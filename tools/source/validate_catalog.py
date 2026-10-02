#!/usr/bin/env python3
"""Verify every finite catalog member without needing private archives in CI."""
import collections
import hashlib
import json
from pathlib import Path
import re

def validate_detail_bindings(bindings, objects):
    shapes={
        'AP_OrderFrm':('AP_OrderTbl','AP_OrderDetailTbl',['UserAutoID','DocumentID','ItemID','Quantity','Quantity2']),
        'IV_InboundRequestFrm':('IV_InboundRequestTbl','IV_InboundRequestDetailsTbl',[
            'UserAutoID','DocumentID','ItemID','SetQuantityByDocument','BarrelQuantityByDocument','SetQuantityByReal','BarrelQuantityByReal'])}
    if bindings.get('sourceSet')!='owner-attachment-20261002' or len(bindings.get('pilots',[]))!=2:
        raise ValueError('Invalid detail source set or pilot count')
    seen=set()
    for pilot in bindings['pilots']:
        form=pilot['form']
        if form not in shapes or form in seen:raise ValueError('Unreviewed or duplicate detail pilot')
        seen.add(form);parent,child,columns=shapes[form]
        p=objects[('TABLE','dbo',parent)];c=objects[('TABLE','dbo',child)]
        expected=[column for column in c['columns'] if column['name'] in columns]
        if (pilot['parentTable']!=parent or pilot['detailTable']!=child or pilot['joinColumns']!=['DocumentID']
            or pilot['lineKey']!='UserAutoID' or pilot['parentSourceLine']!=p['sourceLine']
            or pilot['detailSourceLine']!=c['sourceLine'] or pilot['detailMaskedDefinitionSha256']!=c['maskedDefinitionSha256']
            or pilot['selectedColumns']!=expected or len(expected)!=len(columns)):
            raise ValueError('Detail binding does not match the reviewed source shape')


def main():
    folder=Path(__file__).resolve().parents[2]/'inventories/source/20261002'
    manifest=json.loads((folder/'manifest.json').read_text());counts=collections.Counter();seen=set();objects={}
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
            seen.add(key);objects[key]=obj;counts[obj['kind']]+=1
            columns=obj.get('columns',[])
            if len({c['name'] for c in columns})!=len(columns):raise SystemExit(f'Duplicate column {key}')
    if dict(counts)!=manifest['counts'] or manifest['headersWithoutDeclaration']:raise SystemExit('Incomplete catalog')
    actual={p.name for p in folder.iterdir() if p.is_file()}
    expected=set(manifest['members'])|{'manifest.json','source-set.json','pilot-menu-bindings.json','pilot-action-metadata.json','runtime-receipt.json','detail-read-bindings.json'}
    if actual!=expected:raise SystemExit(f'Manifest directory mismatch: {actual^expected}')
    validate_detail_bindings(json.loads((folder/'detail-read-bindings.json').read_text()),objects)
    print(f'PASS: {len(seen)} declared objects; {len(manifest["members"])} checksum-verified catalog members')

if __name__=='__main__':main()
