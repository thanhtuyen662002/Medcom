#!/usr/bin/env python3
"""Stream a SQL Server dump into metadata only; never emit INSERTs or SQL bodies."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re

IDENT = r'(?:\[(?:[^\]]|\]\])+\]|[A-Za-z_][\w$#]*)'
OBJECT = rf'({IDENT})\s*\.\s*({IDENT})'
DECL = re.compile(rf'^\s*CREATE\s+(?:OR\s+ALTER\s+)?(TABLE|VIEW|PROCEDURE|PROC|FUNCTION|TRIGGER|SEQUENCE)\b\s*{OBJECT}', re.I)
HEADER = re.compile(r'Object:\s+(Table|View|StoredProcedure|UserDefinedFunction|Trigger|Sequence)\s+\[([^\]]+)\]\.\[([^\]]+)\]', re.I)
REF = re.compile(OBJECT)


def name(value):
    return value[1:-1].replace(']]', ']') if value.startswith('[') else value


class Masker:
    """Keep identifiers/code, mask literals/comments across lines (including backup INSERT SQL)."""
    def __init__(self):
        self.quote = False
        self.comment = 0
        self.bracket = False

    def line(self, text):
        out = []
        i = 0
        while i < len(text):
            c = text[i]
            pair = text[i:i+2]
            if self.quote:
                if pair == "''": out.extend('  '); i += 2; continue
                if c == "'": self.quote = False
                out.append('\n' if c == '\n' else ' ')
            elif self.comment:
                if pair == '/*': self.comment += 1; out.extend('  '); i += 2; continue
                if pair == '*/': self.comment -= 1; out.extend('  '); i += 2; continue
                out.append('\n' if c == '\n' else ' ')
            elif self.bracket:
                if pair == ']]': out.extend(pair); i += 2; continue
                out.append(c)
                if c == ']': self.bracket = False
            elif pair == '--':
                out.extend(' ' * (len(text)-i)); break
            elif pair == '/*': self.comment = 1; out.extend('  '); i += 2; continue
            elif c == "'": self.quote = True; out.append(' ')
            else:
                if c == '[': self.bracket = True
                out.append(c)
            i += 1
        return ''.join(out)


def describe(kind, schema, obj, code, line):
    kind = 'PROCEDURE' if kind == 'PROC' else kind
    record = {'kind': kind, 'schema': schema, 'name': obj, 'sourceLine': line,
              'maskedDefinitionSha256': hashlib.sha256(code.encode()).hexdigest()}
    refs = sorted({f'{name(m[1])}.{name(m[2])}' for m in REF.finditer(code)} - {f'{schema}.{obj}'})
    record['syntacticReferences'] = refs
    # These are syntactic candidates, not resolved dependencies/dynamic SQL coverage.
    if kind == 'TABLE':
        columns = []
        pat = re.compile(rf'^\s*({IDENT})\s+({IDENT})(\s*\([^\n)]*\))?(.*)$', re.I)
        for row in code.splitlines()[1:]:
            if re.match(r'^\s*(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|\))', row, re.I): break
            m = pat.match(row)
            if not m or name(m[1]).upper() in {'CONSTRAINT','PRIMARY','UNIQUE','FOREIGN','CHECK'}: continue
            column, data_type, length, tail = m.groups()
            if name(data_type).upper() == 'AS':
                columns.append({'name': name(column), 'computed': True}); continue
            columns.append({'name': name(column), 'type': name(data_type),
                            'typeArguments': (length or '').strip(),
                            'nullable': False if re.search(r'\bNOT\s+NULL\b',tail,re.I) else True if re.search(r'\bNULL\b',tail,re.I) else None,
                            'identity': bool(re.search(r'\bIDENTITY\s*\(',tail,re.I))})
        record['columns'] = columns
    if kind in {'PROCEDURE','FUNCTION'}:
        record['parameters'] = [{'name': m[1], 'type': name(m[2]), 'output': bool(m[3])}
            for m in re.finditer(rf'(@[\w]+)\s+({IDENT})(?:\([^)]*\))?(?:\s*=\s*[^,\n]*)?\s*(OUTPUT)?', re.split(r'\bAS\b', code, maxsplit=1, flags=re.I)[0], re.I)]
    return record


def catalog(path, private_tables_dir=None):
    source_path=Path(path);source_hash=hashlib.sha256()
    with source_path.open('rb') as source:
        for block in iter(lambda:source.read(8*1024*1024),b''):source_hash.update(block)
    masker = Masker(); objects = []; headers = []; ddl = []; raw_ddl = []; current = None; extras = []
    selected = {'SY_User','SY_UserGroup','SY_UserBranch','SY_Menu','SY_UserGroupPermisstion','SY_UserPermisstion','AP_OrderTbl','IV_InboundRequestTbl','AP_OrderDetailTbl','IV_InboundRequestDetailsTbl'}
    private_dir = Path(private_tables_dir).resolve() if private_tables_dir else None
    if private_dir:
        if private_dir.is_relative_to(Path(__file__).resolve().parents[2]): raise ValueError('Private source DDL must stay outside the public checkout')
        private_dir.mkdir(parents=True,exist_ok=True)
    def finish():
        nonlocal current, ddl, raw_ddl
        if current:
            objects.append(describe(*current[:3], ''.join(ddl), current[3]))
            if private_dir and current[0]=='TABLE' and current[1]=='dbo' and current[2] in selected:
                (private_dir/(current[2]+'.sql')).write_text(''.join(raw_ddl))
        current = None; ddl = []; raw_ddl = []
    with Path(path).open(encoding='utf-16') as f:
        for line_no, raw in enumerate(f, 1):
            # SSMS header comments are only recognized outside string literals.
            if not masker.quote and not masker.comment:
                h = HEADER.search(raw)
                if h: headers.append({'kind': h[1], 'schema': h[2], 'name': h[3]})
            code = masker.line(raw)
            if re.fullmatch(r'\s*GO\s*', code, re.I): finish(); continue
            m = DECL.match(code)
            if m:
                if current: raise ValueError('Multiple declarations in one batch require explicit review')
                current = (m[1].upper(),name(m[2]),name(m[3]),line_no)
            if current:
                ddl.append(code)
                if private_dir and current[0]=='TABLE' and current[1]=='dbo' and current[2] in selected: raw_ddl.append(raw)
                if sum(map(len,ddl)) > 2_000_000: raise ValueError('Oversized DDL batch')
            elif re.match(r'^\s*(ALTER\s+TABLE|CREATE\s+(?:(?:UNIQUE|CLUSTERED|NONCLUSTERED)\s+)*INDEX)\b',code,re.I):
                extras.append({'sourceLine':line_no,'syntacticReferences':sorted({f'{name(m[1])}.{name(m[2])}' for m in REF.finditer(code)}), 'maskedStatementSha256':hashlib.sha256(code.encode()).hexdigest()})
    finish()
    if masker.quote or masker.comment or masker.bracket: raise ValueError('Unterminated SQL token')
    keys = [(o['kind'],o['schema'],o['name']) for o in objects]
    if len(keys) != len(set(keys)): raise ValueError('Duplicate object declarations')
    header_kinds={'Table':'TABLE','View':'VIEW','StoredProcedure':'PROCEDURE','UserDefinedFunction':'FUNCTION','Trigger':'TRIGGER','Sequence':'SEQUENCE'}
    declared=set(keys)
    missing=[h for h in headers if (header_kinds[h['kind']],h['schema'],h['name']) not in declared]
    return {'formatVersion':1,'sourceByteCount':source_path.stat().st_size,'sourceSha256':source_hash.hexdigest(),
            'counts':dict(sorted(collections.Counter(o['kind'] for o in objects).items())),
            'objects':objects,'ssmsHeaderCount':len(headers),'headersWithoutDeclaration':missing,
            'additionalIndexOrAlterStatements':extras,
            'limits':['No data rows, literal strings or SQL bodies are exported.',
                      'Syntactic references are candidates; resolution, dynamic SQL, indexes and constraints need separate verification.',
                      'Counts describe this dump only, not the old baseline or a live database.']}


if __name__ == '__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('dump'); ap.add_argument('output'); args=ap.parse_args()
    result=catalog(args.dump)
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'counts':result['counts'],'headersWithoutDeclaration':len(result['headersWithoutDeclaration'])}))
