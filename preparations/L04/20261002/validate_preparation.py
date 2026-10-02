#!/usr/bin/env python3
"""Validate L04 preparation metadata; it never certifies legacy runtime behavior."""
from __future__ import annotations
import argparse, hashlib, json, subprocess
from pathlib import Path

EXPECTED_FILES={
 'T1_PROVENANCE_REGISTER.json','T1_CONTROLLED_RUNTIME_PROTOCOL.json',
 'T1_SESSION_ISOLATION_MATRIX.json','B4_EFFECTIVE_SCOPE_MATRIX.json',
 'T1_ADAPTER_DECISION_GATE.json','T1_STARTUP_DDL_LAUNCH_GATE.json'}
REF='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
EXPECTED_SOURCES={
'docs/erp/TOOL_DLL_METADATA_EVIDENCE.md':'44da37f9d98fece9eae643b8b4c759d2dd40d20a807a37b89ea81c3d721324be',
'docs/architecture/PHASE2_TOOL_DLL_BRIDGE_CONTRACT.md':'b4c15731c6be8874f359150052015094f0e980e92059e1c07f7c41dba70c3cfd',
'docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md':'fa8db170726d9afe02fd5b2e578e00226978f78757c4fbfcde3fa9328d18eb47',
'docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md':'4a48658994a7a70ad809587c2100cb3f6340526e508805f4ebee11710574f4d6',
'docs/erp/EXECUTABLE_METADATA_EVIDENCE.md':'19730c6d5d4e916183cd7b79678227d47047ddc078951ae9355bf4d9bf6e4542',
'docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md':'c0b3703e66de2db886d6f0155c26ce54d16d269f79af7addf399c3c730bd7c84',
'docs/reviews/PHASE2_USER_OPERATIONS_ATTACK_REVIEW.md':'868d941461b99c0d7bd054661312beb83b60d1d55e05548855ce240064af9b2b',
'docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md':'d09bc5a78ea79dc613570e56e7b96100c98e58913b4a1cfaf32b8744ee7b0168',
'docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md':'338ac433b907f42e720fe3564d3041fef2322036d7405bdf0c7e08942ce3bb13'}

def fail(msg): raise ValueError(msg)
def load(package,name): return json.loads((package/name).read_text())
def ids(rows):
 vals=[x['id'] for x in rows]
 if len(vals)!=len(set(vals)): fail('duplicate IDs')
 return set(vals)
def assert_common(data,name):
 if data.get('schema_version')!=1 or data.get('lane')!='L04': fail(f'{name}: schema/lane drift')
 if data.get('artifact_status')!='prepared_local_only': fail(f'{name}: false durable status')
 if data.get('base_main')!=REF or data.get('primary_issues')!=[19,23]: fail(f'{name}: base/ownership drift')
 if data.get('execution_status')!='NOT_RUN': fail(f'{name}: false execution status')
 limits=' '.join(data.get('common_limits',[])).lower()
 for token in ['no l04 writer lease','no raw approved erp','no tool/tools binary executed','no legacy database','no github mutation','runtime and effective-scope outcomes remain unobserved']:
  if token not in limits: fail(f'{name}: missing safety boundary {token}')
 src=data.get('source_contracts',[])
 if {x.get('path') for x in src}!=set(EXPECTED_SOURCES): fail(f'{name}: source membership drift')
 for x in src:
  if x.get('ref')!=REF or x.get('sha256')!=EXPECTED_SOURCES[x['path']]: fail(f'{name}: source ref/hash drift')
  b=subprocess.check_output(['git','show',f'{REF}:{x["path"]}'],cwd=REPO)
  if hashlib.sha256(b).hexdigest()!=x['sha256']: fail(f'{name}: live git object mismatch')

