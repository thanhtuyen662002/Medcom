#!/usr/bin/env python3
import argparse,hashlib,json,pathlib,subprocess,sys
BASE='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
ROOT=pathlib.Path(__file__).resolve().parents[3]
EXPECTED={
 'B1_TYPED_QUERY_BOUNDARY_FIXTURES.json':('B1',20,16),
 'B2_CATALOG_SCHEMA_ACCEPTANCE.json':('B2',21,18),
 'B2_EXTRACTION_MANIFEST_ACCEPTANCE.json':('B2M',21,14),
 'B2_DEFINITION_NORMALIZATION_FIXTURES.json':('B2N',21,16),
 'B2_DEPENDENCY_QUARANTINE_FIXTURES.json':('B2D',21,19),
 'B2_FILTER_LITERAL_RESOLUTION_QUEUE.json':('B2Q',21,18)}
RECORD_TYPES={'schema','table','column','constraint','index','programmable_object','dependency','classification','runtime_option'}
DISPOSITIONS={'RESOLVED_EDGE','DYNAMIC','AMBIGUOUS','UNRESOLVED','UNSUPPORTED_QUARANTINED','EXTERNAL_OR_CROSS_DATABASE','LOCAL_OR_NON_CATALOG'}
LOCAL_CASES={'B2D-07':{'CTE_NAME'},'B2D-08':{'TABLE_VARIABLE'},'B2D-09':{'TEMPORARY_TABLE'},'B2D-11':{'TRIGGER_PSEUDO_TABLE'},'B2D-17':{'COMMENT_TOKEN','STRING_LITERAL_TOKEN'}}
SYNTHETIC_CONTEXTS={'B2D-07':'STATEMENT_CTE','B2D-08':'BATCH_TABLE_VARIABLE','B2D-09':'BATCH_TEMPORARY_TABLE','B2D-11':'TRIGGER_BODY','B2D-17':'ORDINARY_COMMENT_AND_STRING','B2D-19':'CATALOG_QUERY'}
AGG={'permanent_tables':583,'column_declarations':7985,'nullable_declarations':5610,'not_null_declarations':2375,'pk_tables':533,'keyless_tables':50,'fk_declarations':364,'default_declarations':812,'check_declarations':558,'explicit_alter_unique_declarations':7,'normalized_views':203,'normalized_procedures':591,'normalized_functions':109,'normalized_triggers':3}
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def fail(m): raise AssertionError(m)
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(path): return sha(subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT))
def validate(d):
 files={p.name for p in d.glob('*.json')}
 if files!=set(EXPECTED): fail(f'fixture set mismatch {sorted(files)}')
 all_ids=[]
 for name,(unit,issue,count) in EXPECTED.items():
  x=load(d/name)
  if (x.get('schema_version'),x.get('lane'),x.get('artifact_status'),x.get('execution_status'))!=(1,'L03','prepared_local_only','NOT_RUN'): fail(f'{name}: identity/status')
  if (x.get('base_main'),x.get('primary_owner'),x.get('unit'),x.get('issue'))!=(BASE,'L03',unit,issue): fail(f'{name}: base/owner/unit/issue')
  e=x.get('eligibility',{})
  if e.get('writer_lease')!='NOT_GRANTED' or e.get('dispatcher_fencing')!='NOT_PROVEN' or e.get('authoritative_sql_bytes')!='NOT_ACCESSIBLE' or e.get('eligible_to_code') is not False: fail(f'{name}: eligibility')
  limits=' '.join(x.get('safety_limits',[]))
  if 'no GitHub mutation' not in limits or 'production operation' not in limits or 'TRC-DB-001 stays open' not in limits: fail(f'{name}: safety')
  expected_record={'stimulus_timestamp','observed_result','authoritative_source_identity','exact_head','environment_identity','parser_version','reviewer'}
  if set(x.get('future_execution_record_fields',[]))!=expected_record: fail(f'{name}: future record')
  refs=x.get('source_contracts',[])
  if len(refs)!=10 or len({z['path'] for z in refs})!=10: fail(f'{name}: source set')
  for z in refs:
   if z.get('ref')!=BASE or z.get('git_blob_sha256')!=blob(z['path']): fail(f'{name}: bad source pin {z.get("path")}')
  cases=x.get('cases',[])
  if len(cases)!=count: fail(f'{name}: case count')
  ids=[z.get('id') for z in cases]
  if len(ids)!=len(set(ids)) or any(not i.startswith(unit+'-') for i in ids): fail(f'{name}: IDs')
  for z in cases:
   if z.get('execution_status')!='NOT_RUN': fail(f'{name}:{z.get("id")}: execution')
   for k in ('role','entry_point','attack_or_failure','expected_result','owner_route','evidence_to_pass'):
    if not z.get(k): fail(f'{name}:{z.get("id")}:{k}')
  all_ids+=ids
 if len(all_ids)!=len(set(all_ids)): fail('cross-file duplicate ID')
 b1=load(d/'B1_TYPED_QUERY_BOUNDARY_FIXTURES.json')
 rules=' '.join(b1.get('contract_rules',[]))
 for token in ('registered query ID','server resolves','versioned allow-list','fails closed','cancellation'):
  if token not in rules: fail(f'B1 missing rule {token}')
 b2=load(d/'B2_CATALOG_SCHEMA_ACCEPTANCE.json')
 if set(b2.get('required_record_types',[]))!=RECORD_TYPES: fail('B2 record types')
 if b2.get('canonical_aggregate_reconciliation')!=AGG: fail('B2 canonical aggregates')
 manifest=load(d/'B2_EXTRACTION_MANIFEST_ACCEPTANCE.json').get('manifest_contract',{})
 if manifest!={'approved_archive_sha256':'2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c','source_set_state':'NOT_MATERIALIZED','member_set_required':True,'span_offset_unit':'unicode_code_point','body_region_total_coverage':True,'sanitizer_fail_closed':True,'public_raw_retention':'PROHIBITED'}: fail('B2M extraction manifest contract')
 norm=load(d/'B2_DEFINITION_NORMALIZATION_FIXTURES.json')
 if not any('runtime UNKNOWN' in z['expected_result'] for z in norm['cases']): fail('B2N static/runtime boundary')
 dep=load(d/'B2_DEPENDENCY_QUARANTINE_FIXTURES.json')
 if set(dep.get('allowed_dispositions',[]))!=DISPOSITIONS: fail('B2D dispositions')
 if any(z.get('expected_disposition') not in DISPOSITIONS for z in dep['cases']): fail('B2D case disposition')
 if not DISPOSITIONS.issubset({z['expected_disposition'] for z in dep['cases']}): fail('B2D disposition coverage')
 contract=dep.get('classification_contract',{})
 if contract.get('stage_order')!=['lexical_context','local_symbol_scope','catalog_resolution']: fail('B2D classification order')
 if 'not extracted authoritative source sites' not in contract.get('evidence_boundary',''): fail('B2D synthetic boundary')
 by_id={z['id']:z for z in dep['cases']}
 for case_id in set(LOCAL_CASES)|{'B2D-19'}:
  z=by_id.get(case_id,{})
  src=z.get('fixture_source',{});txt=src.get('text','')
  if src.get('identity')!='synthetic:'+case_id or src.get('provenance')!='SYNTHETIC_TEST_DESIGN' or src.get('authoritative_source_path') is not None or not txt or src.get('sha256')!=sha(txt.encode()): fail(f'B2D {case_id}: synthetic source identity/hash')
  if src.get('scope_context')!=SYNTHETIC_CONTEXTS[case_id]: fail(f'B2D {case_id}: synthetic scope context')
  spans=z.get('source_spans',[])
  if not spans: fail(f'B2D {case_id}: missing span')
  for span in spans:
   start,end=span.get('start'),span.get('end')
   if type(start) is not int or type(end) is not int or not 0<=start<end<=len(txt) or span.get('offset_unit')!='unicode_code_point' or txt[start:end]!=span.get('lexeme'): fail(f'B2D {case_id}: invalid synthetic span')
  if not z.get('reason') or z.get('disposition_owner')!='L03/B2' or z.get('catalog_edges')!=[]: fail(f'B2D {case_id}: reason/owner/no-edge')
  if case_id in LOCAL_CASES:
   if z.get('expected_disposition')!='LOCAL_OR_NON_CATALOG' or {s.get('lexical_role') for s in spans}!=LOCAL_CASES[case_id] or not z.get('closure_acceptance','').startswith('NO_CATALOG_EDGE;'): fail(f'B2D {case_id}: local exclusion')
   if case_id=='B2D-11' and {s['lexeme'] for s in spans}!={'inserted','deleted'}: fail('B2D trigger pseudo-table coverage')
  else:
   if z.get('expected_disposition')!='UNRESOLVED' or {s.get('lexical_role') for s in spans}!={'CATALOG_REFERENCE'} or z.get('synthetic_catalog')!={'provenance':'SYNTHETIC_TEST_DESIGN','objects':[],'qualified_match_count':0} or z.get('resolved_target_id') is not None or z.get('binding_acceptance')!='BLOCKED_UNRESOLVED' or z.get('closure_acceptance')!='BLOCKED_UNRESOLVED': fail('B2D unresolved fail-closed acceptance')
 queue=load(d/'B2_FILTER_LITERAL_RESOLUTION_QUEUE.json')
 bound=queue.get('bounded_filter_slice',{})
 if bound!={'families':13,'artifacts':24,'serialized_rows':600,'literal_names':18,'scope':'complete only for explicitly enumerated filter slice'}: fail('B2Q bounded slice')
 reg=load(ROOT/'inventories/traceability/FILTER_FAMILY_TRACEABILITY_REGISTER.json')
 expected_literals={z['literal_name'] for z in reg['literal_db_references']}
 observed={z['literal_name'] for z in queue['cases']}
 if observed!=expected_literals or len(observed)!=18: fail('B2Q literal exact set')
 for z in queue['cases']:
  if z.get('catalog_resolution_status')!='PENDING_B2' or z.get('resolved_catalog_object_id') is not None: fail(f'B2Q premature resolution {z.get("literal_name")}')
 print(f'PASS_LOCAL_PREPARATION_ONLY units=6 cases={len(all_ids)} literals=18 source_pins=60 trc_db_001=OPEN base={BASE}')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent)
 try: validate(p.parse_args().directory)
 except Exception as e: print(f'FAIL: {e}',file=sys.stderr);sys.exit(1)
