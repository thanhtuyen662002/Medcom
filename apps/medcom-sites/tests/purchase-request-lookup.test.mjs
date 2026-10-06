import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Execute the real API module, including its shared fetch and Zod parser. These
// synthetic transport fixtures do not establish SQL or browser/runtime admission.
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','i32-purchase-lookup');
await mkdir(output,{recursive:true});
await build({stdin:{contents:'export {getPurchaseLookup,getPurchaseWorkspace} from "./lib/erp/purchase-request-api"; export {ApiError} from "./lib/erp/api";',resolveDir:app,loader:'ts'},outfile:path.join(output,'api.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
const {getPurchaseLookup,getPurchaseWorkspace,ApiError}=await import(pathToFileURL(path.join(output,'api.mjs')).href);
const scope='a'.repeat(64),kinds=['branches','items','objects','purposes','currencies'];
const choice={branches:{id:'QA-A',label:'QA-A'},purposes:{id:'-7',label:'  SYNTHETIC purpose  '},currencies:{id:'QAX',label:'QAX',currencyName:'  SYNTHETIC currency  ',rateExchange:-1.2345678901234567}};
const page=(items=[],patch={})=>({available:true,reason:null,items,page:1,hasMore:false,...patch});
const unavailable=(patch={})=>page([],{available:false,reason:'source_binding_unqualified',...patch});
const body=data=>({scopeKey:scope,data});
const reply=data=>Response.json(body(data));
const invalid=error=>error instanceof ApiError&&error.status===502&&error.code==='invalid_api_response';
async function withFetch(fetch,run){const original=globalThis.fetch;globalThis.fetch=fetch;try{return await run();}finally{globalThis.fetch=original;}}
async function rejectPage(kind,data){await withFetch(async()=>reply(data),()=>assert.rejects(getPurchaseLookup(scope,kind,'',1),invalid));}

test('branches retain the existing two-field JSON and bounded page contract',async()=>{
 const data=page([{id:'QA-A',label:'QA-A'},{id:'QA-B',label:'  Existing branch label  '}],{page:2,hasMore:true});
 await withFetch(async()=>reply(data),async()=>{
  const actual=await getPurchaseLookup(scope,'branches','',2);
  assert.deepEqual(actual,data);
  for(const item of actual.items)assert.deepEqual(Object.keys(item).sort(),['id','label']);
 });
 const boundary=page(Array.from({length:20},(_,index)=>({id:`QA-${index}`,label:'B'.repeat(100)})),{page:1000});
 await withFetch(async()=>reply(boundary),async()=>assert.deepEqual(await getPurchaseLookup(scope,'branches','',1000),boundary));
});

test('purpose choices preserve NULL, empty and spaced names and canonical full-range Int32 IDs',async()=>{
 const data=page([{id:'-2147483648',label:null},{id:'-1',label:''},{id:'0',label:'  Synthetic purpose  '},{id:'2147483647',label:'😀'.repeat(25)}]);
 await withFetch(async()=>reply(data),async()=>{
  assert.deepEqual(await getPurchaseLookup(scope,'purposes','',1),data);
  assert.equal(data.items[0].label,null);
  assert.equal(data.items[2].label,'  Synthetic purpose  ');
 });
});

test('currencies retain exact source names, identity display and finite rates of either sign',async()=>{
 for(const rate of [-Number.MAX_VALUE,-2.75,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,1.2345678901234567,Number.MAX_VALUE]){
  const data=page([{...choice.currencies,currencyName:rate===0?'':'  SYNTHETIC Việt Nam  ',rateExchange:rate}]);
  // JSON supports -0. Do not let the fixture stringify it to +0 first.
  const json=JSON.stringify(body(data)).replace('"rateExchange":0',Object.is(rate,-0)?'"rateExchange":-0':'"rateExchange":0');
  await withFetch(async()=>new Response(json),async()=>{
   const actual=await getPurchaseLookup(scope,'currencies','',1);
   assert.deepEqual(actual,data);
   assert.ok(Object.is(actual.items[0].rateExchange,rate));
   assert.equal(actual.items[0].label,actual.items[0].id);
  });
 }
 // Identifier permits source-leading spaces; never trim them into another ID.
 const data=page([{id:' Q',label:' Q',currencyName:'😀'.repeat(50),rateExchange:0}]);
 await withFetch(async()=>reply(data),async()=>assert.deepEqual(await getPurchaseLookup(scope,'currencies','',1),data));
});

test('purpose IDs reject noncanonical numbers, aliases, wrong types and values outside Int32',async()=>{
 for(const id of ['', '00','01','-0','-01','+1',' 1','1 ','1.0','1e0','１','2147483648','-2147483649','999999999999999999999',1,null]){
  await rejectPage('purposes',page([{id,label:null}]));
 }
 for(const label of [undefined,42,false,{},[], 'x'.repeat(51),'\0','\ud800','\udc00'])await rejectPage('purposes',page([{id:'1',label}]));
 for(const extra of [{currencyName:null},{rateExchange:null},{currencyName:'Synthetic',rateExchange:1},{purposeId:1}])await rejectPage('purposes',page([{...choice.purposes,...extra}]));
});

test('currency parsing rejects missing, malformed, oversize or substituted source fields',async()=>{
 for(const id of ['', 'ABCD','   ','Q ','Q\u0085','Q\u00a0','Q\u2003','Q\n','Q\u007f','\0Q','\ud800',null,1])await rejectPage('currencies',page([{...choice.currencies,id,label:id}]));
 for(const label of [undefined,null,1,'','QAY','qax','QAX '])await rejectPage('currencies',page([{...choice.currencies,label}]));
 for(const currencyName of [undefined,null,1,false,{},[],'x'.repeat(101),'\0','\ud800'])await rejectPage('currencies',page([{...choice.currencies,currencyName}]));
 for(const rateExchange of [undefined,null,'1','0','-2',false,{},[],Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY])await rejectPage('currencies',page([{...choice.currencies,rateExchange}]));
 for(const rate of ['1e400','-1e400']){
  const json=JSON.stringify(body(page([choice.currencies]))).replace('"rateExchange":-1.2345678901234567',`"rateExchange":${rate}`);
  await withFetch(async()=>new Response(json),()=>assert.rejects(getPurchaseLookup(scope,'currencies','',1),invalid));
 }
 await rejectPage('currencies',page([{...choice.currencies,displayId:'QAX'}]));
 // Names and IDs cannot stand in for the currency fields or a different kind.
 await rejectPage('currencies',page([{id:'QAX',label:'QAX'}]));
 await rejectPage('purposes',page([choice.currencies]));
 await rejectPage('branches',page([choice.currencies]));
});

test('all qualified kinds reject duplicate IDs, extra fields and oversize pages',async()=>{
 for(const kind of Object.keys(choice)){
  const item=choice[kind];
  await rejectPage(kind,page([item,{...item}]));
  await rejectPage(kind,page([item,{...item,...(kind==='currencies'?{rateExchange:9}:{label:'different source label'})}]));
  await rejectPage(kind,page(Array.from({length:21},(_,index)=>kind==='currencies'?{...item,id:`Q${index}`,label:`Q${index}`}:{...item,id:String(index)})));
  await rejectPage(kind,page([{...item,extra:'unexpected'}]));
  await rejectPage(kind,page([{...item,id:undefined}]));
  await rejectPage(kind,page([{...item,label:undefined}]));
  await rejectPage(kind,{...page([item]),extra:true});
 }
 for(const item of [{id:'',label:'branch'},{id:'x'.repeat(101),label:'branch'},{id:'QA',label:'x'.repeat(101)},{id:'QA',label:null},{id:1,label:'branch'}, {id:'QA',label:'QA',rateExchange:null},{id:'QA',label:'QA',currencyName:null}])await rejectPage('branches',page([item]));
});

test('availability, reasons and unavailable results must remain coherent for every kind',async()=>{
 for(const kind of kinds){
  const data=unavailable();
  await withFetch(async()=>reply(data),async()=>assert.deepEqual(await getPurchaseLookup(scope,kind,'',1),data));
  for(const patch of [{reason:null},{reason:''},{reason:undefined},{reason:1},{reason:'x'.repeat(101)},{hasMore:true},{available:'false'}])await rejectPage(kind,unavailable(patch));
  await rejectPage(kind,unavailable({items:[choice[kind]??choice.branches]}));
  if(choice[kind]){
   for(const reason of ['source_binding_unqualified','',1])await rejectPage(kind,page([choice[kind]],{reason}));
   await withFetch(async()=>reply(page()),async()=>assert.deepEqual(await getPurchaseLookup(scope,kind,'',1),page()));
  }else{
   await rejectPage(kind,page());
   await rejectPage(kind,page([choice.branches]));
  }
 }
});

test('lookup responses require strict envelope, page, collection and flag types',async()=>{
 for(const kind of Object.keys(choice)){
  for(const patch of [{page:0},{page:1001},{page:1.5},{page:'1'},{page:null},{page:undefined},{page:2},{hasMore:undefined},{hasMore:1},{available:undefined},{items:null},{items:{}},{items:undefined},{reason:undefined}])await rejectPage(kind,{...page([choice[kind]]),...patch});
  for(const envelope of [{...body(page([choice[kind]])),extra:true},{data:page([choice[kind]])},{scopeKey:null,data:page([choice[kind]])},{scopeKey:'A'.repeat(64),data:page([choice[kind]])},{scopeKey:scope},{scopeKey:scope,data:null}]){
   await withFetch(async()=>Response.json(envelope),()=>assert.rejects(getPurchaseLookup(scope,kind,'',1),invalid));
  }
 }
});

test('mismatched response scope never exposes either available or unavailable choices',async()=>{
 for(const kind of kinds){
  for(const data of [unavailable(),...(choice[kind]?[page([choice[kind]])]:[])]){
   await withFetch(async()=>Response.json({scopeKey:'b'.repeat(64),data}),()=>assert.rejects(getPurchaseLookup(scope,kind,'',1),error=>error instanceof ApiError&&error.status===409&&error.code==='purchase_scope_changed'));
  }
 }
});

test('all lookup kinds use the existing GET with exact encoded search, page and request fences',async()=>{
 const search='  SYNTHETIC A&B+?=/% €  ',controller=new AbortController();
 for(const kind of kinds){
  const data=choice[kind]?page([choice[kind]],{page:7}):unavailable({page:7});let calls=0;
  await withFetch(async(url,init)=>{
   calls++;const parsed=new URL(url,'https://synthetic.example');
   assert.equal(parsed.pathname,'/api/erp/api/purchase-requests/lookup');
   assert.deepEqual([...parsed.searchParams],[['kind',kind],['search',search],['page','7']]);
   assert.equal(init.method??'GET','GET');assert.equal(init.body,undefined);
   assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.signal,controller.signal);
   return reply(data);
  },async()=>assert.deepEqual(await getPurchaseLookup(scope,kind,search,7,controller.signal),data));
  assert.equal(calls,1);
 }
 await withFetch(async()=>assert.fail('unknown kind must not dispatch'),async()=>{
  for(const kind of ['dbo.SY_User','toString','__proto__','CURRENCIES',undefined])await assert.rejects(getPurchaseLookup(scope,kind,'',1),error=>error instanceof ApiError&&error.status===400&&error.code==='invalid_purchase_lookup');
 });
});

test('late aborts after fetch or body parsing cannot return stale lookup results',async()=>{
 for(const phase of ['before-fetch','after-fetch','after-body']){
  const controller=new AbortController();let calls=0,release,started;
  if(phase==='before-fetch')controller.abort();
  const began=new Promise(resolve=>{started=resolve;});
  await withFetch(async()=>{
   calls++;
   if(phase==='after-fetch'){await new Promise(resolve=>{release=resolve;started();});return reply(page([choice.currencies]));}
   if(phase==='after-body')return {ok:true,json:async()=>{await new Promise(resolve=>{release=resolve;started();});return body(page([choice.currencies]));}};
   assert.fail('already-aborted request must not dispatch');
  },async()=>{
   const pending=getPurchaseLookup(scope,'currencies','',1,controller.signal);
   const rejected=assert.rejects(pending,error=>error.name==='AbortError');
   if(phase!=='before-fetch'){await began;controller.abort();release();}
   await rejected;
  });
  assert.equal(calls,phase==='before-fetch'?0:1);
 }
});

test('HTTP denial, validation, unavailable, bad JSON and network failures remain failures',async()=>{
 for(const status of [400,401,403,404,409,429,500,503]){
  await withFetch(async()=>Response.json({code:'synthetic_error'},{status,headers:{'x-correlation-id':'synthetic-correlation'}}),()=>assert.rejects(getPurchaseLookup(scope,'purposes','',1),error=>error instanceof ApiError&&error.status===status&&error.code==='synthetic_error'&&error.correlationId==='synthetic-correlation'));
 }
 await withFetch(async()=>new Response('invalid JSON'),()=>assert.rejects(getPurchaseLookup(scope,'purposes','',1),invalid));
 await withFetch(async()=>new Response('invalid JSON',{status:503}),()=>assert.rejects(getPurchaseLookup(scope,'purposes','',1),error=>error instanceof ApiError&&error.status===503&&error.code==='request_failed'));
 const network=new TypeError('synthetic network failure');
 await withFetch(async()=>{throw network;},()=>assert.rejects(getPurchaseLookup(scope,'purposes','',1),error=>error===network));
});

test('available reference reads do not replace the workspace write gate',async()=>{
 const workspace={branchIds:['QA-A'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:kinds.map(kind=>({kind,available:!!choice[kind],reason:choice[kind]?null:'source_binding_unqualified',evidence:'synthetic contract fixture'}))};
 await withFetch(async url=>String(url).endsWith('/workspace')?reply(workspace):reply(page([choice.currencies])),async()=>{
  assert.equal((await getPurchaseWorkspace()).data.writeAvailable,false);
  assert.equal((await getPurchaseLookup(scope,'currencies','',1)).available,true);
  assert.deepEqual((await getPurchaseWorkspace()).data,workspace);
 });
});
