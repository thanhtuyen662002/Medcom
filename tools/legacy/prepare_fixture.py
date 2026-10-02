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
names=['SY_User','SY_UserGroup','SY_UserBranch','SY_Menu','SY_UserGroupPermisstion','SY_UserPermisstion','AP_OrderTbl','IV_InboundRequestTbl']
schema=private/'runtime-schema.sql'
schema.write_text('\nGO\n'.join((private/'table-ddl'/f'{name}.sql').read_text() for name in names)+'\nGO\n')
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
print('Prepared eight source table DDLs and synthetic-only credential fixture; no database was touched.')
