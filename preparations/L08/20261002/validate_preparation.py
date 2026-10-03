#!/usr/bin/env python3
"""Validate L08 pilot gate preparation; never certifies a product binding."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path
REF='f9197185b624a8c3f74c99e48a69550b5a7c2a73'
FILES={f'{x}_PILOT_EVIDENCE_GATE.json' for x in ['F5','F6','F7','F8','F9']}
HASHES={
'docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md':'d09bc5a78ea79dc613570e56e7b96100c98e58913b4a1cfaf32b8744ee7b0168',
'docs/architecture/PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md':'9d9b7157027cce55e3d24d7ade4e554e7205d34a9393bb67f21f60164190c1e0',
'docs/web/PHASE2_PILOT_FRONTEND_IMPLEMENTATION_PACK.md':'ca5fbb87a9a34262e41b8134693b2f7a69b186c30f6682691132091aaa70af35',
'docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md':'4a48658994a7a70ad809587c2100cb3f6340526e508805f4ebee11710574f4d6',
'inventories/traceability/FILTER_TRACEABILITY_SCOPE_AUDIT.md':'2405377c8f751cf92ff6c5aced05b3b3b5481c599fb76b689d53b3cce43191f1',
'inventories/traceability/FILTER_FAMILY_TRACEABILITY_REGISTER.json':'bf467cc1843939098319f57028ae60c5ed7243ff78ce9f0bafde8f8432ce36bf',
'docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md':'338ac433b907f42e720fe3564d3041fef2322036d7405bdf0c7e08942ce3bb13',
'docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md':'9cb84eb673b9d7a0a8cea3e70f2366350b8150f4a15ad42f614510f3113c1524'}
EXPECTED={
 'F5_PILOT_EVIDENCE_GATE.json':(32,'P1-SALES-REQUEST','P1-'),
 'F6_PILOT_EVIDENCE_GATE.json':(33,'P3-INTERNAL-TRANSFER','P3-'),
 'F7_PILOT_EVIDENCE_GATE.json':(34,'P4-PURCHASE-APPROVAL','P4-'),
 'F8_PILOT_EVIDENCE_GATE.json':(35,'P5-AP-ORDER','P5-'),
 'F9_PILOT_EVIDENCE_GATE.json':(42,'P2-INBOUND-REQUEST-WRITES','P2W-')}
CANDIDATES={
 'F5_PILOT_EVIDENCE_GATE.json':{'ERP-FRM-AR_InvoiceRequestFrm','DB-TABLE-dbo.AR_InvoiceRequestTbl','DB-TABLE-dbo.AR_InvoiceRequestDetailTbl'},
 'F6_PILOT_EVIDENCE_GATE.json':{'IV_StockTranferFrm candidate from historical guide','IV_IncomingShipmentStatusFrm optional companion, explicitly not this pilot'},
 'F7_PILOT_EVIDENCE_GATE.json':{'ERP-FRM-AP_ApprovePurchaseRequestListFrm','DB-TABLE-dbo.AP_PurchaseRequestTbl','DB-TABLE-dbo.AP_PurchaseRequestDetailTbl'},
 'F8_PILOT_EVIDENCE_GATE.json':{'ERP-FRM-AP_OrderFrm','DB-TABLE-dbo.AP_OrderTbl','DB-TABLE-dbo.AP_OrderDetailTbl'},
 'F9_PILOT_EVIDENCE_GATE.json':{'ERP-FRM-IV_InboundRequestFrm','DB-TABLE-dbo.IV_InboundRequestTbl','DB-TABLE-dbo.IV_InboundRequestDetailsTbl'}}
def fail(m):raise ValueError(m)
def validate(repo:Path,package:Path):
 if {x.name for x in package.glob('*.json')}!=FILES:fail('missing/extra pilot package')
 docs={n:json.loads((package/n).read_text()) for n in FILES}
 allids=[]
 for n,d in docs.items():
  issue,pilot,prefix=EXPECTED[n]
  if (d.get('schema_version'),d.get('lane'),d.get('artifact_status'),d.get('base_main'))!=(1,'L08','prepared_local_only',REF):fail(n+': common metadata drift')
  if d.get('primary_issues')!=[32,33,34,35,42] or d.get('issue')!=issue or d.get('graph_id')!=n[:2] or d.get('pilot_id')!=pilot:fail(n+': ownership drift')
  if set(d.get('observed_candidates',[]))!=CANDIDATES[n]:fail(n+': candidate evidence drift')
  if d.get('execution_status')!='NOT_RUN' or d.get('eligible_to_code') is not False:fail(n+': false execution/eligibility')
  lim=' '.join(d.get('limits',[])).lower()
  for t in ['no l08 dispatcher lease','no complete approved erp','no complete b2','no verified mutation signature','no product/api/browser/database execution','no github mutation','mock/test-double evidence cannot enable']:
   if t not in lim:fail(n+': safety boundary missing '+t)
  src=d.get('source_contracts',[])
  if {x.get('path') for x in src}!=set(HASHES):fail(n+': source membership drift')
  for x in src:
   if x.get('ref')!=REF or x.get('sha256')!=HASHES[x['path']]:fail(n+': source ref/hash drift')
   body=subprocess.check_output(['git','show',f'{REF}:{x["path"]}'],cwd=repo)
   if hashlib.sha256(body).hexdigest()!=x['sha256']:fail(n+': git object mismatch')
  if len(d.get('dependency_gates',[]))<7 or len(d.get('acceptance_before_binding',[]))!=7:fail(n+': gate count weakened')
  cases=d.get('cases',[]); got=[x.get('id') for x in cases]
  want=[f'{prefix}{i:02d}' for i in range(1,13)]
  if got!=want or len(got)!=len(set(got)):fail(n+': case membership/order drift')
  allids+=got
 blob=' '.join(json.dumps(x,ensure_ascii=False).lower() for x in docs.values())
 required=['caption equivalence','incoming/status companion is not p3','approve/reject/return','f4 read surface does not authorize f8 mutations','request entry never implies receipt','request entry never implies stock posting','outcomeunknown','mock/test-double evidence cannot enable real users']
 for t in required:
  if t not in blob:fail('cross-pilot boundary missing '+t)
 f5=json.dumps(docs['F5_PILOT_EVIDENCE_GATE.json'],ensure_ascii=False).lower()
 for t in ['yêu cầu xuất hóa đơn','master alias a','exact current caption/menu/variant']:
  if t not in f5:fail('F5 evidence gap missing '+t)
 f6=json.dumps(docs['F6_PILOT_EVIDENCE_GATE.json'],ensure_ascii=False).lower()
 for t in ['exact current form/menu/variant','do not infer binding','incoming shipment status']:
  if t not in f6:fail('F6 evidence gap missing '+t)
 f7=json.dumps(docs['F7_PILOT_EVIDENCE_GATE.json'],ensure_ascii=False).lower()
 for t in ['approve/reject/return','separation-of-duties','mandatory notification/audit']:
  if t not in f7:fail('F7 evidence gap missing '+t)
 f8=json.dumps(docs['F8_PILOT_EVIDENCE_GATE.json'],ensure_ascii=False).lower()
 for t in ['historical guide reports disabled menu','generic edit','count+1']:
  if t not in f8:fail('F8 evidence gap missing '+t)
 f9=json.dumps(docs['F9_PILOT_EVIDENCE_GATE.json'],ensure_ascii=False).lower()
 for t in ['complete actual action enumeration','never implies receipt','never implies stock posting','never implies approval/cancellation/deletion','filter alias a/b']:
  if t not in f9:fail('F9 evidence gap missing '+t)
 if len(allids)!=60 or len(set(allids))!=60:fail('cross-pilot case total/identity drift')
 return {'status':'PASS_LOCAL_PREPARATION_ONLY','units':5,'cases':60,'F5':12,'F6':12,'F7':12,'F8':12,'F9':12,'eligible_to_code':False,'product_tests':'NOT_RUN','github_mutations':'NONE'}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--repo',required=True,type=Path);a.add_argument('--package',type=Path,default=Path(__file__).resolve().parent);x=a.parse_args();print(json.dumps(validate(x.repo.resolve(),x.package.resolve()),ensure_ascii=False))
