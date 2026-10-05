#!/usr/bin/env python3
"""Extract pinned source DDL privately; never connect to SQL or copy dump seed rows."""
import argparse
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat

from catalog_embedded_modules import Boundary
from catalog_sql import DECL, IDENT, Masker, REF, name

REPO = Path(__file__).resolve().parents[2]
INVENTORY = REPO / 'inventories/source/20261005/pm-return-fixture-closure.json'
INVENTORY_SHA256 = 'bc4dbbe83c3262a69ce330803dcf1979805bdf1e921b83f1809163ffd5cb3a88'
SOURCE_BYTES = 1212595716
SOURCE_SHA256 = '61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096'
SCHEMA_FILE = 'pm-return-schema.sql'
RECEIPT_FILE = 'fixture-receipt.json'
MAX_BATCH_CHARS = 2_000_000
EXTRA = re.compile(r'^\s*(ALTER\s+TABLE|CREATE\s+(?:(?:UNIQUE|CLUSTERED|NONCLUSTERED)\s+)*INDEX)\b', re.I)
DATA = re.compile(r'^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|EXEC(?:UTE)?|USE|GRANT|SELECT)\b', re.I | re.M)
PUBLIC_PARTS = {'public', 'wwwroot', 'htdocs', 'www', 'dist', 'artifacts', '.openai'}


class FixtureError(ValueError):
    """Only fixed technical codes, never SQL, row contents or caller paths."""


def fail(code):
    raise FixtureError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('utf-8')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def masked(text):
    lexer = Masker()
    code = ''.join(lexer.line(line) for line in text.splitlines(True))
    if lexer.quote or lexer.comment or lexer.bracket:
        fail('incomplete_selected_token')
    return code


def references(code):
    return sorted({f'{name(m[1])}.{name(m[2])}' for m in REF.finditer(code)
                   if name(m[1]) == 'dbo'})


@dataclass(frozen=True)
class Batch:
    kind: str
    owner: str
    start: int
    end: int
    text: str = field(repr=False)
    mixed: bool = False

    def metadata(self):
        code = masked(self.text)
        return {'kind': self.kind, 'owner': self.owner, 'startLine': self.start,
                'endLine': self.end, 'sha256': digest(self.text.encode('utf-8')),
                'references': references(code)}


def scan(stream):
    """Ignore data with the existing token boundary; retain bounded DDL batches only."""
    boundary = Boundary()
    batches = []
    current = None
    buffer = []
    length = 0
    prefix_bad = False
    line_no = 0

    def finish(end):
        nonlocal current, buffer, length, prefix_bad
        if current:
            kind, owner, start, mixed = current
            batches.append(Batch(kind, owner, start, end, ''.join(buffer), mixed))
        current, buffer, length, prefix_bad = None, [], 0, False

    for line_no, raw in enumerate(stream, 1):
        outside = boundary.outside
        if outside and re.fullmatch(r'\s*GO\s*', raw, re.I):
            finish(line_no - 1)
            boundary.line(raw)
            continue
        declaration = DECL.match(raw) if outside else None
        extra = EXTRA.match(raw) if outside else None
        if declaration or extra:
            if current:
                # A second CREATE/ALTER in a retained batch is not silently split.
                kind, owner, start, _ = current
                current = (kind, owner, start, True)
            else:
                if declaration:
                    kind = declaration[1].upper()
                    if kind == 'PROC':
                        kind = 'PROCEDURE'
                    owner = f'{name(declaration[2])}.{name(declaration[3])}'
                else:
                    kind = 'SUPPLEMENTAL'
                    owner_match = re.search(rf'(?:TABLE|ON)\s+({IDENT})\s*\.\s*({IDENT})', raw, re.I)
                    if not owner_match:
                        fail('unresolved_ddl_owner')
                    owner = f'{name(owner_match[1])}.{name(owner_match[2])}'
                current = (kind, owner, line_no, prefix_bad)
        if current:
            length += len(raw)
            if length > MAX_BATCH_CHARS:
                fail('oversized_ddl_batch')
            buffer.append(raw)
        elif outside and raw.strip() and not re.match(r'^\s*(--|/\*|SET\s+(ANSI_NULLS|QUOTED_IDENTIFIER)\b)', raw, re.I):
            prefix_bad = True
        boundary.line(raw)
    if current:
        fail('missing_final_go')
    if not boundary.outside:
        fail('incomplete_source_token')
    return batches, line_no


