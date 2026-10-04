#!/usr/bin/env python3
"""Publish the tested API and static Next frontend as one portable server package."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def source_revision():
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'],
                               cwd=ROOT, text=True).strip():
        raise SystemExit('Package only a clean committed source tree; source changed or is dirty')
    return revision


parser = argparse.ArgumentParser()
parser.add_argument('--dotnet', default=os.environ.get('MEDCOM_DOTNET', 'dotnet'))
args = parser.parse_args()
revision = source_revision()
output = ROOT / 'artifacts/server'
for target in (ROOT / 'artifacts', output, ROOT / 'artifacts/medcom-server-candidate.zip',
               ROOT / 'artifacts/medcom-verify-package.py', ROOT / 'artifacts/medcom-candidate.sha256'):
    if target.resolve() != target or target.is_symlink():
        raise SystemExit('Artifact paths must remain within the intended workspace without links')
if output.exists():
    shutil.rmtree(output)
subprocess.run([args.dotnet, 'publish', str(ROOT / 'src/backend/Medcom.Api'), '-c', 'Release',
                '--no-restore', '-m:1', '-nr:false', '-o', str(output)], check=True, cwd=ROOT)
subprocess.run([args.dotnet, 'publish', str(ROOT / 'src/backend/Medcom.LegacyPasswordWorker'), '-c', 'Release',
                '--no-restore', '-m:1', '-nr:false', '-o', str(output / 'password-worker')], check=True, cwd=ROOT)
frontend = ROOT / 'src/frontend/out'
for page in ('index.html', 'workspace/index.html'):
    if not (frontend / page).is_file():
        raise SystemExit(f'Missing exported frontend: {page}; run npm ci && npm run build first')
shutil.copytree(frontend, output / 'wwwroot', dirs_exist_ok=True)
shutil.copy(ROOT / 'docs/deployment/SERVER_DEPLOYMENT.md', output / 'DEPLOYMENT.md')
for public_asset in ('tools/deploy/Configure-MedcomServer.ps1', 'docs/backend/SERVER_CONFIGURATION.md'):
    destination = output / public_asset
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / public_asset, destination)
if source_revision() != revision:
    raise SystemExit('Source HEAD changed during publish; candidate not finalized')
manifest = {'format': 2, 'sourceRevision': revision,
            'releaseStatus': 'BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE',
            'files': {path.relative_to(output).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in sorted(output.rglob('*')) if path.is_file()}}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = ROOT / 'artifacts/medcom-server-candidate.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            package.write(path, path.relative_to(output).as_posix())
verifier = ROOT / 'artifacts/medcom-verify-package.py'
shutil.copy(ROOT / '.github/scripts/package_integrity.py', verifier)
subprocess.run([os.environ.get('MEDCOM_PYTHON', 'python'), str(verifier), str(archive)], check=True)
checksum = ROOT / 'artifacts/medcom-candidate.sha256'
try:
    if source_revision() != revision:
        raise SystemExit('Source HEAD changed during verification; candidate not finalized')
except SystemExit:
    archive.unlink(missing_ok=True)
    checksum.unlink(missing_ok=True)
    raise
checksum.write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n'
                          for path in (archive, verifier)))
print(f'Created {archive.name}; release blocked until real ERP/SQL and end-to-end acceptance pass.')
