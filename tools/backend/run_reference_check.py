#!/usr/bin/env python3
"""Execute checksum-pinned reference programs with portable Python child launches.

Historical fixtures invoke Python scripts by their shebang paths. Windows requires
an explicit interpreter. This test-process adapter prepends the same interpreter
for direct .py child commands and preserves all arguments, options, errors and
return codes. Fixture bytes and their review/hash acceptance remain authoritative.
"""
from pathlib import Path
import os
import runpy
import subprocess
import sys


class PythonScriptPopen(subprocess.Popen):
    def __init__(self, args, *positional, **options):
        if (isinstance(args, (list, tuple)) and args and not options.get('shell', False)
                and isinstance(args[0], (str, os.PathLike)) and Path(args[0]).suffix == '.py'):
            script = Path(args[0])
            if not script.is_absolute():
                script = Path(options.get('cwd') or Path.cwd()) / script
            if script.is_file():
                args = [sys.executable, *args]
        super().__init__(args, *positional, **options)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('A reference Python script is required.')
    path = Path(sys.argv[1]).resolve(strict=True)
    if path.suffix != '.py':
        raise SystemExit('A reference Python script is required.')
    # Confined to this reference-test process. subprocess.run/check_output still
    # perform their normal timeout, stream, error and check=True handling.
    subprocess.Popen = PythonScriptPopen
    sys.argv = [str(path), *sys.argv[2:]]
    sys.path.insert(0, str(path.parent))
    runpy.run_path(str(path), run_name='__main__')


if __name__ == '__main__':
    main()