def select(batches, specification):
    objects = {}
    supplemental = []
    for batch in batches:
        if batch.kind == 'SUPPLEMENTAL':
            supplemental.append(batch)
        else:
            if batch.owner in objects:
                fail('duplicate_source_object')
            objects[batch.owner] = batch
    needed = set(specification['rootObjects'])
    pending = list(needed)
    while pending:
        key = pending.pop()
        if key not in objects:
            fail('missing_required_dependency')
        selected = [objects[key]] + [b for b in supplemental if b.owner == key]
        for batch in selected:
            code = masked(batch.text)
            if batch.mixed or (batch.kind in {'TABLE', 'SUPPLEMENTAL'} and DATA.search(code)):
                fail('mixed_data_or_ddl_batch')
            if re.search(r'\bsp_executesql\b|\bEXEC(?:UTE)?\s*\(|\bEXTERNAL\s+NAME\b', code, re.I):
                fail('unsupported_dynamic_or_external_dependency')
            for ref in references(code):
                if ref not in needed:
                    needed.add(ref)
                    pending.append(ref)
    chosen_objects = [objects[key] for key in needed]
    chosen_extra = [b for b in supplemental if b.owner in needed]
    expected_objects = {o['name']: o for o in specification['objects']}
    if needed != set(expected_objects):
        fail('required_closure_mismatch')
    for batch in chosen_objects:
        expected = expected_objects[batch.owner]
        actual = batch.metadata()
        wanted = {k: expected[k] for k in ('kind', 'startLine', 'endLine', 'sha256')}
        if any(actual[k] != value for k, value in wanted.items()) or set(actual['references']) - {batch.owner} != set(expected['references']):
            fail('object_fingerprint_mismatch')
    expected_extra = {o['startLine']: o for o in specification['supplementalDdl']}
    if len(expected_extra) != len(specification['supplementalDdl']) or {b.start for b in chosen_extra} != set(expected_extra):
        fail('supplemental_closure_mismatch')
    for batch in chosen_extra:
        expected = expected_extra[batch.start]
        actual = batch.metadata()
        if any(actual[k] != expected[k] for k in ('owner', 'startLine', 'endLine', 'sha256')) or set(actual['references']) != set(expected['references']):
            fail('supplemental_fingerprint_mismatch')
    # Create all tables first, then the standalone function and source call chain.
    order = {'TABLE': 0, 'FUNCTION': 1, 'PROCEDURE': 2}
    if any(b.kind not in order for b in chosen_objects):
        fail('unsupported_selected_object_kind')
    return sorted(chosen_objects, key=lambda b: (order[b.kind], b.start)) + sorted(chosen_extra, key=lambda b: b.start)


def load_inventory():
    specification = json.loads(INVENTORY.read_text(encoding='utf-8'))
    if digest(canonical(specification)) != INVENTORY_SHA256:
        fail('inventory_fingerprint_mismatch')
    if specification['source']['bytes'] != SOURCE_BYTES or specification['source']['sha256'] != SOURCE_SHA256 or len(specification['objects']) != 26 or len(specification['supplementalDdl']) != 116:
        fail('production_source_pin_mismatch')
    return specification


def path_components(path):
    return list(reversed(path.parents)) + [path]


def lexical_path(value):
    path = Path(value)
    if not path.is_absolute() or path.anchor.startswith('\\\\') or '..' in path.parts:
        fail('unsafe_absolute_path')
    devices = {'CON', 'PRN', 'AUX', 'NUL',
               *('COM' + n for n in '123456789\u00b9\u00b2\u00b3'),
               *('LPT' + n for n in '123456789\u00b9\u00b2\u00b3')}
    for part in path.parts[1:]:
        # Reject Win32 aliases before any filesystem API can normalize them.
        if (part.endswith(('.', ' ')) or re.search(r'[<>:"|?*\\\x00-\x1f]', part)
                or part.split('.')[0].rstrip(' ').upper() in devices):
            fail('unsafe_path_component')
    return path


def checked_chain(path, must_exist):
    for component in path_components(path):
        try:
            info = component.lstat()
        except FileNotFoundError:
            if must_exist or component != path:
                fail('missing_path_component')
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400):
            fail('link_or_reparse_path')


def checked_path(value, must_exist=True):
    path = lexical_path(value)
    # Validate the supplied chain before resolve, so a link is never accepted merely
    # because its target is private. Then validate the canonical chain as well (8.3
    # aliases and platform normalization can otherwise hide protected ancestors).
    checked_chain(path, must_exist)
    try:
        resolved = lexical_path(path.resolve(strict=must_exist))
    except FileNotFoundError:
        fail('missing_path_component')
    checked_chain(resolved, must_exist)
    return resolved


def private_destination(value, repository=REPO):
    path = checked_path(value, must_exist=False)
    if os.path.lexists(path):
        fail('output_already_exists')
    if not path.parent.is_dir():
        fail('output_parent_not_directory')
    if path.is_relative_to(repository) or any(p.casefold() in PUBLIC_PARTS for p in path.parts):
        fail('repository_or_public_output')
    for ancestor in path.parents:
        if os.path.lexists(ancestor / '.git') or os.path.lexists(ancestor / '.openai'):
            fail('repository_or_site_output')
    return path


