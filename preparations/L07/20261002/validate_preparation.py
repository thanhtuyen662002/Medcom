#!/usr/bin/env python3
"""Validate L07 preparation metadata; no transaction/runtime behavior is certified."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path
REF='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
FILES={'B3_TYPED_COMMAND_ENVELOPE_FIXTURES.json','B3_TRANSACTION_EFFECT_AUDIT_TEMPLATE.json','B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json','B5_OUTCOME_UNKNOWN_STATE_MACHINE.json','B5_CONCURRENCY_LOCK_FAULT_FIXTURES.json','B5_LEDGER_RETENTION_RESTORE_GATE.json'}
HASHES={'docs/architecture/PHASE2_COMMAND_TRANSACTION_CONTRACT.md':'a819e2f2cb55b94883235ae3626157e7da641e75a727b98a8930bd712299e99c','docs/db/CONCURRENCY_TRANSACTION_CONTRACTS.md':'5d3a5f84feb79dcfd024531fd9a0b25072756ab5c1c2899edcc52756dfa66b5c','docs/db/LOCKING_TRANSACTION_HOTSPOTS.md':'c0a34a5db9265a0cc946d9ad4cb85bd8f2d736fde84fdfdedaade835c0e401eb','docs/architecture/PHASE2_AUDIT_TRACE_CONTRACT.md':'e552f88a122745ee5e90754115ac832db9de2e16ae0c8f8cc35e650d56e2114c','docs/architecture/PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md':'9d9b7157027cce55e3d24d7ade4e554e7205d34a9393bb67f21f60164190c1e0','docs/web/UX_RUNTIME_FEEDBACK_SESSION.md':'a397a8df0049481cc91df81cfd664deb42e99baa3e060cc534d396c8a4e277a0','docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md':'c0b3703e66de2db886d6f0155c26ce54d16d269f79af7addf399c3c730bd7c84','docs/reviews/PHASE2_USER_OPERATIONS_ATTACK_REVIEW.md':'868d941461b99c0d7bd054661312beb83b60d1d55e05548855ce240064af9b2b','docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md':'d09bc5a78ea79dc613570e56e7b96100c98e58913b4a1cfaf32b8744ee7b0168','docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md':'338ac433b907f42e720fe3564d3041fef2322036d7405bdf0c7e08942ce3bb13'}
def fail(m):raise ValueError(m)
def ids(rows):
 v=[x['id'] for x in rows]
 if len(v)!=len(set(v)):fail('duplicate ID')
 return set(v)
def validate(repo:Path,package:Path):
 if {p.name for p in package.glob('*.json')}!=FILES:fail('missing/extra package')
 ds={n:json.loads((package/n).read_text()) for n in FILES}
 for n,d in ds.items():
  if (d.get('schema_version'),d.get('lane'),d.get('artifact_status'),d.get('base_main'),d.get('primary_issues'))!=(1,'L07','prepared_local_only',REF,[22,24]):fail(n+': common metadata drift')
  if d.get('execution_status')!='NOT_RUN':fail(n+': false execution status')
  lim=' '.join(d.get('limits',[])).lower()
  for t in ['no l07 dispatcher lease','no exact pilot command signature','no authorized raw sql','no database mutation','no product code','no github mutation']:
   if t not in lim:fail(n+': lost boundary '+t)
  src=d.get('source_contracts',[])
  if {x.get('path') for x in src}!=set(HASHES):fail(n+': source membership drift')
  for x in src:
   if x.get('ref')!=REF or x.get('sha256')!=HASHES[x['path']]:fail(n+': source ref/hash drift')
   b=subprocess.check_output(['git','show',f'{REF}:{x["path"]}'],cwd=repo)
   if hashlib.sha256(b).hexdigest()!=x['sha256']:fail(n+': git object hash mismatch')
 c=ds['B3_TYPED_COMMAND_ENVELOPE_FIXTURES.json']
 if ids(c['cases'])!={f'CMD-{i:02d}' for i in range(1,17)}:fail('command cases/status drift')
 if len(c['conceptual_envelope'])!=13 or len(set(c['conceptual_envelope']))!=13:fail('command envelope drift')
 split=c.get('authority_split',{})
 if set(split)!={'browser_may_supply','server_must_derive','rule'} or 'resolved_server_metadata_revision' not in split['server_must_derive'] or 'semantic_fingerprint' not in split['server_must_derive']:fail('browser/server authority split drift')
 command=json.dumps(c,ensure_ascii=False).lower()
 for t in ['sql table/procedure/method','closed schema','client widens','permission generation','business state','foreign parent','configuration injects','correlation grants no','outcomeunknown']:
  if t not in command:fail('command safety missing '+t)
 for t in ['compatibility hint','server metadata revision','fenced dispatch','retired or unsupported']:
  if t not in command:fail('metadata authority safety missing '+t)
 a=ds['B3_TRANSACTION_EFFECT_AUDIT_TEMPLATE.json']
 if ids(a['required_sections'])!={f'AUD-{i:02d}' for i in range(1,11)} or a.get('completion_status')!='template_only_no_command_audited':fail('audit template/status drift')
 phases=a.get('completion_model',[])
 if ids(phases)!={f'CMPH-{i:02d}' for i in range(1,6)} or [x['success_allowed'] for x in phases]!=[False,False,False,False,True]:fail('completion model drift')
 audit=json.dumps(a,ensure_ascii=False).lower()
 for t in ['transaction_owner','nested/savepoint','row/application resources','before/after/deferred','authoritative success','rollback-proved retry','business audit atomicity','static hotspot presence is not']:
  if t not in audit:fail('audit coverage missing '+t)
 for t in ['core_transaction_committed','mandatory_effects_pending','authoritative_reread_final','core transaction commit is an intermediate fact']:
  if t not in audit:fail('completion safety missing '+t)
 i=ds['B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json']
 if ids(i['cases'])!={f'IDM-{x:02d}' for x in range(1,17)}:fail('idempotency cases/status drift')
 stable_key=['tenant','company','authoritative_data_source','stable_principal','registered_action_id','contract_version','idempotency_key']
 if i['dedupe_domain']!=stable_key:fail('dedupe domain drift')
 if i.get('ledger_lookup_key')!=stable_key:fail('ledger lookup must use stable scoped identity without fingerprint')
 if 'semantic_request_fingerprint' in i['ledger_lookup_key']:fail('fingerprint must not participate in lookup uniqueness')
 if i.get('immutable_record_fields')!=['semantic_request_fingerprint']:fail('immutable fingerprint record field drift')
 if i.get('lookup_sequence')!=['lookup by stable scoped ledger key','if absent reserve one operation record','if present compare immutable semantic_request_fingerprint','reject mismatch before dispatch; never reserve a second record for the same key','reauthorize before result disclosure or replay decision']:fail('idempotency lookup sequence drift')
 fc=i.get('fingerprint_contract',{})
 if fc.get('input_owner')!='server' or fc.get('stored_with_operation')!='required and immutable' or fc.get('lookup_behavior')!='lookup by stable scoped ledger key, then compare the immutable stored fingerprint; mismatch is rejected before dispatch and is never a miss or new reservation':fail('fingerprint contract drift')
 idem=json.dumps(i,ensure_ascii=False).lower()
 for t in ['same domain/key','changed semantic payload','different tenant/company','another principal','role revoked','session generation','outcomeunknown','cannot become empty/reusable','external ledger alone cannot claim exactly once']:
  if t not in idem:fail('idempotency safety missing '+t)
 for t in ['ledger query includes semantic fingerprint in lookup uniqueness','canonicalizer/contract version','browser submits its own semantic fingerprint','hash collision']:
  if t not in idem:fail('fingerprint hardening missing '+t)
 o=ds['B5_OUTCOME_UNKNOWN_STATE_MACHINE.json']
 if ids(o['cases'])!={f'OUT-{x:02d}' for x in range(1,17)}:fail('outcome cases/status drift')
 if len(o['states'])!=13 or len(set(o['states']))!=13 or len(o['invariants'])!=8:fail('outcome states/invariants drift')
 if ids(o.get('transitions',[]))!={f'TRN-{x:02d}' for x in range(1,17)} or len(o.get('forbidden_transitions',[]))!=5:fail('outcome transition graph drift')
 outcome=json.dumps(o,ensure_ascii=False).lower()
 for t in ['failed_rollback_proved','outcome_unknown','process death does not prove','continued unknown; no replay','restore frontier','unknown/in-progress keys are never silently purged','current authorization']:
  if t not in outcome:fail('outcome safety missing '+t)
 for t in ['core_committed_effects_pending','expected-state/version','stale reconciler','atomic state/version cas','core commit alone is not final success']:
  if t not in outcome:fail('outcome transition safety missing '+t)
 x=ds['B5_CONCURRENCY_LOCK_FAULT_FIXTURES.json']
 if ids(x['cases'])!={f'CON-{z:02d}' for z in range(1,20)}:fail('concurrency cases/status drift')
 if len(x['verified_hotspot_examples'])!=5 or 'no current pilot/ui action binding' not in x['hotspot_boundary'].lower():fail('hotspot boundary drift')
 con=json.dumps(x,ensure_ascii=False).lower()
 for t in ['opposite order','blanket retry','external or deferred effect','caller transaction','outer transaction','xact_abort on','invented rowversion','count+1','client cancellation','only after authoritative commit']:
  if t not in con:fail('concurrency safety missing '+t)
 for t in ['required outbox/hook reservation','same mandatory effect twice','metadata revision changed','unobserved lock resource']:
  if t not in con:fail('concurrency completion safety missing '+t)
 r=ds['B5_LEDGER_RETENTION_RESTORE_GATE.json']
 if r.get('current_decision')!='BLOCKED_WINDOWS_AND_RESTORE_FRONTIER_UNKNOWN' or r.get('purge_or_dispatch_authorized') is not False:fail('retention/restore gate falsely enabled')
 if ids(r['requirements'])!={f'LRG-{z:02d}' for z in range(1,13)}:fail('retention requirement drift')
 if {z.get('state') for z in r['requirements']}!={'MISSING_NOT_PROVIDED'}:fail('retention evidence falsely promoted')
 if ids(r['cases'])!={f'LRC-{z:02d}' for z in range(1,11)}:fail('retention cases/status drift')
 machine=r.get('state_machine',{})
 if machine.get('initial')!='BLOCKED_WINDOWS_AND_RESTORE_FRONTIER_UNKNOWN' or machine.get('ready')!='READY_FOR_ISOLATED_RETENTION_RESTORE_REHEARSAL':fail('retention state drift')
 if machine.get('all_requirements_required') is not True or machine.get('automatic_transition')!='PROHIBITED':fail('retention admission weakened')
 retention=json.dumps(r,ensure_ascii=False).lower()
 for t in ['outcomeunknown/inprogress','never silently purged','safe tombstone','business/ledger/audit/outbox','restore frontier','dispatch disabled','current authorization','wall-clock','independent review']:
  if t not in retention:fail('retention/restore safety missing '+t)
 total=len(c['cases'])+len(a['required_sections'])+len(i['cases'])+len(o['cases'])+len(x['cases'])+len(r['cases'])
 if total!=87:fail('total drift')
 return {'status':'PASS_LOCAL_PREPARATION_ONLY','units':6,'cases_or_sections':87,'command_cases':16,'audit_sections':10,'completion_phases':5,'idempotency_cases':16,'outcome_cases':16,'outcome_transitions':16,'concurrency_cases':19,'retention_restore_cases':10,'retention_restore_requirements':12,'retention_restore_state':r['current_decision'],'database_runtime_tests':'NOT_RUN','github_mutations':'NONE'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True,type=Path);p.add_argument('--package',type=Path,default=Path(__file__).resolve().parent);a=p.parse_args();print(json.dumps(validate(a.repo.resolve(),a.package.resolve()),ensure_ascii=False))
