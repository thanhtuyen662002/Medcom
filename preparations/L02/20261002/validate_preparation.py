#!/usr/bin/env python3
"""Validate L02 preparation metadata; never reports backend/product execution."""
import argparse, hashlib, json, pathlib, subprocess, sys
BASE='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
EXPECTED={'A1-bootstrap':('A1',12,5,[]),'A2-tenant':('A2',13,6,['A1']),'A3-session':('A3',14,7,['A1']),'A4-capability':('A4',15,7,['A1','A2','A3']),'A6-audit':('A6',17,6,['A1','A2','A4'])}
REQUIRED_SOURCES={'docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md','docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md','docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md','docs/architecture/PHASE2_AUDIT_TRACE_CONTRACT.md','docs/architecture/WEB_PLATFORM_SHARED_SERVICES.md','docs/web/UX_RUNTIME_FEEDBACK_SESSION.md','docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md'}
def fail(m): raise AssertionError(m)
def git_hash(repo,ref,path): return hashlib.sha256(subprocess.check_output(['git','show',f'{ref}:{path}'],cwd=repo)).hexdigest()
def validate(repo:pathlib.Path, package:pathlib.Path):
 actual={p.stem for p in package.glob('*.json')}
 if actual!=set(EXPECTED): fail(f'fixture set mismatch: {sorted(actual)}')
 all_ids=[]
 for name,(graph,issue,count,deps) in EXPECTED.items():
  x=json.loads((package/(name+'.json')).read_text())
  if (x.get('schema_version'),x.get('graph_id'),x.get('issue'),x.get('primary_owner'),x.get('artifact_status'),x.get('base_main'))!=(1,graph,issue,'L02','prepared_local_only',BASE): fail(f'{name}: identity/status')
  if x.get('foundation_dependencies')!=deps or not x.get('current_preparation_limits') or not x.get('limitations'): fail(f'{name}: dependencies/limits')
  if 'exact git object bytes' not in x.get('source_provenance_rule',''): fail(f'{name}: provenance rule')
  refs=x.get('source_contracts',[])
  if {z['path'] for z in refs}!=REQUIRED_SOURCES or len(refs)!=len(REQUIRED_SOURCES): fail(f'{name}: source set')
  for z in refs:
   if z.get('source_ref')!=BASE or z.get('snapshot_status')!='merged_main': fail(f'{name}: source ref/status')
   if z.get('url')!=f'https://github.com/thanhtuyen662002/Medcom/blob/{BASE}/{z["path"]}': fail(f'{name}: citation URL')
   if z.get('sha256')!=git_hash(repo,BASE,z['path']): fail(f'{name}: exact git object hash {z["path"]}')
  cases=x.get('cases',[])
  if len(cases)!=count: fail(f'{name}: case count')
  ids=[c.get('id') for c in cases]
  if len(ids)!=len(set(ids)) or any(not i.startswith(graph+'-') for i in ids): fail(f'{name}: case IDs')
  for c in cases:
   if c.get('execution_status')!='not_run_against_product' or not c.get('synthetic_scenario') or not c.get('expected_assertions') or not c.get('defect_detected'): fail(f'{name}:{c.get("id")}: incomplete/false status')
  all_ids+=ids
 if len(all_ids)!=len(set(all_ids)): fail('cross-package duplicate IDs')
 a1=json.loads((package/'A1-bootstrap.json').read_text()); assert any(c['id']=='A1-05' and 'git show' in ' '.join(c['expected_assertions']) for c in a1['cases'])
 a2=json.loads((package/'A2-tenant.json').read_text()); assert any(c['id']=='A2-06' and 'mapping generation' in c['synthetic_scenario'] for c in a2['cases'])
 a3=json.loads((package/'A3-session.json').read_text()); assert any(c['id']=='A3-07' and 'CSRF' in c['synthetic_scenario'] and 'before handler dispatch' in ' '.join(c['expected_assertions']) for c in a3['cases'])
 a4=json.loads((package/'A4-capability.json').read_text()); assert any(c['id']=='A4-01' and 'authoritative server grants' in ' '.join(c['expected_assertions']) for c in a4['cases']); assert any(c['id']=='A4-07' and 'timing residual' in ' '.join(c['expected_assertions']) for c in a4['cases'])
 a6=json.loads((package/'A6-audit.json').read_text()); assert any(c['id']=='A6-06' and 'log injection' in c['defect_detected'] for c in a6['cases'])
 print(json.dumps({'prepared_packages':5,'synthetic_scenarios':len(all_ids),'exact_git_object_source_hashes':'PASS','product_tests':'NOT_RUN'}))
if __name__=='__main__':
 p=argparse.ArgumentParser(); p.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[3]); p.add_argument('--package',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent); a=p.parse_args()
 try: validate(a.repo.resolve(),a.package.resolve())
 except Exception as e: print(f'FAIL: {e}',file=sys.stderr); sys.exit(1)
