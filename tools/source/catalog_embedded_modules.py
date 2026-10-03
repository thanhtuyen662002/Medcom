#!/usr/bin/env python3
"""Inventory module definitions stored as SQL INSERT literals, separately from executable DDL.

Exports technical metadata only. It never executes the dump, restores data, chooses a
backup version as active, or publishes SQL bodies/other row values.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re

from catalog_sql import Masker, IDENT, name

TOKEN = re.compile(r"'|--|/\*|\[")
COMMENT_TOKEN = re.compile(r'/\*|\*/')
RAW_MODULE = re.compile(r'\b(?:CREATE\s+(?:OR\s+ALTER\s+)?|ALTER\s+)(?:PROCEDURE|PROC|TRIGGER)\b', re.I)
INSERT = re.compile(r'^\s*INSERT\s+\[([^]]+)\]\.\[([^]]+)\]\s*\((.*?)\)\s*VALUES\s*\((.*)\)\s*;?\s*$', re.S | re.I)
DECL = re.compile(rf'^\s*(CREATE\s+(?:OR\s+ALTER\s+)?|ALTER\s+)(PROCEDURE|PROC|TRIGGER|VIEW|FUNCTION)\s+({IDENT})(?:\s*\.\s*({IDENT}))?', re.M | re.I)


class Boundary:
    """Track SQL strings/comments/identifiers without copying every data character."""
    def __init__(self):
        self.quote = False
        self.comment = 0
        self.bracket = False

    @property
    def outside(self):
        return not (self.quote or self.comment or self.bracket)

    def line(self, text):
        i = 0
        while i < len(text):
            if self.quote:
                i = text.find("'", i)
                if i < 0: return
                if text[i:i+2] == "''": i += 2; continue
                self.quote = False; i += 1
            elif self.bracket:
                i = text.find(']', i)
                if i < 0: return
                if text[i:i+2] == ']]': i += 2; continue
                self.bracket = False; i += 1
            elif self.comment:
                m = COMMENT_TOKEN.search(text, i)
                if not m: return
                self.comment += 1 if m[0] == '/*' else -1; i = m.end()
            else:
                m = TOKEN.search(text, i)
                if not m: return
                if m[0] == '--': return
                if m[0] == "'": self.quote = True
                elif m[0] == '[': self.bracket = True
                else: self.comment = 1
                i = m.end()


def values(text):
    """Split SSMS VALUES expressions while preserving literal/expression boundaries."""
    result = []; start = 0; depth = 0; quoted = False; i = 0
    while i < len(text):
        c = text[i]
        if c == "'":
            if quoted and text[i:i+2] == "''": i += 2; continue
            quoted = not quoted
        elif not quoted:
            if c == '(': depth += 1
            elif c == ')': depth -= 1
            elif c == ',' and depth == 0:
                result.append((text[start:i].strip(), start)); start = i + 1
        i += 1
    if quoted or depth: raise ValueError('Incomplete VALUES expression')
    result.append((text[start:].strip(), start))
    return result


def literal(value):
    if value.startswith("N'"): value = value[1:]
    if len(value) >= 2 and value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return None


def describe_insert(statement, source_line):
    m = INSERT.fullmatch(statement)
    if not m: raise ValueError(f'Unsupported module-containing INSERT at line {source_line}')
    columns = re.findall(r'\[([^]]+)\]', m[3]); cells = values(m[4])
    if len(columns) != len(cells): raise ValueError(f'Column/value mismatch at line {source_line}')
    row = dict(zip(columns, (literal(cell[0]) for cell in cells)))
    date_cell = next((cell[0] for col, cell in zip(columns, cells) if col == 'BackupDate'), '')
    date = re.search(r"(?:CAST\s*\(\s*)?N?'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?)'", date_cell)
    records = []
    for column, (expression, offset) in zip(columns, cells):
        definition = literal(expression)
        if definition is None or not re.search(r'\b(?:CREATE|ALTER)\b', definition, re.I): continue
        masker = Masker(); masked = ''.join(masker.line(line) for line in definition.splitlines(True))
        declarations = list(DECL.finditer(masked))
        for declaration in declarations:
            schema = name(declaration[3]) if declaration[4] else row.get('SchemaName')
            obj = name(declaration[4] or declaration[3])
            kind = declaration[2].upper().replace('PROC', 'PROCEDURE') if declaration[2].upper() == 'PROC' else declaration[2].upper()
            qualified = f'{schema}.{obj}' if schema else obj
            stored = row.get('ObjectName') or row.get('ProcedureName') or row.get('ViewName')
            normalized = stored.replace('[', '').replace(']', '') if stored else None
            definition_line = source_line + statement[:m.start(4)+offset].count('\n')
            record = {
                'kind': kind, 'schema': schema, 'name': obj,
                'declarationVerb': ' '.join(declaration[1].upper().split()),
                'sourceTable': f'{m[1]}.{m[2]}', 'sourceColumn': column,
                'insertSourceLine': source_line,
                'declarationSourceLine': definition_line + definition[:declaration.start(1)].count('\n'),
                'definitionSha256': hashlib.sha256(definition.encode()).hexdigest(),
                'definitionCharacterCount': len(definition),
                'backupDate': date[1] if date else None,
                'storedObjectNameMatches': normalized in {obj, qualified} if normalized else None,
                'declarationsInCell': len(declarations),
                'activeRuntimeStatus': 'UNVERIFIED_STORED_DEFINITION',
            }
            # No literal/default values or unrelated row fields leave the parser.
            signature = re.split(r'\bAS\b', masked[declaration.end():], maxsplit=1, flags=re.I)[0]
            record['parameterNameCandidates'] = sorted(set(re.findall(r'@[A-Za-z_][\w]*', signature)))
            record['procedureCallCandidates'] = sorted(set(re.findall(rf'\bEXEC(?:UTE)?\s+(?!\()({IDENT}(?:\s*\.\s*{IDENT})?)', masked, re.I)))
            record['dynamicExecutionCandidate'] = bool(re.search(r'\bEXEC(?:UTE)?\s*\(|\bsp_executesql\b', masked, re.I))
            records.append(record)
    return records, f'{m[1]}.{m[2]}'


def catalog(path):
    boundary = Boundary(); records = []; pending = []; size = 0; start = 0
    candidates = []; candidate_inserts = 0; candidate_tables = collections.Counter(); total_inserts = 0
    with Path(path).open(encoding='utf-16') as stream:
        for line_no, raw in enumerate(stream, 1):
            if boundary.outside and re.match(r'^\s*INSERT\s+\[', raw, re.I):
                if pending: raise ValueError('Overlapping INSERT statements')
                pending = [raw]; size = len(raw); start = line_no; total_inserts += 1
            elif pending:
                pending.append(raw); size += len(raw)
            if RAW_MODULE.search(raw): candidates.append(line_no)
            boundary.line(raw)
            if pending and boundary.outside:
                statement = ''.join(pending); pending = []; size = 0
                # Also catalog view/function definitions in recognized module backup cells.
                if RAW_MODULE.search(statement) or re.search(r'\[(?:ModuleDefinition|Definition)\]', statement, re.I):
                    extracted, table = describe_insert(statement, start)
                    records.extend(extracted); candidate_inserts += 1; candidate_tables[table] += 1
            if size > 20_000_000: raise ValueError('Oversized INSERT requires explicit review')
    if pending or not boundary.outside: raise ValueError('Truncated SQL dump')
    versions = collections.defaultdict(list)
    for record in records: versions[(record['kind'], record['schema'], record['name'])].append(record)
    summary = []
    for key, members in sorted(versions.items(), key=lambda item: str(item[0])):
        hashes = {member['definitionSha256'] for member in members}
        dates = sorted({member['backupDate'] for member in members if member['backupDate']})
        summary.append({'kind': key[0], 'schema': key[1], 'name': key[2],
                        'recordCount': len(members), 'distinctDefinitionCount': len(hashes),
                        'firstBackupDate': dates[0] if dates else None, 'lastBackupDate': dates[-1] if dates else None})
    return {'formatVersion': 1, 'sourceSet': 'owner-attachment-20261002',
            'counts': {'allInsertStatements': total_inserts, 'candidateInsertStatements': candidate_inserts,
                       'storedDeclarations': len(records), 'uniqueModules': len(summary),
                       'byKindRecords': dict(sorted(collections.Counter(r['kind'] for r in records).items())),
                       'byKindUniqueModules': dict(sorted(collections.Counter(r['kind'] for r in summary).items()))},
            'rawProcedureTriggerCandidateLines': candidates, 'candidateSourceTables': dict(sorted(candidate_tables.items())),
            'records': records, 'modules': summary,
            'limits': ['Stored module declarations are distinct from executable outer SQL DDL.',
                       'Backup timestamps identify available versions, not current deployed definitions.',
                       'Syntactic candidates do not prove all resolved dependencies or effects.',
                       'No SQL bodies, arbitrary row values, usernames, credentials or production data are exported.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('dump'); parser.add_argument('--output', required=True)
    args = parser.parse_args(); result = catalog(args.dump)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts'], sort_keys=True))
