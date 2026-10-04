import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile


ROOT = Path(__file__).resolve().parents[2]


class PackageSourceCustodyTests(unittest.TestCase):
    def build(self, change=None, profile="combined", frontend=True, unsafe=None, stat_change=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name).resolve()
        for relative in ('tools/deploy/package.py', '.github/scripts/package_integrity.py'):
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        fixtures = ['docs/deployment/SERVER_DEPLOYMENT.md', 'docs/backend/SERVER_CONFIGURATION.md',
                    'tools/deploy/Configure-MedcomServer.ps1', 'tools/deploy/plan_update.py',
                    'docs/deployment/WINDOWS_UPDATE_WORKFLOW.md']
        if frontend:
            fixtures += ['src/frontend/out/index.html', 'src/frontend/out/workspace/index.html']
        for relative in fixtures:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text('Isolated test fixture; not a production payload')
        external_temp = tempfile.TemporaryDirectory()
        self.addCleanup(external_temp.cleanup)
        external = Path(external_temp.name)
        (external / 'synthetic-private.json').write_text('synthetic external bytes must not be packaged')
        if unsafe == 'source-link':
            source = root / 'docs/backend/SERVER_CONFIGURATION.md'
            source.unlink()
            source.symlink_to(external / 'synthetic-private.json')
        phase = {'publishes': 0, 'verified': False}
        real_run = subprocess.run
        real_fstat = os.fstat
        real_lstat = Path.lstat
        path_stat_calls = {'count': 0}

        def lstat(path):
            info = real_lstat(path)
            if stat_change == 'path-ctime' and path == root / 'docs/deployment/SERVER_DEPLOYMENT.md':
                path_stat_calls['count'] += 1
                if path_stat_calls['count'] == 3:
                    fields = {name: getattr(info, name) for name in dir(info) if name.startswith('st_')}
                    fields['st_ctime_ns'] += 1
                    return SimpleNamespace(**fields)
            return info
        stat_calls = {'count': 0}

        def fstat(fd):
            info = real_fstat(fd)
            stat_calls['count'] += 1
            if not stat_change or stat_change == 'path-ctime':
                return info
            fields = {name: getattr(info, name) for name in dir(info) if name.startswith('st_')}
            if stat_change == 'stable-ctime-offset':
                # CPython 3.12.10 Windows fstat uses ChangeTime; lstat uses birthtime.
                fields['st_ctime_ns'] += 1_000_000_000
            elif stat_calls['count'] % 2 == 0:
                fields[stat_change] += 1
            return SimpleNamespace(**fields)

        def run(command, **kwargs):
            if command[0] == 'fixture-dotnet':
                phase['publishes'] += 1
                self.assertEqual(profile == 'backend', '-p:UseAppHost=false' in command)
                output = Path(command[command.index('-o') + 1])
                output.mkdir(parents=True, exist_ok=True)
                name = 'Medcom.Api.dll' if phase['publishes'] == 1 else 'Medcom.LegacyPasswordWorker.dll'
                (output / name).write_bytes(b'Isolated synthetic assembly fixture')
                if phase['publishes'] == 1:
                    if unsafe == 'file-link':
                        (output / 'innocent.json').symlink_to(external / 'synthetic-private.json')
                    elif unsafe == 'directory-link':
                        (output / 'innocent').symlink_to(external, target_is_directory=True)
                    elif unsafe == 'hard-link':
                        os.link(external / 'synthetic-private.json', output / 'innocent.json')
                    elif unsafe == 'fifo':
                        os.mkfifo(output / 'innocent.json')
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

        with patch.object(sys, 'argv', ['package.py', '--dotnet', 'fixture-dotnet', '--profile', profile]), \
             patch.object(subprocess, 'run', side_effect=run), \
             patch.object(subprocess, 'check_output', side_effect=git), \
             patch.object(os, 'fstat', side_effect=fstat), \
             patch.object(Path, 'lstat', lstat), \
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

    def test_backend_needs_no_frontend_and_has_separate_profile_artifacts(self):
        root, failure = self.build(profile='backend', frontend=False)
        self.assertIsNone(failure)
        self.assertFalse((root / 'artifacts/medcom-server-candidate.zip').exists())
        self.assertTrue((root / 'artifacts/medcom-backend-candidate.sha256').exists())
        self.assertTrue((root / 'artifacts/medcom-backend-verify-package.py').exists())
        with zipfile.ZipFile(root / 'artifacts/medcom-backend-candidate.zip') as archive:
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(3, manifest['format'])
            self.assertEqual('backend', manifest['packageProfile'])
            self.assertFalse(any(name.startswith('wwwroot/') for name in archive.namelist()))
            self.assertIn('tools/deploy/plan_update.py', manifest['files'])
            self.assertIn('tools/deploy/package_integrity.py', manifest['files'])

    def test_backend_source_changes_never_leave_final_candidate(self):
        for change in ('publish-head', 'publish-dirty', 'verify-head', 'verify-dirty'):
            with self.subTest(change=change):
                root, failure = self.build(change, profile='backend', frontend=False)
                self.assertIsNotNone(failure)
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.zip').exists())
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.sha256').exists())

    def test_linked_and_nonregular_inputs_never_finalize_candidate(self):
        modes = ['file-link', 'directory-link', 'source-link', 'hard-link']
        if hasattr(os, 'mkfifo'):
            modes.append('fifo')
        for unsafe in modes:
            with self.subTest(unsafe=unsafe):
                try:
                    root, failure = self.build(profile='backend', frontend=False, unsafe=unsafe)
                except OSError as error:
                    if os.name == 'nt' and getattr(error, 'winerror', None) == 1314:
                        self.skipTest('This Windows test identity cannot create synthetic symbolic links')
                    raise
                self.assertIsNotNone(failure)
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.zip').exists())
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.sha256').exists())

    def test_stable_path_and_descriptor_ctime_semantics_can_differ(self):
        root, failure = self.build(profile='backend', frontend=False, stat_change='stable-ctime-offset')
        self.assertIsNone(failure)
        self.assertTrue((root / 'artifacts/medcom-backend-candidate.sha256').is_file())

    def test_descriptor_changes_still_reject_package(self):
        for field in ('st_ctime_ns', 'st_mtime_ns', 'st_size', 'st_ino', 'st_nlink'):
            with self.subTest(field=field):
                root, failure = self.build(profile='backend', frontend=False, stat_change=field)
                self.assertIsNotNone(failure)
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.zip').exists())
                self.assertFalse((root / 'artifacts/medcom-backend-candidate.sha256').exists())

    def test_path_metadata_change_still_rejects_package(self):
        root, failure = self.build(profile='backend', frontend=False, stat_change='path-ctime')
        self.assertIsNotNone(failure)
        self.assertFalse((root / 'artifacts/medcom-backend-candidate.zip').exists())
        self.assertFalse((root / 'artifacts/medcom-backend-candidate.sha256').exists())

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
