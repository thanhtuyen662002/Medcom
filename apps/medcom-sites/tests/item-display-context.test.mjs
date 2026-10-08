import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const output=path.resolve('.test-runtime/i51');await mkdir(output,{recursive:true});
await build({stdin:{contents:`export * from './lib/erp/item-display';export {detailSchema} from './lib/erp/contracts';export {getDetail} from './lib/erp/api';export {getPurchaseDetail,postPurchaseCommand} from './lib/erp/purchase-request-api';export {createInboundRequestApi} from './lib/erp/inbound-request-api';export {freezePurchaseCommand,commandPurchaseSnapshot} from './lib/erp/purchase-request-command-adapter';export {observedView,sameDraft,sameSnapshot,snapshotAcknowledges,commandResult} from './lib/erp/inbound-draft';export {ItemIdentity} from './components/erp/item-identity';`,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(output,'production.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning'});
const p=await import(pathToFileURL(path.join(output,'production.mjs')));
// Complete production decoder from the verified bba926f base, not a reduced schema approximation.
// Pinned inside this allowed test so the regression remains runnable without a second checkout.
const baselineContracts="import {z} from \"zod\";\nconst sessionTimestamp=z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)));\nexport const sessionSchema=z.object({displayName:z.string().min(1).max(250),tenantId:z.string().min(1),companyId:z.string().min(1),companyName:z.string().min(1),authorityVersion:z.number().int().positive(),idleExpiresAt:sessionTimestamp,absoluteExpiresAt:sessionTimestamp,capabilities:z.array(z.string()).max(256)});\nexport const workspaceSchema=z.object({session:sessionSchema,navigation:z.array(z.object({id:z.string(),label:z.string(),href:z.string()})),branchIds:z.array(z.string()).max(200).default([])});\nexport const rowSchema=z.object({documentId:z.string().min(1).max(50),documentDate:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),branchId:z.string().min(1),statusId:z.number().int().nullable(),statusName:z.string().max(100).nullable().optional(),isLocked:z.boolean().nullable()});\nexport const pageSchema=z.object({rows:z.array(rowSchema).max(100),page:z.number().int().positive(),pageSize:z.number().int().positive().max(100),hasMore:z.boolean()});\nconst decimal=z.string().regex(/^-?\\d{1,28}(?:\\.\\d{1,4})?$/).nullable();const line=z.object({lineId:z.string(),itemId:z.string()});\nexport const detailSchema=z.object({document:rowSchema,purchaseOrderLines:z.array(line.extend({quantity:decimal,quantity2:decimal})).max(100),inboundRequestLines:z.array(line.extend({setQuantityByDocument:decimal,barrelQuantityByDocument:decimal,setQuantityByReal:decimal,barrelQuantityByReal:decimal})).max(100),page:z.number().int().positive(),pageSize:z.number().int().positive().max(100),hasMore:z.boolean()});\nexport type Session=z.infer<typeof sessionSchema>;export type WorkspaceData=z.infer<typeof workspaceSchema>&{sessionScope?:string;readScope?:string};export type DocumentRow=z.infer<typeof rowSchema>;export type DocumentPage=z.infer<typeof pageSchema>;export type DocumentDetail=z.infer<typeof detailSchema>;export type DocumentKind=\"purchase-orders\"|\"inbound-requests\";\n";
assert.equal(createHash('sha256').update(baselineContracts).digest('hex'),"3d74df0602a92d37be9a015b0e7c32a1387b748bca381a74b6c2354c880d30d2");
await build({stdin:{contents:baselineContracts,resolveDir:process.cwd(),loader:'ts'},outfile:path.join(output,'baseline-contracts.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
const baseline=await import(pathToFileURL(path.join(output,'baseline-contracts.mjs')));
const scope='a'.repeat(64),signal=()=>new AbortController().signal;
const binding=(patch={})=>({kind:'purchase-requests',documentId:'DOC',branchId:'BR',stateToken:'prs1.'+'b'.repeat(64),statusId:1,isLocked:null,page:null,pageSize:null,...patch});
const lines=n=>Array.from({length:n},(_,i)=>({lineId:`INTERNAL-ROW-${i}`,itemId:'ITEM'}));
const display=(b=binding(),source=lines(1),patch={})=>({...b,lines:source.map(line=>({...line,manufacturerItemCode:'NSX',manufacturerCodeSource:b.kind==='inbound-requests'?'document':'master',itemName:'  Bộ thử nghiệm 😀  ',unit:'base',referenceState:'available',...patch}))});
const purchase=(n=1)=>({document:{purchaseRequestId:'DOC',branchId:'BR',statusId:1,isLocked:null,header:{purchaseDate:'2026-10-06T13:14:15.000',purposeId:1,personSuggest:'Synthetic requester',department:'Synthetic department',purposeDescOrClient:null,price:'15.25',notes:null,currencyId:'VND',objectId:'OBJ',rateExchange:1.25},lines:lines(n).map(line=>({lineId:line.lineId,values:{itemId:line.itemId,budget:null,timeRequired:'',quantity:'999999999999999999',unitPrice:'2',totalPrice:'7',model:null}}))},stateToken:binding().stateToken});
const inbound=(n=1)=>({documentId:'DOC',statusId:1,stateEqualityToken:'A'.repeat(64),costRowCount:0,costEditingSupported:false,header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'Synthetic order',invoiceNo:'',departurePoint:'FROM',destinationPoint:'TO',orderTypeId:'TYPE',branchId:'BR',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:null},details:lines(n).map(line=>({rowId:line.lineId,clientLineId:null,itemId:line.itemId,lotNumberByDocument:'',setQuantityByDocument:'999999999999999999',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'}))});
const inboundBinding=d=>binding({kind:'inbound-requests',stateToken:d.stateEqualityToken});
const access={canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576};
const response=data=>Response.json(data,{headers:{'cache-control':'no-store'}});
async function readPurchase(data,run=()=>p.getPurchaseDetail(scope,'DOC')){const original=globalThis.fetch;globalThis.fetch=async()=>response({scopeKey:scope,data});try{return await run();}finally{globalThis.fetch=original;}}
const inboundApi=(raw,s=scope)=>p.createInboundRequestApi(async()=>response({scopeKey:s,access,data:raw}));
const readInbound=(raw,s=scope)=>inboundApi(raw,s).read('DOC',scope,signal());

// The eight fixtures below produce 32 actual complete-schema comparisons: two
// paged kinds x absent/null metadata x original row-binding cases. Malformed and
// duplicate keys are synthetic robustness fixtures, not asserted production rows.
const originalBindingFixtures=[
 {name:'empty',source:[{lineId:'',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'NUL',source:[{lineId:'bad\0key',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'high-surrogate',source:[{lineId:'\ud800',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'low-surrogate',source:[{lineId:'\udfff',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'over-SQL-bound',source:[{lineId:'x'.repeat(51),itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'over-context-bound',source:[{lineId:'x'.repeat(101),itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]},
 {name:'duplicate-exact',source:[{lineId:'SAME',itemId:'ITEM'},{lineId:'SAME',itemId:'OTHER'}]},
 {name:'ordinary-Unicode-control',source:[{lineId:'ROW-😀',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}]}
];
const pagedData=(kind,source)=>({document:{documentId:'DOC',documentDate:'2026-10-01',branchId:'BR',statusId:1,isLocked:null},page:1,pageSize:50,hasMore:true,
 purchaseOrderLines:kind==='purchase-orders'?source.map(line=>({...line,quantity:'999999999999999999999999.1234',quantity2:null})):[],
 inboundRequestLines:kind==='inbound-requests'?source.map(line=>({...line,setQuantityByDocument:'999999999999999999999999.1234',barrelQuantityByDocument:null,setQuantityByReal:null,barrelQuantityByReal:null})):[]});
test('32 complete baseline versus revised fixtures preserve unsafe/duplicate original rows with absent/null optional context',async()=>{
 const original=globalThis.fetch;let count=0;
 try{
  for(const kind of ['purchase-orders','inbound-requests'])for(const fixture of originalBindingFixtures)for(const raw of [undefined,null]){
   const data=pagedData(kind,fixture.source);if(raw===null)data.itemDisplayContext=null;
   const old=baseline.detailSchema.parse(data),revised=p.detailSchema.parse(data);
   assert.deepEqual(revised.purchaseOrderLines,old.purchaseOrderLines);assert.deepEqual(revised.inboundRequestLines,old.inboundRequestLines);
   assert.deepEqual(revised.document,old.document);assert.equal(revised.itemDisplayContext,raw);
   assert.equal(Object.hasOwn(revised,'itemDisplayContext'),raw===null);
   globalThis.fetch=async()=>Response.json(data,{headers:{'X-Medcom-Session-Scope':scope,'X-Medcom-Read-Scope':scope}});
   assert.deepEqual(await p.getDetail(kind,'DOC',1,signal(),{sessionScope:scope,readScope:scope}),revised);count++;
  }
  assert.equal(count,32);
 }finally{globalThis.fetch=original;}
});
test('supplied contexts remain strict for unsafe/duplicate/foreign original bindings and exact ordinary controls',()=>{
 for(const kind of ['purchase-orders','inbound-requests']){
  const b=binding({kind,stateToken:null,page:1,pageSize:50});
  for(const fixture of originalBindingFixtures){
   const data=pagedData(kind,fixture.source);
   const unavailable=display(b,fixture.source,{manufacturerItemCode:null,manufacturerCodeSource:'unavailable',itemName:null,unit:null,referenceState:'unavailable'});
   assert.equal(p.detailSchema.safeParse({...data,itemDisplayContext:unavailable}).success,fixture.name==='ordinary-Unicode-control');
  }
  const source=[{lineId:'ROW',itemId:'ITEM'},{lineId:'ORDINARY',itemId:'ITEM'}],data=pagedData(kind,source),good=display(b,source);
  assert.equal(p.detailSchema.safeParse({...data,itemDisplayContext:good}).success,true);
  for(const bad of [{...good,documentId:'FOREIGN'},{...good,branchId:'FOREIGN'},{...good,stateToken:'stale'},
   {...good,page:2},{...good,pageSize:20},{...good,lines:[]},{...good,lines:[good.lines[0],good.lines[0]]},
   {...good,lines:[{...good.lines[0],lineId:'FOREIGN'},good.lines[1]]},{...good,lines:[good.lines[1],good.lines[0]]}])
   assert.equal(p.detailSchema.safeParse({...data,itemDisplayContext:bad}).success,false);
 }
});
test('complete baseline versus revised paged decoders retain empty ItemID for absent/null/supplied unavailable context',async()=>{
 const original=globalThis.fetch;
 try{
  for(const kind of ['purchase-orders','inbound-requests'])for(const itemId of ['', 'ITEM'])for(const variant of ['absent','null','unavailable']){
   const source=[{lineId:'EMPTY-OR-CONTROL',itemId},{lineId:'ORDINARY',itemId:'ITEM'}];
   const b=binding({kind,stateToken:null,page:1,pageSize:50});
   const data={document:{documentId:'DOC',documentDate:'2026-10-01',branchId:'BR',statusId:1,isLocked:null},page:1,pageSize:50,hasMore:true,
    purchaseOrderLines:kind==='purchase-orders'?source.map(line=>({...line,quantity:'999999999999999999999999.1234',quantity2:null})):[],
    inboundRequestLines:kind==='inbound-requests'?source.map(line=>({...line,setQuantityByDocument:'999999999999999999999999.1234',barrelQuantityByDocument:null,setQuantityByReal:null,barrelQuantityByReal:null})):[]};
   if(variant==='null')data.itemDisplayContext=null;
   if(variant==='unavailable')data.itemDisplayContext=display(b,source,{manufacturerItemCode:null,manufacturerCodeSource:'unavailable',itemName:null,unit:null,referenceState:'unavailable'});
   const old=baseline.detailSchema.parse(data),revised=p.detailSchema.parse(data);
   assert.deepEqual(revised.document,old.document);assert.deepEqual(revised.purchaseOrderLines,old.purchaseOrderLines);assert.deepEqual(revised.inboundRequestLines,old.inboundRequestLines);
   const context=p.bindItemDisplayContext(revised.itemDisplayContext,b,source);
   assert.equal(context.lines.length,2);assert.equal(context.lines[0].itemId,itemId);assert.equal(context.lines[0].referenceState,'unavailable');
   assert.equal(context.lines[0].manufacturerCodeSource,'unavailable');assert.equal(context.lines[0].manufacturerItemCode,null);assert.equal(context.lines[0].itemName,null);assert.equal(context.lines[0].unit,null);
   globalThis.fetch=async()=>Response.json(data,{headers:{'X-Medcom-Session-Scope':scope,'X-Medcom-Read-Scope':scope}});
   assert.deepEqual(await p.getDetail(kind,'DOC',1,signal(),{sessionScope:scope,readScope:scope}),revised);
  }
 }finally{globalThis.fetch=original;}
});
test('unqualified historical keys retain bytes while reference enrichment stays unavailable and binding guards remain strict',()=>{
 for(const kind of ['purchase-orders','inbound-requests'])for(const itemId of ['', 'x'.repeat(51),'bad\0key','\ud800']){
  const source=[{lineId:'ROW',itemId}],b=binding({kind,stateToken:null,page:1,pageSize:50});
  const data={document:{documentId:'DOC',documentDate:'2026-10-01',branchId:'BR',statusId:1,isLocked:null},page:1,pageSize:50,hasMore:false,
   purchaseOrderLines:kind==='purchase-orders'?source.map(line=>({...line,quantity:'1',quantity2:null})):[],
   inboundRequestLines:kind==='inbound-requests'?source.map(line=>({...line,setQuantityByDocument:'1',barrelQuantityByDocument:null,setQuantityByReal:null,barrelQuantityByReal:null})):[]};
  assert.equal(baseline.detailSchema.safeParse(data).success,true);
  for(const raw of [undefined,null,display(b,source,{manufacturerItemCode:null,manufacturerCodeSource:'unavailable',itemName:null,unit:null,referenceState:'unavailable'})]){
   assert.equal(p.detailSchema.safeParse({...data,...(raw===undefined?{}:{itemDisplayContext:raw})}).success,true);
   const bound=p.bindItemDisplayContext(raw,b,source);assert.equal(bound.lines[0].itemId,itemId);assert.equal(bound.lines[0].referenceState,'unavailable');
   assert.equal(p.itemDisplayFor(bound,b,source[0]).referenceState,'unavailable');
  }
  const unknown=display(b,source,{manufacturerItemCode:null,manufacturerCodeSource:'unavailable',itemName:null,unit:null,referenceState:'unavailable'});
  for(const bad of [display(b,source),{...unknown,documentId:'FOREIGN'},{...unknown,branchId:'FOREIGN'},{...unknown,stateToken:'stale'},
   {...unknown,page:2},{...unknown,lines:[unknown.lines[0],unknown.lines[0]]},{...unknown,lines:[{...unknown.lines[0],lineId:'FOREIGN'}]}])
   assert.equal(p.detailSchema.safeParse({...data,itemDisplayContext:bad}).success,false);
 }
});
test('older absent/null metadata becomes explicit unknowns and leaves complete editable views exact',async()=>{
 for(const context of [undefined,null]){
  const raw=purchase();if(context===null)raw.itemDisplayContext=null;
  const read=await readPurchase(raw);assert.deepEqual(read.document,raw.document);assert.equal(read.itemDisplayContext.lines[0].referenceState,'unavailable');
  const d=inbound(),ir=await readInbound({outcome:'Observed',document:d,...(context===null?{itemDisplayContext:null}:{})});
  assert.deepEqual(ir.data.document,d);assert.deepEqual(p.observedView(ir.data,'DOC'),d);assert.equal(ir.itemDisplayContext.lines[0].manufacturerCodeSource,'unavailable');
 }
});
test('NULL, empty, whitespace and Unicode remain exact in production decoder',async()=>{
 for(const value of [null,'','  Bộ thử nghiệm 😀  ']){
  const context=display(binding(),lines(1),{manufacturerItemCode:value,itemName:value,unit:value});
  assert.deepEqual((await readPurchase({...purchase(),itemDisplayContext:context})).itemDisplayContext,context);
 }
 assert.equal(p.itemDisplayValue(null),'Chưa có thông tin');assert.equal(p.itemDisplayValue(''),'Trống');
});
test('duplicate, foreign, reordered and changed item keys are rejected by actual purchase decoder',async()=>{
 const good=display(binding(),lines(2));
 for(const bad of [{...good,lines:[good.lines[0],good.lines[0]]},{...good,lines:good.lines.slice(0,1)},
  {...good,lines:[good.lines[1],good.lines[0]]},{...good,lines:[{...good.lines[0],lineId:'FOREIGN'},good.lines[1]]},
  {...good,lines:[{...good.lines[0],itemId:'OTHER'},good.lines[1]]},{...good,extra:true}])
  await assert.rejects(readPurchase({...purchase(2),itemDisplayContext:bad}),e=>e.code==='invalid_api_response');
});
test('document, branch, state, page, status, lock and kind mismatch cannot attach context',async()=>{
 for(const patch of [{documentId:'OTHER'},{branchId:'OTHER'},{stateToken:'prs1.'+'c'.repeat(64)},{statusId:2},{isLocked:true},{page:1},{pageSize:20},{kind:'inbound-requests'}]){
  const bad=display({...binding(),...patch});assert.equal(p.itemDisplayFor(bad,binding(),lines(1)[0]).referenceState,'unavailable');
  await assert.rejects(readPurchase({...purchase(),itemDisplayContext:bad}),e=>e.code==='invalid_api_response');
 }
});
test('inbound persisted manufacturer code preserves NULL/empty/differing values and forbids master fallback',async()=>{
 const document=inbound(),b=inboundBinding(document);
 for(const code of [null,'','persisted different']){
  const result=await readInbound({outcome:'Observed',document,itemDisplayContext:display(b,lines(1),{manufacturerItemCode:code})});
  assert.equal(result.itemDisplayContext.lines[0].manufacturerItemCode,code);assert.deepEqual(result.data.document,document);
 }
 for(const patch of [{manufacturerCodeSource:'master'},{manufacturerItemCode:'x'.repeat(51)}])
  await assert.rejects(readInbound({outcome:'Observed',document,itemDisplayContext:display(b,lines(1),patch)}),e=>e.reason==='invalid');
 for(const patch of [{documentId:'OTHER'},{branchId:'OTHER'},{stateToken:'B'.repeat(64)},{statusId:0}])
  await assert.rejects(readInbound({outcome:'Observed',document,itemDisplayContext:display({...b,...patch})}),e=>e.reason==='invalid');
 const good=display(b,lines(2));
 for(const bad of [{...good,lines:[good.lines[0],good.lines[0]]},{...good,lines:[{...good.lines[0],lineId:'FOREIGN'},good.lines[1]]}])
  await assert.rejects(readInbound({outcome:'Observed',document:inbound(2),itemDisplayContext:bad}),e=>e.reason==='invalid');
 await assert.rejects(readInbound({outcome:'Denied',document:null,itemDisplayContext:display(b)}),e=>e.reason==='invalid');
});
test('missing/ambiguous/invalid/unavailable reference states retain identity and permit only coherent unknowns',()=>{
 for(const referenceState of ['missing','ambiguous','invalid','unavailable']){
  const context=display(binding(),lines(1),{referenceState,itemName:null,unit:null,manufacturerItemCode:null,manufacturerCodeSource:'unavailable'});
  assert.equal(p.bindItemDisplayContext(context,binding(),lines(1)).lines[0].itemId,'ITEM');
  const b=binding({kind:'inbound-requests'}),stored=display(b,lines(1),{referenceState,itemName:null,unit:null,manufacturerItemCode:'persisted'});
  assert.equal(p.bindItemDisplayContext(stored,b,lines(1)).lines[0].manufacturerItemCode,'persisted');
 }
 for(const patch of [{referenceState:'missing'},{manufacturerCodeSource:'unavailable'},{referenceState:'invalid',manufacturerCodeSource:'master',itemName:null,unit:null}])
  assert.equal(p.itemDisplayContextSchema.safeParse(display(binding(),lines(1),patch)).success,false);
});
test('field bounds, lone surrogates, NUL and worst-case supplement size are strict',()=>{
 for(const patch of [{manufacturerItemCode:'c'.repeat(101)},{unit:'u'.repeat(51)},{itemName:'n'.repeat(65537)},
  {itemName:'bad\0text'},{unit:'\ud800'},{manufacturerItemCode:'\udfff'}])
  assert.equal(p.itemDisplayContextSchema.safeParse(display(binding(),lines(1),patch)).success,false);
 assert.equal(p.itemDisplayContextSchema.safeParse(display(binding(),lines(1),{manufacturerItemCode:'c'.repeat(100),unit:'u'.repeat(50),itemName:'名'})).success,true);
 assert.equal(p.itemDisplayContextSchema.safeParse(display(binding(),lines(20),{itemName:'n'.repeat(65536)})).success,false);
});
test('20/21, 50/51, 100/101 and 500/501 read limits preserve original precision',async()=>{
 for(const n of [20,21,50,51,100,101,500,501]){
  const raw={...purchase(n),itemDisplayContext:display(binding(),lines(n))};
  const d=inbound(n),ir={outcome:'Observed',document:d,itemDisplayContext:display(inboundBinding(d),lines(n))};
  if(n===501){await assert.rejects(readPurchase(raw));await assert.rejects(readInbound(ir));continue;}
  const pr=await readPurchase(raw),opened=await readInbound(ir);assert.equal(pr.document.lines.length,n);assert.equal(pr.itemDisplayContext.lines.length,n);
  assert.equal(opened.data.document.details.length,n);assert.equal(opened.itemDisplayContext.lines.length,n);
  assert.equal(pr.document.lines.at(-1).values.quantity,'999999999999999999');assert.equal(opened.data.document.details.at(-1).setQuantityByDocument,'999999999999999999');
 }
});
test('actual paged decoder preserves 100-line bound and large-document precision and validates page binding',()=>{
 for(const n of [20,21,50,51,100,101]){
  const b=binding({kind:'purchase-orders',stateToken:null,page:2,pageSize:100});
  const data={document:{documentId:'DOC',documentDate:'2026-10-01',branchId:'BR',statusId:1,isLocked:null},page:2,pageSize:100,hasMore:true,
   purchaseOrderLines:lines(n).map(line=>({...line,quantity:'999999999999999999999999.1234',quantity2:null})),inboundRequestLines:[],itemDisplayContext:display(b,lines(n))};
  const result=p.detailSchema.safeParse(data);assert.equal(result.success,n<=100);
  if(n<=100){assert.equal(result.data.purchaseOrderLines.at(-1).quantity,'999999999999999999999999.1234');
   assert.equal(p.detailSchema.safeParse({...data,itemDisplayContext:display({...b,page:1},lines(n))}).success,false);}
 }
});
test('scope mismatch, canceled stale response and wrong document suppress display context',async()=>{
 const raw={...purchase(),itemDisplayContext:display()},original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>response({scopeKey:'b'.repeat(64),data:raw});await assert.rejects(p.getPurchaseDetail(scope,'DOC'),e=>e.code==='purchase_scope_changed');
  await assert.rejects(readInbound({outcome:'Observed',document:inbound()},'b'.repeat(64)),e=>e.reason==='scope');
  let release;globalThis.fetch=async()=>new Promise(resolve=>{release=resolve;});
  const c=new AbortController(),pending=p.getPurchaseDetail(scope,'DOC',c.signal);c.abort();release(response({scopeKey:scope,data:raw}));await assert.rejects(pending,e=>e.name==='AbortError');
  globalThis.fetch=async()=>response({scopeKey:scope,data:{...raw,document:{...raw.document,purchaseRequestId:'OTHER'}}});await assert.rejects(p.getPurchaseDetail(scope,'DOC'),e=>e.code==='invalid_api_response');
 }finally{globalThis.fetch=original;}
});
test('metadata changes preserve frozen purchase command bytes/key/intent and inbound equality/receipt',()=>{
 const raw=purchase(),decorated={...raw,itemDisplayContext:display()};const snap=p.commandPurchaseSnapshot(raw);
 const intent={intentId:'abcdef',documentId:'DOC',expectedVersion:raw.stateToken,action:'saveDraft',values:snap.values};
 const a=p.freezePurchaseCommand(raw,intent),b=p.freezePurchaseCommand(decorated,intent);
 assert.equal(a.json,b.json);assert.equal(a.signature,b.signature);assert.deepEqual(a.dto,b.dto);assert.deepEqual(a.desired,b.desired);
 assert.equal(a.json.includes('manufacturerItemCode'),false);assert.equal(a.json.includes('itemDisplayContext'),false);
 const d=inbound();assert.deepEqual(p.observedView({outcome:'Observed',document:d},'DOC'),d);assert.equal(p.sameSnapshot(d,structuredClone(d)),true);assert.equal(p.sameDraft(d,d.header,d.details),true);
 const receipt={operationId:'11111111-1111-4111-8111-111111111111',documentId:'DOC',statusId:1,stateEqualityToken:d.stateEqualityToken,auditId:'22222222-2222-4222-8222-222222222222',committedAtUtc:'2026-10-06T00:00:00Z'};
 assert.equal(p.snapshotAcknowledges(d,receipt),true);
 const command={operationId:receipt.operationId,action:'Save',documentId:'DOC',expectedStateEqualityToken:d.stateEqualityToken,header:d.header,detailUpserts:[],removedDetailIds:[],costChanges:[],note:null};
 assert.deepEqual(p.commandResult({outcome:'Committed',receipt,code:null},command,1),{outcome:'Committed',receipt,code:null});
});
test('read performs no POST and original frozen command transport bodies are byte-identical',async()=>{
 const body='{"synthetic":"frozen original"}',original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return response(String(url).endsWith('/csrf')?{token:'synthetic-csrf'}:init?.method==='POST'?{scopeKey:scope,data:{outcome:0,receipt:null}}:{scopeKey:scope,data:{...purchase(),itemDisplayContext:display()}});};
  await p.getPurchaseDetail(scope,'DOC');assert.equal(calls.some(c=>c.init.method==='POST'),false);
  await p.postPurchaseCommand(scope,'save',body,signal());assert.equal(calls.at(-1).init.body,body);
  const inboundCalls=[],api=p.createInboundRequestApi(async(url,init)=>{inboundCalls.push(init);return response(String(url).endsWith('/csrf')?{token:'synthetic-csrf'}:{scopeKey:scope,data:{outcome:'Committed',receipt:null,code:null}});});
  await api.command('save',body,scope,signal(),()=>{});assert.equal(inboundCalls.at(-1).body,body);
 }finally{globalThis.fetch=original;}
});
test('standalone component renders labelled exact fields, unknowns and mobile grouping without internal IDs',()=>{
 const b=binding(),line=lines(1)[0],context=display(b,[line],{manufacturerItemCode:'<script>synthetic</script>',itemName:null,unit:''});
 const html=renderToStaticMarkup(React.createElement(p.ItemIdentity,{binding:b,line,context}));
 for(const label of ['Mã hàng','Mã hàng NSX','Tên hàng / dịch vụ','ĐVT'])assert.ok(html.includes(label));
 assert.ok(html.includes('Chưa có thông tin'));assert.ok(html.includes('Trống'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('grid-cols-1'));assert.ok(html.includes('sm:grid-cols-2'));
 assert.ok(!html.includes(line.lineId));assert.ok(!html.includes('UserAutoID'));assert.equal((html.match(/<dt/g)||[]).length,4);
 const stale=renderToStaticMarkup(React.createElement(p.ItemIdentity,{binding:{...b,documentId:'OTHER'},line,context}));assert.ok(!stale.includes('synthetic'));
});
