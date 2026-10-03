import hashlib
import json
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path
from package_integrity import verify, STATUS


class PackageTests(unittest.TestCase):
    def package(self, mutate=None, extras=None):
        directory = tempfile.TemporaryDirectory(); self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'candidate.zip'
        payload = {name: b'synthetic' for name in ['Medcom.Api.dll', 'password-worker/Medcom.LegacyPasswordWorker.dll',
                                                 'wwwroot/index.html', 'wwwroot/workspace/index.html', 'DEPLOYMENT.md']}
        manifest = {'format': 2, 'sourceRevision': 'a' * 40, 'releaseStatus': STATUS,
                    'files': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
        if mutate:
            mutate(manifest, payload)
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in payload.items():
                archive.writestr(name, data)
            archive.writestr('manifest.json', json.dumps(manifest))
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                for name, data in extras or []:
                    if isinstance(name, str):
                        member = zipfile.ZipInfo(name)
                        # Preserve the raw ZIP name that Windows would otherwise normalize.
                        member.filename = name
                    else:
                        member = name
                    archive.writestr(member, data)
        return path

    def test_valid_staging_payload(self):
        self.assertEqual([], verify(self.package()))

    def test_tampered_payload(self):
        path = self.package(lambda m, p: p.update({'Medcom.Api.dll': b'tampered'}))
        self.assertIn('checksum_mismatch:Medcom.Api.dll', verify(path))

    def test_extra_missing_and_duplicate_files(self):
        self.assertIn('inventory_mismatch', verify(self.package(extras=[('unlisted.bin', b'x')])))
        self.assertIn('inventory_mismatch', verify(self.package(lambda m, p: p.pop('DEPLOYMENT.md'))))
        self.assertIn('duplicate_or_case_colliding_member', verify(self.package(extras=[('Medcom.Api.dll', b'x')])))
        self.assertIn('duplicate_or_case_colliding_member', verify(self.package(extras=[('medcom.api.dll', b'x')])))

    def test_traversal_absolute_backslash_and_drive_paths(self):
        for name in ['../secret', '/root/key', 'a/../b', 'C:/windows/x', 'a\\x', 'a//x']:
            with self.subTest(name=name):
                self.assertIn('unsafe_member', verify(self.package(extras=[(name, b'x')])))

    def test_raw_name_normalization_is_rejected(self):
        raw_name = 'wwwroot/index.html\x00hidden'
        path = self.package(extras=[(raw_name, b'x')])
        with zipfile.ZipFile(path) as archive:
            self.assertIn(raw_name, [member.orig_filename for member in archive.infolist()])
        self.assertIn('unsafe_member', verify(path))

    def test_symlink(self):
        info = zipfile.ZipInfo('link'); info.create_system = 3; info.external_attr = 0o120777 << 16
        self.assertIn('unsafe_member', verify(self.package(extras=[(info, b'target')])))

    def test_revision_or_release_status_cannot_be_omitted_or_promoted(self):
        for change, reason in [({'sourceRevision': None}, 'source_revision_missing'),
                               ({'releaseStatus': 'GO'}, 'unsupported_manifest_or_release_status'),
                               ({'format': 1}, 'unsupported_manifest_or_release_status')]:
            self.assertIn(reason, verify(self.package(lambda m, p: m.update(change))))

    def test_required_payload(self):
        def remove(m, p):
            p.pop('Medcom.Api.dll'); m['files'].pop('Medcom.Api.dll')
        self.assertIn('required_payload_missing', verify(self.package(remove)))

    def test_invalid_inventory_or_corrupt_zip(self):
        self.assertIn('invalid_inventory', verify(self.package(lambda m, p: m.update(files=[]))))
        path = self.package(); path.write_bytes(b'broken')
        self.assertEqual(['unreadable_or_corrupt_package'], verify(path))


if __name__ == '__main__':
    unittest.main()
