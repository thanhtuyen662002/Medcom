import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {act,create} from 'react-test-renderer';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','i48-reference');
await mkdir(output,{recursive:true});
await build({stdin:{contents:`export * from "./lib/erp/purchase-reference-context";export * from "./components/erp/purchase-reference-details";export {freezePurchaseCommand,commandPurchaseSnapshot} from "./lib/erp/purchase-request-command-adapter";`,resolveDir:app,loader:'tsx'},outfile:path.join(output,'context.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning'});
const {createPurchaseReferenceController:controller,PurchaseReferenceDetails,freezePurchaseCommand,commandPurchaseSnapshot}=await import(pathToFileURL(path.join(output,'context.mjs')));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const audit=[];
after(async()=>{await writeFile(path.join(output,'call-count.json'),JSON.stringify(audit,null,2));});
const input=(patch={})=>({scopeKey:'a'.repeat(64),readIdentity:'session-A-selection-1',authorityKey:'authority-A',documentId:'DOC-A',allowed:true,presentationAllowed:true,purposeId:7,currencyId:'USD',...patch});
const purpose=(id='7',label='Synthetic purpose')=>({id,label});
const currency=(id='USD',name='Synthetic currency',rate=-2.5)=>({id,label:id,currencyName:name,rateExchange:rate});
const page=(items=[],hasMore=false,n=1)=>({available:true,reason:null,items,page:n,hasMore});
const urlOf=url=>new URL(url,'http://synthetic.invalid');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
async function fixture(fn,run){
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{const query=Object.fromEntries(urlOf(url).searchParams);calls.push({query,init,url:String(url)});
  const reply=await fn(query,calls.length,init);
  return reply instanceof Response?reply:Response.json({scopeKey:'a'.repeat(64),data:reply});
 };
 try{await run(calls);}finally{audit.push({count:calls.length,calls:calls.map(c=>({query:c.query,method:c.init.method??'GET',aborted:c.init.signal?.aborted??false}))});globalThis.fetch=saved;}
}
test('exact matching, explicit later page, null/empty label, finite catalog rate; immutable readback and command',async()=>{
 const raw=frozen({document:{purchaseRequestId:'DOC-A',branchId:'BR-A',header:{purposeId:7,currencyId:'USD',rateExchange:9.125,purchaseDate:null,personSuggest:'A',department:'B',purposeDescOrClient:null,price:null,notes:null,objectId:'O'},statusId:1,isLocked:false,lines:[]},stateToken:'prs1.'+'b'.repeat(64)});
 const before=JSON.stringify(raw),initial=commandPurchaseSnapshot(raw),intent={intentId:'abcdef',documentId:'DOC-A',expectedVersion:raw.stateToken,action:'saveDraft',values:initial.values};
 const command=freezePurchaseCommand(raw,intent);
 await fixture(async q=>q.kind==='purposes'?page([purpose(q.page==='1'?'17':'7',q.page==='1'?'contains 7':null)],q.page==='1',+q.page):page([currency('usd'),currency('USD','',0)]),async calls=>{
  const c=controller(frozen(input()),()=>{});c.start();await tick();
  assert.equal(c.snapshot().purpose.status,'unresolved');assert.equal(c.snapshot().purpose.reason,'partial');
  assert.equal(c.snapshot().currency.value.currencyName,'');assert.equal(c.snapshot().currency.value.rateExchange,0);
  assert.equal(calls.length,2);c.continue('purposes');await tick();
  assert.equal(c.snapshot().purpose.status,'resolved-null-label');assert.equal(c.snapshot().purpose.value.label,null);
  assert.equal(calls.length,3);assert.equal(calls[2].query.search,'7');assert.equal(calls[2].query.page,'2');
  for(const call of calls){assert.ok(!call.init.method||call.init.method==='GET');assert.ok(call.query.search.length<=100);assert.ok(+call.query.page>=1&&+call.query.page<=1000);}
  c.dispose();
 });
 assert.equal(JSON.stringify(raw),before);assert.equal(raw.document.header.rateExchange,9.125);
 assert.equal(freezePurchaseCommand(raw,intent).json,command.json);
 for(const label of ['',null,'  Source name  '])await fixture(async q=>page([q.kind==='purposes'?purpose('7',label):currency('USD','source',-1.2345678901234567)]),async()=>{
  const c=controller(input(),()=>{});c.start();await tick();assert.equal(c.snapshot().purpose.value.label,label);assert.equal(c.snapshot().currency.value.rateExchange,-1.2345678901234567);c.dispose();
 });
});
test('case/padding/substrings/labels never resolve; null purpose skips lookup; unavailable versus exhausted',async()=>{
 await fixture(async q=>q.kind==='purposes'?page([purpose('17','7')]):page([currency('usd'),currency(' US','USD')]),async()=>{
  const c=controller(input(),()=>{});c.start();await tick();
  for(const value of [c.snapshot().purpose,c.snapshot().currency])assert.equal(value.reason,'exhausted');c.dispose();
 });
 await fixture(async()=>({available:false,reason:'source_binding_unqualified',items:[],page:1,hasMore:false}),async calls=>{
  const c=controller(input({purposeId:null}),()=>{});c.start();await tick();
  assert.equal(c.snapshot().purpose.status,'no-selection');assert.equal(c.snapshot().currency.status,'unavailable');assert.equal(calls.length,1);c.dispose();
 });
 for(const patch of [{allowed:false},{presentationAllowed:false},{scopeKey:null},{readIdentity:null},{authorityKey:null},{documentId:null}])
  await fixture(async()=>assert.fail('inactive requested'),async calls=>{const c=controller(input(patch),()=>{});c.start();await tick();assert.equal(calls.length,0);assert.equal(c.snapshot().currency.status,'inactive');c.dispose();});
 await fixture(async()=>assert.fail('invalid requested'),async calls=>{
  const c=controller(input({purposeId:2147483648,currencyId:'X'.repeat(101)}),()=>{});c.start();await tick();assert.equal(calls.length,0);assert.equal(c.snapshot().purpose.reason,'invalid-id');c.dispose();
 });
});
test('bounded page/click/retry budgets, duplicate protection across pages and malformed single page',async()=>{
 await fixture(async q=>page([purpose(String(+q.page+100))],true,+q.page),async calls=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();assert.equal(calls.length,1);
  for(let i=0;i<9;i++){c.continue('purposes');c.continue('purposes');await tick();}
  assert.equal(calls.length,5);assert.equal(c.snapshot().purpose.reason,'page-limit');assert.equal(c.snapshot().purpose.progress.hasMore,true);c.dispose();
 });
 await fixture(async q=>page([purpose('7')],true,+q.page),async()=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();assert.equal(c.snapshot().purpose.status,'resolved');
  c.continue('purposes');await tick();assert.equal(c.snapshot().purpose.reason,'ambiguous');assert.equal('value' in c.snapshot().purpose,false);assert.equal(c.snapshot().purpose.progress.canContinue,false);c.dispose();
 });
 await fixture(async()=>page([purpose(),purpose()]),async()=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();assert.equal(c.snapshot().purpose.failure,'response');c.dispose();
 });
 await fixture(async()=>new Response('{}',{status:503}),async calls=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();
  for(let i=0;i<10;i++){c.retry('purposes');c.retry('purposes');await tick();}
  assert.equal(calls.length,6);assert.equal(c.snapshot().purpose.progress.canRetry,false);c.dispose();
 });
 let attempts=0;
 await fixture(async()=>++attempts===1?new Response('{}',{status:503}):page([purpose()]),async calls=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();c.retry('purposes');await tick();
  assert.equal(c.snapshot().purpose.status,'resolved');assert.deepEqual(calls.map(c=>c.query.page),['1','1']);c.dispose();
 });
 for(const [status,failure] of [[401,'authentication'],[403,'authority'],[409,'scope']])await fixture(async()=>new Response(JSON.stringify({code:'private_sql_diagnostic'}),{status}),async()=>{
  const c=controller(input({currencyId:''}),()=>{});c.start();await tick();assert.equal(c.snapshot().purpose.failure,failure);assert.equal(c.snapshot().purpose.progress.canRetry,false);c.dispose();
 });
});
test('actual component lifetime: A→B→A, identity/authority/visibility/candidates/logout retire and mask late fetches',async()=>{
 const held=[],contexts=[];let renderer,props=input();
 await fixture((q,number,init)=>new Promise(resolve=>held.push({q,number,init,resolve})),async calls=>{
  const mount=next=>act(async()=>{props=next;const element=React.createElement(PurchaseReferenceDetails,{...props,documentRateExchange:9.125,onContextChange:value=>contexts.push(value)});if(renderer)renderer.update(element);else renderer=create(element);});
  await mount(props);assert.equal(calls.length,2);
  // A→B→A batched by root still rotates its controlled selection incarnation.
  await mount(input({readIdentity:'selection-3',documentId:'DOC-A'}));assert.equal(calls.length,4);
  for(const change of [{documentId:'DOC-B',readIdentity:'selection-4'},{authorityKey:'authority-B'},{scopeKey:'b'.repeat(64),readIdentity:'session-B'},
   {purposeId:8,currencyId:'EUR'},{presentationAllowed:false},{presentationAllowed:true,readIdentity:'visibility-return'},{allowed:false}]){
   await mount({...props,...change});
  }
  assert.equal(renderer.toJSON(),null);
  assert.ok(held.every(h=>h.init.signal.aborted));
  await act(async()=>{for(const h of held)h.resolve(page([h.q.kind==='purposes'?purpose(h.q.search):currency(h.q.search)]));await tick();});
  assert.equal(renderer.toJSON(),null);assert.equal(contexts.at(-1).purpose.status,'inactive');
  assert.ok(contexts.every(c=>!['resolved','resolved-null-label'].includes(c.purpose.status)));
  await act(async()=>renderer.unmount());assert.equal(calls.length,held.length);
 });
});
test('actual component retains read-only stored rate and safe failure presentation',async()=>{
 await fixture(async q=>q.kind==='purposes'?new Response('{"code":"private SQL secret"}',{status:503}):page([currency('USD','',-2)]),async()=>{
  let r;await act(async()=>{r=create(React.createElement(PurchaseReferenceDetails,{...input(),documentRateExchange:9.125}));await tick();});
  const text=JSON.stringify(r.toJSON());assert.match(text,/9.125/);assert.match(text,/hiện tại: /);assert.doesNotMatch(text,/private SQL secret/);
  assert.equal(r.root.findAllByType('input').length,0);assert.equal(r.root.findAllByType('select').length,0);
  await act(async()=>r.unmount());
 });
});

