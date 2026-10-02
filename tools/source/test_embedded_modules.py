import json
from pathlib import Path
import tempfile
import unittest

from catalog_embedded_modules import catalog


class EmbeddedModuleTests(unittest.TestCase):
    def scan(self, text):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'data.sql';source.write_text(text,encoding='utf-16')
            return catalog(source)

    def test_decodes_create_alter_and_preserves_versions_without_exporting_rows(self):
        result=self.scan("""CREATE TABLE [dbo].[Backup] ([Definition] nvarchar(max))
GO
INSERT [dbo].[Backup] ([ObjectName],[Definition],[BackupDate],[LoginName]) VALUES (N'TestProc',N'CREATE PROC [dbo].[TestProc] @Id varchar(50) AS
SELECT N''private secret'';
EXEC dbo.NextProc @Id;',CAST(N'2026-01-01T12:00:00.000' AS DateTime),N'private username')
INSERT [dbo].[Backup] ([ObjectName],[Definition],[BackupDate]) VALUES (N'TestProc',N'ALTER PROCEDURE [dbo].[TestProc] @Id varchar(50) AS SELECT 2',CAST(N'2026-02-01T12:00:00.000' AS DateTime))
GO
""")
        self.assertEqual(result['counts']['byKindRecords'],{'PROCEDURE':2})
        self.assertEqual(result['counts']['uniqueModules'],1)
        self.assertEqual(result['modules'][0]['distinctDefinitionCount'],2)
        self.assertEqual(result['records'][0]['parameterNameCandidates'],['@Id'])
        self.assertEqual(result['records'][0]['procedureCallCandidates'],['dbo.NextProc'])
        self.assertTrue(result['records'][0]['storedObjectNameMatches'])
        serialized=json.dumps(result)
        for secret in ['private secret','private username','SELECT 2','CREATE PROC']:
            self.assertNotIn(secret,serialized)

    def test_nested_sql_strings_comments_and_fake_inserts_do_not_invent_modules(self):
        result=self.scan("""INSERT [dbo].[Config] ([Source]) VALUES (N'-- CREATE PROC dbo.FakeComment AS SELECT 1
DECLARE @sql nvarchar(max)=N''CREATE PROC dbo.FakeDynamic AS SELECT 1'';
INSERT [dbo].[Inner] ([Id]) VALUES (1);
/* CREATE TRIGGER dbo.FakeTrigger ON dbo.T AFTER INSERT AS SELECT 1 */
SELECT 1;')
INSERT [dbo].[Backup] ([ModuleDefinition]) VALUES (N'/* prefix comment */
CREATE OR ALTER TRIGGER [dbo].[ActualTrigger] ON dbo.T AFTER INSERT AS SELECT N''private row'';')
""")
        self.assertEqual(result['counts']['allInsertStatements'],2)
        self.assertEqual([r['name'] for r in result['records']],['ActualTrigger'])
        self.assertEqual(result['records'][0]['declarationVerb'],'CREATE OR ALTER')
        self.assertNotIn('FakeDynamic',json.dumps(result))

    def test_truncated_dump_is_rejected(self):
        with self.assertRaises(ValueError):
            self.scan("INSERT [dbo].[Backup] ([Definition]) VALUES (N'CREATE PROC dbo.Test AS SELECT 1")


if __name__=='__main__':unittest.main()
