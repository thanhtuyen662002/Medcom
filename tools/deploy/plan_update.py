#!/usr/bin/env python3
"""Read-only backend candidate verification and operator update plan.

This command never extracts files, runs commands, contacts a server, reads private
configuration or changes services. A valid plan is not deployment acceptance.
Use the script/verifier from a trusted reviewed checkout or verified distribution.
"""
import argparse
import hashlib
import types
import json
from pathlib import Path
import re
import sys
import zipfile


def load_verifier():
    here = Path(__file__).resolve().parent
    path = here / 'package_integrity.py'
    if not path.is_file():
        path = here.parents[1] / '.github/scripts/package_integrity.py'
    # Execute only this trusted local helper, without creating a __pycache__ file.
    module = types.ModuleType('medcom_package_integrity')
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


def digest(path):
    checksum = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


def plan(archive, expected_revision, expected_sha256):
    failure = {'plan_valid': False, 'production_accepted': False, 'reasons': []}
    if not re.fullmatch(r'[0-9a-f]{40}', expected_revision or ''):
        failure['reasons'] = ['invalid_expected_revision']
        return failure
    if not re.fullmatch(r'[0-9a-f]{64}', expected_sha256 or ''):
        failure['reasons'] = ['invalid_expected_sha256']
        return failure
    try:
        if digest(archive) != expected_sha256:
            failure['reasons'] = ['archive_checksum_mismatch']
            return failure
        errors = load_verifier().verify(archive)
        if errors:
            failure['reasons'] = errors
            return failure
        with zipfile.ZipFile(archive) as package:
            manifest = json.loads(package.read('manifest.json'))
        if manifest.get('format') != 3 or manifest.get('packageProfile') != 'backend':
            failure['reasons'] = ['backend_profile_required']
            return failure
        if manifest['sourceRevision'] != expected_revision:
            failure['reasons'] = ['source_revision_mismatch']
            return failure
        if digest(archive) != expected_sha256:
            failure['reasons'] = ['archive_changed_during_validation']
            return failure
    except (OSError, ValueError, KeyError, zipfile.BadZipFile):
        failure['reasons'] = ['unreadable_candidate']
        return failure
    return {
        'plan_valid': True,
        'mode': 'dry_run_only',
        'production_accepted': False,
        'source_revision': expected_revision,
        'archive_sha256': expected_sha256,
        'release_directory_name': expected_revision + '-' + expected_sha256[:12],
        'release_status': manifest['releaseStatus'],
        'required_operator_decisions': [
            'Confirm supported Windows/runtime architecture and trusted ASP.NET Core/.NET 10 installation.',
            'Choose hosting model and verify its exact application identity, stop/start controls and release binding.',
            'Approve maintenance window, rollback binding and private configuration/key access.',
            'Verify trusted HTTPS, SQL certificate chain and accepted application/dependency smoke checks.'
        ],
        'steps': [
            'Reverify the trusted revision and archive hash immediately before any operator extraction.',
            'Extract only into a fresh release directory; never overwrite the current or previous release.',
            'Keep private configuration, selector, owner DLL and keys outside checkout and release directories.',
            'Record the current release binding; stop only the approved application and confirm it stopped.',
            'Point the approved host at the new release, preserving its private settings; start once.',
            'Check trusted HTTPS and /health/live; /health/ready remains blocked and is not a production pass.',
            'If startup or approved smoke checks fail, stop the candidate and restore/start the previous release.',
            'Preserve previous releases and private diagnostics; code rollback does not reverse database changes.'
        ]
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--expected-revision', required=True)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args(argv)
    result = plan(args.archive, args.expected_revision, args.expected_sha256)
    print(json.dumps(result, indent=2))
    return 0 if result['plan_valid'] else 1


if __name__ == '__main__':
    sys.exit(main())