test('actual hook discards previously resolved state through permission loss/recovery and ignores prop object churn',async()=>{
 let held=false,queue=[],r,props=input();
 await fixture(async q=>held?new Promise(resolve=>queue.push({q,resolve})):page([q.kind==='purposes'?purpose():currency()]),async calls=>{
  const mount=async patch=>{props={...props,...patch};await act(async()=>{const e=React.createElement(PurchaseReferenceDetails,{...props,documentRateExchange:9.125});if(r)r.update(e);else r=create(e);await tick();});};
  await mount({});assert.match(JSON.stringify(r.toJSON()),/Synthetic purpose/);assert.equal(calls.length,2);
  await mount({});assert.equal(calls.length,2,'object churn must not refetch');
  await mount({presentationAllowed:false});assert.equal(r.toJSON(),null);
  held=true;await mount({presentationAllowed:true});assert.equal(calls.length,4);
  assert.doesNotMatch(JSON.stringify(r.toJSON()),/Synthetic purpose/);assert.match(JSON.stringify(r.toJSON()),/Đang đọc/);
  await act(async()=>{queue.forEach(({q,resolve})=>resolve(page([q.kind==='purposes'?purpose('7',null):currency('USD','new',0)])));await tick();});
  assert.match(JSON.stringify(r.toJSON()),/NULL/);
  await act(async()=>r.unmount());
 });
});
