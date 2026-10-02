import copy
import json
from pathlib import Path
import tempfile
import unittest
from catalog_sql import catalog
from validate_catalog import validate_detail_bindings

class CatalogTests(unittest.TestCase):
    def run_dump(self, text):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'dump.sql'; p.write_text(text,encoding='utf-16')
            return catalog(p)

    def test_backup_insert_cannot_invent_schema_or_leak_values(self):
        result=self.run_dump("""CREATE TABLE [dbo].[Backup] (
 [Id] [int] IDENTITY(1,1) NOT NULL,
 [Definition] [nvarchar](max) NULL,
 CONSTRAINT [PK_Backup] PRIMARY KEY CLUSTERED
 ([Id] ASC)
)
GO
INSERT [dbo].[Backup] VALUES (1,N'patient-secret
GO
CREATE PROCEDURE [dbo].[Fake] AS SELECT ''password-secret''
GO
CREATE VIEW [dbo].[FakeView] AS SELECT 1')
GO
CREATE VIEW [dbo].[RealView] AS SELECT [Id] FROM [dbo].[Backup]
GO
""")
        self.assertEqual(result['counts'],{'TABLE':1,'VIEW':1})
        self.assertEqual([c['name'] for c in result['objects'][0]['columns']],['Id','Definition'])
        serialized=json.dumps(result)
        for forbidden in ['patient-secret','password-secret','FakeView','Fake','VALUES']:
            self.assertNotIn(forbidden,serialized)
        self.assertEqual(result['objects'][1]['syntacticReferences'],['dbo.Backup'])

    def test_comments_escaped_quotes_and_parameter_body(self):
        result=self.run_dump("""/* CREATE TABLE [dbo].[Fake] ([bad] int) */
CREATE PROCEDURE [dbo].[Real] @Arg [int] AS
DECLARE @Internal varchar(20)
SELECT N'CREATE TABLE [dbo].[Hidden] (id int)', @Arg
GO
""")
        self.assertEqual(result['counts'],{'PROCEDURE':1})
        self.assertEqual(result['objects'][0]['parameters'],[{'name':'@Arg','type':'int','output':False}])
        self.assertNotIn('Hidden',json.dumps(result))

    def test_truncated_literal_and_duplicate_declaration_fail(self):
        for dump in ["INSERT dbo.x VALUES(N'unclosed", 'CREATE TABLE [dbo].[X] ([Id] int)\nGO\nCREATE TABLE [dbo].[X] ([Id] int)\nGO\n']:
            with self.assertRaises(ValueError): self.run_dump(dump)

class DetailBindingTests(unittest.TestCase):
    def test_registered_detail_metadata_is_valid_but_stale_or_wider_bindings_fail(self):
        folder=Path(__file__).resolve().parents[2]/'inventories/source/20261002'
        bindings=json.loads((folder/'detail-read-bindings.json').read_text())
        objects={}
        for path in folder.glob('table-*.json'):
            for obj in json.loads(path.read_text())['objects']:
                objects[(obj['kind'],obj['schema'],obj['name'])]=obj
        validate_detail_bindings(bindings,objects)
        for field,value in [('detailMaskedDefinitionSha256','stale'),('detailTable','SY_User'),('joinColumns',['ItemID'])]:
            changed=copy.deepcopy(bindings);changed['pilots'][0][field]=value
            with self.assertRaises(ValueError):validate_detail_bindings(changed,objects)
        changed=copy.deepcopy(bindings)
        changed['pilots'][0]['selectedColumns'].append({'name':'Amount','type':'decimal'})
        with self.assertRaises(ValueError):validate_detail_bindings(changed,objects)

if __name__ == '__main__': unittest.main()
