#!/usr/bin/env python3
"""Prepare only reviewed source DDL/check procedures in a private test fixture."""
import argparse
import json
from pathlib import Path
import re

from catalog_embedded_modules import Boundary
from catalog_sql import DECL, name
from verify_source_archive import digest_file

FULL_SQL_SHA256='61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096'
FULL_SQL_SIZE=1212595716
TABLES={'IV_InternalTransferRequestTbl','IV_InternalTransferBatchTbl','IV_InternalTransferBatchRequestTbl'}
PROCEDURES={'IV_InternalTransfer_BatchCheckBeforeUpdateStp','IV_InternalTransfer_BatchCheckDeleteStp',
    'IV_InternalTransfer_BatchPMCheckEditStp','IV_InternalTransfer_BatchRoleCheckEditStp',
    'IV_InternalTransfer_BatchTechCheckEditStp','IV_InternalTransfer_RequestCheckDeleteStp',
    'IV_InternalTransfer_RequestCheckEditStp','IV_InternalTransfer_RequestPMCheckEditStp'}


def prepare(source, output):
    source=Path(source);output=Path(output).resolve()
    if output.is_relative_to(Path(__file__).resolve().parents[2]):raise ValueError('Source SQL fixture must remain private')
    if source.stat().st_size!=FULL_SQL_SIZE or digest_file(source)!=FULL_SQL_SHA256:
        raise ValueError('Unverified or incomplete SQL source')
    boundary=Boundary();current=None;buffer=[];found={}
    with source.open(encoding='utf-16') as stream:
        for raw in stream:
            outside=boundary.outside
            if outside and re.fullmatch(r'\s*GO\s*',raw,re.I):
                if current:found[current]=''.join(buffer);current=None;buffer=[]
            elif outside and (match:=DECL.match(raw)):
                kind,schema,obj=match[1].upper(),name(match[2]),name(match[3])
                if schema=='dbo' and ((kind=='TABLE' and obj in TABLES) or (kind=='PROCEDURE' and obj in PROCEDURES)):
                    if obj in found or current:raise ValueError('Duplicate selected declaration')
                    current=obj;buffer=[raw]
            elif current:buffer.append(raw)
            boundary.line(raw)
    if current or not boundary.outside or set(found)!=TABLES|PROCEDURES:
        raise ValueError('Incomplete selected workflow definitions')
    output.parent.mkdir(parents=True,exist_ok=True)
    order=sorted(TABLES)+['IV_InternalTransfer_BatchCheckBeforeUpdateStp']+sorted(PROCEDURES-{'IV_InternalTransfer_BatchCheckBeforeUpdateStp'})
    output.write_text('\nGO\n'.join(found[obj] for obj in order)+'\nGO\n',encoding='utf-8')
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('dump');parser.add_argument('private_directory')
    args=parser.parse_args();folder=Path(args.private_directory);output=prepare(args.dump,folder/'transfer-check-schema.sql')
    settings_path=folder/'prepared-env.json';settings=json.loads(settings_path.read_text(encoding='utf-8'))
    if not {'MEDCOM_LEGACY_TOOLS','MEDCOM_TEST_HASH','MEDCOM_TEST_SCHEMA'}<=set(settings):raise SystemExit('Prepare base fixture first')
    settings['MEDCOM_TEST_TRANSFER_SCHEMA']=str(output)
    settings_path.write_text(json.dumps(settings,indent=2)+'\n',encoding='utf-8')
    print('Prepared three source tables and eight check procedures; no database/data restored.')