def validate(repo:Path,package:Path):
 global REPO;REPO=repo
 actual={p.name for p in package.glob('*.json')}
 if actual!=EXPECTED_FILES: fail('missing/extra package file')
 data={n:load(package,n) for n in EXPECTED_FILES}
 for n,d in data.items(): assert_common(d,n)
 p=data['T1_PROVENANCE_REGISTER.json'];rid=ids(p['records'])
 if rid!={'BIN-IDENTITY','BIN-TARGET','BIN-API','BIN-NEGATIVE-NAME-SEARCH','GUIDE-SOURCE-PROJECT','SOURCE-BINARY-LINK','CURRENT-DEPLOYMENT'}: fail('provenance record drift')
 levels={x['id']:x['underlying_level'] for x in p['records']}
 if levels['GUIDE-SOURCE-PROJECT']!='INFERRED_LEGACY_IMPLEMENTATION' or levels['SOURCE-BINARY-LINK']!='UNKNOWN' or levels['CURRENT-DEPLOYMENT']!='UNKNOWN': fail('evidence promotion')
 ident=p.get('immutable_binary_identity',{})
 if ident!={'sha256':'AA8910F3BA244FC405CCAD2D322D142D40F938BE3DA94277CCD8D0814082DD61','length_bytes':8258049,'assembly_name':'Tools','assembly_version':'7.9.9767.36959','public_key_token':'none','target_framework':'.NETFramework,Version=v4.6.2','pe_machine':'I386','clr_flags':['ILOnly'],'metadata_version':'v4.0.30319'}: fail('binary identity drift')
 chain=p.get('source_build_runtime_chain',{})
 if set(chain)!={'source_archive','source_project','reproducible_build','binary_match','current_deployment'} or set(chain.values())!={'UNKNOWN'}: fail('source/build/runtime chain promoted or incomplete')
 rules=' '.join(p['fail_closed_rules']).lower()
 for token in ['two verified binaries','verifyuserpass as login','x86-only','guide source paths','mismatch stops']:
  if token not in rules: fail('missing provenance fail-closed rule')
 r=data['T1_CONTROLLED_RUNTIME_PROTOCOL.json'];
 if ids(r['preconditions'])!={'ENV-01','SRC-01','DB-01','DEP-01','DDL-01'}: fail('runtime precondition drift')
 if ids(r['ordered_checks'])!={f'RUN-{i:02d}' for i in range(1,8)}: fail('runtime sequence drift')
 protocol=json.dumps(r,ensure_ascii=False).lower()
 for token in ['disposable nonproduction','startup/initialization','same-user, two-user same-company','outcomeunknown','production/shared customer database']:
  if token not in protocol: fail(f'missing runtime safety {token}')
 for token in ['target fingerprint','network egress','schema fingerprint','kill switch']:
  if token not in protocol: fail(f'missing runtime containment {token}')
 s=data['T1_SESSION_ISOLATION_MATRIX.json'];
 if ids(s['cases'])!={f'SES-{i:02d}' for i in range(1,17)}: fail('session case/status drift')
 if 'one serialized dedicated worker process context per authenticated erp session' not in s.get('default_until_proved','').lower(): fail('unsafe shared worker default')
 session=json.dumps(s,ensure_ascii=False).lower()
 for token in ['child process','environment/config','temporary file','credential buffers']:
  if token not in session: fail(f'missing state-bleed adversary {token}')
 b=data['B4_EFFECTIVE_SCOPE_MATRIX.json'];
 if ids(b['cases'])!={f'SCP-{i:02d}' for i in range(1,17)}: fail('scope case/status drift')
 if len(b.get('facts_still_unknown',[]))<5: fail('scope unknowns dropped')
 scope=json.dumps(b,ensure_ascii=False).lower()
 for token in ['menu visibility alone','visible navigation never grants','client_company','client_branch','lookup_value','stale allow','same_company_users']:
  if token not in scope: fail(f'missing effective-scope adversary {token}')
 for token in ['timing/size','cache key','download token','queued work']:
  if token not in scope: fail(f'missing scope side-channel/freshness adversary {token}')
 a=data['T1_ADAPTER_DECISION_GATE.json'];opts={x['option'] for x in a['options']}
 if opts!={'DIRECT_LOAD_IN_DEDICATED_COMPATIBILITY_WORKER','PRIVATE_DOTNET_FRAMEWORK_BRIDGE','UNSUPPORTED_FAIL_CLOSED'}: fail('adapter option drift')
 if a.get('current_decision')!='PRIVATE_DOTNET_FRAMEWORK_BRIDGE_IS_CONSERVATIVE_DESIGN_DEFAULT_ONLY; final host decision remains BLOCKED/UNKNOWN': fail('false host decision')
 machine=a.get('decision_state_machine',{})
 if machine.get('initial')!='BLOCKED_UNKNOWN' or set(machine.get('terminal',[]))!={'DIRECT_LOAD_APPROVED','PRIVATE_BRIDGE_APPROVED','UNSUPPORTED_FAIL_CLOSED'}: fail('adapter decision state drift')
 if 'automatic_fallback' not in machine or machine['automatic_fallback']!='PROHIBITED': fail('adapter fallback weakened')
 acceptance=' '.join(a.get('acceptance_before_binding',[])).lower()
 for token in ['controlled protocol','source/build/dependency','session isolation','startup ddl','security/redaction/capacity','required ci']:
  if token not in acceptance: fail(f'missing binding acceptance {token}')
 g=data['T1_STARTUP_DDL_LAUNCH_GATE.json']
 if g.get('gate_state')!='BLOCKED_NOT_RUN' or g.get('launch_authorized') is not False: fail('startup launch gate promoted')
 if ids(g['requirements'])!={f'DDLG-{i:02d}' for i in range(1,13)}: fail('startup launch requirement drift')
 if {x.get('state') for x in g['requirements']}!={'MISSING_NOT_PROVIDED'}: fail('startup launch evidence falsely promoted')
 machine=g.get('state_machine',{})
 if machine.get('initial')!='BLOCKED_NOT_RUN' or machine.get('ready')!='READY_FOR_CONTROLLED_NONPRODUCTION_LAUNCH': fail('startup launch state drift')
 if machine.get('all_requirements_required') is not True or machine.get('automatic_transition')!='PROHIBITED': fail('startup launch admission weakened')
 launch=json.dumps(g,ensure_ascii=False).lower()
 for token in ['production=false','deny by default','pre-run schema fingerprint','kill switch','before credentials','unexpected ddl','destroy and rebuild','no rollback claim','statement hash','independent review']:
  if token not in launch: fail(f'missing startup containment {token}')
 if set(g.get('allowed_outcomes',[]))!={'BLOCKED_NOT_RUN','PASS_CONTROLLED_LAUNCH','FAIL_STOPPED_AND_QUARANTINED','INCOMPLETE_ENVIRONMENT_LOST'}: fail('startup outcome drift')
 return {'status':'PASS_LOCAL_PREPARATION_ONLY','units':6,'provenance_records':len(p['records']),'runtime_preconditions':len(r['preconditions']),'runtime_checks':len(r['ordered_checks']),'session_cases':len(s['cases']),'scope_cases':len(b['cases']),'startup_launch_requirements':len(g['requirements']),'startup_launch_state':g['gate_state'],'legacy_runtime_executed':False,'github_mutation':False}

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True,type=Path);ap.add_argument('--package',type=Path,default=Path(__file__).resolve().parent);args=ap.parse_args();print(json.dumps(validate(args.repo.resolve(),args.package.resolve()),ensure_ascii=False))
