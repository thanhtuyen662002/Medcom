import hashlib
import json
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path
from package_integrity import verify, STATUS


class PackageTests(unittest.TestCase):
    def package(self, mutate=None, extras=None, backend=False):
        directory = tempfile.TemporaryDirectory(); self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'candidate.zip'
        payload = {name: b'synthetic' for name in ['Medcom.Api.dll', 'password-worker/Medcom.LegacyPasswordWorker.dll',
                                                 'wwwroot/index.html', 'wwwroot/workspace/index.html', 'DEPLOYMENT.md',
                                                 'tools/deploy/Configure-MedcomServer.ps1', 'docs/backend/SERVER_CONFIGURATION.md']}
        manifest = {'format': 2, 'sourceRevision': 'a' * 40, 'releaseStatus': STATUS,
                    'files': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
        if backend:
            payload.pop('wwwroot/index.html')
            payload.pop('wwwroot/workspace/index.html')
            payload.update({name: b'synthetic' for name in ('tools/deploy/plan_update.py',
                'tools/deploy/package_integrity.py', 'docs/deployment/WINDOWS_UPDATE_WORKFLOW.md')})
            manifest.update(format=3, packageProfile='backend',
                            files={name: hashlib.sha256(data).hexdigest() for name, data in payload.items()})
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

    def test_backend_profile_is_valid_without_embedded_frontend(self):
        self.assertEqual([], verify(self.package(backend=True)))

    def test_backend_profile_rejects_frontend_even_when_hashed(self):
        for name in ('wwwroot/index.html', 'WWWROOT/stale.txt', 'wwwroot'):
            def add(m, p):
                p[name] = b'stale frontend'
                m['files'][name] = hashlib.sha256(p[name]).hexdigest()
            self.assertIn('frontend_payload_forbidden', verify(self.package(add, backend=True)))

    def test_backend_requires_its_operator_assets(self):
        for name in ('tools/deploy/plan_update.py', 'tools/deploy/package_integrity.py',
                     'docs/deployment/WINDOWS_UPDATE_WORKFLOW.md'):
            def remove(m, p):
                p.pop(name); m['files'].pop(name)
            self.assertIn('required_payload_missing', verify(self.package(remove, backend=True)))

    def test_profile_format_confusion_is_rejected(self):
        for change in ({'format': 3}, {'packageProfile': 'backend'}, {'format': 3.0},
                       {'format': 3, 'packageProfile': 'combined'}, {'format': True}):
            self.assertIn('unsupported_manifest_or_release_status',
                          verify(self.package(lambda m, p: m.update(change))))
        self.assertIn('unsupported_manifest_or_release_status',
                      verify(self.package(lambda m, p: m.pop('packageProfile'), backend=True)))

    def test_backend_private_material_and_revision_gates_preserved(self):
        def add(m, p):
            p['appsettings.Private.json'] = b'synthetic'
            m['files']['appsettings.Private.json'] = hashlib.sha256(b'synthetic').hexdigest()
        self.assertEqual(['private_payload_forbidden'], verify(self.package(add, backend=True)))
        self.assertIn('source_revision_missing', verify(self.package(
            lambda m, p: m.update(sourceRevision='unknown'), backend=True)))
        self.assertIn('unsupported_manifest_or_release_status', verify(self.package(
            lambda m, p: m.update(releaseStatus='READY'), backend=True)))

    def test_setup_tool_and_guide_are_required(self):
        for name in ('tools/deploy/Configure-MedcomServer.ps1', 'docs/backend/SERVER_CONFIGURATION.md'):
            def remove(m, p):
                p.pop(name); m['files'].pop(name)
            self.assertIn('required_payload_missing', verify(self.package(remove)))

    def test_private_payload_rejected_even_with_matching_manifest(self):
        for name in ('appsettings.Private.json', 'nested/CONFIG-LOCATION.JSON', 'Tools.dll',
                     'MedData-Data.sql', 'Medcom-Data.sql', 'database.bak', 'database.mdf', 'database.ldf',
                     'server.pfx', 'server.p12', 'ERP_Medcom2026(4).zip', 'Medcom-Data (3)(1).zip'):
            def add(m, p):
                p[name] = b'synthetic-only'; m['files'][name] = hashlib.sha256(p[name]).hexdigest()
            with self.subTest(name=name):
                self.assertEqual(['private_payload_forbidden'], verify(self.package(add)))

    def test_public_schema_migration_is_not_excluded(self):
        def add(m, p):
            p['migrations/001-control-schema.sql'] = b'synthetic-only'
            m['files']['migrations/001-control-schema.sql'] = hashlib.sha256(p['migrations/001-control-schema.sql']).hexdigest()
        self.assertEqual([], verify(self.package(add)))

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

    def test_windows_trailing_dot_or_space_aliases_are_rejected(self):
        for name in ('appsettings.Private.json.', 'server.pfx.', 'nested ./file',
                     'nested./file', 'appsettings.Private.json ', 'server.pfx '):
            with self.subTest(name=name):
                self.assertIn('unsafe_member', verify(self.package(extras=[(name, b'synthetic')])))

    def test_windows_device_names_are_rejected_in_every_component(self):
        for name in ('NUL.txt', 'nested/COM1.dll', 'AUX', 'PRN.json', 'con/file',
                     'LPT9', 'com¹.txt', 'lpt².txt', 'COM³.dll', 'CONIN$.log',
                     'CONOUT$', 'CLOCK$.data', 'NUL .txt', 'con...txt'):
            with self.subTest(name=name):
                self.assertIn('unsafe_member', verify(self.package(extras=[(name, b'x')])))

    def test_windows_illegal_and_control_characters_are_rejected(self):
        for name in ('a?b', 'a*b', 'a<b', 'a>b', 'a|b', 'a"b', 'a\x01b',
                     'a\tb', 'a\nb', 'a\x1fb', 'a\x7fb', 'a\x85b'):
            with self.subTest(name=name):
                self.assertIn('unsafe_member', verify(self.package(extras=[(name, b'x'), ('a_b', b'y')])))

    def test_casefolded_file_directory_prefix_collisions_are_rejected(self):
        for name in ('tools', 'TOOLS', 'tools/DEPLOY', 'MEDCOM.API.DLL/child.txt'):
            with self.subTest(name=name):
                self.assertIn('file_directory_collision', verify(self.package(extras=[(name, b'x')])))

    def test_valid_portable_runtime_paths_remain_allowed(self):
        def add(m, p):
            for name in ('runtimes/win-x64/native/Microsoft.Data.SqlClient.SNI.dll',
                         'password-worker/Medcom.LegacyPasswordWorker.runtimeconfig.json',
                         'locales/vi-VN.json', 'tools/com10-example.txt'):
                p[name] = b'synthetic'; m['files'][name] = hashlib.sha256(p[name]).hexdigest()
        self.assertEqual([], verify(self.package(add, backend=True)))

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
