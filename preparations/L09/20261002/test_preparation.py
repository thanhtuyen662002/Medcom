#!/usr/bin/env python3
import copy, json, pathlib, shutil, subprocess, tempfile
HERE=pathlib.Path(__file__).resolve().parent
VALIDATOR=HERE/'validate_preparation.py'
JSONS=sorted(HERE.glob('*.json'))

def run(path): return subprocess.run([str(VALIDATOR),str(path)],capture_output=True,text=True)
def mutate(name,fn):
 with tempfile.TemporaryDirectory() as td:
  d=pathlib.Path(td)
  for p in JSONS: shutil.copy2(p,d/p.name)
  p=d/name; data=json.loads(p.read_text()); fn(data); p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  r=run(d)
  assert r.returncode!=0, f'negative mutation unexpectedly passed: {name} {fn.__name__}'

base=run(HERE); assert base.returncode==0, base.stderr
checks=[
 ('R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json',lambda d:d.__setitem__('base_main','deadbeef')),
 ('R1_REALTIME_EVENT_LOSS_FIXTURES.json',lambda d:d.__setitem__('issue',25)),
 ('R4_ISOLATED_RECOVERY_CHECKLIST.json',lambda d:d.__setitem__('execution_status','PASSED')),
 ('R5_COEXISTENCE_ROLLBACK_FIXTURES.json',lambda d:d['source_contracts'][0].__setitem__('git_blob_sha256','0'*64)),
 ('R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json',lambda d:d['verified_static_facts'].__setitem__('candidate_current_rpx_count',785)),
 ('R1_REALTIME_EVENT_LOSS_FIXTURES.json',lambda d:d['contract'].__setitem__('signalr_role','business authority')),
 ('R4_ISOLATED_RECOVERY_CHECKLIST.json',lambda d:d['prohibited_claims'].remove('no invented RPO/RTO')),
 ('R5_COEXISTENCE_ROLLBACK_FIXTURES.json',lambda d:d['rollback_boundaries']['must_not'].remove('reverse committed business transactions')),
 ('R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json',lambda d:d['cases'][1].__setitem__('id',d['cases'][0]['id'])),
 ('R5_COEXISTENCE_ROLLBACK_FIXTURES.json',lambda d:d['eligibility'].__setitem__('decision','eligible to operate')),
 ('R4_ISOLATED_RECOVERY_CHECKLIST.json',lambda d:d['backup_chain_policy'].__setitem__('SIMPLE','require full/differential/log chain')),
 ('R4_ISOLATED_RECOVERY_CHECKLIST.json',lambda d:d['restore_frontier']['stores'].remove('command/idempotency ledger')),
 ('R2_ASYNC_JOB_SCOPE_FIXTURES.json',lambda d:d['job_envelope'].__setitem__('dispatch_rule','execute queued request without reauthorization')),
 ('R2_ASYNC_JOB_SCOPE_FIXTURES.json',lambda d:d['job_envelope']['server_derived_immutable'].remove('canonical_parameter_fingerprint')),
 ('R5_COEXISTENCE_ROLLBACK_FIXTURES.json',lambda d:d['rollback_boundaries']['may'].pop()),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d.__setitem__('external_write_rehearsal_authorized',True)),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['requirements'].pop()),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['requirements'][0].__setitem__('state','VERIFIED')),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['requirements'][1].__setitem__('requirement','placeholder')),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['state_machine'].__setitem__('admission_rule','admit without exact-head verification')),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['state_machine'].__setitem__('drift_rule','none')),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['cases'][0].__setitem__('id','R1X-99')),
 ('R1_EXTERNAL_WRITE_FRESHNESS_GATE.json',lambda d:d['cases'][0].__setitem__('required_evidence_to_pass','ok')),
 ('R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json',lambda d:d['eligibility'].__setitem__('graph_status','READY')),
 ('R2_ASYNC_JOB_SCOPE_FIXTURES.json',lambda d:d['job_envelope']['browser_inputs'].remove('registered_report_id')),
 ('R4_ISOLATED_RECOVERY_CHECKLIST.json',lambda d:d['required_rehearsal_record'].remove('cleanup/retention outcome and reviewer sign-off')),
 ('R5_COEXISTENCE_ROLLBACK_FIXTURES.json',lambda d:d['eligibility']['dependencies'].remove('R4')),
]
for name,fn in checks: mutate(name,fn)
print('PASS tests=28 baseline=1 negative=27')
