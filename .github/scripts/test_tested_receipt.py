import subprocess
import tempfile
import unittest
from pathlib import Path
from tested_receipt import receipt


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Synthetic Test'); self.git('config', 'user.email', 'test@example.invalid')
        (self.root / 'base').write_text('base')
        self.git('add', '.'); self.git('commit', '-qm', 'base')
        self.base = self.git('rev-parse', 'HEAD')
        self.git('switch', '-qc', 'source')
        (self.root / 'source').write_text('source')
        self.git('add', '.'); self.git('commit', '-qm', 'source')
        self.source = self.git('rev-parse', 'HEAD')
        self.git('switch', '-q', 'main'); self.git('merge', '--no-ff', '-qm', 'tested merge', self.source)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def get(self, **kwargs):
        args = dict(root=self.root, event='pull_request', source=self.source, base=self.base,
                    run_id='1234', repository='thanhtuyen662002/Medcom')
        args.update(kwargs)
        return receipt(**args)

    def test_exact_merge_provenance(self):
        result = self.get()
        self.assertEqual(self.git('rev-parse', 'HEAD'), result['sha'])
        self.assertFalse(result['production_accepted'])

    def test_wrong_base_source_or_direct_source_checkout(self):
        for args in [{'base': 'f' * 40}, {'source': 'e' * 40}]:
            with self.assertRaises(ValueError): self.get(**args)
        self.git('checkout', '-q', self.source)
        with self.assertRaises(ValueError): self.get()

    def test_dirty_checkout(self):
        (self.root / 'base').write_text('modified')
        with self.assertRaises(ValueError): self.get()

    def test_untracked_code_is_not_attested(self):
        (self.root / 'new.cs').write_text('uncommitted')
        with self.assertRaises(ValueError): self.get()

    def test_other_events_repository_or_invalid_id(self):
        for args in [{'event': 'push'}, {'repository': 'other/repo'}, {'run_id': '../1'}]:
            with self.assertRaises(ValueError): self.get(**args)


if __name__ == '__main__':
    unittest.main()
