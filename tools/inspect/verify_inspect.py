#!/usr/bin/env python3
"""Static fixed-plan/source checks and synthetic packaging regressions; never opens SQL."""
import hashlib
import importlib.util
import json
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'tools/inspect/package.py'
spec = importlib.util.spec_from_file_location('inspector_package', MODULE)
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


def verify_sources():
    project = ROOT / package.PROJECT
    package.validate_project(ROOT)
    xml = ET.parse(project)
    assert {(n.attrib['Include'], n.attrib['Version']) for n in xml.findall('.//PackageReference')} == {('Microsoft.Data.SqlClient', '7.0.3')}
    lock = json.loads((project.parent / 'packages.lock.json').read_text(encoding='utf-8'))['dependencies']['net10.0']
    origin = json.loads((ROOT / 'src/backend/Medcom.Infrastructure/packages.lock.json').read_text(encoding='utf-8'))['dependencies']['net10.0']
    assert lock == {k: v for k, v in origin.items() if v['type'] != 'Project'}
    code = (project.parent / 'InspectionSql.cs').read_text(encoding='utf-8')
    plans = dict(re.findall(r'public const string (\w+) = """\n(.*?)\n        """;', code, re.S))
    assert set(plans) == {'Environment', 'Columns', 'Keys', 'Safety', 'PurchaseForeignKey', 'Definitions', 'Defaults', 'Binding', 'ServerTriggers'}
    catalogs = {'databases','columns','types','schemas','tables','indexes','index_columns','triggers','security_predicates','security_policies','foreign_keys','foreign_key_columns','check_constraints','default_constraints','server_triggers','server_trigger_events'}
    forbidden = r'\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|COMMIT|ROLLBACK|BEGIN|INTO|WAITFOR|DBCC|BACKUP|RESTORE|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|UPDLOCK|HOLDLOCK)\b'
    for name, sql in plans.items():
        # Each authored plan is a single SELECT/CTE statement. String content is data only.
        tokens = re.sub(r"N?'(?:''|[^'])*'", "''", sql)
        assert not re.search(forbidden, tokens, re.I), name
        assert tokens.lstrip().split()[0] in ('SELECT', 'WITH'), name
        assert tokens.count(';') == 1 and tokens.rstrip().endswith(';'), name
        assert set(re.findall(r'\bsys\.(\w+)', sql)) <= catalogs, name
        direct = re.findall(r'\b(?:FROM|JOIN)\s+dbo\.(\w+)', sql, re.I)
        assert direct == (['MedcomPurchaseRequestCommandSchema'] if name == 'Binding' else []), (name, direct)
    assert 'TOP(2)' in plans['Binding'] and '@binding' in plans['Binding']
    assert 'UPDLOCK' not in code and 'HOLDLOCK' not in code
    # Purchase tuples must remain exactly aligned with the current source probe.
    purchase = (ROOT / 'src/backend/Medcom.Infrastructure/PurchaseRequests/PurchaseRequestSql.cs').read_text(encoding='utf-8').split('public const string CredentialText')[0]
    shape = r"\('([^']+)','([^']+)','([^']+)',(-?\d+),(\d+),(\d+),(\d+)\)"
    expected_purchase = re.findall(shape, purchase)
    actual = re.findall(shape[:-2] + r",'([^']*)'\)", plans['Columns'])
    assert len(expected_purchase) == 35 and len(actual) == 161
    assert {tuple(x[:7]) for x in actual if x[0].startswith(('AP_', 'Medcom'))} == set(expected_purchase)
    native_names = {'IV_InboundRequestTbl','IV_InboundRequestDetailsTbl','IV_InboundRequestCTCPTbl','IV_InboundRequestNoSuitableTbl','IV_InboundRequestLogTbl'}
    expected_native = []
    for source in sorted((ROOT / 'inventories/source/20261002').glob('table-*.json')):
        for obj in json.loads(source.read_text(encoding='utf-8'))['objects']:
            if obj['name'] not in native_names: continue
            for col in obj['columns']:
                typ=col['type']; args=re.findall(r'\d+',col['typeArguments']); number=int(args[0]) if args else 0
                if typ in ('varchar','nvarchar','char','nchar'):
                    length=-1 if 'max' in col['typeArguments'] else number*(2 if typ.startswith('n') else 1); precision=scale=0
                elif typ in ('decimal','numeric'):
                    precision=number;scale=int(args[1]);length=5 if precision<=9 else 9 if precision<=19 else 13 if precision<=28 else 17
                else:
                    length,precision,scale={'datetime':(8,23,3),'int':(4,10,0),'float':(8,53,0),'bit':(1,1,0),'smallint':(2,5,0)}[typ]
                assert not col['identity']
                expected_native.append((obj['name'],col['name'],typ,str(length),'1' if col['nullable'] else '0',str(precision),str(scale),''))
    assert len(expected_native)==109
    assert set(expected_native)=={tuple(x) for x in actual if x[0] in native_names}
    journal=[x for x in actual if x[0]=='WebInboundRequestCommandJournalV1']
    schema=(ROOT/'schemas/backend/inbound-request-command-journal-v1.sql').read_text(encoding='utf-8')
    columns=[]
    for line in schema.splitlines():
        match=re.match(r'    (\w+) (\w+)(?:\((\d+)\))?(?: COLLATE (\w+))? (NOT NULL|NULL)',line)
        if match: columns.append(match.groups())
    assert len(columns)==17 and {x[0] for x in columns}=={x[1] for x in journal}
    for name,typ,size,collation,nullability in columns:
        entry=next(x for x in journal if x[1]==name)
        assert entry[2]==typ and entry[4]==('0' if nullability=='NOT NULL' else '1')
        assert entry[7]==(collation or '')
        if typ in ('nvarchar','varchar','char','binary'): assert int(entry[3])==int(size)*(2 if typ=='nvarchar' else 1)
        if typ=='datetime2': assert entry[3:7]==('8',entry[4],'27','7')
    assert "('WebInboundRequestCommandJournalV1','OperationId',5)" in plans['Keys']
    assert "('WebInboundRequestCommandJournalV1','CreatedAtUtc')" in plans['Defaults']
    marker=json.loads((ROOT/'docs/execution/direct-runs/I34.json').read_text(encoding='utf-8'))
    assert len(marker['scope'])==17 and all((ROOT/p).is_file() for p in marker['scope'])
    for workflow in ('.github/workflows/backend.yml','.github/workflows/ci-policy.yml'):
        text=(ROOT/workflow).read_text(encoding='utf-8')
        assert 'dotnet restore tests/backend/Medcom.TargetInspect.Tests/Medcom.TargetInspect.Tests.csproj --locked-mode' in text
        assert '--results-directory artifacts/target-inspector-test-results' in text
        assert 'python tools/inspect/verify_inspect.py' in text
    print('PASS: fixed read-only plans, 161 source-aligned columns, policy links, locked provider, exact scope and CI separation')

