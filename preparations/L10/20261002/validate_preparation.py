#!/usr/bin/env python3
import argparse, hashlib, json, pathlib, subprocess, sys
BASE='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
ROOT=pathlib.Path(__file__).resolve().parents[3]
EXPECTED={
 'Q1_AUTH_TENANT_ATTACK_MATRIX.json':('Q1',36,19),
 'Q2_FRONTEND_STRESS_MATRIX.json':('Q2',37,19),
 'Q3_FRESHNESS_CHAOS_MATRIX.json':('Q3',38,16),
 'Q4_RELEASE_GATE_LEDGER.json':('Q4',41,14),
 'QX_OWNER_PREPARATION_RECHECK.json':('QX',41,12)}
SUPPLEMENTS={
 'Q1_SUPPORT_LOG_LEAKAGE_MATRIX.json':('Q1',36,6,'Q1_AUTH_TENANT_ATTACK_MATRIX.json'),
 'Q2_EXPORT_FORMULA_ACCESSIBILITY_MATRIX.json':('Q2',37,6,'Q2_FRONTEND_STRESS_MATRIX.json'),
 'Q3_EVENT_PAYLOAD_ABUSE_MATRIX.json':('Q3',38,6,'Q3_FRESHNESS_CHAOS_MATRIX.json'),
 'Q4_EVIDENCE_PROVENANCE_TAMPER_MATRIX.json':('Q4',41,6,'Q4_RELEASE_GATE_LEDGER.json')}
