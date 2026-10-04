#!/usr/bin/env python3
import argparse, hashlib, json, pathlib, subprocess, sys

BASE='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
EXPECTED={
 'R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json':('R2',25,16),
 'R2_ASYNC_JOB_SCOPE_FIXTURES.json':('R2J',25,12),
 'R1_REALTIME_EVENT_LOSS_FIXTURES.json':('R1',39,16),
 'R1_EXTERNAL_WRITE_FRESHNESS_GATE.json':('R1X',39,10),
 'R4_ISOLATED_RECOVERY_CHECKLIST.json':('R4',27,14),
 'R5_COEXISTENCE_ROLLBACK_FIXTURES.json':('R5',40,16),
}
ROOT=pathlib.Path(__file__).resolve().parents[3]
R1X_REQUIREMENTS={
 'XWR-01':'Disposable nonproduction database and Web environment are uniquely fingerprinted; production connectivity is denied.',
 'XWR-02':'Approved WinForms build/source identity and one bounded write path are verified; no guessed action or SQL contract.',
 'XWR-03':'Authoritative version/change detector is identified for the affected resource; timestamps alone are insufficient.',
 'XWR-04':'Baseline proves no SQL Broker event transport is assumed; no SQL Broker or database option change is made.',
 'XWR-05':'SWR/poll/focus/manual fallback paths are separately instrumented and reauthorize before returning data.',
 'XWR-06':'Polling is bounded by measured load, jitter/backoff and resource-specific freshness acceptance; no interval is invented.',
 'XWR-07':'Server-derived tenant/company/branch/storehouse scope and permission revision fence every revalidation.',
 'XWR-08':'Role revoke, logout and company switch purge inaccessible cached data and late results without existence leakage.',
 'XWR-09':'Passive traffic does not extend session activity or draft lifetime.',
 'XWR-10':'Freshness UI exposes data age/degraded state and never claims live delivery from transport connectivity alone.',
 'XWR-11':'Concurrent Web/WinForms writes and superseded responses resolve through authoritative reread without overwriting dirty input.',
 'XWR-12':'Independent review by security/DBA/operations accepts exact environment, head, load and cleanup evidence.',
}
R1X_CASE_EVIDENCE={
 'R1X-01':'write identity, detector result, elapsed convergence and authorized reread proof',
 'R1X-02':'UI freshness trace and fallback convergence record',
 'R1X-03':'generation fence and zero cross-scope field/count disclosure',
 'R1X-04':'permission revision trace and denial without existence leak',
 'R1X-05':'ordered write/version record and final authoritative equality',
 'R1X-06':'request-rate, backoff and recovery measurements',
 'R1X-07':'request generation ordering and displayed-version trace',
 'R1X-08':'activity-clock trace and expired authorization result',
 'R1X-09':'dirty-field preservation and authoritative version comparison',
 'R1X-10':'approved isolated environment and reviewed nonproduction procedure',
}
R2_DEPENDENCIES={'B2','exact ERP/report reachability','export authority'}
R2J_BROWSER_INPUTS={'registered_report_id','typed_parameters','requested_format','client_idempotency_key','correlation_id'}
R4_REHEARSAL_RECORD={
 'source environment identity and approved scope',
 'backup identity/type/time/hash or provider-native immutable ID',
 'disposable restore target and isolation proof',
 'tool/version/command class with secrets redacted',
 'start/end timestamps and measured durations',
 'integrity result and application smoke result',
 'data-loss observation compared with an agreed target',
 'cleanup/retention outcome and reviewer sign-off',
}
R5_DEPENDENCIES={'A1','A5','A7','Q3','R4'}

def fail(msg): raise AssertionError(msg)
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def blob_hash(ref,path):
 data=subprocess.check_output(['git','show',f'{ref}:{path}'],cwd=ROOT)
 return hashlib.sha256(data).hexdigest()

