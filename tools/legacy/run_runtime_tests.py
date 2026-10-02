#!/usr/bin/env python3
"""Run gated owner DLL + disposable loopback SQL tests; never print connection secrets."""
import argparse
import json
import os
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[2]
ap=argparse.ArgumentParser();ap.add_argument('--private-directory',required=True);ap.add_argument('--dotnet',default='dotnet');args=ap.parse_args()
if not os.environ.get('MEDCOM_TEST_SQL'):raise SystemExit('MEDCOM_TEST_SQL must name a disposable loopback SQL master connection')
settings=json.loads((Path(args.private_directory)/'prepared-env.json').read_text())
if set(settings)!={'MEDCOM_LEGACY_TOOLS','MEDCOM_TEST_HASH','MEDCOM_TEST_SCHEMA'}:raise SystemExit('Invalid fixture contract')
environment=dict(os.environ,**settings)
result=subprocess.run([args.dotnet,'test',str(ROOT/'tests/backend/Medcom.Api.Tests'),'-c','Release','--no-restore','-m:1','-nr:false','--filter','Category=LegacyRuntime','--logger','trx;LogFileName=legacy-runtime.trx'],env=environment,cwd=ROOT)
raise SystemExit(result.returncode)
