#!/usr/bin/env python3
"""Emit exact checkout provenance after tests; never declare release acceptance."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

SHA = re.compile(r'[0-9a-f]{40}\Z')


def receipt(root, event, source, base, run_id, repository):
    if event != 'pull_request' or repository != 'thanhtuyen662002/Medcom' or not run_id.isdigit():
        raise ValueError('Only this repository pull-request run can attest a tested merge')
    if not SHA.fullmatch(source) or not SHA.fullmatch(base) or source == base:
        raise ValueError('Invalid source/base')
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
    head = git('rev-parse', 'HEAD')
    parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split()
    if parents != [head, base, source]:
        raise ValueError('Checkout is not the exact expected base/source merge')
    if git('status', '--porcelain', '--untracked-files=normal'):
        raise ValueError('Tested source checkout is dirty')
    return {'format': 1, 'repository': repository, 'event': event, 'source': source,
            'base': base, 'sha': head, 'run_id': run_id, 'production_accepted': False,
            'usage': 'Verify artifact origin and successful GitHub check/run; then recheck live head/base/policy before integration.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    data = receipt(Path.cwd(), os.environ['TEST_EVENT'], os.environ['TEST_SOURCE'],
                   os.environ['TEST_BASE'], os.environ['TEST_RUN_ID'], os.environ['TEST_REPOSITORY'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=2) + '\n')
    print('Recorded exact tested source/base checkout; release acceptance remains open.')


if __name__ == '__main__':
    main()
