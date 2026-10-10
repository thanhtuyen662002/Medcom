#!/usr/bin/env python3
"""Prepare private source-table DDL and a synthetic DLL hash; never restore dump data."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/source'))
from catalog_sql import catalog

ap=argparse.ArgumentParser();ap.add_argument('--dump',required=True);ap.add_argument('--tools',required=True)
ap.add_argument('--private-directory',required=True);ap.add_argument('--dotnet',default='dotnet');args=ap.parse_args()
private=Path(args.private_directory).resolve();tools=Path(args.tools).resolve()
if private.is_relative_to(ROOT):raise SystemExit('Private fixture must stay outside the public checkout')
if hashlib.sha256(tools.read_bytes()).hexdigest()!='aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61':raise SystemExit('Unapproved DLL bytes')
metadata=catalog(args.dump,private/'table-ddl')
names=['SY_User','SY_UserGroup','SY_UserBranch','SY_Menu','SY_UserGroupPermisstion','SY_UserPermisstion','AP_OrderTbl','IV_InboundRequestTbl','AP_OrderDetailTbl','IV_InboundRequestDetailsTbl']
schema=private/'runtime-schema.sql'
schema.write_text('\nGO\n'.join((private/'table-ddl'/f'{name}.sql').read_text() for name in names)+'\nGO\n')
# The historical dump has 37/25 inbound read columns. Append the two verified
# nullable current-source additions only to this private disposable fixture;
# this tool still does not connect to or change any database.
live=json.loads((ROOT/'inventories/source/20261010/document-read-tables.json').read_text())
extensions=[]
for table,column in [('IV_InboundRequestTbl','LinkID'),('IV_InboundRequestDetailsTbl','ParentID')]:
    objects=[obj for obj in live['objects'] if obj['schema']=='dbo' and obj['name']==table]
    if len(objects)!=1:raise SystemExit('Current fixture source table unavailable')
    fields=[field for field in objects[0]['columns'] if field['name']==column]
    if len(fields)!=1 or (fields[0]['type'],fields[0]['typeArguments'],fields[0]['nullable'])!=('varchar','(50)',True):
        raise SystemExit('Current fixture extension source mismatch')
    extensions.append(f'ALTER TABLE [dbo].[{table}] ADD [{column}] [varchar](50) NULL;')
with schema.open('a') as output:output.write('\nGO\n'.join(extensions)+'\nGO\n')
probe=private/'synthetic-probe';probe.mkdir(exist_ok=True)
(probe/'probe.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>')
(probe/'Program.cs').write_text('''using System.Reflection;
using System.Globalization;
CultureInfo.CurrentCulture=CultureInfo.GetCultureInfo("vi-VN");
var assembly=Assembly.LoadFile(args[0]);var type=assembly.GetType("Tools.MD5",true)!;
var hash=type.GetMethod("EncryptUserPass")!.Invoke(Activator.CreateInstance(type),["web_synthetic_test","Synthetic-Only-482!"]);
File.WriteAllText(args[1],(string)hash!);
''')
hashfile=private/'synthetic-hash.txt'
subprocess.run([args.dotnet,'run','--project',str(probe),'--',str(tools),str(hashfile)],check=True,stdout=subprocess.DEVNULL)
(private/'prepared-env.json').write_text(json.dumps({'MEDCOM_LEGACY_TOOLS':str(tools),'MEDCOM_TEST_HASH':hashfile.read_text(),'MEDCOM_TEST_SCHEMA':str(schema)},indent=2)+'\n')
print('Prepared ten source table DDLs and synthetic-only credential fixture; no database was touched.')
