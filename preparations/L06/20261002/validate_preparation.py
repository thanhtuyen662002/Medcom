#!/usr/bin/env python3
"""Validate L06 contract preparation; never reports browser/product tests as executed."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path
REF='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
FILES={'F1_AUTHORIZED_SHELL_MOBILE_FIXTURES.json','F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json','F2_QUERY_RACE_FRESHNESS_FIXTURES.json','F3_FORM_SESSION_RECOVERY_FIXTURES.json','F3_DRAFT_STORAGE_GATE.json','F4_READ_ONLY_PILOT_SURFACE_FIXTURES.json'}
HASHES={'docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md':'b59d80f754cd3108c415a458f83c19dc7c7c197998e23fa12f258adaeafb3418','docs/web/PRODUCT_UX_FOUNDATION.md':'8299a090625de634f1aadc4b8bd5cb17aef628489d5cca31bdfc755d904bc520','docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md':'5e031383a484408298ea8ee819694499e7d00af621ccd1d793e1c26b1023ea8e','docs/web/CONFIGURATION_LOOKUP_UX.md':'757435de098e0f72e1235b1fa6f672c2e4d526e3914ed29b6ca0a6ad51b4793d','docs/web/UX_RUNTIME_FEEDBACK_SESSION.md':'a397a8df0049481cc91df81cfd664deb42e99baa3e060cc534d396c8a4e277a0','docs/web/PHASE2_FRONTEND_ACCEPTANCE.md':'668c3f410cbc5793aa3be1f032130a31d07bbf075c9153a778af5e3ac2d4422a','docs/web/UX_STRESS_ACCEPTANCE.md':'56a9163d45ad3c6787ca280db17c0ce69f6f31a5525ba1c94ac943d114649e03','docs/architecture/PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md':'9d9b7157027cce55e3d24d7ade4e554e7205d34a9393bb67f21f60164190c1e0','docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md':'fa8db170726d9afe02fd5b2e578e00226978f78757c4fbfcde3fa9328d18eb47','docs/architecture/PHASE2_SCREEN_DEFINITION_CONTRACT.md':'aeb14d0db338c24d98dce32f1eb986ff6e771abd5c799a151a8536c9dbba2316','docs/reviews/PHASE2_USER_OPERATIONS_ATTACK_REVIEW.md':'868d941461b99c0d7bd054661312beb83b60d1d55e05548855ce240064af9b2b','docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md':'c0b3703e66de2db886d6f0155c26ce54d16d269f79af7addf399c3c730bd7c84','docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md':'d09bc5a78ea79dc613570e56e7b96100c98e58913b4a1cfaf32b8744ee7b0168'}
def fail(m):raise ValueError(m)
def ids(rows):
 v=[x['id'] for x in rows]
 if len(v)!=len(set(v)):fail('duplicate case ID')
 return set(v)
def validate(repo:Path,package:Path):
 actual={p.name for p in package.glob('*.json')}
 if actual!=FILES:fail('missing/extra package')
 ds={n:json.loads((package/n).read_text()) for n in FILES}
 for n,d in ds.items():
  if (d.get('schema_version'),d.get('lane'),d.get('artifact_status'),d.get('base_main'),d.get('primary_issues'))!=(1,'L06','prepared_local_only',REF,[28,29,30,31]):fail(n+': metadata drift')
  if d.get('execution_status')!='NOT_RUN':fail(n+': false execution status')
  lim=' '.join(d.get('limits',[])).lower()
  for t in ['no l06 dispatcher lease','no frontend application tree','no completed backend/query/capability dependencies','no product browser','no github mutation','cannot enable real users']:
   if t not in lim:fail(n+': missing boundary '+t)
  src=d.get('source_contracts',[])
  if {x.get('path') for x in src}!=set(HASHES):fail(n+': source membership drift')
  for x in src:
   if x.get('ref')!=REF or x.get('sha256')!=HASHES[x['path']]:fail(n+': ref/hash drift')
   b=subprocess.check_output(['git','show',f'{REF}:{x["path"]}'],cwd=repo)
   if hashlib.sha256(b).hexdigest()!=x['sha256']:fail(n+': live object hash mismatch')
 s=ds['F1_AUTHORIZED_SHELL_MOBILE_FIXTURES.json']
 if ids(s['cases'])!={f'SHL-{i:02d}' for i in range(1,17)}:fail('shell cases/status drift')
 shell=json.dumps(s,ensure_ascii=False).lower()
 for t in ['direct route/api denied','quick-nav cannot create capability','company switch','back-forward cache','390px','keyboard-only']:
  if t not in shell:fail('shell coverage missing '+t)
 for t in ['no flash of protected content','same-origin allow-listed','cross-tab generation','focus returns']:
  if t not in shell:fail('shell hardening missing '+t)
 g=ds['F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json']
 if ids(g['cases'])!={f'GRD-{i:02d}' for i in range(1,20)}:fail('grid cases/status drift')
 if g.get('dataset_contract')!={'minimum_cardinality_exclusive':100000,'fixture_rows':100001,'potential_columns':120,'synthetic_only':True,'stable_row_ids':'required','server_windowing':'required','browser_full_materialization':'prohibited'}:fail('grid stress contract drift')
 if g.get('performance_budget')!={'local_interaction_p95_ms_max':100,'normal_indexed_filter_sort_p95_ms_max':1000,'first_useful_grid_p75_ms_max':1500,'first_useful_grid_p95_ms_max':2500,'progress_after_ms':300,'slow_network_fixture_ms':10000}:fail('grid performance budget drift')
 grid=json.dumps(g,ensure_ascii=False).lower()
 for t in ['bounded dom','stable tie-breaker','logical row identity','shift range','home/end/pageup/pagedown','domain approve action','existence leak','390px','p95 <=100 ms','n+1','detail a beneath selected master b','recycled dom index']:
  if t not in grid:fail('grid coverage missing '+t)
 q=ds['F2_QUERY_RACE_FRESHNESS_FIXTURES.json']
 if ids(q['cases'])!={f'QRY-{i:02d}' for i in range(1,15)}:fail('query cases/status drift')
 query=json.dumps(q,ensure_ascii=False).lower()
 for t in ['reverse order','company or role generation','data age','event is a hint','transport alone','legacy fieldid','outcomeunknown']:
  if t not in query:fail('query coverage missing '+t)
 for t in ['10-second latency','cross-scope reuse','cursor/page token','not-modified']:
  if t not in query:fail('query hardening missing '+t)
 f=ds['F3_FORM_SESSION_RECOVERY_FIXTURES.json']
 if ids(f['cases'])!={f'FRM-{i:02d}' for i in range(1,19)}:fail('form cases/status drift')
 form=json.dumps(f,ensure_ascii=False).lower()
 for t in ['hidden tabs','dirty form','last-write-wins','outcomeunknown','superseded result','server expiry','passive traffic','correlation','offline']:
  if t not in form:fail('form coverage missing '+t)
 for t in ['double click/enter','draft recovery key','impossible form','open redirect']:
  if t not in form:fail('form hardening missing '+t)
 r=ds['F4_READ_ONLY_PILOT_SURFACE_FIXTURES.json']
 if ids(r['surfaces'])!={'READ-AP-ORDER','READ-IV-INBOUND'} or ids(r['cases'])!={f'RDO-{i:02d}' for i in range(1,17)}:fail('read surface cases/status drift')
 for surface in r['surfaces']:
  forbidden=' '.join(surface['forbidden_ui']).lower();allowed=' '.join(surface['allowed_ui']).lower()
  if 'create' not in forbidden or 'hidden mutation' not in forbidden:fail('mutation boundary weakened')
  if any(x in allowed for x in ['create','edit','save','submit','approve','delete','cancel']):fail('mutation leaked into allowed UI')
  if len(surface['required_before_binding'])<6:fail('binding gates weakened')
 read=json.dumps(r,ensure_ascii=False).lower()
 for t in ['historically disabled','field/join contract missing','f9 owns','does not imply receipt','mock data']:
  if t not in read:fail('read-only gate missing '+t)
 for t in ['independently authorized typed export','before aggregation','post/put/patch/delete','component-test harness']:
  if t not in read:fail('read-only hardening missing '+t)
 d=ds['F3_DRAFT_STORAGE_GATE.json']
 if d.get('current_decision')!='NO_PERSISTENT_SENSITIVE_DRAFT_BY_DEFAULT' or d.get('persistent_storage_authorized') is not False:fail('draft storage falsely enabled')
 if ids(d['requirements'])!={f'DFT-{i:02d}' for i in range(1,13)}:fail('draft requirement drift')
 if {x.get('state') for x in d['requirements']}!={'MISSING_NOT_PROVIDED'}:fail('draft evidence falsely promoted')
 if ids(d['cases'])!={f'DFR-{i:02d}' for i in range(1,11)}:fail('draft case drift')
 machine=d.get('state_machine',{})
 if machine.get('initial')!='NO_PERSISTENT_SENSITIVE_DRAFT_BY_DEFAULT' or machine.get('ready')!='READY_FOR_BOUNDED_SYNTHETIC_DRAFT_TEST':fail('draft gate state drift')
 if machine.get('all_requirements_required') is not True or machine.get('automatic_transition')!='PROHIBITED':fail('draft gate weakened')
 draft=json.dumps(d,ensure_ascii=False).lower()
 for t in ['tenant/company/principal','field allow-list','no secret','logout','account switch','role revoke','schema version','ttl','quota','reauthorize','never auto-replay']:
  if t not in draft:fail('draft safety missing '+t)
 total=sum(len(ds[n]['cases']) for n in FILES)
 if total!=93:fail('case total drift')
 return {'status':'PASS_LOCAL_PREPARATION_ONLY','units':6,'cases':93,'shell':16,'grid':19,'query':14,'form':18,'draft_storage':10,'draft_requirements':12,'read_surface':16,'draft_state':d['current_decision'],'product_tests':'NOT_RUN','github_mutations':'NONE'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True,type=Path);p.add_argument('--package',type=Path,default=Path(__file__).resolve().parent);a=p.parse_args();print(json.dumps(validate(a.repo.resolve(),a.package.resolve()),ensure_ascii=False))
