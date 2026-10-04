"""Synthetic source fixtures only; no ERP SQL or transaction rows."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import prepare_transfer_checks as checks


class TransferFixtureTests(unittest.TestCase):
    def source(self, folder):
        declarations = [
            f'CREATE TABLE [dbo].[{name}] (ID int)\n'
            for name in sorted(checks.TABLES)
        ] + [
            f"CREATE PROCEDURE [dbo].[{name}] AS\nSELECT N'Từ chối nhanh; Điều chuyển'\n"
            for name in sorted(checks.PROCEDURES)
        ]
        source = folder / 'synthetic.sql'
        source.write_text('\nGO\n'.join(declarations) + '\nGO\n', encoding='utf-16')
        return source

    def baseline(self, source):
        data = source.read_bytes()
        return patch.multiple(checks, FULL_SQL_SIZE=len(data),
                              FULL_SQL_SHA256=hashlib.sha256(data).hexdigest())

    def test_vietnamese_definitions_roundtrip_under_windows_default(self):
        with tempfile.TemporaryDirectory(prefix='medcom-source-test-') as folder:
            source = self.source(Path(folder))
            output = Path(folder) / 'Điều chuyển' / 'schema.sql'
            original_write = Path.write_text

            def windows_default(path, data, *args, **kwargs):
                kwargs.setdefault('encoding', 'cp1252')
                return original_write(path, data, *args, **kwargs)

            with self.baseline(source), patch.object(
                    Path, 'write_text', autospec=True, side_effect=windows_default):
                self.assertEqual(checks.prepare(source, output), output.resolve())
            text = output.read_bytes().decode('utf-8', errors='strict')
            self.assertEqual(text.count('Từ chối nhanh; Điều chuyển'), len(checks.PROCEDURES))
            for name in checks.TABLES | checks.PROCEDURES:
                self.assertIn(f'[dbo].[{name}]', text)

    def test_changed_source_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory(prefix='medcom-source-test-') as folder:
            source = self.source(Path(folder))
            output = Path(folder) / 'schema.sql'
            with self.baseline(source):
                data = source.read_bytes().replace('Điều'.encode('utf-16-le'),
                                                  'Khác'.encode('utf-16-le'), 1)
                source.write_bytes(data)
                with self.assertRaisesRegex(ValueError, 'Unverified or incomplete SQL source'):
                    checks.prepare(source, output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
