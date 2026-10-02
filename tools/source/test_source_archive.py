import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile
import zlib

from verify_source_archive import extract_verified


class ArchiveIntegrityTests(unittest.TestCase):
    def fixture(self, folder):
        archive=Path(folder)/'source.zip';content='SELECT 1;\nCREATE PROC dbo.EndOfFile AS SELECT 2;'.encode('utf-16')
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('data.sql',content)
        return archive,content,hashlib.sha256(archive.read_bytes()).hexdigest()

    def test_extraction_replaces_only_after_complete_member_verification(self):
        with tempfile.TemporaryDirectory() as folder:
            archive,content,digest=self.fixture(folder);target=Path(folder)/'output.sql';target.write_bytes(b'previous verified bytes')
            result=extract_verified(archive,target,expected_archive_sha256=digest,expected_member='data.sql',expected_bytes=len(content))
            self.assertEqual(target.read_bytes(),content)
            self.assertEqual(result['sha256'],hashlib.sha256(content).hexdigest())
            self.assertEqual(result['archiveMemberIntegrity'],'VERIFIED_FULL_SIZE_AND_CRC')

    def test_wrong_size_corrupt_or_truncated_member_never_overwrites_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            archive,content,digest=self.fixture(folder);target=Path(folder)/'output.sql';original=b'previous verified bytes';target.write_bytes(original)
            with self.assertRaises(ValueError):
                extract_verified(archive,target,expected_archive_sha256=digest,expected_member='data.sql',expected_bytes=len(content)-1)
            broken=bytearray(archive.read_bytes());broken[len(broken)//2]^=0xff;archive.write_bytes(broken)
            with self.assertRaises((ValueError,zipfile.BadZipFile,EOFError,zlib.error)):
                extract_verified(archive,target,expected_archive_sha256=hashlib.sha256(broken).hexdigest(),expected_member='data.sql',expected_bytes=len(content))
            self.assertEqual(target.read_bytes(),original)
            self.assertEqual(list(Path(folder).glob('.verified-*')),[])


if __name__=='__main__':unittest.main()
