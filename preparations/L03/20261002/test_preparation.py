#!/usr/bin/env python3
import json,pathlib,shutil,subprocess,tempfile,sys
HERE=pathlib.Path(__file__).resolve().parent;V=HERE/'validate_preparation.py';JSONS=sorted(HERE.glob('*.json'))
def run(p): return subprocess.run([sys.executable,str(V),str(p)],capture_output=True,text=True)
def neg(name,fn):
 with tempfile.TemporaryDirectory() as td:
  d=pathlib.Path(td)
  for p in JSONS: shutil.copy2(p,d/p.name)
  p=d/name;x=json.loads(p.read_text());fn(x);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
  r=run(d);assert r.returncode!=0,(name,r.stdout,r.stderr)
r=run(HERE);assert r.returncode==0,r.stderr
checks=[
('B1_TYPED_QUERY_BOUNDARY_FIXTURES.json',lambda x:x.__setitem__('base_main','bad')),
('B1_TYPED_QUERY_BOUNDARY_FIXTURES.json',lambda x:x['contract_rules'].pop()),
('B1_TYPED_QUERY_BOUNDARY_FIXTURES.json',lambda x:x['cases'][0].__setitem__('execution_status','PASSED')),
('B2_CATALOG_SCHEMA_ACCEPTANCE.json',lambda x:x['required_record_types'].remove('dependency')),
('B2_CATALOG_SCHEMA_ACCEPTANCE.json',lambda x:x['canonical_aggregate_reconciliation'].__setitem__('permanent_tables',582)),
('B2_CATALOG_SCHEMA_ACCEPTANCE.json',lambda x:x['source_contracts'][0].__setitem__('git_blob_sha256','0'*64)),
('B2_EXTRACTION_MANIFEST_ACCEPTANCE.json',lambda x:x['manifest_contract'].__setitem__('source_set_state','MATERIALIZED_VERIFIED')),
('B2_EXTRACTION_MANIFEST_ACCEPTANCE.json',lambda x:x['manifest_contract'].__setitem__('member_set_required',False)),
('B2_EXTRACTION_MANIFEST_ACCEPTANCE.json',lambda x:x['manifest_contract'].__setitem__('body_region_total_coverage',False)),
('B2_EXTRACTION_MANIFEST_ACCEPTANCE.json',lambda x:x['cases'].pop()),
('B2_DEFINITION_NORMALIZATION_FIXTURES.json',lambda x:x['eligibility'].__setitem__('authoritative_sql_bytes','ACCESSIBLE')),
('B2_DEFINITION_NORMALIZATION_FIXTURES.json',lambda x:x['cases'].pop()),
('B2_DEPENDENCY_QUARANTINE_FIXTURES.json',lambda x:x['allowed_dispositions'].remove('DYNAMIC')),
('B2_DEPENDENCY_QUARANTINE_FIXTURES.json',lambda x:x['cases'][0].__setitem__('expected_disposition','SILENT_DROP')),
('B2_FILTER_LITERAL_RESOLUTION_QUEUE.json',lambda x:x['cases'][0].__setitem__('catalog_resolution_status','RESOLVED')),
('B2_FILTER_LITERAL_RESOLUTION_QUEUE.json',lambda x:x['cases'][0].__setitem__('resolved_catalog_object_id','DB-TABLE-dbo.Guessed'))]
for n,f in checks:neg(n,f)
DEP='B2_DEPENDENCY_QUARANTINE_FIXTURES.json'
def case(x,case_id): return next(z for z in x['cases'] if z['id']==case_id)
for case_id in ('B2D-07','B2D-08','B2D-09','B2D-11','B2D-17'):
 neg(DEP,lambda x,c=case_id:case(x,c).__setitem__('expected_disposition','RESOLVED_EDGE'))
extra=[
 lambda x:case(x,'B2D-19').__setitem__('expected_disposition','AMBIGUOUS'),
 lambda x:case(x,'B2D-19').__setitem__('source_spans',[]),
 lambda x:case(x,'B2D-19').__setitem__('reason',''),
 lambda x:case(x,'B2D-19').__setitem__('disposition_owner',''),
 lambda x:case(x,'B2D-19').__setitem__('catalog_edges',['DB-TABLE-dbo.Guessed']),
 lambda x:case(x,'B2D-19')['fixture_source'].__setitem__('provenance','AUTHORITATIVE_EXTRACT'),
 lambda x:case(x,'B2D-19').__setitem__('binding_acceptance','PASS'),
 lambda x:case(x,'B2D-19').__setitem__('closure_acceptance','PASS'),
 lambda x:case(x,'B2D-07')['source_spans'][0].__setitem__('start',0),
 lambda x:case(x,'B2D-19')['synthetic_catalog'].__setitem__('qualified_match_count',1),
 lambda x:case(x,'B2D-19').__setitem__('resolved_target_id','DB-TABLE-dbo.Guessed'),
 lambda x:case(x,'B2D-11')['fixture_source'].__setitem__('scope_context','ORDINARY_QUERY')]
for f in extra:neg(DEP,f)
print(f'PASS tests={1+len(checks)+5+len(extra)} baseline=1 negative={len(checks)+5+len(extra)}')
