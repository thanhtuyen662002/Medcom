import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import test_package_integrity

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('plan_update', ROOT / 'tools/deploy/plan_update.py')
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)


class UpdatePlanTests(unittest.TestCase):
    def candidate(self, backend=True):
        fixture = test_package_integrity.PackageTests()
        self.addCleanup(fixture.doCleanups)
        archive = fixture.package(backend=backend)
        return archive, hashlib.sha256(archive.read_bytes()).hexdigest()

    def test_valid_plan_keeps_readiness_and_operator_gates(self):
        archive, checksum = self.candidate()
        result = planner.plan(archive, 'a' * 40, checksum)
        self.assertTrue(result['plan_valid'])
        self.assertEqual('dry_run_only', result['mode'])
        self.assertFalse(result['production_accepted'])
        self.assertEqual('BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE', result['release_status'])
        self.assertEqual('a' * 40 + '-' + checksum[:12], result['release_directory_name'])
        self.assertEqual(4, len(result['required_operator_decisions']))
        self.assertEqual(8, len(result['steps']))

    def test_rejects_wrong_checksum_revision_and_profile(self):
        archive, checksum = self.candidate()
        for revision, digest, reason in (
                ('a' * 40, 'b' * 64, 'archive_checksum_mismatch'),
                ('b' * 40, checksum, 'source_revision_mismatch'),
                ('main', checksum, 'invalid_expected_revision'),
                ('a' * 40, 'bad', 'invalid_expected_sha256')):
            self.assertEqual([reason], planner.plan(archive, revision, digest)['reasons'])
        archive, checksum = self.candidate(backend=False)
        self.assertEqual(['backend_profile_required'], planner.plan(archive, 'a' * 40, checksum)['reasons'])

    def test_unreadable_or_corrupt_candidate_fails_closed(self):
        archive, _ = self.candidate()
        archive.write_bytes(b'not a zip')
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.assertFalse(planner.plan(archive, 'a' * 40, checksum)['plan_valid'])
        archive.unlink()
        self.assertEqual(['unreadable_candidate'], planner.plan(archive, 'a' * 40, checksum)['reasons'])

    def test_change_during_validation_fails_closed(self):
        archive, checksum = self.candidate()
        with patch.object(planner, 'digest', side_effect=[checksum, 'b' * 64]):
            self.assertEqual(['archive_changed_during_validation'],
                             planner.plan(archive, 'a' * 40, checksum)['reasons'])

    def test_packaged_planner_cli_writes_nothing(self):
        archive, checksum = self.candidate()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copyfile(ROOT / 'tools/deploy/plan_update.py', root / 'plan_update.py')
            shutil.copyfile(ROOT / '.github/scripts/package_integrity.py', root / 'package_integrity.py')
            shutil.copyfile(archive, root / 'candidate.zip')
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            result = subprocess.run([sys.executable, str(root / 'plan_update.py'), str(root / 'candidate.zip'),
                                     '--expected-revision', 'a' * 40, '--expected-sha256', checksum],
                                    capture_output=True, text=True, check=True, cwd=root)
            self.assertTrue(json.loads(result.stdout)['plan_valid'])
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir()})
            denied = subprocess.run([sys.executable, str(root / 'plan_update.py'), str(root / 'candidate.zip'),
                                     '--expected-revision', 'b' * 40, '--expected-sha256', checksum],
                                    capture_output=True, text=True, cwd=root)
            self.assertEqual(1, denied.returncode)
            self.assertFalse(json.loads(denied.stdout)['plan_valid'])


if __name__ == '__main__':
    unittest.main()
