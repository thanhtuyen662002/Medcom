#!/usr/bin/env python3
"""Emit small metadata-only catalog members plus a finite checksum manifest."""
import argparse
import hashlib
import json
from pathlib import Path

if __name__ == '__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('input');ap.add_argument('directory');args=ap.parse_args()
    data=json.loads(Path(args.input).read_text());folder=Path(args.directory);folder.mkdir(parents=True,exist_ok=True)
    if data['headersWithoutDeclaration']: raise SystemExit('Missing header members require review')
    members={}; expected=set()
    for kind in sorted(data['counts']):
        objects=[o for o in data['objects'] if o['kind']==kind]
        batches=[];batch=[];size=0
        for obj in objects:
            addition=len(json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode())
            if batch and size+addition>48000:batches.append(batch);batch=[];size=0
            batch.append(obj);size+=addition
        if batch:batches.append(batch)
        for n,records in enumerate(batches,1):
            path=folder/f'{kind.lower()}-{n:02}.json';expected.add(path.name)
            content=json.dumps({'objects':records},ensure_ascii=False,separators=(',',':'))+'\n';path.write_text(content)
            members[path.name]={'sha256':hashlib.sha256(content.encode()).hexdigest(),'objectCount':len(records)}
    extras=folder/'additional-statements.json';expected.add(extras.name)
    extras.write_text(json.dumps(data['additionalIndexOrAlterStatements'],ensure_ascii=False,indent=2)+'\n')
    members[extras.name]={'sha256':hashlib.sha256(extras.read_bytes()).hexdigest()}
    manifest={k:v for k,v in data.items() if k not in ['objects','additionalIndexOrAlterStatements']}
    manifest['members']=members;expected.add('manifest.json')
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    stale=[p.name for p in folder.iterdir() if p.is_file() and p.name not in expected]
    if stale:raise SystemExit(f'Unexpected old members: {stale}')
    print(json.dumps({'memberCount':len(members),'objectCount':sum(data['counts'].values())}))
