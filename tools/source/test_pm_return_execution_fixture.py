"""Adversarial synthetic inputs only; no owner SQL, rows, DLLs or SQL runtime."""
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import prepare_pm_return_execution_fixture as fixture


class PmReturnFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='medcom-pmr-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'synthetic.sql'
        self.output = self.root / 'private-fixture'
        self.parent = 'CREATE TABLE [dbo].[Parent] (ID int NOT NULL PRIMARY KEY)\n'
        self.child = 'CREATE TABLE [dbo].[Child] (ID int NOT NULL, ParentID int NULL)\n'
        self.extra = ('ALTER TABLE [dbo].[Child] WITH CHECK ADD CONSTRAINT [FK_Test] FOREIGN KEY (ParentID)\n'
                      'REFERENCES [dbo].[Parent] (ID)\n')
        self.procedure = ("CREATE PROCEDURE [dbo].[Return] AS\nBEGIN\n"
                          "SELECT N'Đây là synthetic; GO và CREATE không phải delimiter'\nEND\n")
        self.text = ('GO\n' + self.parent + 'GO\n' + self.child + 'GO\n' + self.extra + 'GO\n'
                     + self.procedure + 'GO\nINSERT [dbo].[Parent] VALUES(987654)\nGO\n')
        self.write(self.text)
        # Explicit expected synthetic batches, not a second call to the scanner under test.
        self.spec = {'schemaVersion': 1, 'rootObjects': ['dbo.Child', 'dbo.Return'],
                     'objects': [self.pin('Parent', 'TABLE', self.parent, []),
                                 self.pin('Child', 'TABLE', self.child, []),
                                 self.pin('Return', 'PROCEDURE', self.procedure, [])],
                     'supplementalDdl': [self.pin_extra()]}
        self.repin_source()

    def write(self, text):
        self.source.write_bytes(b'\xff\xfe' + text.encode('utf-16-le'))

    def repin_source(self):
        data = self.source.read_bytes()
        self.spec['source'] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                               'lines': len(data[2:].decode('utf-16-le').splitlines())}

    def pin(self, short, kind, text, refs):
        start = self.text[:self.text.index(text)].count('\n') + 1
        return {'name': 'dbo.' + short, 'kind': kind, 'startLine': start,
                'endLine': start + text.count('\n') - 1,
                'sha256': hashlib.sha256(text.encode()).hexdigest(), 'references': refs}

    def pin_extra(self):
        start = self.text[:self.text.index(self.extra)].count('\n') + 1
        return {'owner': 'dbo.Child', 'startLine': start, 'endLine': start + 1,
                'sha256': hashlib.sha256(self.extra.encode()).hexdigest(),
                'references': ['dbo.Child', 'dbo.Parent']}

    def prepare(self):
        return fixture._prepare(self.source, self.output, self.spec)

    def refused(self, code):
        with self.assertRaisesRegex(fixture.FixtureError, code):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_exact_unicode_ddl_and_outgoing_fk_roundtrip_excludes_seed_rows(self):
        receipt = self.prepare()
        schema = (self.output / fixture.SCHEMA_FILE).read_bytes()
        self.assertIn(self.procedure.encode(), schema)
        self.assertIn(self.extra.encode(), schema)
        self.assertNotIn(b'987654', schema)
        self.assertNotIn(b'INSERT', schema)
        self.assertEqual(receipt['outputSha256'], hashlib.sha256(schema).hexdigest())
        self.assertEqual(receipt, json.loads((self.output / fixture.RECEIPT_FILE).read_bytes()))
        self.assertFalse(receipt['sqlExecuted'])
        self.assertFalse(receipt['compileTransactionDurabilityAccepted'])
        self.assertEqual(['fixture-receipt.json', 'pm-return-schema.sql'], sorted(p.name for p in self.output.iterdir()))

    def test_crlf_input_uses_same_universal_lf_definition_pins(self):
        self.write(self.text.replace('\n', '\r\n'))
        self.repin_source()
        self.prepare()
        schema = (self.output / fixture.SCHEMA_FILE).read_bytes()
        self.assertNotIn(b'\r', schema)
        self.assertIn(self.procedure.encode(), schema)

    def test_hard_linked_input_is_refused(self):
        alias = self.root / 'hard-link'
        os.link(self.source, alias)
        self.refused('input_not_single_regular_file')

    def test_existing_output_created_during_scan_is_not_overwritten(self):
        original = fixture.scan
        def collision(stream):
            result = original(stream)
            self.output.mkdir()
            (self.output / 'keep.txt').write_text('synthetic collision')
            return result
        with patch.object(fixture, 'scan', side_effect=collision):
            with self.assertRaisesRegex(fixture.FixtureError, 'output_already_exists'):
                self.prepare()
        self.assertEqual('synthetic collision', (self.output / 'keep.txt').read_text())

    def test_platform_directory_guard_keeps_windows_parent_from_being_renamed(self):
        with fixture.locked_directories(self.root) as handle:
            if os.name == 'nt':
                self.assertIsNone(handle)
                renamed = self.root.with_name(self.root.name + '-renamed')
                try:
                    self.root.rename(renamed)
                except OSError:
                    pass
                else:
                    renamed.rename(self.root)
                    self.fail('Windows directory guard permitted rename')
            else:
                self.assertEqual(self.root.stat().st_ino, os.fstat(handle).st_ino)

    def test_full_source_same_size_changed_bytes_refused_before_output(self):
        self.write(self.text.replace('987654', '987655'))
        self.refused('full_source_fingerprint_mismatch')

    def test_full_source_truncation_refused_before_output(self):
        self.source.write_bytes(self.source.read_bytes()[:-2])
        self.refused('full_source_fingerprint_mismatch')

    def test_second_pass_detects_input_mutation_even_outside_selected_objects(self):
        original = fixture.scan
        def changing(stream):
            result = original(stream)
            with self.source.open('r+b') as output:
                output.seek(-16, 2)
                output.write('9'.encode('utf-16-le'))
            return result
        with patch.object(fixture, 'scan', side_effect=changing):
            self.refused('input_changed_during_scan')

    def test_changed_selected_object_does_not_pass_even_with_whole_test_source_repin(self):
        self.write(self.text.replace('ID int NOT NULL PRIMARY KEY', 'ID int NULL PRIMARY KEY'))
        self.repin_source()
        self.refused('object_fingerprint_mismatch')

    def test_missing_fk_parent_refused(self):
        self.write(self.text.replace(self.parent, ''))
        self.repin_source()
        self.refused('missing_required_dependency')

    def test_changed_fk_second_line_dependency_refused(self):
        changed = self.text.replace('REFERENCES [dbo].[Parent]', 'REFERENCES [dbo].[Missing]')
        self.write(changed)
        self.repin_source()
        self.refused('missing_required_dependency')

    def test_extra_resolved_required_dependency_refused(self):
        self.write(self.text.replace('REFERENCES [dbo].[Parent]', 'REFERENCES [dbo].[Extra]')
                   + 'CREATE TABLE [dbo].[Extra] (ID int)\nGO\n')
        self.repin_source()
        self.refused('required_closure_mismatch')

    def test_extra_supplemental_batch_on_required_table_refused(self):
        self.write(self.text + 'ALTER TABLE [dbo].[Child] ADD X int NULL\nGO\n')
        self.repin_source()
        self.refused('supplemental_closure_mismatch')

    def test_changed_supplemental_fingerprint_refused(self):
        self.write(self.text.replace('WITH CHECK ADD', 'WITH NOCHECK ADD'))
        self.repin_source()
        self.refused('supplemental_fingerprint_mismatch')

    def test_missing_supplemental_batch_refused(self):
        self.write(self.text.replace(self.extra, ''))
        self.repin_source()
        self.refused('required_closure_mismatch|supplemental_closure_mismatch')

    def test_duplicate_object_refused(self):
        self.write(self.text + self.parent + 'GO\n')
        self.repin_source()
        self.refused('duplicate_source_object')

    def test_table_followed_by_original_row_in_same_batch_refused(self):
        self.write(self.text.replace(self.child, self.child + 'INSERT dbo.Child VALUES(12,34)\n'))
        self.repin_source()
        self.refused('mixed_data_or_ddl_batch')

    def test_row_before_selected_declaration_in_same_batch_refused(self):
        self.write(self.text.replace(self.child, 'INSERT dbo.Child VALUES(12,34)\n' + self.child))
        self.repin_source()
        self.refused('mixed_data_or_ddl_batch')

    def test_multiple_declarations_in_same_batch_refused(self):
        self.write(self.text.replace(self.child, self.child + 'CREATE TABLE dbo.Bad (ID int)\n'))
        self.repin_source()
        self.refused('mixed_data_or_ddl_batch')

    def test_go_and_fake_ddl_inside_stored_literal_do_not_create_objects_or_copy_data(self):
        self.write(self.text + "INSERT dbo.Backup VALUES(N'\nGO\nCREATE TABLE dbo.Leaked(ID int)\n')\nGO\n")
        self.repin_source()
        self.prepare()
        self.assertNotIn('Leaked', (self.output / fixture.SCHEMA_FILE).read_text(encoding='utf-8'))

    def test_incomplete_string_refused(self):
        self.write(self.text + "INSERT dbo.Backup VALUES(N'\n")
        self.repin_source()
        self.refused('incomplete_source_token')

    def test_selected_batch_without_go_refused(self):
        self.write(self.text + self.parent)
        self.repin_source()
        self.refused('missing_final_go')

    def test_wrong_encoding_is_rejected_even_when_test_digest_matches(self):
        self.source.write_bytes(self.text.encode('utf-8'))
        data = self.source.read_bytes()
        self.spec['source'].update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.refused('input_not_utf16le_bom')

    def test_oversized_ddl_refused(self):
        with patch.object(fixture, 'MAX_BATCH_CHARS', 20):
            self.refused('oversized_ddl_batch')

    def test_existing_directory_and_file_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / 'keep.txt'
        sentinel.write_text('synthetic sentinel')
        with self.assertRaisesRegex(fixture.FixtureError, 'output_already_exists'):
            self.prepare()
        self.assertEqual('synthetic sentinel', sentinel.read_text())
        self.output = self.root / 'existing-file'
        self.output.write_text('synthetic sentinel')
        with self.assertRaisesRegex(fixture.FixtureError, 'output_already_exists'):
            self.prepare()
        self.assertEqual('synthetic sentinel', self.output.read_text())

    def test_repository_git_file_marker_and_public_output_are_refused(self):
        repo = self.root / 'checkout'
        repo.mkdir()
        (repo / '.git').write_text('synthetic gitdir marker')
        for leaf in (repo / 'private-leaf', self.root / 'public' / 'leaf'):
            leaf.parent.mkdir(exist_ok=True)
            with self.assertRaisesRegex(fixture.FixtureError, 'repository_or_(site|public)_output'):
                fixture._prepare(self.source, leaf, self.spec)
            self.assertFalse(leaf.exists())

    def test_sites_output_and_repository_parameter_are_refused(self):
        (self.root / '.openai').mkdir()
        with self.assertRaisesRegex(fixture.FixtureError, 'repository_or_site_output'):
            self.prepare()
        (self.root / '.openai').rmdir()
        with self.assertRaisesRegex(fixture.FixtureError, 'repository_or_public_output'):
            fixture._prepare(self.source, self.output, self.spec, repository=self.root)

    def test_missing_parent_relative_parent_traversal_and_device_paths_are_refused(self):
        for candidate in (self.root / 'missing' / 'leaf', Path('relative'), self.root / '..' / 'leaf', self.root / 'NUL'):
            with self.assertRaises(fixture.FixtureError):
                fixture._prepare(self.source, candidate, self.spec)
        self.assertFalse(self.output.exists())

    def test_reparse_point_and_symbolic_link_metadata_refused_without_following(self):
        original = Path.lstat
        for attribute, mode in ((0x400, stat.S_IFDIR), (0, stat.S_IFLNK)):
            def unsafe(path, *args, **kwargs):
                if path == self.root:
                    return SimpleNamespace(st_mode=mode, st_file_attributes=attribute)
                return original(path, *args, **kwargs)
            with patch.object(Path, 'lstat', unsafe):
                self.refused('link_or_reparse_path')

    def test_input_and_output_links_refused_with_platform_supported_checks(self):
        if os.name == 'nt':
            original = Path.lstat
            def unsafe(path, *args, **kwargs):
                if path in {self.source, self.output}:
                    return SimpleNamespace(st_mode=stat.S_IFREG, st_file_attributes=0x400)
                return original(path, *args, **kwargs)
            with patch.object(Path, 'lstat', unsafe):
                self.refused('link_or_reparse_path')
        else:
            alias = self.root / 'input-link'
            alias.symlink_to(self.source)
            with self.assertRaisesRegex(fixture.FixtureError, 'link_or_reparse_path'):
                fixture._prepare(alias, self.output, self.spec)
            self.output.symlink_to(self.root / 'missing-target')
            self.refused('link_or_reparse_path')

    def test_no_success_after_io_failure_and_existing_partial_output_not_reused(self):
        with patch.object(fixture, 'exclusive_write', side_effect=OSError('synthetic disk failure')):
            with self.assertRaises(OSError):
                self.prepare()
        self.assertFalse((self.output / fixture.RECEIPT_FILE).exists())
        with self.assertRaisesRegex(fixture.FixtureError, 'output_already_exists'):
            self.prepare()

    def test_production_inventory_is_pinned_complete_and_technical_only(self):
        inventory = fixture.load_inventory()
        self.assertEqual(26, len(inventory['objects']))
        self.assertEqual(116, len(inventory['supplementalDdl']))
        self.assertEqual(fixture.SOURCE_SHA256, inventory['source']['sha256'])
        self.assertEqual({'FUNCTION', 'TABLE', 'PROCEDURE'}, {o['kind'] for o in inventory['objects']})
        self.assertEqual(26, len({o['name'] for o in inventory['objects']}))
        for value in fixture.canonical(inventory).decode().split('"'):
            self.assertNotIn('CREATE TABLE', value)
            self.assertNotIn('INSERT ', value)
        modified = deepcopy(inventory)
        modified['objects'][0]['sha256'] = 'a' * 64
        with patch.object(Path, 'read_text', return_value=json.dumps(modified)):
            with self.assertRaisesRegex(fixture.FixtureError, 'inventory_fingerprint_mismatch'):
                fixture.load_inventory()

    def test_windows_public_aliases_refused_without_creating_normalized_output(self):
        for alias in ('public.', 'public ', 'public. ', 'PUBLIC...', 'wwwroot.', '.openai.', 'artifacts '):
            real_parent = self.root / alias.rstrip(' .')
            real_parent.mkdir(exist_ok=True)
            if os.name != 'nt':
                (self.root / alias).mkdir(exist_ok=True)
            candidate = self.root / alias / 'leaf'
            with self.subTest(alias=alias):
                with self.assertRaisesRegex(fixture.FixtureError, 'unsafe_path_component'):
                    fixture._prepare(self.source, candidate, self.spec)
                self.assertFalse((real_parent / 'leaf').exists())
                self.assertFalse(candidate.exists())

    def test_windows_alias_device_ads_and_invalid_names_refused_before_filesystem_lookup(self):
        for component in ('public.', 'private ', 'NUL.txt', 'CON .txt', 'COM\u00b9.log',
                          'LPT\u00b2', 'leaf:stream', 'leaf::$DATA', 'a?b', 'a|b', 'a\x00b', 'a\x01b'):
            with self.subTest(component=component):
                with patch.object(Path, 'lstat', side_effect=AssertionError('filesystem lookup before lexical validation')):
                    with self.assertRaisesRegex(fixture.FixtureError, 'unsafe_path_component'):
                        fixture.checked_path(self.root / component / 'leaf', must_exist=False)

    def test_source_trailing_dot_alias_refused_before_output(self):
        with self.assertRaisesRegex(fixture.FixtureError, 'unsafe_path_component'):
            fixture._prepare(self.root / 'synthetic.sql.', self.output, self.spec)
        self.assertFalse(self.output.exists())

    def test_resolved_public_and_git_repository_ancestors_refused(self):
        lexical_parent = self.root / 'private-alias'
        lexical_parent.mkdir()
        lexical = lexical_parent / 'leaf'
        public = self.root / 'public'
        public.mkdir()
        repository = self.root / 'long-private-checkout'
        repository.mkdir()
        (repository / '.git').write_text('synthetic marker')
        original = Path.resolve
        for destination, code in ((public / 'leaf', 'repository_or_public_output'),
                                  (repository / 'leaf', 'repository_or_site_output')):
            def resolve(path, *args, **kwargs):
                return destination if path == lexical else original(path, *args, **kwargs)
            with self.subTest(destination=destination.name):
                with patch.object(Path, 'resolve', resolve):
                    with self.assertRaisesRegex(fixture.FixtureError, code):
                        fixture.private_destination(lexical)
            self.assertFalse(destination.exists())

    def test_resolved_ancestor_reparse_metadata_is_rechecked(self):
        lexical_parent = self.root / 'private-alias'
        lexical_parent.mkdir()
        lexical = lexical_parent / 'leaf'
        resolved_parent = self.root / 'resolved-private'
        resolved_parent.mkdir()
        original_resolve, original_lstat = Path.resolve, Path.lstat
        def resolve(path, *args, **kwargs):
            return resolved_parent / 'leaf' if path == lexical else original_resolve(path, *args, **kwargs)
        def lstat(path, *args, **kwargs):
            if path == resolved_parent:
                return SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0x400)
            return original_lstat(path, *args, **kwargs)
        with patch.object(Path, 'resolve', resolve), patch.object(Path, 'lstat', lstat):
            with self.assertRaisesRegex(fixture.FixtureError, 'link_or_reparse_path'):
                fixture.private_destination(lexical)
        self.assertFalse((resolved_parent / 'leaf').exists())


if __name__ == '__main__':
    unittest.main()