@contextmanager
def locked_directories(path):
    """POSIX binds writes to dir_fd; Windows holds checked directories without delete sharing."""
    with ExitStack() as stack:
        checked_path(path)
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            create = kernel.CreateFileW
            create.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                               wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE)
            create.restype = wintypes.HANDLE
            close = kernel.CloseHandle
            close.argtypes = (wintypes.HANDLE,)
            for component in path_components(path):
                # FILE_LIST_DIRECTORY participates in Windows share-access checks;
                # a metadata-only zero-access handle does not fence renames.
                handle = create(str(component), 1, 3, None, 3, 0x02000000 | 0x00200000, None)
                if handle == ctypes.c_void_p(-1).value:
                    fail('cannot_lock_private_directory')
                stack.callback(close, handle)
            checked_path(path)
            yield None
        else:
            handle = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            stack.callback(os.close, handle)
            if os.fstat(handle).st_ino != path.lstat().st_ino or os.fstat(handle).st_dev != path.lstat().st_dev:
                fail('output_parent_changed')
            yield handle


def exclusive_write(directory, handle, filename, data):
    checked_path(directory)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
    target = directory / filename if handle is None else filename
    descriptor = os.open(target, flags, 0o600, **({} if handle is None else {'dir_fd': handle}))
    with os.fdopen(descriptor, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def _prepare(source, destination, specification, repository=REPO):
    """Internal specification injection exists for synthetic scanner tests, never CLI input."""
    source = checked_path(source)
    destination = private_destination(destination, repository)
    if not source.is_file() or source.stat().st_nlink != 1:
        fail('input_not_single_regular_file')
    with locked_directories(source.parent) as source_handle:
        checked_path(source)
        flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
        descriptor = os.open(source if source_handle is None else source.name, flags,
                             **({} if source_handle is None else {'dir_fd': source_handle}))
        with os.fdopen(descriptor, 'rb') as raw:
            return _verified_prepare(raw, source, destination, specification, repository)


def _verified_prepare(raw, source, destination, specification, repository):
    # The already checked input parent/descriptor remains bound until all output completes.
    actual = os.fstat(raw.fileno())
    named = source.lstat()
    if not stat.S_ISREG(actual.st_mode) or actual.st_nlink != 1 or (actual.st_dev, actual.st_ino) != (named.st_dev, named.st_ino):
        fail('input_descriptor_changed')
    before = os.fstat(raw.fileno())
    hasher = hashlib.sha256()
    for block in iter(lambda: raw.read(8 * 1024 * 1024), b''):
        hasher.update(block)
    if before.st_size != specification['source']['bytes'] or hasher.hexdigest() != specification['source']['sha256']:
        fail('full_source_fingerprint_mismatch')
    raw.seek(0)
    if raw.read(2) != b'\xff\xfe':
        fail('input_not_utf16le_bom')
    raw.seek(0)
    wrapper = io.TextIOWrapper(raw, encoding='utf-16', newline=None)
    try:
        batches, lines = scan(wrapper)
    except UnicodeError:
        fail('invalid_input_encoding')
    finally:
        wrapper.detach()
    raw.seek(0)
    second = hashlib.sha256()
    for block in iter(lambda: raw.read(8 * 1024 * 1024), b''):
        second.update(block)
    after = os.fstat(raw.fileno())
    if second.hexdigest() != specification['source']['sha256'] or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        fail('input_changed_during_scan')
    if lines != specification['source']['lines']:
        fail('source_line_count_mismatch')
    chosen = select(batches, specification)
    header = 'SET ANSI_NULLS ON\nGO\nSET QUOTED_IDENTIFIER ON\nGO\n'
    sql = (header + '\nGO\n'.join(b.text for b in chosen) + '\nGO\n').encode('utf-8')
    receipt = {'schemaVersion': 1, 'sourceSha256': specification['source']['sha256'],
               'inventoryCanonicalSha256': digest(canonical(specification)), 'objects': len(specification['objects']),
               'supplementalDdl': len(specification['supplementalDdl']), 'outputBytes': len(sql),
               'outputSha256': digest(sql), 'originalRowsCopied': False, 'sqlExecuted': False,
               'compileTransactionDurabilityAccepted': False}
    # Nothing is created until both whole-source passes, closure and every selected pin pass.
    with locked_directories(destination.parent) as parent_handle:
        private_destination(destination, repository)
        os.mkdir(destination if parent_handle is None else destination.name, 0o700,
                 **({} if parent_handle is None else {'dir_fd': parent_handle}))
        with locked_directories(destination) as output_handle:
            exclusive_write(destination, output_handle, SCHEMA_FILE, sql)
            exclusive_write(destination, output_handle, RECEIPT_FILE, canonical(receipt) + b'\n')
    return receipt


def prepare(source, destination):
    return _prepare(source, destination, load_inventory())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dump', help='Authorized full pinned UTF-16LE SQL member')
    parser.add_argument('private_output_directory', help='New leaf under an existing protected private directory')
    args = parser.parse_args()
    try:
        receipt = prepare(args.dump, args.private_output_directory)
    except FixtureError as error:
        parser.exit(1, f'Fixture refused: {error}\n')
    except (OSError, UnicodeError, json.JSONDecodeError):
        parser.exit(1, 'Fixture refused: filesystem_or_encoding_failure; no success receipt\n')
    print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