class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='i34-package-test-')
        self.base = Path(self.temporary.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        self.original_root = package.ROOT
        package.ROOT = self.root
        self.dotnet = 'synthetic-dotnet'
        original_run = subprocess.run
        def fake_run(command, *args, **kwargs):
            if command[0] != self.dotnet:
                return original_run(command, *args, **kwargs)
            if command[1] == 'restore':
                assert '--locked-mode' in command
            elif command[1] == 'publish':
                assert '--no-restore' in command and '-p:UseAppHost=false' in command
                assert not (Path(kwargs['cwd']) / 'private-ignored.cs').exists()
                out = Path(command[command.index('--output') + 1]); out.mkdir()
                for name, data in {'Medcom.TargetInspect.dll': b'synthetic inspector', 'Medcom.TargetInspect.deps.json': b'{}', 'Medcom.TargetInspect.runtimeconfig.json': b'{}', 'runtimes/win-x64/native/Microsoft.Data.SqlClient.SNI.dll': b'synthetic native windows', 'runtimes/linux-x64/native/example.so': b'synthetic native linux'}.items():
                    path=out/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            else: raise AssertionError(command)
            return subprocess.CompletedProcess(command, 0)
        self.mock_run=patch.object(package.subprocess, 'run', side_effect=fake_run)
        self.mock_run.start()
        for source in package.LINKED_SOURCES:
            path = self.root / source
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('public static class Source {}\n')
        project = self.root / package.PROJECT
        project.parent.mkdir(parents=True)
        project.write_text('<Project><ItemGroup><Compile Include="../../../' + package.LINKED_SOURCES[0] + '"/><Compile Include="../../../' + package.LINKED_SOURCES[1] + '"/></ItemGroup></Project>')
        (project.parent / 'packages.lock.json').write_text('{}\n')
        (self.root / package.README).write_text('Public instructions.\n')
        (self.root / '.gitignore').write_text('artifacts\nprivate-ignored.cs\n')
        self.git('init', '-q')
        self.git('config', 'core.autocrlf', 'false')
        self.git('add', '.')
        self.commit()
        (self.root / 'private-ignored.cs').write_text('must never enter source snapshot')

    def tearDown(self):
        self.mock_run.stop()
        package.ROOT = self.original_root
        self.temporary.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.STDOUT).decode().strip()

    def commit(self):
        self.git('-c', 'user.name=Local package test', '-c', 'user.email=package-test@example.invalid', 'commit', '-qm', 'Synthetic test fixture; not remote provenance')

    def run_package(self):
        package.package(str(self.dotnet))
        return self.root / 'artifacts' / package.ARCHIVE_NAME

    def test_inventory_provenance_and_native_assets(self):
        archive_path = self.run_package()
        with zipfile.ZipFile(archive_path) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(set(archive.namelist()), set(manifest['files']) | {'manifest.json'})
            self.assertEqual(manifest['sourceRevision'], self.git('rev-parse', 'HEAD'))
            self.assertEqual(manifest['sourceTree'], self.git('rev-parse', 'HEAD^{tree}'))
            self.assertIs(manifest['releaseStillBlocked'], True)
            self.assertEqual(manifest['kind'], 'medcom-target-inspector')
            self.assertEqual(manifest['schemaVersion'], 1)
            for name, digest in manifest['files'].items():
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
            for name, digest in manifest['linkedSources'].items():
                self.assertEqual(hashlib.sha256((self.root / name).read_bytes()).hexdigest(), digest)
            self.assertIn('runtimes/win-x64/native/Microsoft.Data.SqlClient.SNI.dll', manifest['files'])
            self.assertIn('runtimes/linux-x64/native/example.so', manifest['files'])
            self.assertTrue(all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist()))
        checksum = (archive_path.parent / 'medcom-target-inspector.sha256').read_text(encoding='utf-8')
        self.assertEqual(checksum, hashlib.sha256(archive_path.read_bytes()).hexdigest() + '  ' + archive_path.name + '\n')

    def test_repeat_is_byte_deterministic(self):
        first = self.run_package().read_bytes()
        self.assertEqual(first, self.run_package().read_bytes())

    def test_untracked_input_refused(self):
        (self.root / 'secret.json').write_text('not included')
        with self.assertRaisesRegex(ValueError, 'dirty'):
            self.run_package()

    def test_dirty_tracked_input_refused(self):
        (self.root / package.README).write_text('uncommitted')
        with self.assertRaisesRegex(ValueError, 'dirty'):
            self.run_package()

    def test_symlink_output_refused(self):
        artifacts = self.root / 'artifacts'
        try: artifacts.symlink_to(self.base / 'escape', target_is_directory=True)
        except OSError: self.skipTest('Platform does not permit symlink creation')
        with self.assertRaisesRegex(ValueError, 'regular'):
            self.run_package()

    def test_source_symlink_refused(self):
        try: (self.root / 'symlink').symlink_to('README.md')
        except OSError: self.skipTest('Platform does not permit symlink creation')
        self.git('add', '.')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'links or special files'):
            self.run_package()

    def test_production_project_reference_refused(self):
        path = self.root / package.PROJECT
        path.write_text(path.read_text(encoding='utf-8').replace('</ItemGroup>', '<ProjectReference Include="production.csproj"/></ItemGroup>'))
        self.git('add', '.')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'production projects'):
            self.run_package()

    def test_linked_source_mismatch_refused(self):
        path = self.root / package.PROJECT
        path.write_text(path.read_text(encoding='utf-8').replace(package.LINKED_SOURCES[1], package.LINKED_SOURCES[0]))
        self.git('add', '.')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'two declared source files'):
            self.run_package()

    def test_unexpected_publish_input_refused(self):
        output = self.base / 'published'
        output.mkdir()
        (output / 'appsettings.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            package.published_files(output)

    def test_project_uses_one_canonical_snapshot_anchor(self):
        # Equivalent filesystem spelling, analogous to Windows 8.3/long names.
        # The previous mixed lexical/resolved anchors raised in relative_to().
        alias = self.root / 'tools' / '..'
        package.validate_project(alias)

    def test_noncanonical_paths_refused(self):
        for path in ('../escape', '/root', 'foo\\bar', 'C:/x', 'foo//bar', './foo', 'foo/../bar'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                package.safe_name(path)

if __name__ == '__main__':
    verify_sources()
    unittest.main()
