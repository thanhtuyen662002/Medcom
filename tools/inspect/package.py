#!/usr/bin/env python3
"""Package the isolated inspector from a clean, committed source snapshot."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tarfile
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'tools/inspect/Medcom.TargetInspect/Medcom.TargetInspect.csproj'
README = 'tools/inspect/README.md'
LINKED_SOURCES = (
    'src/backend/Medcom.Api/ServerConfiguration.cs',
    'src/backend/Medcom.Infrastructure/SqlDevelopmentTestTlsTarget.cs',
)
ARCHIVE_NAME = 'medcom-target-inspector.zip'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def provenance():
    if git('status', '--porcelain', '--untracked-files=all').strip():
        raise ValueError('Package only a clean committed source tree; source is dirty')
    return (git('rev-parse', '--verify', 'HEAD').decode().strip(),
            git('rev-parse', '--verify', 'HEAD^{tree}').decode().strip())


def safe_name(name):
    path = PurePosixPath(name)
    if (not name or name != path.as_posix() or path.is_absolute()
            or any(part in ('', '.', '..') for part in name.split('/'))
            or '\\' in name or ':' in name or any(ord(char) < 32 for char in name)):
        raise ValueError('Package paths must be canonical safe relative paths')
    return path


def regular_node(path, directory=False):
    info = path.lstat()
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if (not expected(info.st_mode) or stat.S_ISLNK(info.st_mode)
            or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)
            or (not directory and info.st_nlink != 1)):
        raise ValueError('Package paths must be regular files/directories without links')
    return info


def read_regular(path):
    before = regular_node(path)
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        data = stream.read()
        after = os.fstat(stream.fileno())
    current = regular_node(path)
    identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
    snapshot = lambda info: (identity(info), info.st_mode, info.st_nlink,
                             info.st_ctime_ns, getattr(info, 'st_file_attributes', 0))
    # Windows path-stat and descriptor-stat ctime have different meanings;
    # compare ctime only within the same API, retaining identity/race checks.
    if (identity(before) != identity(opened) or identity(after) != identity(current)
            or snapshot(before) != snapshot(current) or snapshot(opened) != snapshot(after)
            or not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1
            or len(data) != after.st_size):
        raise ValueError('Package input changed while reading')
    return data


def snapshot_source(revision, destination):
    # Git archive excludes ignored build outputs, private local files and stale
    # binaries. Never compile from the caller's working directory.
    with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', revision))) as archive:
        for member in archive.getmembers():
            name = member.name.rstrip('/') if member.isdir() else member.name
            relative = safe_name(name)
            target = destination.joinpath(*relative.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
            else:
                raise ValueError('Committed source snapshot must not contain links or special files')


def validate_project(snapshot):
    # Windows temporary paths can use an 8.3 spelling while resolve() returns the
    # long spelling. Use one verified canonical anchor for every relative test.
    regular_node(snapshot, directory=True)
    snapshot = snapshot.resolve(strict=True)
    regular_node(snapshot, directory=True)
    project = snapshot / PROJECT
    tree = ET.parse(project)
    if tree.findall('.//ProjectReference') or tree.findall('.//Reference'):
        raise ValueError('Inspector must not reference production projects or local assemblies')
    linked = []
    for node in tree.findall('.//Compile'):
        include = node.attrib.get('Include')
        if not include:
            continue
        source = (project.parent / include.replace('\\', '/')).resolve()
        if not source.is_relative_to(project.parent):
            linked.append(source.relative_to(snapshot).as_posix())
    if sorted(linked) != sorted(LINKED_SOURCES):
        raise ValueError('Inspector must compile-link exactly the two declared source files')
    if not (project.parent / 'packages.lock.json').is_file():
        raise ValueError('Inspector requires committed locked dependencies')


def published_files(directory):
    files = {}
    for parent, folders, names in os.walk(directory, followlinks=False):
        regular_node(Path(parent), directory=True)
        for folder in folders:
            regular_node(Path(parent) / folder, directory=True)
        for name in names:
            path = Path(parent) / name
            relative = path.relative_to(directory).as_posix()
            safe_name(relative)
            # Only compiled portable output is allowed, including native
            # SqlClient runtime assets. No settings, source, apphost or secrets.
            if (path.suffix.lower() not in ('.dll', '.so', '.dylib', '.pdb')
                    and relative not in ('Medcom.TargetInspect.deps.json',
                                         'Medcom.TargetInspect.runtimeconfig.json')):
                raise ValueError(f'Unexpected inspector publish output: {relative}')
            if name.startswith('Medcom.') and name.endswith('.dll') and name != 'Medcom.TargetInspect.dll':
                raise ValueError('Inspector package must not include production Medcom assemblies')
            files[relative] = read_regular(path)
    for required in ('Medcom.TargetInspect.dll', 'Medcom.TargetInspect.deps.json',
                     'Medcom.TargetInspect.runtimeconfig.json'):
        if required not in files:
            raise ValueError(f'Missing inspector publish output: {required}')
    return files


def package(dotnet):
    revision, tree = provenance()
    artifacts = ROOT / 'artifacts'
    if artifacts.exists() or artifacts.is_symlink():
        regular_node(artifacts, directory=True)
    else:
        artifacts.mkdir()
    archive_path = artifacts / ARCHIVE_NAME
    checksum_path = artifacts / 'medcom-target-inspector.sha256'
    # Remove previous completion markers before starting this package again.
    for path in (archive_path, checksum_path):
        if path.exists() or path.is_symlink():
            regular_node(path)
            path.unlink()
    with tempfile.TemporaryDirectory(prefix='medcom-target-inspector-') as temporary:
        workspace = Path(temporary)
        snapshot = workspace / 'source'
        snapshot.mkdir()
        snapshot_source(revision, snapshot)
        validate_project(snapshot)
        linked = {}
        for name in LINKED_SOURCES:
            data = read_regular(snapshot / name)
            if data != git('show', f'{revision}:{name}'):
                raise ValueError('Compile-linked source snapshot differs from the committed blob')
            linked[name] = hashlib.sha256(data).hexdigest()
        subprocess.run([dotnet, 'restore', str(snapshot / PROJECT), '--locked-mode'],
                       check=True, cwd=snapshot)
        output = workspace / 'published'
        subprocess.run([dotnet, 'publish', str(snapshot / PROJECT), '--configuration', 'Release',
                        '--no-restore', '--self-contained', 'false', '-p:UseAppHost=false',
                        '-p:ContinuousIntegrationBuild=true', f'-p:SourceRevisionId={revision}',
                        f'-p:PathMap={snapshot}=/_/', '-p:DebugType=None', '-p:DebugSymbols=false',
                        '-m:1', '-nr:false', '--output', str(output)], check=True, cwd=snapshot)
        files = published_files(output)
        files['README.md'] = read_regular(snapshot / README)
        manifest = {'schemaVersion': 1, 'kind': 'medcom-target-inspector',
                    'sourceRevision': revision, 'sourceTree': tree,
                    'releaseStillBlocked': True, 'linkedSources': linked,
                    'files': {name: hashlib.sha256(data).hexdigest()
                              for name, data in sorted(files.items())}}
        files['manifest.json'] = (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode()
        staged_archive = workspace / ARCHIVE_NAME
        with zipfile.ZipFile(staged_archive, 'x', compression=zipfile.ZIP_DEFLATED,
                             compresslevel=9) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                archive.writestr(info, data, compresslevel=9)
        with zipfile.ZipFile(staged_archive) as archive:
            if archive.namelist() != sorted(files) or archive.testzip() is not None:
                raise ValueError('Inspector ZIP inventory or integrity verification failed')
            for name, data in files.items():
                if archive.read(name) != data:
                    raise ValueError('Inspector ZIP content verification failed')
        if provenance() != (revision, tree):
            raise ValueError('Source HEAD changed during publish; package not finalized')
        data = read_regular(staged_archive)
        with archive_path.open('xb') as stream:
            stream.write(data)
        with checksum_path.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(f'{hashlib.sha256(data).hexdigest()}  {ARCHIVE_NAME}\n')
    print(f'Created {archive_path.name} from actual source {revision} (tree {tree}).')
    print('Inspection only; business, target runtime and release acceptance remain blocked.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet', default=os.environ.get('MEDCOM_DOTNET', 'dotnet'))
    args = parser.parse_args()
    try:
        package(args.dotnet)
    except (OSError, ValueError, subprocess.CalledProcessError, ET.ParseError, tarfile.TarError) as error:
        raise SystemExit(f'Inspector packaging failed: {error}') from error


if __name__ == '__main__':
    main()