REVIEWS={
 'QX_L09_R1_GATE_REVIEW.json':('QX-R1',41,5,'L09/R1',2),
 'QX_L09_OPERATIONS_REPAIR_REVIEW.json':('QX-OPS',41,4,'L09/R2,R4,R5',6),
}
OPEN_REVIEWS={
 'QX_L09_R2J_EXECUTABLE_REVIEW.json':('QX-R2J',41,5,'L09/R2',4),
}
DEPS=[('F4',31,'L06'),('F5',32,'L08'),('F6',33,'L08'),('F7',34,'L08'),('F8',35,'L08'),('F9',42,'L08'),('B5',24,'L07'),('Q1',36,'L10'),('Q2',37,'L10'),('Q3',38,'L10'),('R1',39,'L09'),('R2',25,'L09'),('R4',27,'L09'),('R5',40,'L09')]
FINDINGS={'QA-ROUTE-L07-001','QA-ROUTE-L07-002','QA-ROUTE-L07-003','QA-ROUTE-L07-004','QA-ROUTE-L06-001','QA-ROUTE-L06-002','QA-ROUTE-L09-001','QA-ROUTE-L09-002','QA-ROUTE-L09-003','QA-ROUTE-L02-001','QA-ROUTE-L03-001','QA-ROUTE-L03-002'}
OPEN_FINDINGS=set()
def fail(m): raise AssertionError(m)
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(b): return hashlib.sha256(b).hexdigest()
def bh(path): return sha(subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT))
def validate(d):
 files={p.name for p in d.glob('*.json')}
 if files!=set(EXPECTED)|set(SUPPLEMENTS)|set(REVIEWS)|set(OPEN_REVIEWS): fail(f'fixture set mismatch {sorted(files)}')
 ids=[]
 for name,(unit,issue,count) in EXPECTED.items():
  x=load(d/name)
  if (x.get('schema_version'),x.get('lane'),x.get('artifact_status'),x.get('execution_status'))!=(1,'L10','prepared_local_only','NOT_RUN'): fail(f'{name}: identity/status')
  if (x.get('base_main'),x.get('unit'),x.get('issue'))!=(BASE,unit,issue): fail(f'{name}: base/unit/issue')
  if not any('no GitHub mutation' in z and 'production operation' in z for z in x.get('safety_limits',[])): fail(f'{name}: safety limits')
  required_record={'stimulus_timestamp','observed_result','authoritative_version_or_identity','exact_head','environment_identity','measurement_profile','reviewer'}
  if set(x.get('future_execution_record_fields',[]))!=required_record: fail(f'{name}: future execution record')
  refs=x.get('source_contracts',[])
  if len(refs)!=15 or len({z['path'] for z in refs})!=15: fail(f'{name}: source set')
  for z in refs:
   if z.get('ref')!=BASE or z.get('git_blob_sha256')!=bh(z['path']): fail(f'{name}: bad source pin {z.get("path")}')
  cases=x.get('cases',[])
  if len(cases)!=count: fail(f'{name}: case count')
  current=[z.get('id') for z in cases]
  if len(current)!=len(set(current)) or any(not i.startswith(unit+'-') for i in current): fail(f'{name}: IDs')
  for z in cases:
   if z.get('execution_status')!='NOT_RUN': fail(f'{name}:{z.get("id")}: status')
   for k in ('role','entry_point','attack_or_failure','expected_result','owner_route','evidence_to_pass'):
    if not z.get(k): fail(f'{name}:{z.get("id")}:{k}')
  ids+=current
 for name,(unit,issue,count,owner,artifact_count) in REVIEWS.items():
  x=load(d/name)
  if (x.get('schema_version'),x.get('lane'),x.get('artifact_status'),x.get('execution_status'))!=(1,'L10','prepared_local_only','NOT_RUN'): fail(f'{name}: identity/status')
  if (x.get('base_main'),x.get('unit'),x.get('issue'),x.get('reviewed_owner'))!=(BASE,unit,issue,owner): fail(f'{name}: base/unit/issue/owner')
  if x.get('review_verdict')!='PASS_PREPARED_LOCAL_REPAIR_NOT_DURABLE' or not x.get('owner_route','').startswith('L09/'): fail(f'{name}: verdict/route')
  if not any('no GitHub mutation' in z and 'production operation' in z for z in x.get('safety_limits',[])): fail(f'{name}: safety limits')
  arts=x.get('reviewed_local_artifacts',[])
  if len(arts)!=artifact_count or len({z['path'] for z in arts})!=artifact_count: fail(f'{name}: reviewed artifact set')
  for z in arts:
   p=ROOT/z['path']
   if z.get('durability')!='LOCAL_WORKTREE_ONLY' or not p.is_file() or z.get('sha256')!=sha(p.read_bytes()): fail(f'{name}: reviewed artifact drift {z.get("path")}')
  cases=x.get('cases',[])
  if len(cases)!=count or {z.get('id') for z in cases}!={f'{unit}-{n:02d}' for n in range(1,count+1)}: fail(f'{name}: exact case set')
  for z in cases:
   if z.get('execution_status')!='NOT_RUN' or z.get('observed_local_result')!='REJECTED_BY_REPAIRED_VALIDATOR' or not z.get('owner_route','').startswith('L09/'): fail(f'{name}:{z.get("id")}: disposition')
   for k in ('role','entry_point','attack_or_failure','expected_result','evidence_to_pass'):
    if not z.get(k): fail(f'{name}:{z.get("id")}:{k}')
  ids += [z['id'] for z in cases]
 for name,(unit,issue,count,owner,artifact_count) in OPEN_REVIEWS.items():
  x=load(d/name)
  if (x.get('schema_version'),x.get('lane'),x.get('artifact_status'),x.get('execution_status'))!=(1,'L10','prepared_local_only','NOT_RUN'): fail(f'{name}: identity/status')
  if (x.get('base_main'),x.get('unit'),x.get('issue'),x.get('reviewed_owner'))!=(BASE,unit,issue,owner): fail(f'{name}: base/unit/issue/owner')
  if x.get('review_verdict')!='FAIL_OPEN_DESIGN_DEFECTS_ROUTED' or x.get('owner_route')!='L09/R2/#25': fail(f'{name}: verdict/route')
  if not any('no GitHub mutation' in z and 'production operation' in z for z in x.get('safety_limits',[])): fail(f'{name}: safety limits')
  arts=x.get('reviewed_local_artifacts',[])
  if len(arts)!=artifact_count or len({z['path'] for z in arts})!=artifact_count: fail(f'{name}: reviewed artifact set')
  for z in arts:
   p=ROOT/z['path']
   if z.get('durability')!='LOCAL_WORKTREE_ONLY' or not p.is_file() or z.get('sha256')!=sha(p.read_bytes()): fail(f'{name}: reviewed artifact drift {z.get("path")}')
  cases=x.get('cases',[])
  if len(cases)!=count or {z.get('id') for z in cases}!={f'{unit}-{n:02d}' for n in range(1,count+1)}: fail(f'{name}: exact case set')
  for z in cases:
   if z.get('execution_status')!='NOT_RUN' or z.get('observed_local_result')!='REPRODUCED_FAIL_OPEN_DESIGN_DEFECT' or z.get('owner_route')!='L09/R2/#25': fail(f'{name}:{z.get("id")}: disposition')
   for k in ('role','entry_point','attack_or_failure','expected_result','evidence_to_pass'):
    if not z.get(k): fail(f'{name}:{z.get("id")}:{k}')
  ids += [z['id'] for z in cases]
 for name,(unit,issue,count,parent) in SUPPLEMENTS.items():
  x=load(d/name)
  if (x.get('schema_version'),x.get('lane'),x.get('artifact_status'),x.get('execution_status'))!=(1,'L10','prepared_local_only','NOT_RUN'): fail(f'{name}: identity/status')
  if (x.get('base_main'),x.get('unit'),x.get('issue'),x.get('supplement_to'))!=(BASE,unit,issue,parent): fail(f'{name}: base/unit/issue/parent')
  if not any('no GitHub mutation' in z and 'production operation' in z for z in x.get('safety_limits',[])): fail(f'{name}: safety limits')
  required_record={'stimulus_timestamp','observed_result','authoritative_version_or_identity','exact_head','environment_identity','measurement_profile','reviewer'}
  if set(x.get('future_execution_record_fields',[]))!=required_record: fail(f'{name}: future execution record')
  refs=x.get('source_contracts',[])
  if len(refs)!=3 or len({z['path'] for z in refs})!=3: fail(f'{name}: source set')
  for z in refs:
   if z.get('ref')!=BASE or z.get('git_blob_sha256')!=bh(z['path']): fail(f'{name}: bad source pin {z.get("path")}')
  cases=x.get('cases',[])
  if len(cases)!=count: fail(f'{name}: case count')
  current=[z.get('id') for z in cases]
  if len(current)!=len(set(current)) or any(not i.startswith(unit+'-') for i in current): fail(f'{name}: IDs')
  for z in cases:
   if z.get('execution_status')!='NOT_RUN': fail(f'{name}:{z.get("id")}: status')
   for k in ('role','entry_point','attack_or_failure','expected_result','owner_route','evidence_to_pass'):
    if not z.get(k): fail(f'{name}:{z.get("id")}:{k}')
  ids+=current
 if len(ids)!=len(set(ids)): fail('cross-file duplicate IDs')
 expected_supplement_ids={
  'Q1_SUPPORT_LOG_LEAKAGE_MATRIX.json':{f'Q1-SL-{n:02d}' for n in range(1,7)},
  'Q2_EXPORT_FORMULA_ACCESSIBILITY_MATRIX.json':{f'Q2-EF-{n:02d}' for n in range(1,7)},
  'Q3_EVENT_PAYLOAD_ABUSE_MATRIX.json':{f'Q3-EP-{n:02d}' for n in range(1,7)},
  'Q4_EVIDENCE_PROVENANCE_TAMPER_MATRIX.json':{f'Q4-PT-{n:02d}' for n in range(1,7)}}
 for name,expected_ids in expected_supplement_ids.items():
  if {z['id'] for z in load(d/name)['cases']}!=expected_ids: fail(f'{name}: required coverage')
 q1=load(d/'Q1_AUTH_TENANT_ATTACK_MATRIX.json')
 axes=set(q1['identity_axes'])
 if not {'authenticated principal','tenant/data-source profile','company','branch','storehouse','permission/session generation'}.issubset(axes): fail('Q1 scope axes')
 if not {'Q1-16','Q1-17','Q1-18','Q1-19'}.issubset({z['id'] for z in q1['cases']}): fail('Q1 generation/cache/side-channel coverage')
 q2=load(d/'Q2_FRONTEND_STRESS_MATRIX.json')
 if q2['performance_contract_ms']!={'local_interaction_p95_max':100,'indexed_filter_sort_p95_max':1000,'first_useful_grid_p75_max':1500,'first_useful_grid_p95_max':2500,'slow_network_fixture':10000}: fail('Q2 performance bounds')
 if not {'Q2-16','Q2-17','Q2-18','Q2-19'}.issubset({z['id'] for z in q2['cases']}): fail('Q2 boundary/profile/focus/build coverage')
 q3=load(d/'Q3_FRESHNESS_CHAOS_MATRIX.json')
 if 'disposable WinForms/direct-write test target' not in q3['eligibility']['unmet']: fail('Q3 direct-write gate')
 if 'completed authoritative reread' not in q3.get('open_freshness_measurement_definition',''): fail('Q3 freshness measurement definition')
 if not {'Q3-13','Q3-14','Q3-15','Q3-16'}.issubset({z['id'] for z in q3['cases']}): fail('Q3 outbox/scope/generation/kill-switch coverage')
 q4=load(d/'Q4_RELEASE_GATE_LEDGER.json')
 observed=[(z['graph_id'],z['issue'],z['owner_lane']) for z in q4['dependency_ledger']]
 if observed!=DEPS or q4['eligibility'].get('dependency_count')!=14 or q4['eligibility'].get('release_decision')!='NOT_ELIGIBLE': fail('Q4 dependency/release gate')
 if any(z.get('gate')!='BLOCKING' or z.get('verified_implementation')!='NOT_PROVEN' or z.get('green_exact_head_ci')!='NOT_PROVEN' for z in q4['dependency_ledger']): fail('Q4 dependency proof status')
 findings={z['id']:z for z in q4.get('routed_findings',[])}
 if set(findings)!=FINDINGS: fail('Q4 routed findings')
 if any(findings[k].get('status')!='OPEN_DESIGN_DEFECT' for k in OPEN_FINDINGS): fail('Q4 open design defect status')
 if any(z.get('status')!='PREPARED_LOCAL_CORRECTION_NOT_DURABLE' for k,z in findings.items() if k not in OPEN_FINDINGS): fail('Q4 local correction status')
 if any(z.get('release_effect')!='BLOCKING_UNTIL_DURABLE_REVIEWED_EVIDENCE' or z.get('product_evidence')!='NOT_RUN' for z in findings.values()): fail('Q4 finding release/product evidence')
 if not all(z.get('owner') in {'L07/B5','L07/B3','L06/F2','L09/R4','L09/R2','L02/A1','L03/B2'} for z in findings.values()): fail('Q4 finding routing')
 qx=load(d/'QX_OWNER_PREPARATION_RECHECK.json')
 if qx.get('review_summary')!={'routed_findings':12,'prepared_corrections':12,'open_design_defects':0,'durable_corrections':0,'product_tests_passed':0}: fail('QX review summary')
 arts=qx.get('reviewed_local_artifacts',[])
 if len(arts)!=13 or len({z['path'] for z in arts})!=13: fail('QX artifact set')
 for z in arts:
  p=ROOT/z['path']
  if z.get('durability')!='LOCAL_WORKTREE_ONLY' or not p.is_file() or z.get('sha256')!=sha(p.read_bytes()): fail(f'QX artifact drift {z.get("path")}')
 qxc={z['routed_finding_id']:z for z in qx['cases']}
 if set(qxc)!=FINDINGS: fail('QX finding coverage')
 if any(qxc[k].get('local_recheck_result')!='FAIL_OPEN_DESIGN_DEFECT' for k in OPEN_FINDINGS): fail('QX open defect disposition')
 if any(z.get('local_recheck_result')!='PASS_PREPARED_LOCAL_NOT_DURABLE' for k,z in qxc.items() if k not in OPEN_FINDINGS): fail('QX prepared correction disposition')
 idem=load(ROOT/'preparations/L07/20261002/B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json')
 stable_key=['tenant','company','authoritative_data_source','stable_principal','registered_action_id','contract_version','idempotency_key']
 if idem.get('dedupe_domain')!=stable_key or idem.get('ledger_lookup_key')!=stable_key: fail('QX L07 stable lookup key')
 if 'semantic_request_fingerprint' in idem.get('dedupe_domain',[]) or 'semantic_request_fingerprint' in idem.get('ledger_lookup_key',[]): fail('QX L07 fingerprint participates in lookup')
 if idem.get('immutable_record_fields')!=['semantic_request_fingerprint']: fail('QX L07 immutable fingerprint record')
 expected_behavior='lookup by stable scoped ledger key, then compare the immutable stored fingerprint; mismatch is rejected before dispatch and is never a miss or new reservation'
 if idem.get('fingerprint_contract',{}).get('lookup_behavior')!=expected_behavior: fail('QX L07 lookup behavior')
 expected_lookup='[tenant, company, authoritative_data_source, stable_principal, registered_action_id, contract_version, idempotency_key]'
 if expected_lookup not in qxc['QA-ROUTE-L07-001']['expected_result']: fail('QX stable lookup remediation')
 dep=load(ROOT/'preparations/L03/20261002/B2_DEPENDENCY_QUARANTINE_FIXTURES.json')
 dep_cases={z.get('entry_point'):z for z in dep.get('cases',[])}
 local_entries={'CTE name','table variable','temporary table','trigger pseudo-table','comment/string token'}
 if any(dep_cases.get(k,{}).get('expected_disposition')!='LOCAL_OR_NON_CATALOG' for k in local_entries): fail('QX L03 local-symbol correction')
 unresolved=[z for z in dep.get('cases',[]) if z.get('expected_disposition')=='UNRESOLVED']
 if len(unresolved)!=1 or not unresolved[0].get('fixture_source') or not all(unresolved[0].get(k) for k in ('reason','disposition_owner','binding_acceptance','closure_acceptance','source_spans')): fail('QX L03 unresolved coverage')
 print(f'PASS_LOCAL_PREPARATION_ONLY units=12 cases={len(ids)} dependencies=14 prepared_corrections=12 open_design_defects=5 base={BASE}')
if __name__=='__main__':
 p=argparse.ArgumentParser(); p.add_argument('directory',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent)
 try: validate(p.parse_args().directory)
 except Exception as e: print(f'FAIL: {e}',file=sys.stderr); sys.exit(1)