def validate(directory:pathlib.Path):
 actual={p.name for p in directory.glob('*.json')}
 if actual != set(EXPECTED): fail(f'fixture set mismatch: {sorted(actual)}')
 all_ids=[]
 for name,(unit,issue,count) in EXPECTED.items():
  d=load(directory/name)
  if d.get('schema_version')!=1 or d.get('lane')!='L09': fail(f'{name}: common identity')
  if d.get('artifact_status')!='prepared_local_only' or d.get('execution_status')!='NOT_RUN': fail(f'{name}: status')
  if d.get('base_main')!=BASE or d.get('unit')!=unit or d.get('issue')!=issue: fail(f'{name}: base/unit/issue')
  limits=d.get('safety_limits',[])
  if not any('no GitHub mutation' in x and 'production operation' in x for x in limits): fail(f'{name}: mutation/operation limit')
  refs=d.get('source_contracts',[])
  if len(refs)!=13 or len({x['path'] for x in refs})!=13: fail(f'{name}: source contract set')
  for ref in refs:
   if ref.get('ref')!=BASE or ref.get('git_blob_sha256')!=blob_hash(BASE,ref['path']): fail(f'{name}: bad source pin {ref.get("path")}')
  cases=d.get('cases',[])
  if len(cases)!=count: fail(f'{name}: expected {count} cases')
  ids=[x.get('id') for x in cases]
  if len(ids)!=len(set(ids)) or any(not x.startswith(unit+'-') for x in ids): fail(f'{name}: case IDs')
  for c in cases:
   if c.get('execution_status')!='NOT_RUN': fail(f'{name}:{c.get("id")}: execution status')
   for k in ('synthetic_trigger','expected_fail_closed_behavior','required_evidence_to_pass'):
    if not c.get(k): fail(f'{name}:{c.get("id")}: missing {k}')
  all_ids.extend(ids)
 if len(all_ids)!=len(set(all_ids)): fail('cross-file duplicate case IDs')
 r2=load(directory/'R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json')
 f=r2['verified_static_facts']
 if (f['candidate_current_rpx_count'],f['embedded_script_report_count'],f['subreport_control_count'],f['subreport_parent_count'])!=(786,119,31,8): fail('R2 static counts')
 if not any('candidate is not a reachable' in x for x in r2['non_inferences']): fail('R2 candidate/reachability boundary')
 if r2.get('eligibility',{}).get('graph_status')!='BLOCKED' or set(r2['eligibility'].get('dependencies',[]))!=R2_DEPENDENCIES: fail('R2 eligibility weakened')
 r1=load(directory/'R1_REALTIME_EVENT_LOSS_FIXTURES.json')
 if r1['contract'].get('signalr_role')!='invalidation accelerator only': fail('R1 SignalR authority')
 if 'WinForms may write without a Web event' not in r1['contract'].get('legacy_writer_limit',''): fail('R1 legacy writer limit')
 if 'reauthorize/revalidate current scope' not in r1['contract'].get('dispatch_boundary',''): fail('R1 consumer reauthorization boundary')
 r4=load(directory/'R4_ISOLATED_RECOVERY_CHECKLIST.json')
 if r4['verified_static_baseline']!={'recovery_model':'SIMPLE','read_committed_snapshot':'ON','snapshot_isolation':'OFF','service_broker':'OFF','query_store':'OFF','meaning':'dump evidence only; current runtime must be rechecked'}: fail('R4 static baseline')
 if 'no invented RPO/RTO' not in r4.get('prohibited_claims',[]): fail('R4 RPO/RTO boundary')
 if r4['eligibility'].get('graph_status')!='BLOCKED': fail('R4 graph status')
 policy=r4.get('backup_chain_policy',{})
 if policy.get('historical_static_recovery_model')!='SIMPLE' or 'do not require or claim SQL transaction-log chain' not in policy.get('SIMPLE',''): fail('R4 SIMPLE-compatible backup policy')
 frontier=r4.get('restore_frontier',{})
 stores=set(frontier.get('stores',[]))
 for required_store in ['business database','command/idempotency ledger','business/security audit','outbox/event delivery state']:
  if required_store not in stores: fail('R4 restore frontier missing '+required_store)
 if 'independent store restores are not assumed atomic' not in frontier.get('rule',''): fail('R4 cross-store atomicity assumption')
 if set(r4.get('required_rehearsal_record',[]))!=R4_REHEARSAL_RECORD: fail('R4 rehearsal evidence record')
 r5=load(directory/'R5_COEXISTENCE_ROLLBACK_FIXTURES.json')
 if r5['eligibility'].get('decision')!='preparation_only; READY label does not grant code or operation': fail('R5 readiness boundary')
 must_not=r5['rollback_boundaries']['must_not']
 required={'reverse committed business transactions','restore production database as routine application rollback','alter SQL recovery/isolation options','destructively rewrite shared legacy schema'}
 if not required.issubset(set(must_not)): fail('R5 rollback boundary')
 if not any('fence queued workers' in x for x in r5['rollback_boundaries']['may']): fail('R5 queued-worker fence missing')
 if r5.get('eligibility',{}).get('graph_status')!='READY WITH BOUNDS' or set(r5['eligibility'].get('dependencies',[]))!=R5_DEPENDENCIES: fail('R5 bounded readiness dependencies')
 job=load(directory/'R2_ASYNC_JOB_SCOPE_FIXTURES.json')
 env=job.get('job_envelope',{})
 for k in ['browser_inputs','server_derived_immutable','dispatch_rule','visibility_rule']:
  if not env.get(k): fail('R2J envelope missing '+k)
 if set(env['browser_inputs'])!=R2J_BROWSER_INPUTS: fail('R2J browser input boundary')
 if job.get('eligibility',{}).get('graph_status')!='BLOCKED' or set(job['eligibility'].get('dependencies',[]))!=R2_DEPENDENCIES: fail('R2J eligibility weakened')
 if 'canonical_parameter_fingerprint' not in env['server_derived_immutable'] or 'release/config generation' not in env['server_derived_immutable']: fail('R2J immutable scope incomplete')
 if 'reauthorizes current principal/capability' not in env['dispatch_rule'] or 'can only narrow' not in env['dispatch_rule']: fail('R2J dispatch authorization weakened')
 if 'status, notification and download each reauthorize' not in env['visibility_rule']: fail('R2J visibility authorization weakened')
 ext=load(directory/'R1_EXTERNAL_WRITE_FRESHNESS_GATE.json')
 if ext.get('current_decision')!='BLOCKED_NO_DISPOSABLE_EXTERNAL_WRITER_REHEARSAL' or ext.get('external_write_rehearsal_authorized') is not False: fail('R1X rehearsal falsely enabled')
 req=ext.get('requirements',[])
 if {x.get('id') for x in req}!={f'XWR-{i:02d}' for i in range(1,13)} or {x.get('state') for x in req}!={'MISSING_NOT_PROVIDED'}: fail('R1X requirements')
 if {x.get('id'):x.get('requirement') for x in req}!=R1X_REQUIREMENTS: fail('R1X exact requirement semantics')
 machine=ext.get('state_machine',{})
 if machine.get('initial')!='BLOCKED_NO_DISPOSABLE_EXTERNAL_WRITER_REHEARSAL' or machine.get('ready')!='READY_FOR_ISOLATED_EXTERNAL_WRITE_REHEARSAL': fail('R1X state')
 if machine.get('all_requirements_required') is not True or machine.get('automatic_transition')!='PROHIBITED': fail('R1X admission weakened')
 if machine.get('admission_rule')!='A separately authorized controller may admit one isolated rehearsal only after XWR-01..12 are VERIFIED at the exact head.': fail('R1X exact admission rule')
 if machine.get('drift_rule')!='Any target/build/scope/detector/load/review drift returns to BLOCKED_NO_DISPOSABLE_EXTERNAL_WRITER_REHEARSAL.': fail('R1X exact drift rule')
 ext_cases=ext.get('cases',[])
 if {x.get('id') for x in ext_cases}!=set(R1X_CASE_EVIDENCE): fail('R1X exact case set')
 if {x.get('id'):x.get('required_evidence_to_pass') for x in ext_cases}!=R1X_CASE_EVIDENCE: fail('R1X exact evidence obligations')
 body=json.dumps(ext,ensure_ascii=False).lower()
 for token in ['no sql broker','disposable target','winforms-direct write','swr/poll/focus/manual','authoritative version','permission revoke','passive traffic','bounded polling','independent review']:
  if token not in body: fail('R1X safety missing '+token)
 print(f'PASS_LOCAL_PREPARATION_ONLY units=6 cases={len(all_ids)} base={BASE}')

if __name__=='__main__':
 p=argparse.ArgumentParser(); p.add_argument('directory',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent)
 try: validate(p.parse_args().directory)
 except Exception as e:
  print(f'FAIL: {e}',file=sys.stderr); sys.exit(1)
