import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Explicit Node24, existing browser/toolchain; no installation, camera, SQL or
// production transport. This file runs directly without shared runner changes.
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Node 24 required; this test does not install or replace the toolchain.');
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..').replaceAll('\\','/');
const output=path.join(app,'.test-runtime','i18-mobile-inbound');await mkdir(output,{recursive:true});
const library=path.join(output,'inbound-draft.mjs');
await build({absWorkingDir:app,entryPoints:[`${app}/lib/erp/inbound-draft.ts`],outfile:library.replaceAll('\\','/'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
const {exactDecimal,sourceTimestamp,observedView,commandResult,buildCommand,canSend,commandBytes,draftErrors,sameDraft,sameSnapshot,snapshotAcknowledges,lineKey}=await import(pathToFileURL(library).href);
const operation='11111111-1111-4111-8111-111111111111',audit='22222222-2222-4222-8222-222222222222';
const source={documentId:'DOC-A',statusId:0,stateEqualityToken:'A'.repeat(64),costRowCount:2,costEditingSupported:false,
 header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'SOURCE A',invoiceNo:'',departurePoint:'FROM',destinationPoint:'TO',orderTypeId:'TYPE',branchId:'BR-A',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:''},
 details:[{rowId:'ROW-1',clientLineId:null,itemId:'ITEM-1',lotNumberByDocument:'',setQuantityByDocument:'999999999999999999',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'},
 {rowId:'ROW-2',clientLineId:null,itemId:'ITEM-2',lotNumberByDocument:'lot',setQuantityByDocument:'0',barrelQuantityByDocument:'-1',expireDateByDocument:'2027-01-02T00:00:00',unitPrice:null}]};
const read=document=>({outcome:'Observed',document});
const receipt=command=>({operationId:command.operationId,documentId:command.documentId,statusId:command.action==='SendToWarehouse'?2:0,stateEqualityToken:'C'.repeat(64),auditId:audit,committedAtUtc:'2026-10-06T00:00:00Z'});

test('exact decimal bounds keep signs, zero, all18digits and ten-place rates',()=>{
 for(const value of ['999999999999999999','-999999999999999999','0','000000000000001','1.000'])assert.equal(exactDecimal(value,18,0),true,value);
 for(const value of ['9999999999999999999','1.1','1e3',' 1','NaN',''])assert.equal(exactDecimal(value,18,0),false,value);
 for(const value of ['0.0000000001','999999999999999999.9999999999','-0.0000000000',null])assert.equal(exactDecimal(value,28,10),true);
 assert.equal(exactDecimal('0.00000000001',28,10),false);
});
test('source wall clocks retain milliseconds and reject silent date/time coercion',()=>{
 for(const value of [source.header.documentDate,source.details[0].expireDateByDocument,'1753-01-01T00:00:00',null])assert.equal(sourceTimestamp(value),true);
 for(const value of ['2026-02-31T00:00:00','2026-10-01','2026-10-01T00:00:00Z','2026-10-01T00:00:00.001','1752-12-31T00:00:00','2026-10-01T24:00:00'])assert.equal(sourceTimestamp(value),false,value);
});
test('complete strict read preserves every supplied field and NULL/empty distinctions',()=>{
 assert.deepEqual(observedView(read(source),'DOC-A'),source);
 for(const mutate of [v=>v.header.rateExchange=1,v=>v.details[0].setQuantityByDocument=123,v=>v.details[0].amount='999',v=>v.details[1].rowId='ROW-1',v=>v.costEditingSupported=true]){
  const value=structuredClone(source);mutate(value);assert.equal(observedView(read(value),'DOC-A'),null);
 }
 assert.equal(observedView(read(source),'DOC-B'),null);
});
test('fixed Save emits explicit deltas/removals, complete header and deep-frozen intent',()=>{
 const header={...source.header,notes:null},changed={...source.details[0],itemId:'CHANGED'},added={...source.details[1],rowId:null,clientLineId:operation,itemId:'NEW'};
 const command=buildCommand(source,header,[changed,added],'Save','not a save note',operation);
 assert.equal(command.note,null);assert.deepEqual(command.header,header);assert.deepEqual(command.detailUpserts,[changed,added]);assert.deepEqual(command.removedDetailIds,['ROW-2']);assert.deepEqual(command.costChanges,[]);
 assert.equal(command.expectedStateEqualityToken,source.stateEqualityToken);
 for(const value of [command,command.header,command.detailUpserts,...command.detailUpserts,command.removedDetailIds,command.costChanges])assert.equal(Object.isFrozen(value),true);
 assert.equal(source.header.notes,'');assert.equal(source.details[0].itemId,'ITEM-1');assert.ok(commandBytes(command)>0);
});
test('Send has no combined Save payload and applies only observed source NULL predicates',()=>{
 const command=buildCommand(source,source.header,source.details,'SendToWarehouse','',operation);
 assert.equal(command.header,null);assert.deepEqual(command.detailUpserts,[]);assert.deepEqual(command.removedDetailIds,[]);assert.equal(command.note,'');assert.equal(canSend(source),true);
 for(const field of ['lotNumberByDocument','setQuantityByDocument','barrelQuantityByDocument','expireDateByDocument']){
  const value=structuredClone(source);value.details[0][field]=null;assert.equal(canSend(value),false,field);
 }
 assert.throws(()=>buildCommand(source,{...source.header,notes:'dirty'},source.details,'SendToWarehouse',null,operation));
 assert.ok(draftErrors(source,{...source.header,branchId:'BR-B'},source.details,null)['header.branchId']);
 assert.ok(draftErrors(source,{...source.header,documentDate:'2026-10-02T00:00:00'},source.details,null)['header.documentDate']);
});
test('500 details retained without truncation; over-bound or aliased identities rejected',()=>{
 const value={...source,details:Array.from({length:500},(_,i)=>({...source.details[0],rowId:`ROW-${i+1}`}))};
 assert.equal(observedView(read(value),'DOC-A').details.length,500);
 assert.equal(buildCommand(value,{...value.header,notes:'metadata'},value.details,'Save',null,operation).detailUpserts.length,0);
 assert.equal(observedView(read({...value,details:[...value.details,{...source.details[0],rowId:'ROW-501'}]}),'DOC-A'),null);
});
test('receipt must bind original operation/document/action status; non-success cannot carry receipt',()=>{
 const command=buildCommand(source,source.header,source.details,'SendToWarehouse',null,operation);
 const good={outcome:'Committed',receipt:receipt(command),code:null};assert.deepEqual(commandResult(good,command,0),good);
 for(const update of [{operationId:audit},{documentId:'DOC-B'},{statusId:0},{auditId:'bad'},{stateEqualityToken:'bad'}])assert.equal(commandResult({...good,receipt:{...good.receipt,...update}},command,0),null);
 for(const outcome of ['InvalidInput','Denied','NotFound','Conflict','Rejected','UnsupportedCostEdits','NumberingUnavailable','Unavailable','OutcomeUnknown'])assert.equal(commandResult({outcome,receipt:null,code:null},command,0).outcome,outcome);
 assert.equal(commandResult({outcome:'Observed',receipt:null,code:null},command,0),null);
 assert.equal(commandResult({...good,outcome:'Rejected'},command,0),null);
});


test('snapshot barrier requires the acknowledged document, status and exact token',()=>{
 const ack={...receipt({operationId:operation,documentId:'DOC-A',action:'Save'}),stateEqualityToken:source.stateEqualityToken};
 assert.equal(snapshotAcknowledges(source,ack),true);
 for(const change of [{documentId:'DOC-B'},{statusId:2},{stateEqualityToken:'B'.repeat(64)}])assert.equal(snapshotAcknowledges({...source,...change},ack),false);
 assert.equal(sameSnapshot(source,structuredClone(source)),true);
 for(const change of [{documentId:'DOC-B'},{statusId:2},{stateEqualityToken:'B'.repeat(64)},{costRowCount:3}])assert.equal(sameSnapshot(source,{...source,...change}),false);
});
test('field property order and row order are not changes; exact string spelling is',()=>{
 const reverse=value=>Object.fromEntries(Object.entries(value).reverse());
 const header=reverse(source.header),details=source.details.map(reverse).reverse();
 assert.equal(sameDraft(source,header,details),true);
 assert.deepEqual(buildCommand(source,header,details,'Save',null,operation).detailUpserts,[]);
 assert.equal(sameDraft(source,{...header,rateExchange:'1'},details),false);
 assert.equal(sameDraft(source,{...header,notes:null},details),false);
});
test('Save is independent of invalid Send-only note and never emits it',()=>{
 const invalid='n'.repeat(201),header={...source.header,notes:'save separately'};
 const command=buildCommand(source,header,source.details,'Save',invalid,operation);
 assert.equal(command.note,null);assert.equal(command.action,'Save');
 assert.throws(()=>buildCommand(source,source.header,source.details,'SendToWarehouse',invalid,operation));
});
test('client GUID identity is case-insensitive and separate from server row namespace',()=>{
 const id='abcdefab-abcd-4abc-8abc-abcdefabcdef';
 const server={...source.details[0],rowId:id};
 const client={...source.details[1],rowId:null,clientLineId:id};
 const view={...source,details:[server]};
 assert.notEqual(lineKey(server),lineKey(client));
 assert.deepEqual(draftErrors(view,view.header,[server,client],null),{});
 assert.ok(draftErrors(view,view.header,[client,{...client,clientLineId:id.toUpperCase()}],null).details);
});
test('multiline text, raw timestamp and NULL/empty values survive command construction',()=>{
 const value=structuredClone(source);value.header.notes='line1\r\nline2\t';value.header.departurePoint='from\nto';
 const view=observedView(read(value),'DOC-A');assert.ok(view);
 const command=buildCommand(view,{...view.header,invoiceNo:'changed'},view.details,'Save',null,operation);
 assert.equal(command.header.notes,value.header.notes);assert.equal(command.header.departurePoint,value.header.departurePoint);
 assert.equal(command.header.documentDate,value.header.documentDate);assert.deepEqual(command.detailUpserts,[]);
});

const fixture=`
import React,{useMemo,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {MobileInboundRequest} from './components/erp/mobile-inbound-request';
import {NavigationGuardProvider,useNavigationGuard} from './components/erp/navigation-guard';
const baseline=${JSON.stringify(source)};
window.qaPresented=[];window.qaCallbacks=[];window.qaHeldReads=[];window.qaConfirms=0;window.qaLeft=false;window.qaConfirmAnswer=true;window.confirm=()=>{window.qaConfirms++;return window.qaConfirmAnswer;};
function docs(count=2){const a=structuredClone(baseline);if(count!==2)a.details=Array.from({length:count},(_,i)=>({...baseline.details[0],rowId:'ROW-'+(i+1)}));return {'DOC-A':a,'DOC-B':{...structuredClone(a),documentId:'DOC-B',stateEqualityToken:'B'.repeat(64),header:{...a.header,orderNumber:'SOURCE B'}}};}
function model(patch={}){const m={docs:docs(patch.count),calls:{read:[],execute:[],reconcile:[],frozen:[],sameOriginal:[],finishedRead:0,finishedExecute:0,aborts:0},mode:'Committed',readFault:false,badReceipt:null,reconcileOutcome:'Replayed',callbackThrows:false,revision:0,...patch};
 if(patch.nullField)m.docs['DOC-A'].details[0][patch.nullField]=null;
 if(patch.multiline){m.docs['DOC-A'].header.notes='line1\\r\\nline2';m.docs['DOC-A'].header.departurePoint='FROM\\nTO';}
 if(patch.longIdentifiers)m.docs['DOC-A'].details[0].rowId='R'.repeat(50);return m;}
function apply(m,c){const d=m.docs[c.documentId];if(c.action==='Save'){d.header=structuredClone(c.header);d.details=d.details.filter(row=>!c.removedDetailIds.includes(row.rowId));for(const row of c.detailUpserts){const next={...structuredClone(row),rowId:row.rowId??'SERVER-'+(++m.revision),clientLineId:null};const index=d.details.findIndex(old=>old.rowId===row.rowId);if(index<0)d.details.push(next);else d.details[index]=next;}}else d.statusId=2;d.stateEqualityToken=(++m.revision).toString(16).toUpperCase().padStart(64,'0');
 return {operationId:c.operationId,documentId:c.documentId,statusId:d.statusId,stateEqualityToken:d.stateEqualityToken,auditId:'${audit}',committedAtUtc:'2026-10-06T00:00:00Z'};}
function App(){const ref=useRef(model()),sequence=useRef(0);const [config,setConfig]=useState({scopeKey:'synthetic-session-0',documentId:'DOC-A',canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576,adapterVersion:0});
 const adapter=useMemo(()=>{const m=ref.current;return {
 read:async(id,signal)=>{m.calls.read.push(id);signal.addEventListener('abort',()=>m.calls.aborts++);
  // Capture BEFORE waiting: an old response must actually carry old data.
  const snapshot=structuredClone(m.staleReadback&&m.calls.execute.length?baseline:m.docs[id]);
  if(m.malformedRead)snapshot.header.rateExchange=1;
  if(m.holdReadDocument===id){await new Promise(resolve=>{window.qaReadResolve=resolve;window.qaHeldReads.push({id,resolve});});}
  m.calls.finishedRead++;if(m.readFault||m.readFaultDocument===id)throw Error('PRIVATE SENTINEL read');return {outcome:'Observed',document:snapshot};},
 execute:async(c,signal)=>{m.original=c;m.calls.execute.push(structuredClone(c));m.calls.frozen.push(Object.isFrozen(c)&&Object.isFrozen(c.header??c)&&Object.isFrozen(c.detailUpserts)&&c.detailUpserts.every(Object.isFrozen));signal.addEventListener('abort',()=>m.calls.aborts++);
  if(m.mode==='controlled')await new Promise(resolve=>window.qaExecuteResolve=resolve);
  if(['Committed','Replayed','lost','controlled','malformed','readFailure'].includes(m.mode)){m.receipt=apply(m,c);m.calls.finishedExecute++;if(m.mode==='lost')throw Error('PRIVATE SENTINEL lost acknowledgment');if(m.mode==='readFailure')m.readFault=true;const result={outcome:m.mode==='Replayed'?'Replayed':'Committed',receipt:structuredClone(m.receipt),code:null};if(m.mode==='malformed')result.receipt[m.badReceipt??'operationId']='bad';return result;}
  return {outcome:m.mode,receipt:null,code:'PRIVATE SENTINEL'};
 },
 reconcile:async(c,signal)=>{m.calls.reconcile.push(structuredClone(c));m.calls.sameOriginal.push(c===m.original&&Object.isFrozen(c));signal.addEventListener('abort',()=>m.calls.aborts++);if(m.holdReconcile)await new Promise(resolve=>window.qaReconcileResolve=resolve);return {outcome:m.reconcileOutcome,receipt:m.reconcileOutcome==='Replayed'?structuredClone(m.receipt):null,code:null};}
 };},[config.scopeKey,config.adapterVersion]);
 window.qa={reset:patch=>{ref.current=model(patch);window.qaPresented=[];window.qaHeldReads=[];window.qaReadResolve=undefined;window.qaConfirms=0;window.qaCallbacks=[];window.qaLeft=false;window.qaConfirmAnswer=true;setConfig({scopeKey:'synthetic-session-'+(++sequence.current),documentId:'DOC-A',canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:patch?.maxCommandBytes??1048576,adapterVersion:0});},calls:()=>ref.current.calls,serverRows:()=>ref.current.docs["DOC-A"].details.map(row=>row.rowId),
 // Raw select deliberately bypasses the host guard for stale-response adversarial tests; Leave is the guarded user path.
 select:id=>flushSync(()=>setConfig(old=>({...old,documentId:id}))),refresh:()=>setConfig(old=>({...old})),revoke:()=>setConfig(old=>({...old,canRead:false,canSave:false,canSend:false})),restore:()=>setConfig(old=>({...old,canRead:true,canSave:true,canSend:true})),logout:()=>setConfig(old=>({...old,scopeKey:null})),
 healthy:()=>{ref.current.readFault=false;ref.current.staleReadback=false;ref.current.malformedRead=false;},readFault:value=>{ref.current.readFault=value;},holdReads:id=>{ref.current.holdReadDocument=id;},
  rights:patch=>setConfig(old=>({...old,...patch})),replaceAdapter:()=>setConfig(old=>({...old,adapterVersion:old.adapterVersion+1})),mutateOrder:value=>{ref.current.docs['DOC-A'].header.orderNumber=value;},mutateCallback:()=>{ref.current.callbackMutates=true;},
  changeToken:()=>{ref.current.docs['DOC-A'].stateEqualityToken='F'.repeat(64);},corruptFresh:kind=>{const d=ref.current.docs['DOC-A'];if(kind==='status')d.statusId=2;if(kind==='header')d.header.invoiceNo='CHANGED';if(kind==='detail')d.details[0].setQuantityByDocument=null;if(kind==='cost')d.costRowCount=3;},reconcileOutcome:value=>{ref.current.reconcileOutcome=value;},callbackThrows:()=>{ref.current.callbackThrows=true;}};
 return <NavigationGuardProvider><MobileInboundRequest documentId={config.documentId} access={config} adapter={adapter} onPresentedRead={event=>{
  const editor=document.querySelector('[data-testid=inbound-editor]'),field=document.getElementById('inbound-header-orderNumber');
  window.qaPresented.push({...event,phase:editor?.getAttribute('data-phase')??null,visibleDocumentId:editor?.getAttribute('data-document-id')??null,order:field?.value??null,fieldConnected:field?.isConnected??false});
  if(ref.current.presentedCallback==='throw')throw Error('PRIVATE SENTINEL presentation callback');
  if(ref.current.presentedCallback==='reject')return Promise.reject(Error('PRIVATE SENTINEL presentation rejection'));
 }} onConfirmed={receipt=>{window.qaCallbacks.push(receipt);if(ref.current.callbackMutates)receipt.documentId='MUTATED';if(ref.current.callbackThrows)throw Error('PRIVATE SENTINEL callback');}}/><Leave onLeave={()=>setConfig(old=>({...old,documentId:'DOC-B'}))}/></NavigationGuardProvider>;
}
function Leave({onLeave}){const guard=useNavigationGuard();return <button id='qa-leave' onClick={()=>guard.request(()=>{window.qaLeft=true;onLeave();})}>Synthetic navigation</button>;}
createRoot(document.getElementById('root')).render(<App/>);`;

test('actual React mobile workflow and adversarial async custody', {timeout:240000},async t=>{
 const tools=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(tools?createRequire(path.join(path.resolve(tools),'package.json')):createRequire(import.meta.url))('playwright-core'));}catch{throw Error('Existing playwright-core required; set MEDCOM_BROWSER_TOOLCHAIN. No install attempted.');}
 const bundle=await build({stdin:{contents:fixture,resolveDir:app,loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},logLevel:'warning'});
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}*{box-sizing:border-box}button{min-height:44px}button:disabled{opacity:.5}[role=alertdialog]{position:fixed;top:5%;left:3%;z-index:51;width:94vw;background:white;border:1px solid #aaa;padding:16px}[data-slot=alert-dialog-overlay]{position:fixed;inset:0;z-index:50;background:#0004}</style><div id="root"></div><script src="/fixture.js"></script></html>';
 const server=createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/fixture.js'?'application/javascript':'text/html; charset=utf-8');response.end(request.url==='/fixture.js'?bundle.outputFiles[0].contents:html);});server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 let browser,context,page;const errors=[],external=[];const results=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.I18_TEST_BROWSER?{executablePath:process.env.I18_TEST_BROWSER}:{})});
  context=await browser.newContext({viewport:{width:390,height:844},locale:'vi-VN',isMobile:true,hasTouch:true,serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(origin);
  const field=(name)=>name==='Ghi chú'?page.getByRole('textbox',{name,exact:true,includeHidden:true}):page.getByLabel(name,{exact:true});
  const ready=async()=>{await page.waitForFunction(()=>{const input=document.getElementById('inbound-header-orderNumber');return window.qa.calls().read.length>0&&input&&document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='editing';});};
  const reset=async(patch={})=>{await page.evaluate(patch=>window.qa.reset(patch),patch);await ready();};
  const calls=()=>page.evaluate(()=>window.qa.calls());
  const review=()=>page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();
  const save=async()=>{await review();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();};
  const unknown=()=>page.waitForFunction(()=>document.body.textContent.includes('Chưa xác nhận kết quả.'));
  const confirm=()=>page.waitForFunction(()=>{const commands=window.qa.calls().execute;const id=commands.at(-1)?.operationId;return id&&document.querySelector('[data-testid=confirmed-receipt]')?.textContent.includes(id);});
  const run=async(name,fn)=>{let status='FAIL';await t.test(name,async()=>{await fn();status='PASS';});results.push({name,status});};
  const phase=value=>page.waitForFunction(value=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')===value,value);
  const sendNote=async value=>{await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill(value);};
  const navigationDialog=async(discardable,cancel=true)=>{
   assert.equal(await page.evaluate(()=>window.qaLeft),false,'leave callback must not have run before request');
   await page.locator('#qa-leave').click();
   const dialog=page.getByRole('alertdialog');await dialog.waitFor({state:'visible'});
   assert.equal(await dialog.isVisible(),true,'navigation warning must actually be shown');
   assert.match(await dialog.innerText(),/Công việc chưa hoàn tất/);
   assert.equal(await page.evaluate(()=>window.qaLeft),false,'request must not invoke the leave callback');
   const discard=dialog.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true});
   assert.equal(await discard.count(),discardable?1:0);
   if(discardable)assert.equal(await discard.isVisible(),true);
   if(cancel){
    await dialog.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.qaLeft),false,'cancel must retain the current document');
   }
   return dialog;
  };
  await ready();
  const presentationEvents=()=>page.evaluate(()=>window.qaPresented);
  const presented=async()=>(await presentationEvents()).filter(event=>event.state!=='pending');
  await run('presentation readiness occurs after committed current full read and does not remount or read again',async()=>{
   await page.evaluate(()=>window.qa.reset({holdReadDocument:'DOC-A'}));await page.waitForFunction(()=>window.qaHeldReads.length===1);
   assert.deepEqual(await presented(),[],'A started transport is not committed read proof');
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await ready();
   const events=await presented();assert.equal(events.length,1);assert.match(events[0].scopeKey,/^synthetic-session-/);
   assert.deepEqual({...events[0],scopeKey:'CURRENT'}, {documentId:'DOC-A',scopeKey:'CURRENT',state:'ready',phase:'editing',visibleDocumentId:'DOC-A',order:'SOURCE A',fieldConnected:true});
   await page.evaluate(()=>{window.qaPresentedEditor=document.querySelector('[data-testid=inbound-editor]');window.qa.refresh();});
   await field('Số đơn').fill('KEEP PRESENTED EDIT');await page.evaluate(()=>window.qa.refresh());await page.waitForTimeout(30);
   assert.equal(await page.evaluate(()=>window.qaPresentedEditor===document.querySelector('[data-testid=inbound-editor]')),true);
   assert.equal(await field('Số đơn').inputValue(),'KEEP PRESENTED EDIT');assert.equal((await presented()).length,1);
   assert.equal((await calls()).read.length,1);assert.equal((await calls()).execute.length,0);
  });
  for(const fault of ['readFault','malformedRead'])await run(`presentation ${fault} reports only current failure until an explicit successful retry`,async()=>{
   await page.evaluate(fault=>window.qa.reset({[fault]:true}),fault);await phase('readFailed');
   assert.deepEqual((await presented()).map(event=>[event.documentId,event.state,event.phase]),[['DOC-A','failed','readFailed']]);
   assert.equal((await calls()).read.length,1);assert.equal(await page.locator('form').count(),0);
   await page.evaluate(()=>window.qa.healthy());await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();
   assert.deepEqual((await presented()).map(event=>event.state),['failed','ready']);assert.equal((await calls()).read.length,2);assert.equal((await calls()).execute.length,0);
  });
  for(const lateFailure of [false,true])await run(`presentation ignores superseded A ${lateFailure?'failure':'full read'} after B commits`,async()=>{
   await page.evaluate(lateFailure=>window.qa.reset({holdReadDocument:'DOC-A',...(lateFailure?{readFaultDocument:'DOC-A'}:{})}),lateFailure);
   await page.waitForFunction(()=>window.qaHeldReads.length===1);assert.deepEqual(await presented(),[]);
   await page.evaluate(()=>window.qa.select('DOC-B'));await ready();
   assert.deepEqual((await presented()).map(event=>[event.documentId,event.state]),[['DOC-B','ready']]);
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForFunction(()=>window.qa.calls().finishedRead===2);await page.waitForTimeout(30);
   assert.deepEqual((await presented()).map(event=>[event.documentId,event.state]),[['DOC-B','ready']]);assert.equal(await field('Số đơn').inputValue(),'SOURCE B');
   assert.equal((await calls()).read.length,2);assert.equal((await calls()).execute.length,0);
  });
  await run('presentation cannot report a held read after authority loss; restored authority needs its new read',async()=>{
   await page.evaluate(()=>window.qa.reset({holdReadDocument:'DOC-A'}));await page.waitForFunction(()=>window.qaHeldReads.length===1);
   await page.evaluate(()=>window.qa.revoke());await page.waitForFunction(()=>!document.querySelector('form'));
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForFunction(()=>window.qa.calls().finishedRead===1);await page.waitForTimeout(30);
   assert.deepEqual(await presented(),[]);
   await page.evaluate(()=>window.qa.restore());await page.waitForFunction(()=>window.qaHeldReads.length===2);assert.deepEqual(await presented(),[]);
   await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();
   assert.deepEqual((await presented()).map(event=>[event.documentId,event.state]),[['DOC-A','ready']]);assert.equal((await calls()).read.length,2);
  });
  await run('presentation reports legitimate retained conflict only after a new bound read commits',async()=>{
   await reset();await field('Số đơn').fill('UNSAVED PRESENTED');
   await page.evaluate(()=>{window.qa.mutateOrder('CONCURRENT PRESENTED');window.qa.rights({canSend:false});});await phase('conflict');
   const events=await presented();assert.deepEqual(events.map(event=>[event.state,event.phase]),[['ready','editing'],['ready','conflict']]);
   assert.equal(events[1].order,'UNSAVED PRESENTED');assert.equal(events[1].fieldConnected,true);assert.equal(await field('Số đơn').isDisabled(),true);
   assert.equal((await calls()).read.length,2);assert.equal((await calls()).execute.length,0);
  });
  for(const presentedCallback of ['throw','reject'])await run(`presentation callback ${presentedCallback} cannot change command, receipt or editor lifetime`,async()=>{
   await reset({presentedCallback});await page.evaluate(()=>{window.qaPresentedEditor=document.querySelector('[data-testid=inbound-editor]');});
   assert.equal((await calls()).read.length,1);assert.equal((await presented()).length,1);
   await field('Số đơn').fill('CALLBACK ISOLATED');await save();await confirm();await ready();await page.waitForTimeout(30);
   assert.equal(await field('Số đơn').inputValue(),'CALLBACK ISOLATED');assert.equal(await page.evaluate(()=>window.qaPresentedEditor===document.querySelector('[data-testid=inbound-editor]')),true);
   const c=await calls();assert.equal(c.read.length,2);assert.equal(c.execute.length,1);assert.equal(c.reconcile.length,0);assert.equal(c.frozen[0],true);
   assert.equal(c.execute[0].header.orderNumber,'CALLBACK ISOLATED');assert.equal(await page.evaluate(()=>window.qaCallbacks.length),1);
   assert.deepEqual((await presented()).map(event=>event.state),['ready','ready']);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE SENTINEL/);
  });
  await run('presentation readiness also covers granted read-only full detail without enabling commands',async()=>{
   await reset();await page.evaluate(()=>window.qa.rights({canSave:false,canSend:false}));await page.waitForFunction(()=>window.qa.calls().read.length===2);await ready();
   const events=await presented();assert.equal(events.length,2);assert.equal(events[1].state,'ready');assert.equal(events[1].visibleDocumentId,'DOC-A');assert.equal(events[1].fieldConnected,true);
   assert.equal(await field('Số đơn').isDisabled(),true);assert.equal((await calls()).execute.length,0);
  });
  await run('presentation invalidates an explicit held reread before a new binding-nonce proof can become ready',async()=>{
   await reset();const before=await presentationEvents();assert.equal(before.at(-1).state,'ready');
   await page.evaluate(()=>{window.qaPresentedEditor=document.querySelector('[data-testid=inbound-editor]');window.qa.holdReads('DOC-A');});
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await page.waitForFunction(()=>window.qaHeldReads.length===1);
   const pending=await presentationEvents();assert.equal(pending.at(-1).state,'pending');assert.equal(pending.at(-1).documentId,'DOC-A');
   assert.equal(pending.at(-1).scopeKey,before.at(-1).scopeKey);assert.equal((await presented()).length,1);
   assert.equal(await page.evaluate(()=>window.qaPresentedEditor===document.querySelector('[data-testid=inbound-editor]')),true);
   assert.equal(await field('Số đơn').isDisabled(),true);assert.equal((await calls()).read.length,2);
   for(let index=0;index<3;index++){await page.evaluate(()=>window.qa.refresh());await page.waitForTimeout(10);}
   assert.deepEqual(await presentationEvents(),pending,'Reporting pending and parent rerenders cannot become accepted read proof');
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await ready();
   const accepted=await presentationEvents();assert.equal(accepted.length,pending.length+1);assert.equal(accepted.at(-1).state,'ready');
   assert.equal(accepted.at(-1).fieldConnected,true);assert.equal(accepted.at(-1).phase,'editing');assert.equal((await calls()).read.length,2);
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await page.waitForFunction(()=>window.qaHeldReads.length===2);
   const again=await presentationEvents();assert.equal(again.length,accepted.length+1);assert.equal(again.at(-1).state,'pending');
   await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();assert.equal((await presentationEvents()).at(-1).state,'ready');
   assert.equal((await calls()).read.length,3);assert.equal((await calls()).execute.length,0);
  });
  await run('failed held reread remains failed across parent renders until a new explicit nonce succeeds',async()=>{
   await reset();await page.evaluate(()=>{window.qa.holdReads('DOC-A');window.qa.readFault(true);});
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await page.waitForFunction(()=>window.qaHeldReads.length===1);
   assert.equal((await presentationEvents()).at(-1).state,'pending');await page.evaluate(()=>window.qaHeldReads[0].resolve());await phase('readFailed');
   const failed=await presentationEvents();assert.equal(failed.at(-1).state,'failed');assert.deepEqual((await presented()).map(event=>event.state),['ready','failed']);
   await page.evaluate(()=>{window.qa.healthy();window.qa.refresh();});await page.waitForTimeout(30);
   assert.deepEqual(await presentationEvents(),failed,'Healthy transport alone cannot restore stale presentation readiness');
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await page.waitForFunction(()=>window.qaHeldReads.length===2);
   assert.equal((await presentationEvents()).at(-1).state,'pending');await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();
   assert.deepEqual((await presented()).map(event=>event.state),['ready','failed','ready']);assert.equal((await calls()).read.length,3);assert.equal((await calls()).execute.length,0);
  });
  await run('all header fields, NULL/empty, exact18digit values and source times survive metadata Save',async()=>{
   await reset();assert.equal(await field('Ngày giờ chứng từ').inputValue(),source.header.documentDate);assert.equal(await field('Ngày giờ chứng từ').isDisabled(),true);assert.equal(await field('Chi nhánh').isDisabled(),true);
   assert.equal(await field('Số lượng bộ theo chứng từ').first().inputValue(),'999999999999999999');assert.equal(await field('Ngày giờ hết hạn theo chứng từ').first().inputValue(),source.details[0].expireDateByDocument);
   await field('Số đơn').fill('EDITED');await save();await confirm();await ready();const c=(await calls()).execute[0];assert.deepEqual(c.header,{...source.header,orderNumber:'EDITED'});assert.deepEqual(c.detailUpserts,[]);assert.deepEqual(c.removedDetailIds,[]);assert.equal(c.action,'Save');assert.equal(c.note,null);assert.equal((await calls()).frozen[0],true);
  });
  await run('explicit line update/add/removal and NULL edits read back server row identities',async()=>{
   await reset();await field('Số lượng thùng theo chứng từ').first().fill('-2');await field('Ghi chú NULL').check();await page.getByRole('button',{name:'Xóa dòng 2',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Xóa dòng',exact:true}).click();await page.getByRole('button',{name:'Thêm dòng',exact:true}).click();await field('Mã hàng').last().fill('NEW-ITEM');await save();await confirm();await ready();
   const c=(await calls()).execute[0];assert.equal(c.header.notes,null);assert.deepEqual(c.removedDetailIds,['ROW-2']);assert.equal(c.detailUpserts.length,2);assert.equal(c.detailUpserts[0].barrelQuantityByDocument,'-2');assert.equal(c.detailUpserts[1].rowId,null);assert.ok(c.detailUpserts[1].clientLineId);assert.equal(c.detailUpserts[1].unitPrice,null);assert.doesNotMatch(await page.locator('form').innerText(),/SERVER-/);assert.equal((await page.evaluate(()=>window.qa.serverRows())).some(rowId=>rowId.startsWith('SERVER-')),true);
  });
  await run('duplicate taps dispatch once; dirty Save cannot become combined Send',async()=>{
   await reset({mode:'controlled'});await field('Số đơn').fill('DUPLICATE');await review();assert.equal(await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).isDisabled(),true);
   await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Lưu thay đổi');b.click();b.click();});await page.waitForFunction(()=>window.qa.calls().execute.length===1);assert.equal((await calls()).execute.length,1);await page.evaluate(()=>window.qaExecuteResolve());await confirm();await ready();
  });
  await run('Send uses a fresh equality read, separate intent, source state2 and no further actions',async()=>{
   await reset();await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill('');await review();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await confirm();await page.waitForFunction(()=>document.body.textContent.includes('Trạng thái hiện tại chỉ đọc'));
   const c=(await calls()).execute[0];assert.equal(c.action,'SendToWarehouse');assert.equal(c.header,null);assert.deepEqual(c.detailUpserts,[]);assert.deepEqual(c.removedDetailIds,[]);assert.equal(c.note,'');assert.equal((await calls()).read.length,3);
  });
  await run('server change during Send preflight conflicts without execute',async()=>{
   await reset();await review();await page.evaluate(()=>window.qa.changeToken());await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Chứng từ đã thay đổi.'));assert.equal((await calls()).execute.length,0);
  });
  for(const kind of ['status','header','detail','cost'])await run(`fresh ${kind} mismatch cannot dispatch even with a reused token`,async()=>{
   await reset();await review();await page.evaluate(kind=>window.qa.corruptFresh(kind),kind);await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Chứng từ đã thay đổi.'));assert.equal((await calls()).execute.length,0);
  });
  await run('invalid decimal input remains exact, focuses its error and never dispatches',async()=>{
   await reset();await field('Số lượng bộ theo chứng từ').first().fill('1e3');await review();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-invalid')==='true');assert.equal(await field('Số lượng bộ theo chứng từ').first().inputValue(),'1e3');assert.equal((await calls()).execute.length,0);
  });
  for(const nullField of ['lotNumberByDocument','setQuantityByDocument','barrelQuantityByDocument','expireDateByDocument'])await run(`source Send NULL guard ${nullField}`,async()=>{await reset({nullField});await review();assert.equal(await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).isDisabled(),true);assert.equal((await calls()).execute.length,0);});
  for(const outcome of ['InvalidInput','Denied','NotFound','Conflict','Rejected','UnsupportedCostEdits','NumberingUnavailable','Unavailable'])await run(`typed ${outcome} retains input and requires explicit fresh read`,async()=>{
   await reset({mode:outcome});await field('Số đơn').fill('RETAINED');await save();await page.waitForFunction(()=>window.qa.calls().execute.length===1&&document.querySelector('#inbound-header-orderNumber').matches(':disabled'));
   assert.equal(await field('Số đơn').inputValue(),'RETAINED');assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE SENTINEL/);await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();assert.equal(await field('Số đơn').inputValue(),'SOURCE A');
  });
  await run('valid Replayed receipt survives throwing parent callback',async()=>{
   await reset({mode:'Replayed'});await page.evaluate(()=>window.qa.callbackThrows());await field('Số đơn').fill('REPLAYED');await save();await confirm();await ready();assert.equal((await calls()).execute.length,1);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE SENTINEL/);
  });
  await run('valid receipt survives failed readback; refresh never redispatches or reconciles',async()=>{
   await reset({mode:'readFailure'});await field('Số đơn').fill('COMMITTED');await save();await confirm();await page.waitForFunction(()=>document.body.textContent.includes('chưa đọc lại được chứng từ'));assert.equal(await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).isDisabled(),true);assert.equal((await calls()).reconcile.length,0);
   await page.evaluate(()=>window.qa.healthy());await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();assert.equal(await field('Số đơn').inputValue(),'COMMITTED');assert.equal((await calls()).execute.length,1);assert.equal(await page.evaluate(()=>window.qaConfirms),0);
  });
  await run('lost ACK plus same-scope refresh retains exact frozen original and blocks navigation',async()=>{
   await reset({mode:'lost'});await field('Số đơn').fill('UNKNOWN');await save();await unknown();const original=(await calls()).execute[0];await page.evaluate(()=>window.qa.refresh());await unknown();await navigationDialog(false);
   await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();await ready();assert.deepEqual((await calls()).reconcile[0],original);assert.equal((await calls()).sameOriginal[0],true);assert.equal((await calls()).execute.length,1);
  });
  for(const action of ['Save','SendToWarehouse'])await run('pending '+action+' shows non-discardable dialog and never invokes leave',async()=>{
   await reset({mode:'controlled'});await sendNote('KEEP SEND NOTE');
   if(action==='Save'){await field('Số đơn').fill('PENDING');await save();}
   else{await review();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();}
   await phase('pending');await page.waitForFunction(()=>window.qa.calls().execute.length===1);
   const original=(await calls()).execute[0];await navigationDialog(false);
   assert.equal((await calls()).read.includes('DOC-B'),false);assert.deepEqual((await calls()).execute,[original]);
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'KEEP SEND NOTE');
   await page.evaluate(()=>window.qaExecuteResolve());await confirm();await phase('editing');
   assert.equal(await page.evaluate(()=>window.qaLeft),false);assert.equal((await calls()).execute.length,1);
  });
  await run('reconciling shows non-discardable dialog and retains the exact original',async()=>{
   await reset({mode:'lost',holdReconcile:true});await sendNote('UNSENT NOTE');await field('Số đơn').fill('RECONCILE');
   await save();await unknown();const original=(await calls()).execute[0];
   await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await phase('reconciling');
   await page.waitForFunction(()=>typeof window.qaReconcileResolve==='function');await navigationDialog(false);
   assert.equal((await calls()).read.includes('DOC-B'),false);assert.deepEqual((await calls()).reconcile,[original]);
   assert.deepEqual((await calls()).sameOriginal,[true]);assert.equal((await calls()).execute.length,1);
   await page.evaluate(()=>window.qaReconcileResolve());await confirm();await ready();
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'UNSENT NOTE');assert.equal(await page.evaluate(()=>window.qaLeft),false);
  });
  for(const cause of ['permissions','adapter'])for(const note of ['', 'A ONLY NOTE'])await run('Send-only '+JSON.stringify(note)+' stays guarded during '+cause+' revalidation',async()=>{
   await reset();await sendNote(note);assert.equal(await field('Số đơn').inputValue(),'SOURCE A');
   await page.evaluate(cause=>{window.qa.holdReads('DOC-A');if(cause==='permissions')window.qa.rights({canSend:false});else window.qa.replaceAdapter();},cause);
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('loading');
   assert.equal(await page.locator('form').count(),0,'retired snapshot must stay hidden');
   await navigationDialog(true);assert.equal((await calls()).read.includes('DOC-B'),false);
   assert.equal((await calls()).execute.length,0);await page.evaluate(()=>window.qaHeldReads[0].resolve());await ready();
   assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),false);assert.equal(await field('Ghi chú gửi kho').inputValue(),note);
   assert.equal(await field('Số đơn').inputValue(),'SOURCE A');assert.equal(await page.evaluate(()=>window.qaLeft),false);
  });
  await run('same-session read revocation hides data but not the unsent-note navigation guard',async()=>{
   await reset();await sendNote('REVALIDATE RIGHTS');await page.evaluate(()=>window.qa.revoke());
   await page.waitForFunction(()=>!document.querySelector('form'));await navigationDialog(true);
   await page.evaluate(()=>{window.qa.holdReads('DOC-A');window.qa.restore();});
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('loading');await navigationDialog(true);
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await ready();
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'REVALIDATE RIGHTS');assert.equal((await calls()).execute.length,0);
  });
  await run('explicit discard during note-only revalidation selects B and fences the retired A read',async()=>{
   await reset();await sendNote('A DISCARD ONLY');await page.evaluate(()=>{window.qa.holdReads('DOC-A');window.qa.replaceAdapter();});
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('loading');
   const dialog=await navigationDialog(true,false);
   assert.equal((await calls()).read.includes('DOC-B'),false);
   await dialog.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.waitForFunction(()=>window.qa.calls().read.includes('DOC-B'));await ready();
   assert.equal(await page.evaluate(()=>window.qaLeft),true);assert.equal(await field('Số đơn').inputValue(),'SOURCE B');
   assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),true);
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForFunction(()=>window.qa.calls().finishedRead===3);
   assert.equal(await field('Số đơn').inputValue(),'SOURCE B');assert.equal((await calls()).execute.length,0);
  });
  await run('failed note-only revalidation still guards navigation and requires confirmation to discard on reload',async()=>{
   await reset();await sendNote('KEEP AFTER READ ERROR');
   await page.evaluate(()=>{window.qa.readFault(true);window.qa.replaceAdapter();});await phase('readFailed');
   assert.equal(await page.locator('form').count(),0);await navigationDialog(true);
   await page.evaluate(()=>{window.qa.healthy();window.qaConfirmAnswer=false;});
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.qaConfirms),1);assert.equal((await calls()).read.length,2);
   await navigationDialog(true);
   await page.evaluate(()=>window.qa.replaceAdapter());await page.waitForFunction(()=>window.qa.calls().read.length===3);await ready();
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'KEEP AFTER READ ERROR');assert.equal((await calls()).execute.length,0);
  });
  for(const note of ['', 'SEND AFTER CHECK'])await run('Send-only '+JSON.stringify(note)+' stays guarded during held preflight and survives staying on page',async()=>{
   await reset({mode:'controlled'});await sendNote(note);await review();await page.evaluate(()=>window.qa.holdReads('DOC-A'));
   await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('checking');await navigationDialog(false);
   assert.equal((await calls()).execute.length,0);assert.equal((await calls()).read.includes('DOC-B'),false);
   assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),false);assert.equal(await field('Ghi chú gửi kho').inputValue(),note);
   await page.evaluate(()=>{window.qa.holdReads(null);window.qaHeldReads[0].resolve();});await phase('pending');
   await navigationDialog(false);assert.equal((await calls()).execute[0].note,note);assert.equal((await calls()).execute.length,1);
   await page.evaluate(()=>window.qaExecuteResolve());await confirm();await phase('editing');
   assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),true);assert.equal(await page.evaluate(()=>window.qaLeft),false);
  });
  await run('preflight navigation dialog cannot grant stale discard once execute becomes pending',async()=>{
   await reset({mode:'controlled'});await sendNote('NO STALE DISCARD');await review();await page.evaluate(()=>window.qa.holdReads('DOC-A'));
   await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('checking');
   const dialog=await navigationDialog(false,false);
   await page.evaluate(()=>{window.qa.holdReads(null);window.qaHeldReads[0].resolve();});await phase('pending');
   assert.equal(await dialog.isVisible(),true);assert.equal(await page.evaluate(()=>window.qaLeft),false);
   assert.equal(await dialog.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
   assert.equal((await calls()).execute.length,1);assert.equal((await calls()).execute[0].note,'NO STALE DISCARD');
   await dialog.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>window.qaLeft),false);await page.evaluate(()=>window.qaExecuteResolve());await confirm();await phase('editing');
  });
  await run('cancel held Send preflight retains note; only a later confirmed discard leaves A',async()=>{
   await reset();await sendNote('DO NOT SEND');await review();await page.evaluate(()=>window.qa.holdReads('DOC-A'));
   await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();
   await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('checking');
   await navigationDialog(false);assert.equal((await calls()).execute.length,0);
   await page.getByRole('button',{name:'Hủy kiểm tra trước khi gửi',exact:true}).click();await phase('editing');
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'DO NOT SEND');assert.equal((await calls()).execute.length,0);
   const dialog=await navigationDialog(true,false);
   await dialog.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.waitForFunction(()=>window.qa.calls().read.includes('DOC-B'));await ready();
   assert.equal(await page.evaluate(()=>window.qaLeft),true);assert.equal(await field('Số đơn').inputValue(),'SOURCE B');
   assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),true);
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForFunction(()=>window.qa.calls().finishedRead===3);
   assert.equal((await calls()).execute.length,0);assert.equal((await calls()).reconcile.length,0);
   assert.equal(await field('Số đơn').inputValue(),'SOURCE B');assert.equal((await calls()).aborts>0,true);
  });
  await run('acknowledged Save readback retry retains the unsent note without silently discarding it',async()=>{
   await reset({mode:'readFailure'});await sendNote('SEND LATER');await field('Số đơn').fill('SAVED FIRST');await save();await confirm();await phase('readFailed');
   await navigationDialog(true);await page.evaluate(()=>{window.qa.healthy();window.qa.holdReads('DOC-A');});
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await page.waitForFunction(()=>window.qaHeldReads.length===1);await phase('loading');
   await navigationDialog(true);assert.equal(await field('Ghi chú gửi kho').inputValue(),'SEND LATER');
   await page.evaluate(()=>window.qaHeldReads[0].resolve());await ready();
   assert.equal(await field('Ghi chú gửi kho').inputValue(),'SEND LATER');assert.equal(await field('Số đơn').inputValue(),'SAVED FIRST');
   assert.equal((await calls()).execute.length,1);assert.equal((await calls()).reconcile.length,0);assert.equal(await page.evaluate(()=>window.qaConfirms),0);
  });
  await run('clean synthetic navigation really invokes the leave callback and selects B',async()=>{
   await reset();assert.equal(await page.evaluate(()=>window.qaLeft),false);await page.locator('#qa-leave').click();
   await page.waitForFunction(()=>window.qaLeft===true&&window.qa.calls().read.includes('DOC-B'));await ready();assert.equal(await page.getByRole('alertdialog').count(),0);
   assert.equal(await field('Số đơn').inputValue(),'SOURCE B');assert.equal((await calls()).execute.length,0);
  });
  await run('unsuccessful reconciliation remains unknown with original custody',async()=>{
   await reset({mode:'lost',reconcileOutcome:'Denied'});await field('Số đơn').fill('UNKNOWN');await save();await unknown();await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await unknown();assert.equal((await calls()).execute.length,1);assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);await page.evaluate(()=>window.qa.reconcileOutcome('Replayed'));await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();assert.equal((await calls()).reconcile.length,2);
  });
  for(const outcome of ['OutcomeUnknown','Observed'])await run(`typed ${outcome} cannot confirm or permit replacement dispatch`,async()=>{
   await reset({mode:outcome,reconcileOutcome:'OutcomeUnknown'});await field('Số đơn').fill('ORIGINAL ONLY');await save();await unknown();await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await unknown();
   assert.equal((await calls()).execute.length,1);assert.equal((await calls()).sameOriginal[0],true);assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);
  });
  for(const badReceipt of ['operationId','documentId','statusId','auditId','stateEqualityToken'])await run(`malformed/mismatched ${badReceipt} is unknown then reconciles original`,async()=>{
   await reset({mode:'malformed',badReceipt});await field('Số đơn').fill('BAD ACK');await save();await unknown();assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();assert.equal((await calls()).execute.length,1);
  });
  await run('unknown A→B selection reconciles A before opening B without applying A receipt to B',async()=>{
   await reset({mode:'lost'});await field('Số đơn').fill('A ONLY');await save();await unknown();await page.evaluate(()=>window.qa.select('DOC-B'));await page.waitForFunction(()=>!document.querySelector('form'));assert.equal((await calls()).read.includes('DOC-B'),false);
   await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await ready();assert.equal(await field('Số đơn').inputValue(),'SOURCE B');assert.equal((await calls()).reconcile[0].documentId,'DOC-A');assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);
  });
  await run('pending A→B→A Send retires late ACK, reconciles original and never redispatches',async()=>{
   await reset({mode:'controlled'});await review();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await page.waitForFunction(()=>window.qa.calls().execute.length===1);await page.evaluate(()=>window.qa.select('DOC-B'));await page.evaluate(()=>window.qa.select('DOC-A'));await page.evaluate(()=>window.qaExecuteResolve());await page.waitForFunction(()=>window.qa.calls().finishedExecute===1);await unknown();assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();await page.waitForFunction(()=>document.body.textContent.includes('Trạng thái hiện tại chỉ đọc'));assert.equal((await calls()).execute.length,1);assert.equal(await field('Số đơn').isDisabled(),true);
  });
  await run('unknown A→B→A Save reads acknowledged token before a later separate Send',async()=>{
   await reset({mode:'lost'});await field('Số đơn').fill('ACKNOWLEDGED A');await save();await unknown();await page.evaluate(()=>window.qa.select('DOC-B'));await page.evaluate(()=>window.qa.select('DOC-A'));await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();await ready();assert.equal(await field('Số đơn').inputValue(),'ACKNOWLEDGED A');assert.equal((await calls()).execute.length,1);
   await review();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await unknown();assert.notEqual((await calls()).execute[1].expectedStateEqualityToken,'A'.repeat(64));assert.notEqual((await calls()).execute[1].operationId,(await calls()).execute[0].operationId);
  });
  await run('same-session revocation hides data and fences ignored cancellation, retaining custody for restoration',async()=>{
   await reset({mode:'controlled'});await field('Số đơn').fill('REVOKED');await save();await page.waitForFunction(()=>window.qa.calls().execute.length===1);await page.evaluate(()=>window.qa.revoke());await page.waitForFunction(()=>!document.querySelector('form'));await page.evaluate(()=>window.qaExecuteResolve());assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);await page.evaluate(()=>window.qa.restore());await unknown();await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await confirm();await ready();assert.equal((await calls()).execute.length,1);
  });
  await run('logout/new session retires ignored late ACK and callback',async()=>{
   await reset({mode:'controlled'});await field('Số đơn').fill('OLD SESSION');await save();await page.waitForFunction(()=>window.qa.calls().execute.length===1);await page.evaluate(()=>window.qa.logout());await page.waitForFunction(()=>!document.querySelector('form'));await reset();await page.evaluate(()=>window.qaExecuteResolve());await page.waitForTimeout(30);assert.equal(await field('Số đơn').inputValue(),'SOURCE A');assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0);assert.equal(await page.evaluate(()=>window.qaCallbacks.length),0);assert.doesNotMatch(await page.locator('body').innerText(),/OLD SESSION/);
  });
  await run('late read from retired selection cannot revive previous document',async()=>{
   await page.evaluate(()=>window.qa.reset({holdReadDocument:'DOC-A'}));await page.waitForFunction(()=>typeof window.qaReadResolve==='function');await page.evaluate(()=>window.qa.select('DOC-B'));await ready();assert.equal(await field('Số đơn').inputValue(),'SOURCE B');await page.evaluate(()=>window.qaReadResolve());await page.waitForTimeout(30);assert.equal(await field('Số đơn').inputValue(),'SOURCE B');
  });
   await run('stale post-Save snapshot cannot unlock another command or erase receipt',async()=>{
    await reset({staleReadback:true});await field('Số đơn').fill('ACK NEW');await save();await confirm();
    await page.waitForFunction(()=>document.body.textContent.includes('snapshot tải lại chưa khớp xác nhận'));
    assert.equal(await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).isDisabled(),true);
    assert.equal((await calls()).execute.length,1);assert.equal((await calls()).reconcile.length,0);
    await page.evaluate(()=>window.qa.healthy());await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();
    assert.equal(await field('Số đơn').inputValue(),'ACK NEW');assert.equal((await calls()).execute.length,1);
   });
   await run('late A→B→A read cannot revive old A data or enable stale controls',async()=>{
    await reset();await page.evaluate(()=>window.qa.holdReads('DOC-A'));await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();
    await page.waitForFunction(()=>window.qaHeldReads.length===1);await page.evaluate(()=>window.qa.select('DOC-B'));await ready();
    await page.evaluate(()=>window.qa.mutateOrder('FRESH A'));await page.evaluate(()=>window.qa.select('DOC-A'));
    await page.waitForFunction(()=>window.qaHeldReads.length===2);assert.equal(await page.locator('form').count(),0);
    await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForTimeout(30);assert.equal(await page.locator('form').count(),0);
    await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();assert.equal(await field('Số đơn').inputValue(),'FRESH A');
   });
   await run('capability change restarts a cancelled read even while canRead remains true',async()=>{
    await page.evaluate(()=>window.qa.reset({holdReadDocument:'DOC-A'}));await page.waitForFunction(()=>window.qaHeldReads.length===1);
    await page.evaluate(()=>window.qa.rights({canSend:false}));await page.waitForFunction(()=>window.qaHeldReads.length===2);
    await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForTimeout(30);assert.equal(await page.locator('form').count(),0);
    await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();await review();
    assert.equal(await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).isDisabled(),true);
   });
   await run('adapter replacement preserves a dirty draft only after a matching fresh read',async()=>{
    await reset();await field('Số đơn').fill('KEEP MY EDIT');await page.evaluate(()=>window.qa.replaceAdapter());
    await page.waitForFunction(()=>window.qa.calls().read.length===2);await ready();assert.equal(await field('Số đơn').inputValue(),'KEEP MY EDIT');
    await save();await confirm();await ready();assert.equal((await calls()).execute[0].header.orderNumber,'KEEP MY EDIT');
   });
   await run('permission refresh with changed server state preserves dirty input in conflict',async()=>{
    await reset();await field('Số đơn').fill('UNSAVED');await page.evaluate(()=>{window.qa.mutateOrder('CONCURRENT');window.qa.rights({canSend:false});});
    await page.waitForFunction(()=>document.body.textContent.includes('Bản sửa chưa lưu được giữ nguyên'));
    assert.equal(await field('Số đơn').inputValue(),'UNSAVED');assert.equal(await field('Số đơn').isDisabled(),true);
    await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();assert.equal(await field('Số đơn').inputValue(),'CONCURRENT');
    assert.equal(await page.evaluate(()=>window.qaConfirms),1);assert.equal((await calls()).execute.length,0);
   });
   await run('choosing B after a rejected A command starts a fresh B read',async()=>{
    await reset({mode:'Rejected'});await field('Số đơn').fill('REJECT A');await save();
    await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='failed');
    await page.evaluate(()=>window.qa.select('DOC-B'));await ready();assert.equal(await field('Số đơn').inputValue(),'SOURCE B');
   });
   await run('cancelled Send preflight cannot execute after A→B→A',async()=>{
    await reset();await review();await page.evaluate(()=>window.qa.holdReads('DOC-A'));await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();
    await page.waitForFunction(()=>window.qaHeldReads.length===1);await page.evaluate(()=>window.qa.select('DOC-B'));await ready();
    await page.evaluate(()=>window.qa.select('DOC-A'));await page.waitForFunction(()=>window.qaHeldReads.length===2);
    await page.evaluate(()=>window.qaHeldReads[0].resolve());await page.waitForTimeout(30);assert.equal((await calls()).execute.length,0);
    await page.evaluate(()=>window.qaHeldReads[1].resolve());await ready();assert.equal((await calls()).execute.length,0);
   });
   await run('reconcile double tap uses one original; retired reconcile response is ignored',async()=>{
    await reset({mode:'lost',holdReconcile:true});await field('Số đơn').fill('ORIGINAL');await save();await unknown();
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Kiểm tra yêu cầu gốc');b.click();b.click();});
    await page.waitForFunction(()=>window.qa.calls().reconcile.length===1);await page.evaluate(()=>window.qa.select('DOC-B'));await unknown();
    await page.evaluate(()=>window.qaReconcileResolve());await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>window.qaCallbacks.length),0);
    assert.equal((await calls()).execute.length,1);assert.equal((await calls()).sameOriginal[0],true);
   });
   await run('read-only document fields do not remove a separately granted Send right',async()=>{
    await reset();await page.evaluate(()=>window.qa.rights({canSave:false}));await page.waitForFunction(()=>window.qa.calls().read.length===2);await ready();
    assert.equal(await field('Số đơn').isDisabled(),true);await review();assert.equal(await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).isEnabled(),true);
   });
   await run('invalid Send-only note cannot block a separate Save',async()=>{
    await reset();await field('Số đơn').fill('SEPARATE');await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill('n'.repeat(201));
    await review();assert.equal(await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).isEnabled(),true);
    assert.equal(await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await confirm();await ready();assert.equal((await calls()).execute[0].note,null);
   });
   await run('parent callback cannot mutate acknowledged receipt and readback barrier',async()=>{
    await reset();await page.evaluate(()=>window.qa.mutateCallback());await field('Số đơn').fill('IMMUTABLE ACK');await save();await confirm();await ready();
    assert.equal(await page.evaluate(()=>window.qaCallbacks[0].documentId),'DOC-A');assert.equal((await calls()).execute.length,1);
   });
   await run('multiline source text is rendered without single-line input truncation',async()=>{
    await reset({multiline:true});assert.equal(await field('Ghi chú').evaluate(element=>element.tagName),'TEXTAREA');
    await field('Số đơn').fill('MULTILINE');await save();await confirm();await ready();
    assert.equal((await calls()).execute[0].header.notes,'line1\r\nline2');assert.equal((await calls()).execute[0].header.departurePoint,'FROM\nTO');
   });
   await run('validation jumps to an invalid row on another page without dropping rows',async()=>{
    await reset({count:26});await field('Số lượng bộ theo chứng từ').first().fill('1e3');await page.getByRole('button',{name:'Dòng tiếp',exact:true}).click();
    await review();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-invalid')==='true');
    assert.match(await page.locator('form').innerText(),/Trang 1\/2/);assert.match(await page.locator('form').innerText(),/giữ đủ 26 dòng/);assert.equal((await calls()).execute.length,0);
   });
   for(const width of [320,360,390])await run('mobile viewport '+width+'px has no horizontal overflow',async()=>{
    await reset({longIdentifiers:true});await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.setViewportSize({width:390,height:844});
   });
  await run('complete500line pagination preserves aggregate and edits last row without truncation',async()=>{
   await reset({count:500});for(let i=1;i<20;i++)await page.getByRole('button',{name:'Dòng tiếp',exact:true}).click();assert.match(await page.locator('form').innerText(),/giữ đủ 500 dòng/);await page.locator('[id="inbound-detail-row%3AROW-500-itemId"]').fill('LAST-ROW');await save();await confirm();await ready();const c=(await calls()).execute[0];assert.equal(c.detailUpserts.length,1);assert.equal(c.detailUpserts[0].rowId,'ROW-500');assert.deepEqual(c.removedDetailIds,[]);assert.match(await page.locator('form').innerText(),/500 dòng đầy đủ/);
  });
  await run('byte bound rejects before dispatch without dropping input or replacing keys',async()=>{
   await reset({maxCommandBytes:100});await field('Số đơn').fill('PRESERVE LARGE INPUT');await save();await page.waitForFunction(()=>document.body.textContent.includes('vượt giới hạn truyền'));assert.equal((await calls()).execute.length,0);assert.equal(await field('Số đơn').inputValue(),'PRESERVE LARGE INPUT');
  });
  await run('send-note input is guarded on refresh and never carried to another document',async()=>{
   await reset();await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill('A ONLY NOTE');
   await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>window.qaConfirms),1);assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),true);
   await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill('A ONLY NOTE');const dialog=await navigationDialog(true,false);await dialog.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.waitForFunction(()=>window.qaLeft===true&&window.qa.calls().read.includes('DOC-B')&&document.getElementById('inbound-header-orderNumber')?.value==='SOURCE B');await ready();assert.equal(await field('Số đơn').inputValue(),'SOURCE B');assert.equal(await field('Ghi chú gửi kho NULL').isChecked(),true);
   await review();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await confirm();assert.equal((await calls()).execute[0].documentId,'DOC-B');assert.equal((await calls()).execute[0].note,null);
  });
  await run('maximum-width source row identities remain readable within390px',async()=>{
   await reset({longIdentifiers:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);assert.equal(await page.locator('legend').filter({hasText:'R'.repeat(50)}).count(),0);assert.equal(await page.getByRole('button',{name:'Xóa dòng 1',exact:true}).evaluate(element=>element.getBoundingClientRect().right<=390),true);
  });
  await run('390px layout, keyboard and honest Create/cost limits',async()=>{
   await reset();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);assert.match(await page.locator('body').innerText(),/2 dòng chi phí được giữ nguyên, chỉ đọc/);assert.equal(await field('Số đơn').evaluate(element=>element.getBoundingClientRect().height>=44),true);await field('Số đơn').focus();assert.equal(await field('Số đơn').evaluate(element=>element===document.activeElement),true);await page.screenshot({path:path.join(output,'synthetic-mobile-inbound.png'),fullPage:true});await page.evaluate(()=>window.qa.select(null));await page.waitForFunction(()=>document.body.textContent.includes('Tạo mới chưa được mở'));assert.equal((await calls()).execute.length,0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify({node:process.version,browser:browser.version(),status:results.every(result=>result.status==='PASS')?'PASS':'FAIL',viewport:{width:390,height:844},cases:results,uncaughtErrors:errors,externalRequests:external,scope:'Synthetic React/injected adapters only; no camera, SQL, private configuration or production transport.'},null,2));
 }finally{await context?.close();await browser?.close();server.close();await once(server,'close');}
});
