#!/usr/bin/env python3
"""Verify candidate ZIP inventory/checksums before extraction or installation.

Integrity is not release acceptance. This verifier accepts only a staging manifest
and never installs, extracts, modifies SQL, or changes configuration.
"""
import argparse
import hashlib
import json
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILES = 50000
MAX_BYTES = 2 * 1024 ** 3
MAX_MANIFEST_BYTES = 8 * 1024 ** 2
HEX = re.compile(r'[0-9a-f]{64}\Z')
SHA = re.compile(r'[0-9a-f]{40}\Z')
STATUS = 'BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE'


def safe_name(name):
    path = PurePosixPath(name)
    return bool(name and not name.startswith('/') and '\\' not in name and ':' not in name
                and all(part not in ('', '.', '..') for part in name.split('/'))
                and str(path) == name)


def verify(path):
    errors = []
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            names = [m.filename for m in members]
            if len(members) > MAX_FILES or sum(m.file_size for m in members) > MAX_BYTES:
                return ['archive_limit_exceeded']
            if len(names) != len(set(names)) or len(names) != len(set(n.casefold() for n in names)):
                errors.append('duplicate_or_case_colliding_member')
            if any(not safe_name(m.filename) or m.is_dir()
                   or stat.S_ISLNK(m.external_attr >> 16) or m.flag_bits & 1 for m in members):
                errors.append('unsafe_member')
            if errors:
                return errors
            if 'manifest.json' not in names or archive.getinfo('manifest.json').file_size > MAX_MANIFEST_BYTES:
                return ['manifest_missing_or_oversized']
            manifest = json.loads(archive.read('manifest.json'))
            if not isinstance(manifest, dict):
                return ['invalid_manifest']
            if manifest.get('format') != 2 or manifest.get('releaseStatus') != STATUS:
                errors.append('unsupported_manifest_or_release_status')
            if not isinstance(manifest.get('sourceRevision'), str) or not SHA.fullmatch(manifest['sourceRevision']):
                errors.append('source_revision_missing')
            files = manifest.get('files')
            if not isinstance(files, dict):
                return errors + ['invalid_inventory']
            if set(files) != set(names) - {'manifest.json'}:
                errors.append('inventory_mismatch')
            required = {'Medcom.Api.dll', 'password-worker/Medcom.LegacyPasswordWorker.dll',
                        'wwwroot/index.html', 'wwwroot/workspace/index.html', 'DEPLOYMENT.md'}
            if not required.issubset(files):
                errors.append('required_payload_missing')
            for name, expected in files.items():
                if not safe_name(name) or not isinstance(expected, str) or not HEX.fullmatch(expected):
                    errors.append('invalid_inventory_entry')
                    continue
                if name not in names:
                    continue
                digest = hashlib.sha256()
                with archive.open(name) as stream:
                    while chunk := stream.read(1024 ** 2):
                        digest.update(chunk)
                if digest.hexdigest() != expected:
                    errors.append('checksum_mismatch:' + name)
    except (OSError, ValueError, TypeError, KeyError, zipfile.BadZipFile, RuntimeError):
        return ['unreadable_or_corrupt_package']
    return sorted(set(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    errors = verify(args.archive)
    print(json.dumps({'integrity': 'FAIL' if errors else 'PASS', 'reasons': errors,
                      'production_accepted': False}, indent=2))
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
