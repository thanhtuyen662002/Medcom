import contextlib
import io
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile


ROOT = Path(__file__).resolve().parents[2]


class PackageSourceCustodyTests(unittest.TestCase):
    def build(self, change=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name).resolve()
        for relative in ('tools/deploy/package.py', '.github/scripts/package_integrity.py'):
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        for relative in ('src/frontend/out/index.html', 'src/frontend/out/workspace/index.html',
                         'docs/deployment/SERVER_DEPLOYMENT.md', 'docs/backend/SERVER_CONFIGURATION.md',
                         'tools/deploy/Configure-MedcomServer.ps1'):
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text('Isolated test fixture; not a production payload')
        phase = {'publishes': 0, 'verified': False}
        real_run = subprocess.run

        def run(command, **kwargs):
            if command[0] == 'fixture-dotnet':
                phase['publishes'] += 1
                output = Path(command[command.index('-o') + 1])
                output.mkdir(parents=True, exist_ok=True)
                name = 'Medcom.Api.dll' if phase['publishes'] == 1 else 'Medcom.LegacyPasswordWorker.dll'
                (output / name).write_bytes(b'Isolated synthetic assembly fixture')
                return subprocess.CompletedProcess(command, 0)
            result = real_run(command, capture_output=True, text=True, **kwargs)
            phase['verified'] = True
            return result

        def git(command, **kwargs):
            changed = (change and ((change.startswith('publish') and phase['publishes'] == 2)
                                  or (change.startswith('verify') and phase['verified'])))
            if command[1] == 'rev-parse':
                return ('b' if changed and change.endswith('head') else 'a') * 40 + '\n'
            return ' M source.cs\n' if changed and change.endswith('dirty') else ''

        with patch.object(sys, 'argv', ['package.py', '--dotnet', 'fixture-dotnet']), \
             patch.object(subprocess, 'run', side_effect=run), \
             patch.object(subprocess, 'check_output', side_effect=git), \
             contextlib.redirect_stdout(io.StringIO()):
            try:
                runpy.run_path(str(root / 'tools/deploy/package.py'), run_name='__main__')
            except SystemExit as failure:
                return root, failure
        return root, None

    def test_stable_source_produces_verified_setup_assets_with_posix_inventory(self):
        root, failure = self.build()
        self.assertIsNone(failure)
        with zipfile.ZipFile(root / 'artifacts/medcom-server-candidate.zip') as archive:
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual('a' * 40, manifest['sourceRevision'])
            self.assertIn('tools/deploy/Configure-MedcomServer.ps1', manifest['files'])
            self.assertIn('docs/backend/SERVER_CONFIGURATION.md', manifest['files'])
            self.assertFalse(any('\\' in name for name in manifest['files']))
        self.assertTrue((root / 'artifacts/medcom-candidate.sha256').is_file())

    def assert_unfinalized(self, change):
        root, failure = self.build(change)
        self.assertIsNotNone(failure)
        self.assertFalse((root / 'artifacts/medcom-server-candidate.zip').exists())
        self.assertFalse((root / 'artifacts/medcom-candidate.sha256').exists())

    def test_changed_head_during_publish_rejects_candidate(self):
        self.assert_unfinalized('publish-head')

    def test_dirty_source_during_publish_rejects_candidate(self):
        self.assert_unfinalized('publish-dirty')

    def test_changed_head_during_verification_removes_unaccepted_archive(self):
        self.assert_unfinalized('verify-head')

    def test_dirty_source_during_verification_removes_unaccepted_archive(self):
        self.assert_unfinalized('verify-dirty')


if __name__ == '__main__':
    unittest.main()
