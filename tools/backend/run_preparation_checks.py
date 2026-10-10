#!/usr/bin/env python3
"""Run durable reference checks without claiming product/runtime acceptance."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
files = sorted(root.glob('preparations/L*/20261002/test_*.py'))
files += sorted(root.glob('tools/execution/test_*.py'))
files += sorted(root.glob('tools/traceability/test_*.py'))
files += [root / 'tools/backend/test_reference_runner.py']
if len(files) < 23:
    raise SystemExit('Incomplete preparation handoff: expected at least 23 suites')
for path in files:
    print(f'Running {path.relative_to(root)}', flush=True)
    result = subprocess.run([sys.executable, str(root / 'tools/backend/run_reference_check.py'), str(path)], cwd=root,
        env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1'})
    if result.returncode:
        raise SystemExit(result.returncode)
print(f'PASS: {len(files)} reference suites; product/runtime claims remain separate')
