#!/usr/bin/env python3
import json,pathlib,shutil,subprocess,tempfile
HERE=pathlib.Path(__file__).resolve().parent; VALIDATOR=HERE/'validate_preparation.py'; JSONS=sorted(HERE.glob('*.json'))
def run(p): return subprocess.run([str(VALIDATOR),str(p)],capture_output=True,text=True)
def neg(name,fn):
 with tempfile.TemporaryDirectory() as td:
  d=pathlib.Path(td)
  for p in JSONS: shutil.copy2(p,d/p.name)
  p=d/name; x=json.loads(p.read_text()); fn(x); p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
  r=run(d); assert r.returncode!=0,(name,fn.__name__,r.stdout,r.stderr)
r=run(HERE); assert r.returncode==0,r.stderr
checks=[
 ('Q1_AUTH_TENANT_ATTACK_MATRIX.json',lambda x:x.__setitem__('base_main','bad')),
 ('Q1_AUTH_TENANT_ATTACK_MATRIX.json',lambda x:x['identity_axes'].remove('storehouse')),
 ('Q2_FRONTEND_STRESS_MATRIX.json',lambda x:x['performance_contract_ms'].__setitem__('slow_network_fixture',5000)),
 ('Q2_FRONTEND_STRESS_MATRIX.json',lambda x:x['cases'][0].__setitem__('execution_status','PASSED')),
 ('Q3_FRESHNESS_CHAOS_MATRIX.json',lambda x:x['eligibility']['unmet'].remove('disposable WinForms/direct-write test target')),
 ('Q3_FRESHNESS_CHAOS_MATRIX.json',lambda x:x['source_contracts'][0].__setitem__('git_blob_sha256','0'*64)),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:x['eligibility'].__setitem__('release_decision','ELIGIBLE')),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:x['dependency_ledger'].pop()),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:x['dependency_ledger'][0].__setitem__('green_exact_head_ci','PASSED')),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:x['routed_findings'][0].__setitem__('status','CLOSED')),
 ('QX_OWNER_PREPARATION_RECHECK.json',lambda x:x['reviewed_local_artifacts'][0].__setitem__('sha256','0'*64)),
 ('QX_OWNER_PREPARATION_RECHECK.json',lambda x:x['review_summary'].__setitem__('durable_corrections',10)),
 ('QX_OWNER_PREPARATION_RECHECK.json',lambda x:x['cases'][0].__setitem__('local_recheck_result','FAIL_OPEN_DESIGN_DEFECT')),
 ('QX_OWNER_PREPARATION_RECHECK.json',lambda x:next(z for z in x['cases'] if z['routed_finding_id']=='QA-ROUTE-L03-001').__setitem__('local_recheck_result','FAIL_OPEN_DESIGN_DEFECT')),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:next(z for z in x['routed_findings'] if z['id']=='QA-ROUTE-L03-002').__setitem__('status','OPEN_DESIGN_DEFECT')),
 ('Q1_AUTH_TENANT_ATTACK_MATRIX.json',lambda x:x['cases'].pop()),
 ('Q4_RELEASE_GATE_LEDGER.json',lambda x:x['cases'].pop()),
 ('Q1_SUPPORT_LOG_LEAKAGE_MATRIX.json',lambda x:x['cases'].pop()),
 ('Q2_EXPORT_FORMULA_ACCESSIBILITY_MATRIX.json',lambda x:x['source_contracts'][0].__setitem__('git_blob_sha256','0'*64)),
 ('Q3_EVENT_PAYLOAD_ABUSE_MATRIX.json',lambda x:x['cases'][0].__setitem__('execution_status','PASSED')),
 ('Q4_EVIDENCE_PROVENANCE_TAMPER_MATRIX.json',lambda x:x.__setitem__('supplement_to','Q4_RELEASE_GATE_LEDGER_WRONG.json'))]
checks += [
 ('QX_L09_R1_GATE_REVIEW.json',lambda x:x.__setitem__('review_verdict','FAIL_OPEN_VALIDATOR_GAPS')),
 ('QX_L09_R1_GATE_REVIEW.json',lambda x:x['cases'][0].__setitem__('observed_local_result','ACCEPTED_BY_CURRENT_VALIDATOR')),
 ('QX_L09_OPERATIONS_REPAIR_REVIEW.json',lambda x:x['reviewed_local_artifacts'][0].__setitem__('sha256','0'*64)),
 ('QX_L09_OPERATIONS_REPAIR_REVIEW.json',lambda x:x['cases'][3].__setitem__('owner_route','L01'))]
checks += [
 ('QX_L09_R2J_EXECUTABLE_REVIEW.json',lambda x:x.__setitem__('review_verdict','PASS_PREPARED_LOCAL_REPAIR_NOT_DURABLE')),
 ('QX_L09_R2J_EXECUTABLE_REVIEW.json',lambda x:x['cases'][0].__setitem__('observed_local_result','NOT_REPRODUCED')),
 ('QX_L09_R2J_EXECUTABLE_REVIEW.json',lambda x:x['reviewed_local_artifacts'][0].__setitem__('sha256','0'*64))]
for n,f in checks: neg(n,f)
print('PASS tests=29 baseline=1 negative=28')
