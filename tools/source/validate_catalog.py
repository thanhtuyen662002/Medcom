#!/usr/bin/env python3
"""Verify every finite catalog member without needing private archives in CI."""
import collections
import hashlib
import json
from pathlib import Path
import re

folder=Path(__file__).resolve().parents[2]/'inventories/source/20261002'
manifest=json.loads((folder/'manifest.json').read_text());counts=collections.Counter();seen=set()
for filename,entry in manifest['members'].items():
    if not re.fullmatch(r'(?:table|view|function|sequence)-\d{2}\.json|additional-statements\.json',filename):raise SystemExit('Invalid member path')
    content=(folder/filename).read_bytes()
    if hashlib.sha256(content).hexdigest()!=entry['sha256']:raise SystemExit(f'Checksum mismatch {filename}')
    data=json.loads(content)
    if isinstance(data,list):continue
    if len(data['objects'])!=entry['objectCount']:raise SystemExit('Object count mismatch')
    for obj in data['objects']:
        key=(obj['kind'],obj['schema'],obj['name'])
        if key in seen:raise SystemExit(f'Duplicate object {key}')
        seen.add(key);counts[obj['kind']]+=1
        columns=obj.get('columns',[])
        if len({c['name'] for c in columns})!=len(columns):raise SystemExit(f'Duplicate column {key}')
if dict(counts)!=manifest['counts'] or manifest['headersWithoutDeclaration']:raise SystemExit('Incomplete catalog')
actual={p.name for p in folder.iterdir() if p.is_file()}
expected=set(manifest['members'])|{'manifest.json','source-set.json','pilot-menu-bindings.json','pilot-action-metadata.json','runtime-receipt.json'}
if actual!=expected:raise SystemExit(f'Manifest directory mismatch: {actual^expected}')
print(f'PASS: {len(seen)} declared objects; {len(manifest["members"])} checksum-verified catalog members')
