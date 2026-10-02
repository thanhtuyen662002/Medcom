#!/usr/bin/env python3
"""Validate L05 preparation metadata only; no compiler/runtime behavior is certified."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path
REF='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
FILES={'A5_SY_REUSE_GAP_MATRIX.json','A7_SCREEN_DEFINITION_FIXTURES.json','R3_DAT_SOURCE_PRECEDENCE_REGISTER.json','A7_COMPILER_ADVERSARIAL_FIXTURES.json','A7_SYNC_ROLLBACK_STATE_MACHINE.json','R3_LEGACY_WRITEBACK_GATE.json','R3_DAT_EXECUTION_ADMISSION_GATE.json'}
HASHES={'docs/db/CONFIGURATION_OBJECT_CATALOG.md':'a8cb863be9b001a9e81fe3f91b17b7370096accb66153cdcc1a744ad37fe8245','docs/architecture/PHASE2_SCREEN_DEFINITION_CONTRACT.md':'aeb14d0db338c24d98dce32f1eb986ff6e771abd5c799a151a8536c9dbba2316','docs/erp/DAT_LAYOUT_CORROBORATION.md':'c2dc4ea6cc61b46edb12b7ebf0f1edfdbb6975f7d9df29f4f0448deadcdccedf','docs/erp/FILTER_CONFIGURATION_EVIDENCE.md':'87a9165f370e30294d69a409e81c918f1f2425c2eeeb86d534d68d79762a14ad','docs/erp/TEMPLATES_PERSONALIZATION_UPDATE_EVIDENCE.md':'ef8ec347a29a39e5b112225c923f9ec751a3d4e9ca097ba6abbe3b889ebff25f','docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md':'4a48658994a7a70ad809587c2100cb3f6340526e508805f4ebee11710574f4d6','inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json':'c41eb90ae522a45819f810f3ac69e2cf902f5d47f295163de5056dcfcb4fe50c','docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md':'c0b3703e66de2db886d6f0155c26ce54d16d269f79af7addf399c3c730bd7c84','docs/reviews/PHASE2_USER_OPERATIONS_ATTACK_REVIEW.md':'868d941461b99c0d7bd054661312beb83b60d1d55e05548855ce240064af9b2b','docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md':'d09bc5a78ea79dc613570e56e7b96100c98e58913b4a1cfaf32b8744ee7b0168'}
def fail(s):raise ValueError(s)
def unique(rows):
 v=[x['id'] for x in rows]
 if len(v)!=len(set(v)):fail('duplicate IDs')
 return set(v)
def validate(repo:Path,package:Path):
 actual={p.name for p in package.glob('*.json')}
 if actual!=FILES:fail('missing or extra unit JSON')
 ds={n:json.loads((package/n).read_text()) for n in FILES}
 for n,d in ds.items():
  if (d.get('schema_version'),d.get('lane'),d.get('artifact_status'),d.get('base_main'),d.get('primary_issues'))!=(1,'L05','prepared_local_only',REF,[16,18,26]):fail(n+': common metadata drift')
  if d.get('execution_status')!='NOT_RUN':fail(n+': false execution status')
  limits=' '.join(d.get('limits',[])).lower()
  for t in ['no l05 dispatcher lease','no approved raw dat','no sy_* rows','no legacy database','no product/compiler runtime','no github mutation']:
   if t not in limits:fail(n+': lost boundary '+t)
  src=d.get('source_contracts',[])
  if n=='R3_DAT_EXECUTION_ADMISSION_GATE.json':
   if d.get('source_contract_ref')!='R3_DAT_SOURCE_PRECEDENCE_REGISTER.json#source_contracts':fail(n+': source contract reference drift')
   src=ds['R3_DAT_SOURCE_PRECEDENCE_REGISTER.json'].get('source_contracts',[])
  if {x.get('path') for x in src}!=set(HASHES):fail(n+': source membership drift')
  for x in src:
   if x.get('ref')!=REF or x.get('sha256')!=HASHES[x['path']]:fail(n+': source ref/hash drift')
   b=subprocess.check_output(['git','show',f'{REF}:{x["path"]}'],cwd=repo)
   if hashlib.sha256(b).hexdigest()!=x['sha256']:fail(n+': git object hash mismatch')
 a=ds['A5_SY_REUSE_GAP_MATRIX.json']
 if len(a['verified_object_presence'])!=13 or len(set(a['verified_object_presence']))!=13:fail('SY object count/uniqueness drift')
 if unique(a['capabilities'])!={'CAP-MENU','CAP-CONTROL','CAP-LOOKUP','CAP-FILTER','CAP-ACTION','CAP-SCOPE','CAP-SCREEN-VERSION','CAP-SYNC','CAP-OVERRIDE','CAP-IDEMPOTENCY-AUDIT-OUTBOX'}:fail('capability matrix drift')
 for cid in ['CAP-SCREEN-VERSION','CAP-SYNC','CAP-OVERRIDE']:
  row=next(x for x in a['capabilities'] if x['id']==cid)
  if 'ADDITIVE_GAP_UNPROVED' not in row['disposition']:fail('unproved gap promoted')
 if len(a.get('physical_change_gate',[]))!=6:fail('physical change gate weakened')
 if unique(a.get('reconciliation_acceptance',[]))!={f'REC-{i:02d}' for i in range(1,7)}:fail('SY reconciliation acceptance drift')
 if 'canonical owner' not in json.dumps(a['reconciliation_acceptance']).lower():fail('cross-owner storage duplication guard missing')
 d=ds['A7_SCREEN_DEFINITION_FIXTURES.json']
 if unique(d['fixtures'])!={f'DEF-{i:02d}' for i in range(1,15)}:fail('definition fixture/status drift')
 if len(d['normalized_shape']['prohibited_browser_fields'])<5:fail('browser prohibition weakened')
 definition=json.dumps(d,ensure_ascii=False).lower()
 for t in ['canonical_content_hash','publisher_epoch','null/empty/default','unicode normalization','source-set manifest','capability/action identifier']:
  if t not in definition:fail('definition coverage missing '+t)
 r=ds['R3_DAT_SOURCE_PRECEDENCE_REGISTER.json']
 if unique(r['sources'])!={'SRC-DAT-ROOT','SRC-DAT-FILTER','SRC-DB-SY','SRC-GUIDE-SY_FRMCFG','SRC-USER-PACKAGE','SRC-ADMIN-WEB'}:fail('source register drift')
 if not r['legacy_precedence'].startswith('UNKNOWN;'):fail('legacy precedence falsely decided')
 if len(r.get('fail_closed_selection',[]))!=6:fail('source selection guard weakened')
 if len(r.get('source_identity_fields',[]))!=11:fail('source identity shape drift')
 if unique(r.get('precedence_conflict_cases',[]))!={f'PRE-{i:02d}' for i in range(1,7)}:fail('precedence conflict coverage drift')
 c=ds['A7_COMPILER_ADVERSARIAL_FIXTURES.json']
 if unique(c['cases'])!={f'CMP-{i:02d}' for i in range(1,21)}:fail('compiler cases/status drift')
 compiler=json.dumps(c,ensure_ascii=False).lower()
 for t in ['trailing empty','unknown extra trailing','subvalue','adt-1/adt-2','ta..tj','duplicate configuration','controltype 30','ebs/ess/ess2','filter alias','previous-good']:
  if t not in compiler:fail('compiler coverage missing '+t)
 for t in ['external entity','resource amplification','path traversal','unicode-confusable','future hook key']:
  if t not in compiler:fail('compiler security coverage missing '+t)
 if len(c.get('resource_limits_required',[]))!=6:fail('compiler resource limits weakened')
 s=ds['A7_SYNC_ROLLBACK_STATE_MACHINE.json']
 if unique(s['cases'])!={f'SYN-{i:02d}' for i in range(1,17)}:fail('sync cases/status drift')
 if len(s['states'])!=13 or len(set(s['states']))!=13 or len(s['invariants'])!=9:fail('state/invariant drift')
 sync=json.dumps(s,ensure_ascii=False).lower()
 for t in ['hash reconciliation','transactional cas','post-commit invalidation','forever1day','rollback conflicts','business data is never reversed']:
  if t not in sync:fail('sync safety missing '+t)
 for t in ['publisher epoch','manifest snapshot equality','loses acknowledgement','clock moves backward']:
  if t not in sync:fail('sync fencing coverage missing '+t)
 w=ds['R3_LEGACY_WRITEBACK_GATE.json']
 if w.get('current_decision')!='DISABLED_BLOCKED_UNKNOWN' or w.get('writeback_authorized') is not False:fail('legacy writeback falsely enabled')
 if unique(w['requirements'])!={f'WRB-{i:02d}' for i in range(1,13)}:fail('writeback requirement drift')
 if {x.get('state') for x in w['requirements']}!={'MISSING_NOT_PROVIDED'}:fail('writeback evidence falsely promoted')
 if unique(w['adversarial_cases'])!={f'WBA-{i:02d}' for i in range(1,11)}:fail('writeback adversarial coverage drift')
 machine=w.get('state_machine',{})
 if machine.get('initial')!='DISABLED_BLOCKED_UNKNOWN' or machine.get('ready')!='READY_FOR_DISPOSABLE_WRITEBACK_TEST':fail('writeback state drift')
 if machine.get('all_requirements_required') is not True or machine.get('automatic_transition')!='PROHIBITED':fail('writeback admission weakened')
 writeback=json.dumps(w,ensure_ascii=False).lower()
 for t in ['delete all rows for an fid','no production','unknown trailing','expected-state','lost acknowledgement','cache convergence','independent review','business data']:
  if t not in writeback:fail('writeback safety missing '+t)
 e=ds['R3_DAT_EXECUTION_ADMISSION_GATE.json']
 if e.get('current_decision')!='BLOCKED_NO_EXECUTABLE_DAT_ADMISSION' or e.get('execution_authorized') is not False:fail('DAT execution falsely enabled')
 if unique(e['requirements'])!={f'EXE-{i:02d}' for i in range(1,13)}:fail('DAT execution requirements drift')
 if {x.get('state') for x in e['requirements']}!={'MISSING_NOT_PROVIDED'}:fail('DAT execution evidence falsely promoted')
 if unique(e['adversarial_cases'])!={f'XAD-{i:02d}' for i in range(1,11)}:fail('DAT execution adversarial coverage drift')
 execution=json.dumps(e,ensure_ascii=False).lower()
 for t in ['complete qualified source-set manifest','compiler binary/source/dependency identity','unknown execution surfaces are denied','previous-good remains active','expected-current cas','no automatic replay','configuration is not permission']:
  if t not in execution:fail('DAT execution safety missing '+t)
 return {'status':'PASS_LOCAL_PREPARATION_ONLY','units':7,'sy_objects':13,'capability_rows':10,'reconciliation_checks':6,'definition_cases':14,'source_classes':6,'precedence_conflicts':6,'compiler_cases':20,'sync_cases':16,'writeback_requirements':12,'writeback_adversarial_cases':10,'dat_execution_requirements':12,'dat_execution_adversarial_cases':10,'dat_execution_state':e['current_decision'],'writeback_state':w['current_decision'],'product_tests':'NOT_RUN','github_mutations':'NONE'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True,type=Path);p.add_argument('--package',type=Path,default=Path(__file__).resolve().parent);a=p.parse_args();print(json.dumps(validate(a.repo.resolve(),a.package.resolve()),ensure_ascii=False))
