#!/usr/bin/env python3
"""Publish a checksummed staging candidate; backend profile excludes the frontend."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def regular_node(path):
    info = path.lstat()
    if (stat.S_ISLNK(info.st_mode)
            or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)
            or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode))
            or (stat.S_ISREG(info.st_mode) and info.st_nlink != 1)):
        raise SystemExit('Package inputs must be regular private-workspace files/directories without links')
    return info


def validate_path(path):
    relative = path.relative_to(ROOT)
    current = ROOT
    regular_node(current)
    for part in relative.parts:
        current = current / part
        regular_node(current)


def validate_tree(path):
    validate_path(path)
    # Inspect every child before os.walk can descend; directory reparse points
    # (including Windows junctions) are rejected even on Python without is_junction.
    for directory, folders, files in os.walk(path, followlinks=False):
        for name in folders + files:
            regular_node(Path(directory) / name)


def read_regular_file(path):
    validate_path(path)
    before = regular_node(path)
    if not stat.S_ISREG(before.st_mode):
        raise SystemExit('Expected a regular package file')
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        if (not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1
                or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino)):
            raise SystemExit('Package input changed while opening')
        data = stream.read()
        after = os.fstat(stream.fileno())
    current = regular_node(path)
    if ((opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns)
            != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
            or (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)):
        raise SystemExit('Package input changed while reading')
    return data


def copy_public_file(source, destination):
    data = read_regular_file(source)
    validate_path(destination.parent)
    # Never follow an existing destination link, even when it appeared after publish.
    with destination.open('xb') as stream:
        stream.write(data)


def source_revision():
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'],
                               cwd=ROOT, text=True).strip():
        raise SystemExit('Package only a clean committed source tree; source changed or is dirty')
    return revision


parser = argparse.ArgumentParser()
parser.add_argument('--dotnet', default=os.environ.get('MEDCOM_DOTNET', 'dotnet'))
parser.add_argument('--profile', choices=('combined', 'backend'), default='combined')
args = parser.parse_args()
revision = source_revision()
backend = args.profile == 'backend'
output = ROOT / ('artifacts/backend' if backend else 'artifacts/server')
archive = ROOT / ('artifacts/medcom-backend-candidate.zip' if backend else 'artifacts/medcom-server-candidate.zip')
verifier = ROOT / ('artifacts/medcom-backend-verify-package.py' if backend else 'artifacts/medcom-verify-package.py')
checksum = ROOT / ('artifacts/medcom-backend-candidate.sha256' if backend else 'artifacts/medcom-candidate.sha256')
for target in (ROOT / 'artifacts', output, archive, verifier, checksum):
    if target.resolve() != target or target.is_symlink():
        raise SystemExit('Artifact paths must remain within the intended workspace without links')
# Invalidate previous completion markers before starting this profile again.
archive.unlink(missing_ok=True)
checksum.unlink(missing_ok=True)
if output.exists():
    shutil.rmtree(output)
publish_options = ['-p:UseAppHost=false'] if backend else []
subprocess.run([args.dotnet, 'publish', str(ROOT / 'src/backend/Medcom.Api'), '-c', 'Release',
                '--no-restore', '-m:1', '-nr:false', '-o', str(output)] + publish_options, check=True, cwd=ROOT)
validate_tree(output)
subprocess.run([args.dotnet, 'publish', str(ROOT / 'src/backend/Medcom.LegacyPasswordWorker'), '-c', 'Release',
                '--no-restore', '-m:1', '-nr:false', '-o', str(output / 'password-worker')] + publish_options, check=True, cwd=ROOT)
validate_tree(output)
if not backend:
    frontend = ROOT / 'src/frontend/out'
    validate_tree(frontend)
    for page in ('index.html', 'workspace/index.html'):
        if not (frontend / page).is_file():
            raise SystemExit(f'Missing exported frontend: {page}; run npm ci && npm run build first')
    shutil.copytree(frontend, output / 'wwwroot', dirs_exist_ok=True)
validate_tree(output)
copy_public_file(ROOT / 'docs/deployment/SERVER_DEPLOYMENT.md', output / 'DEPLOYMENT.md')
# The root entry-point guide has a different relative base than its source file.
deployment = output / 'DEPLOYMENT.md'
deployment.write_text(deployment.read_text().replace(
    '](WINDOWS_UPDATE_WORKFLOW.md)', '](docs/deployment/WINDOWS_UPDATE_WORKFLOW.md)'))
public_assets = ['tools/deploy/Configure-MedcomServer.ps1', 'docs/backend/SERVER_CONFIGURATION.md',
                 'docs/deployment/WINDOWS_UPDATE_WORKFLOW.md']
if backend:
    public_assets += ['tools/deploy/plan_update.py']
for public_asset in public_assets:
    destination = output / public_asset
    destination.parent.mkdir(parents=True, exist_ok=True)
    copy_public_file(ROOT / public_asset, destination)
if backend:
    copy_public_file(ROOT / '.github/scripts/package_integrity.py', output / 'tools/deploy/package_integrity.py')
if source_revision() != revision:
    raise SystemExit('Source HEAD changed during publish; candidate not finalized')
validate_tree(output)
manifest = {'format': 3 if backend else 2, 'sourceRevision': revision,
            'releaseStatus': 'BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE',
            'files': {path.relative_to(output).as_posix(): hashlib.sha256(read_regular_file(path)).hexdigest()
                      for path in sorted(output.rglob('*')) if path.is_file()}}
if backend:
    manifest['packageProfile'] = 'backend'
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
validate_tree(output)
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            data = read_regular_file(path)
            info = zipfile.ZipInfo(path.relative_to(output).as_posix())
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            package.writestr(info, data)
verifier.unlink(missing_ok=True)
copy_public_file(ROOT / '.github/scripts/package_integrity.py', verifier)
try:
    subprocess.run([os.environ.get('MEDCOM_PYTHON', 'python'), str(verifier), str(archive)], check=True)
    if source_revision() != revision:
        raise SystemExit('Source HEAD changed during verification; candidate not finalized')
except (SystemExit, subprocess.CalledProcessError):
    archive.unlink(missing_ok=True)
    checksum.unlink(missing_ok=True)
    raise
checksum.write_text(''.join(f'{hashlib.sha256(read_regular_file(path)).hexdigest()}  {path.name}\n'
                          for path in (archive, verifier)))
print(f'Created {archive.name}; release blocked until real ERP/SQL and end-to-end acceptance pass.')
