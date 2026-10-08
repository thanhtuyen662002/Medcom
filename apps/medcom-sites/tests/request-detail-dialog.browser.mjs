// I43: actual request screens, editors, bridge and NavigationGuardProvider.
// Synthetic HTTP/session data only. No replacement editor or guard logic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','i43-detail-dialog');
const require=createRequire(import.meta.url),scope='a'.repeat(64),session='b'.repeat(64);
const purchase={purchaseRequestId:'QA-001',branchId:'QA-BRANCH',statusId:1,isLocked:false,
 header:{purchaseDate:'2026-10-01T14:22:11.003',purposeId:1,personSuggest:'SYNTHETIC USER',department:'SYNTHETIC',purposeDescOrClient:'Synthetic purpose',price:'1',notes:'',currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1},
 lines:[{lineId:'QA-LINE',values:{itemId:'QA-ITEM',budget:null,timeRequired:null,quantity:'1',unitPrice:'1',totalPrice:'1',model:''}}]};
const inbound={documentId:'QA-001',statusId:0,stateEqualityToken:'C'.repeat(64),costRowCount:0,costEditingSupported:false,
 header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'SYNTHETIC',invoiceNo:'',departurePoint:'FROM',destinationPoint:'TO',orderTypeId:'QA-TYPE',branchId:'QA-BRANCH',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:''},
 details:[{rowId:'QA-ROW',clientLineId:null,itemId:'QA-ITEM',lotNumberByDocument:'QA-LOT',setQuantityByDocument:'1',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'}]};
// The fixed purchase client is strict; the generic inbound list uses a source
// date-only projection. Never combine the two endpoint-specific row shapes.
function dialogList(kind,page){
 const isPurchase=kind==='purchase';
 return {rows:Array.from({length:18},(_,index)=>{
  const common={documentId:'QA-'+String(index+1).padStart(3,'0'),branchId:'QA-BRANCH',statusId:isPurchase?1:0,isLocked:false};
  return isPurchase?{...common,purchaseDate:purchase.header.purchaseDate,personSuggest:'SYNTHETIC',department:'SYNTHETIC'}
   :{...common,documentDate:inbound.header.documentDate.slice(0,10)};
 }),page,pageSize:isPurchase?20:50,hasMore:true};
}
async function runRequiredDialogCase(context,name,body,diagnose){
 context.signal?.throwIfAborted();
 let failure;
 await context.test(name,async()=>{try{await body();}catch(error){failure=error;await diagnose(name,error);throw error;}});
 // node:test resolves a failed child rather than throwing into this loop.
 // Propagate the original failure so setup cannot cascade into 8 x 30s waits.
 if(failure)throw failure;
 context.signal?.throwIfAborted();
}
// A closed/hidden content node does not mean the separate Radix Presence
// overlay has finished its exit animation or released outside pointer state.
async function waitForGuardDismissal(page){
 await page.locator('[data-slot="alert-dialog-content"]').waitFor({state:'detached'});
 await page.locator('[data-slot="alert-dialog-overlay"]').waitFor({state:'detached'});
 await page.waitForFunction(()=>getComputedStyle(document.body).pointerEvents!=='none');
}
// Reuse the exact response bytes/metadata in the browser and decoder checks.
// The inbound transport requires no-store even for bootstrap and CSRF replies.
function dialogJson(status,data,headers={}){
 return {status,data,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}};
}
function dialogApiResponse(m,route,query,method='GET'){
 const headers={'X-Medcom-Session-Scope':session,'X-Medcom-Read-Scope':scope};
 if(route.endsWith('/csrf'))return dialogJson(200,{token:'synthetic-csrf'});
 if(route.endsWith('/workspace'))return dialogJson(200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
 if(['/api/erp/api/purchase-requests','/api/erp/api/documents/inbound-requests'].includes(route)){
  const data=dialogList(route.includes('/documents/')?'inbound':'purchase',Number(query.get('page')));
  return dialogJson(200,route.includes('/documents/')?data:{scopeKey:scope,data},headers);
 }
 if(method==='GET'&&(route.endsWith('/detail')||route.endsWith('/draft'))){
  if(m.detailStatus!==200)return dialogJson(m.detailStatus,{code:'request_failed'});
  const id=query.get('documentId');
  if(route.includes('/purchase-requests/'))return dialogJson(200,{scopeKey:scope,data:{document:{...m.purchase,purchaseRequestId:id},stateToken:'prs1.'+'1'.repeat(64),commandAccess:{canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'available'}}});
  if(route.includes('/documents/'))return dialogJson(200,{document:{documentId:id,branchId:'QA-BRANCH',documentDate:'2026-10-01',statusId:0,isLocked:false},purchaseOrderLines:[],inboundRequestLines:[],page:Number(query.get('page')),pageSize:50,hasMore:false},headers);
  if(m.readOnly)return dialogJson(200,{scopeKey:null,access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},data:{outcome:'Unavailable',document:null}});
  return dialogJson(200,{scopeKey:scope,access:{canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576},data:{outcome:'Observed',document:{...m.inbound,documentId:id}}});
 }
 // Deliberately unknown, never a manufactured successful server receipt.
 if(method==='POST')return dialogJson(503,{code:'backend_unavailable'});
 return dialogJson(404,{code:'request_failed'});
}
test('I43 exact synthetic responses pass real clients and full draft validation; malformed fixtures fail closed',async()=>{
 const {build}=require('esbuild');await mkdir(output,{recursive:true});const file=path.join(output,'fixture-api-contract.mjs');
 await build({absWorkingDir:app,stdin:{contents:'export {getPurchaseList,getPurchaseWorkspace,getPurchaseDetail,getPurchaseLookup,postPurchaseCommand} from "./lib/erp/purchase-request-api";export {getDocuments,getDetail} from "./lib/erp/api";export {createInboundRequestApi} from "./lib/erp/inbound-request-api";export {observedView,buildCommand} from "./lib/erp/inbound-draft";export {createInboundRequestBridge} from "./lib/erp/inbound-request-command-adapter";',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
 const {getPurchaseList,getPurchaseWorkspace,getPurchaseDetail,getPurchaseLookup,postPurchaseCommand,getDocuments,getDetail,createInboundRequestApi,observedView,buildCommand,createInboundRequestBridge}=await import(pathToFileURL(file).href);
 const nativeFetch=globalThis.fetch,calls=[],checked=[],signal=new AbortController().signal,readScope={sessionScope:session,readScope:scope};
 const model={detailStatus:200,readOnly:false,purchase:structuredClone(purchase),inbound:structuredClone(inbound)};let changeReply=reply=>reply;
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url,'http://synthetic.invalid'),method=init.method??'GET';
  const reply=changeReply(dialogApiResponse(model,u.pathname,u.searchParams,method),u);
  calls.push({url:String(url),method,status:reply.status,body:init.body??null});
  return new Response(JSON.stringify(reply.data),{status:reply.status,headers:reply.headers});
 };
 const api=createInboundRequestApi(globalThis.fetch);
 try{
  for(const kind of ['purchase','inbound'])for(const page of [1,2]){
   const data=dialogList(kind,page);
   const actual=kind==='purchase'?await getPurchaseList(scope,page,'',''):await getDocuments('inbound-requests',page,'','',undefined,readScope);
   assert.deepEqual(actual,data);assert.equal(actual.rows.length,18);assert.deepEqual(actual.rows.map(row=>row.documentId),Array.from({length:18},(_,index)=>'QA-'+String(index+1).padStart(3,'0')));
   assert.ok(actual.rows.every(row=>kind==='purchase'?!Object.hasOwn(row,'documentDate'):/^\d{4}-\d{2}-\d{2}$/.test(row.documentDate)));
  }
  checked.push('purchase and inbound list pages 1 and 2, all 18 rows');
  const workspace=await getPurchaseWorkspace();assert.deepEqual(workspace,dialogApiResponse(model,'/api/erp/api/purchase-requests/workspace',new URLSearchParams()).data);
  checked.push('purchase workspace');
  for(const documentId of ['QA-001','QA-018']){
   const detail=await getPurchaseDetail(scope,documentId,signal);assert.deepEqual(detail.document,{...purchase,purchaseRequestId:documentId});
   assert.deepEqual(detail.commandAccess,{canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'available'});
   for(const readKey of [null,scope]){
    const result=await api.read(documentId,readKey,signal);assert.equal(result.scopeKey,scope);
    assert.deepEqual(result.access,{canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576});
    assert.deepEqual(observedView(result.data,documentId),{...inbound,documentId},'The real complete I18 schema must admit every synthetic draft field');
   }
  }
  checked.push('purchase detail, full inbound bootstrap and scoped draft');
  model.readOnly=true;
  const unavailable=await api.read('QA-001',null,signal);
  assert.deepEqual(unavailable,{scopeKey:null,access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},data:{outcome:'Unavailable',document:null},itemDisplayContext:null});
  assert.equal(observedView(unavailable.data,'QA-001'),null);
  for(const page of [1,2]){
   const fallback=await getDetail('inbound-requests','QA-001',page,signal,readScope);
   assert.deepEqual(fallback,dialogApiResponse(model,'/api/erp/api/documents/inbound-requests/detail',new URLSearchParams({documentId:'QA-001',page:String(page)})).data);
  }
  model.readOnly=false;checked.push('unavailable draft and independent read-only fallback');
  // Successful CSRF must reach each original POST; a 503 is intentionally
  // unresolved. Assert the actual clients cannot turn it into a receipt.
  const body=JSON.stringify({synthetic:'original bytes'});
  for(const route of ['save','submit','save/lookup','submit/lookup']){
   const at=calls.length;await assert.rejects(()=>postPurchaseCommand(scope,route,body,signal),error=>error.status===503&&error.code==='backend_unavailable');
   assert.deepEqual(calls.slice(at).map(call=>[call.method,call.status]),[['GET',200],['POST',503]]);assert.equal(calls.at(-1).body,body);
  }
  for(const route of ['save','send','reconcile']){
   let beforeSend=0;const at=calls.length;
   await assert.rejects(()=>api.command(route,body,scope,signal,()=>beforeSend++),error=>error.status===503&&error.reason==='http');
   assert.equal(beforeSend,1);assert.deepEqual(calls.slice(at).map(call=>[call.method,call.status]),[['GET',200],['POST',503]]);assert.equal(calls.at(-1).body,body);
  }
  checked.push('CSRF, purchase and inbound unavailable commands');
  const bridge=createInboundRequestBridge(api);bridge.configure('synthetic-login',api);bridge.select('QA-001');
  try{
   await bridge.revalidate(signal);assert.equal(bridge.getSnapshot().access.canRead,true);
   const view=observedView(await bridge.adapter.read('QA-001',signal),'QA-001');assert.ok(view);
   const command=buildCommand(view,{...view.header,notes:'KEPT THROUGH HIDE'},view.details,'Save',null,'11111111-1111-4111-8111-111111111111'),at=calls.length;
   for(const action of ['execute','reconcile']){
    assert.deepEqual(await bridge.adapter[action](command,signal),{outcome:'OutcomeUnknown',receipt:null,code:null});
    assert.equal(bridge.hasUnresolved(),true);assert.equal(bridge.getSnapshot().phase,'unknown');
   }
   const posts=calls.slice(at).filter(call=>call.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body,JSON.stringify(command));assert.equal(posts[1].body,posts[0].body);
  }finally{bridge.dispose();}
  checked.push('inbound bridge preserves original command custody through 503 and reconcile');
  model.detailStatus=404;
  await assert.rejects(()=>getPurchaseDetail(scope,'QA-001',signal),error=>error.status===404&&error.code==='request_failed');
  await assert.rejects(()=>api.read('QA-001',scope,signal),error=>error.status===404&&error.reason==='http');
  await assert.rejects(()=>getDetail('inbound-requests','QA-001',1,signal,readScope),error=>error.status===404&&error.code==='request_failed');
  model.detailStatus=200;
  await assert.rejects(()=>getPurchaseLookup(scope,'items','',1,signal),error=>error.status===404&&error.code==='request_failed');
  changeReply=()=>dialogJson(500,{code:'synthetic_fixture_error'});
  await assert.rejects(()=>getPurchaseDetail(scope,'QA-001',signal),error=>error.status===500&&error.code==='synthetic_fixture_error');
  await assert.rejects(()=>api.read('QA-001',scope,signal),error=>error.status===500&&error.reason==='http');
  checked.push('detail 404, unmapped 404 and fixture error 500');
  // Reproduce the exact pre-repair metadata omission for draft, unavailable
  // fallback and CSRF, without relaxing the production transport requirement.
  changeReply=reply=>{const headers={...reply.headers};delete headers['Cache-Control'];return {...reply,headers};};
  for(const readOnly of [false,true]){
   model.readOnly=readOnly;await assert.rejects(()=>api.read('QA-001',null,signal),error=>error.status===502&&error.reason==='invalid');
  }
  model.readOnly=false;let beforeSend=0;const beforeCsrf=calls.length;
  await assert.rejects(()=>api.command('save',body,scope,signal,()=>beforeSend++),error=>error.status===502&&error.reason==='invalid');
  assert.equal(beforeSend,0);assert.deepEqual(calls.slice(beforeCsrf).map(call=>call.method),['GET']);
  changeReply=reply=>reply;
  checked.push('missing no-store fails closed before draft/fallback or command dispatch');
  const malformed=structuredClone((await api.read('QA-001',scope,signal)).data);delete malformed.document.header.notes;
  assert.equal(observedView(malformed,'QA-001'),null);malformed.document.header.notes='';malformed.document.details[0].unitPrice=1;
  assert.equal(observedView(malformed,'QA-001'),null);checked.push('full draft rejects incomplete header and numeric decimal');
  // Preserve the exact pre-repair mixed list schema negative regression.
  for(const kind of ['purchase','inbound']){
   const data={rows:Array.from({length:18},(_,index)=>({documentId:'QA-'+String(index+1).padStart(3,'0'),branchId:'QA-BRANCH',purchaseDate:purchase.header.purchaseDate,documentDate:inbound.header.documentDate,personSuggest:'SYNTHETIC',department:'SYNTHETIC',statusId:kind==='purchase'?1:0,isLocked:false})),page:1,pageSize:kind==='purchase'?20:50,hasMore:true};
   changeReply=reply=>({...reply,data:kind==='purchase'?{scopeKey:scope,data}:data});
   await assert.rejects(()=>kind==='purchase'?getPurchaseList(scope,1,'',''):getDocuments('inbound-requests',1,'','',undefined,readScope),error=>error.code==='invalid_api_response');
  }
  checked.push('legacy mixed purchase and inbound list schemas rejected');
  await writeFile(path.join(output,'fixture-api-contract.json'),JSON.stringify({result:'PASS',realClients:true,fullInboundDecoder:true,browserExecuted:false,pages:[1,2],rowsPerPage:18,legacyPurchaseRejected:true,legacyInboundRejected:true,missingNoStoreRejected:true,checked,calls},null,2));
 }finally{globalThis.fetch=nativeFetch;}
});
test('I43 failed required child preserves the first cause and stops subsequent setup',async()=>{
 const original=Error('synthetic initial readiness failure'),runs=[],diagnostics=[],childErrors=[];
 const context={test:async(name,body)=>{try{await body();}catch(error){childErrors.push(error);}}};
 await assert.rejects(async()=>{for(const name of ['first','must-not-start'])await runRequiredDialogCase(context,name,async()=>{runs.push(name);throw original;},async(name,error)=>diagnostics.push({name,error}));},error=>error===original);
 assert.deepEqual(runs,['first']);assert.deepEqual(childErrors,[original]);assert.deepEqual(diagnostics,[{name:'first',error:original}]);
});

// Radix's locked hideOthers implementation preserves live announcements and
// their ancestors. Verify every underlying control, not one outer wrapper.
function retainedDetailAccessibility(surface){
 const blocked=node=>!!node?.closest('[aria-hidden="true"],[hidden],[inert]');
 const controls=[...surface.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],summary,[role="button"],[role="combobox"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])')];
 const live=[...surface.querySelectorAll('[aria-live]')],exposed=controls.filter(node=>!blocked(node));
 return {controlCount:controls.length,exposedControlCount:exposed.length,exposedControls:exposed.slice(0,12).map(node=>({tag:node.tagName,role:node.getAttribute('role'),label:node.getAttribute('aria-label'),id:node.id||null})),liveCount:live.length,exposedLiveCount:live.filter(node=>!blocked(node)).length,surfaceBlocked:blocked(surface),dialogBlocked:blocked(surface.querySelector('[role="dialog"]'))};
}
test('I43 locked Radix isolation preserves live ancestors and waits for complete modal cleanup',async()=>{
 const {hideOthers}=require('aria-hidden');
 class Element{
  constructor(tag,parent=null,attributes={}){this.tagName=tag.toUpperCase();this.parentNode=this.parentElement=parent;this.children=[];this.attributes={...attributes};this.id=attributes.id??'';if(parent)parent.children.push(this);this.ownerDocument=parent?.ownerDocument??{body:this};}
  contains(node){for(let current=node;current;current=current.parentNode)if(current===this)return true;return false;}
  getAttribute(name){return this.attributes[name]??null;}setAttribute(name,value){this.attributes[name]=value;}removeAttribute(name){delete this.attributes[name];}
  closest(){if(this.getAttribute('aria-hidden')==='true'||Object.hasOwn(this.attributes,'hidden')||Object.hasOwn(this.attributes,'inert'))return this;return this.parentNode?.closest()??null;}
  querySelectorAll(selector){return this.children.flatMap(node=>{const match=selector.includes('[aria-live]')?(Object.hasOwn(node.attributes,'aria-live')||selector.includes('script')&&node.tagName==='SCRIPT'):selector==='[role="dialog"]'?node.getAttribute('role')==='dialog':['BUTTON','INPUT','SELECT','TEXTAREA','A','SUMMARY'].includes(node.tagName);return [...(match?[node]:[]),...node.querySelectorAll(selector)];});}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 }
 const body=new Element('body'),root=new Element('main',body),surface=new Element('div',root),detail=new Element('div',surface,{role:'dialog'}),header=new Element('header',detail),close=new Element('button',header),content=new Element('div',detail),editorHeader=new Element('header',content),live=new Element('p',editorHeader,{'aria-live':'polite'}),fields=new Element('section',content),notes=new Element('textarea',fields),reference=new Element('section',content),referenceLive=new Element('div',reference,{'aria-live':'polite'}),retry=new Element('button',reference),command=new Element('div',body,{role:'dialog'}),input=new Element('input',command);
 assert.equal(retainedDetailAccessibility(surface).exposedControlCount,3);
 // Explicit body is equivalent to command.ownerDocument.body in the browser;
 // only the DOM is doubled. This executes the actual locked dependency.
 const undo=hideOthers(command,body);
 try{
  const result=retainedDetailAccessibility(surface);
  assert.deepEqual(result,{controlCount:3,exposedControlCount:0,exposedControls:[],liveCount:2,exposedLiveCount:2,surfaceBlocked:false,dialogBlocked:false});
  assert.ok(close.closest()&&notes.closest()&&retry.closest());assert.equal(live.closest(),null);assert.equal(referenceLive.closest(),null);assert.equal(input.closest(),null);
  const leaked=new Element('button',live,{'aria-label':'synthetic exposed control'});assert.equal(retainedDetailAccessibility(surface).exposedControlCount,1,'The contract rejects an interactive leak inside a preserved live subtree');live.children.splice(live.children.indexOf(leaked),1);
 }finally{undo();}
 assert.equal(retainedDetailAccessibility(surface).exposedControlCount,3,'Modal cleanup restores the original controls without replacing their nodes');
 // Execute the exact browser helper against staged lifecycle completions.
 // Neither a hidden content node nor a fixed number of paint frames can end it.
 const steps=[],release=[];let finished=false;
 const page={locator:selector=>({waitFor:options=>{assert.deepEqual(options,{state:'detached'});steps.push(selector);return new Promise(resolve=>release.push(resolve));}}),waitForFunction:predicate=>{assert.match(String(predicate),/getComputedStyle\(document.body\).pointerEvents!=='none'/);steps.push('body pointer state');return new Promise(resolve=>release.push(resolve));}};
 const closing=waitForGuardDismissal(page).then(()=>{finished=true;});
 assert.deepEqual(steps,['[data-slot="alert-dialog-content"]']);assert.equal(finished,false);
 release.shift()();await Promise.resolve();assert.deepEqual(steps,['[data-slot="alert-dialog-content"]','[data-slot="alert-dialog-overlay"]']);assert.equal(finished,false);
 release.shift()();await Promise.resolve();assert.equal(steps.at(-1),'body pointer state');assert.equal(finished,false);
 release.shift()();await closing;assert.equal(finished,true);
 const failure=Error('overlay did not detach');
 await assert.rejects(()=>waitForGuardDismissal({locator:()=>({waitFor:async()=>{throw failure;}})}),error=>error===failure);

});

const entry=`import React,{useState,useCallback}from'react';import{createRoot}from'react-dom/client';
 import{PurchaseRequestScreen}from'./components/erp/purchase-request-screen';
 import{InboundRequestScreen}from'./components/erp/inbound-request-screen';
 import{NavigationGuardProvider}from'./components/erp/navigation-guard';
 import{MobileBottomNav}from'./components/erp/workspace';
 import{SidebarProvider,SidebarInset}from'./components/ui/sidebar';
 import{Dialog,DialogContent,DialogTitle}from'./components/ui/dialog';
 const base={session:{tenantId:'QA-T',companyId:'QA-C',displayName:'SYNTHETIC',companyName:'SYNTHETIC',idleExpiresAt:'2099-01-01T00:00:00Z',absoluteExpiresAt:'2099-01-01T00:00:00Z',authorityVersion:1,capabilities:['purchase-requests.read','inbound-requests.read']},branchIds:['QA-BRANCH'],sessionScope:'${session}',readScope:'${scope}',navigation:[]};
 window.i43={life:[],adapters:[],navigation:null,denials:[],navCalls:[]};
 function Fixture(){const [commandOpen,setCommandOpen]=useState(false);
  React.useEffect(()=>{const onKey=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setCommandOpen(true);}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[]);
  const [config,setConfig]=useState({allowed:true,workspace:true,version:1,login:1});
  const register=useCallback(value=>{window.i43.navigation=value;},[]);
  const onDenied=useCallback(error=>window.i43.denials.push(error.status),[]);
  const verifyWorkspace=useCallback(async()=>setConfig(value=>({...value,workspace:true,version:value.version+1})),[]);
  const onLogin=useCallback(()=>{},[]);
  window.i43.configure=patch=>setConfig(value=>({...value,...patch}));
  const workspace=React.useMemo(()=>config.workspace?{...base,session:{...base.session,authorityVersion:config.version}}:null,[config.workspace,config.version]);
  const purchase=new URLSearchParams(location.search).get('kind')==='purchase';
  return <NavigationGuardProvider><SidebarProvider><SidebarInset className='erp-inset'><main className='workspace-content' style={{height:'100vh',overflow:'auto'}} data-testid='list-scroll'>
   <div style={{height:350}}>Synthetic fixture. No ERP connection.</div>
   {purchase?<PurchaseRequestScreen workspace={workspace} loginBoundary={config.login} sessionEnded={false} verifying={false} onVerifyWorkspace={verifyWorkspace} onDenied={onDenied} onLogin={onLogin} presentationAllowed={config.allowed} registerDetailNavigation={register}/>
   :<InboundRequestScreen workspace={workspace} loginKey={'synthetic-'+config.login} historyOwner='workspace' presentationAllowed={config.allowed} registerDetailNavigation={register} onDenied={onDenied}/>}
   <div style={{height:700}}/>
  </main></SidebarInset><MobileBottomNav screen={purchase?'purchase-requests':'inbound-requests'} workspace={workspace} navigate={id=>window.i43.navCalls.push(id)} onSearch={()=>window.i43.navCalls.push('search')} searchOpen={false}/><Dialog open={commandOpen} onOpenChange={setCommandOpen}><DialogContent aria-describedby={undefined}><DialogTitle>R1 command modal</DialogTitle><input aria-label='R1 command input'/></DialogContent></Dialog></SidebarProvider></NavigationGuardProvider>;
 }createRoot(document.getElementById('root')).render(<Fixture/>);`;
let compiled;
async function compile(){
 if(compiled)return compiled;
 const {build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 await mkdir(output,{recursive:true});
 const result=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'fixture.js'),bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning',plugins:[{name:'actual-editor-lifetime-observation',setup(build){
  // Expose the real private navigation component in this in-memory test bundle
  // only. Preserve all Workspace bytes and every production navigation handler.
  build.onLoad({filter:/[/\\]erp[/\\]workspace\.tsx$/},async args=>({loader:'tsx',resolveDir:path.dirname(args.path),contents:(await readFile(args.path,'utf8'))+'\nexport {MobileBottomNav};\n'}));
  build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'i43-image'}));
  build.onLoad({filter:/.*/,namespace:'i43-image'},()=>({loader:'jsx',resolveDir:app,contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}"}));
  build.onLoad({filter:/[/\\]mobile-(?:inbound-)?request\.tsx$/},async args=>{
   const name=args.path.endsWith('mobile-request.tsx')?'RequestEditor':'InboundEditor';
   const original=await readFile(args.path,'utf8');
   const header=original.match(new RegExp('function '+name+'\\([^]*?\\)\\s*\\{'))?.[0];assert.ok(header);
   // Observe the actual inner editor, including its pre-existing scope key.
   // No replacement tree/bridge/guard or duplicated lifecycle implementation.
   const instrumentation=`
    useLayoutEffect(()=>{window.i43.life.push({name:'${name}',event:'mount'});return()=>window.i43.life.push({name:'${name}',event:'unmount'});},[]);
    useLayoutEffect(()=>{if(adapter&&!window.i43.adapters.includes(adapter))window.i43.adapters.push(adapter);});
   `;
   return {loader:'tsx',resolveDir:path.dirname(args.path),contents:original.replace(header,header+instrumentation)};
  });
 }}]});
 const applicationCss=(await postcss([tailwind({base:app})]).process(await readFile(path.join(app,'app/globals.css'),'utf8'),{from:path.join(app,'app/globals.css')})).css;
 const javascript=result.outputFiles.find(file=>file.path.endsWith('.js')),modules=result.outputFiles.filter(file=>file.path.endsWith('.css'));
 assert.ok(javascript?.contents.length);assert.ok(modules.length>0&&modules.every(file=>file.contents.length>0));
 assert.ok(!applicationCss.includes('@import "tailwindcss"'));
 const css=applicationCss+'\n'+modules.map(file=>file.text).join('\n');assert.match(css,/min-height:\s*100dvh/);
 compiled={script:javascript.contents,css};
 await writeFile(path.join(output,'fixture-build.json'),JSON.stringify({result:'PASS',node:process.version,actualScreens:true,actualEditors:true,actualGuard:true,actualMobileBottomNav:true,actualSidebarAncestors:true,syntheticHTTP:true,browserExecuted:false},null,2));
 return compiled;
}
test('I43 fixture callbacks stay stable for modal presentation while explicit authority changes remain live',async()=>{
 const {build}=require('esbuild'),React=require('react'),{act,create}=require('react-test-renderer');
 // Execute the actual fixture's hook declarations, omitting only its JSX view.
 const base=entry.slice(entry.indexOf(' const base='),entry.indexOf(' window.i43='));
 const setup=entry.slice(entry.indexOf(' function Fixture(){'),entry.indexOf('  return <NavigationGuardProvider>')).replace('function Fixture(){','export function Fixture({observe}){');
 assert.ok(base&&setup.includes('const onDenied=useCallback'));
 const file=path.join(output,'fixture-callback-contract.mjs');await mkdir(output,{recursive:true});
 await build({stdin:{contents:"import React,{useState,useCallback}from'react';"+base+setup+'observe({onDenied,verifyWorkspace,onLogin,workspace,commandOpen,setCommandOpen,presentationAllowed:config.allowed});return null;}',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {Fixture}=await import(pathToFileURL(file).href),names=['window','document','location','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),listeners=new Map();let renderer,current;
 try{
  Object.assign(globalThis,{window:{i43:{denials:[]}},document:{addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)},location:{search:'?kind=purchase'},IS_REACT_ACT_ENVIRONMENT:true});
  await act(async()=>{renderer=create(React.createElement(Fixture,{observe:value=>{current=value;}}));});const initial=current;
  await act(async()=>listeners.get('keydown')({ctrlKey:true,key:'k',preventDefault(){}}));assert.equal(current.commandOpen,true);assert.strictEqual(current.workspace,initial.workspace);
  for(const key of ['onDenied','verifyWorkspace','onLogin'])assert.strictEqual(current[key],initial[key],key+' must not turn command presentation into authority revalidation');
  await act(async()=>current.setCommandOpen(false));assert.strictEqual(current.workspace,initial.workspace);assert.strictEqual(current.onDenied,initial.onDenied);
  await act(async()=>window.i43.configure({version:2}));assert.notStrictEqual(current.workspace,initial.workspace);assert.equal(current.workspace.session.authorityVersion,2);
  await act(async()=>current.verifyWorkspace());assert.equal(current.workspace.session.authorityVersion,3,'Explicit verification still creates a new authority observation');
  await act(async()=>window.i43.configure({allowed:false}));assert.equal(current.presentationAllowed,false,'Permission obscuring is not removed by callback stabilization');
 }finally{if(renderer)await act(async()=>renderer.unmount());for(const [name,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});
test('I43 actual dialog fixture compiles with the locked application dependencies',async()=>{await compile();});
test('I43 R1 source and compiled layers place the retained surface between mobile navigation and the workspace guard',async()=>{
 const postcss=require('postcss');
 const globals=postcss.parse(await readFile(path.join(app,'app/globals.css'),'utf8'));
 const emitted=postcss.parse((await compile()).css);
 const declarations=(css,selector)=>{const values=[];css.walkRules(selector,rule=>rule.walkDecls('z-index',decl=>{
  const layers=[];for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='layer')layers.push(parent.params);
  values.push({value:Number(decl.value),layers});
 }));return values;};
 const selectors={navigation:'.mobile-bottom-nav',guardContent:'.workspace-navigation-warning',guardOverlay:'[data-slot="alert-dialog-overlay"]:has(+ .workspace-navigation-warning)'},evidence={};
 for(const [name,css] of [['source',globals],['compiled',emitted]]){
  const values=Object.fromEntries(Object.entries(selectors).map(([key,selector])=>[key,declarations(css,selector)]));
  assert.deepEqual(values.navigation,[{value:40,layers:[]}]);
  assert.deepEqual(values.guardContent,[{value:80,layers:[]}]);assert.deepEqual(values.guardOverlay,[{value:79,layers:[]}]);
  evidence[name]=values;
 }
 // The primitive's utility is a base layer, not the composed guard's value.
 // Unlayered application rules override the emitted Tailwind utility layer.
 assert.deepEqual(declarations(emitted,'.z-50'),[{value:50,layers:['utilities']}]);
 const surface=await readFile(path.join(app,'components/erp/request-detail-dialog.tsx'),'utf8');
 const layer=Number(/\.request-detail-surface:not\(\[hidden\]\)\{[^}]*z-index:(\d+)/.exec(surface)?.[1]);
 const primitive=await readFile(path.join(app,'components/ui/alert-dialog.tsx'),'utf8');
 assert.equal((primitive.match(/fixed[^"\n]*z-50/g)??[]).length,2,'primitive overlay/content retain their base utility');
 assert.match(primitive,/<AlertDialogOverlay \/>\s*<AlertDialogPrimitive.Content/,'the workspace guard overlay remains the preceding sibling matched by application CSS');
 assert.match(await readFile(path.join(app,'components/erp/navigation-guard.tsx'),'utf8'),/className="workspace-navigation-warning"/);
 const navigation=evidence.compiled.navigation[0].value,guardOverlay=evidence.compiled.guardOverlay[0].value,guardContent=evidence.compiled.guardContent[0].value;
 assert.equal(layer,45);assert.ok(guardContent>guardOverlay&&guardOverlay>layer&&layer>navigation);
 assert.ok(entry.indexOf('<MobileBottomNav')>entry.indexOf('</SidebarInset>'),'fixture keeps the later Workspace sibling order');
 // Source/compilation evidence only: no claim about computed browser stacking.
 await writeFile(path.join(output,'r1-layer-contract.json'),JSON.stringify({result:'PASS',navigation,surface:layer,guardPrimitiveBase:50,guardOverlay,guardContent,evidence,actualMobileBottomNav:true,browserExecuted:false},null,2));
});
test('I43 R1 production layout effect yields focus and Escape to higher modal ownership (DOM model, not browser)',async()=>{
 const ts=require('typescript'),{runInNewContext}=require('node:vm');
 const source=await readFile(path.join(app,'components/erp/request-detail-dialog.tsx'),'utf8');
 const file=ts.createSourceFile('request-detail-dialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(file)==='useLayoutEffect'&&node.arguments[0]?.getText(file).includes('const element = content.current'))effect=node.arguments[0].getText(file);ts.forEachChild(node,visit);};visit(file);assert.ok(effect);
 const code=ts.transpileModule('('+effect+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const listeners=new Map(),observers=[];let closed=0;
 const document={hidden:false,activeElement:null,addEventListener(name,handler){const set=listeners.get(name)??new Set();set.add(handler);listeners.set(name,set);},removeEventListener(name,handler){listeners.get(name)?.delete(handler);}};
 const emit=(name,event)=>{for(const handler of [...(listeners.get(name)??[])])handler(event);};
 class Element{
  constructor(name,parent=null,role=null,z='auto'){this.name=name;this.parentElement=parent;this.role=role;this.css={display:'block',visibility:'visible',opacity:'1',zIndex:z};this.style={overflow:''};this.isConnected=true;this.hidden=false;this.inert=false;this.ariaHidden=false;this.tabIndex=0;}
  contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
  closest(selector){if(selector.includes('[hidden]')&&this.hidden||selector.includes('[inert]')&&this.inert||selector.includes('[aria-hidden="true"]')&&this.ariaHidden)return this;return this.parentElement?.closest(selector)??null;}
  getClientRects(){return this.isConnected&&!this.closest('[hidden]')?[{}]:[];}
  matches(selector){return selector===':disabled'?false:false;}
  getAttribute(name){return name==='role'?this.role:null;}
  querySelectorAll(){return this===detail?[detailInput]:[];}
  querySelector(){return null;}
  addEventListener(){} removeEventListener(){}
  focus(){document.activeElement=this;emit('focusin',{target:this});}
 }
 const body=new Element('body'),surface=new Element('surface',body,null,'45'),detail=new Element('detail',surface,'dialog'),detailInput=new Element('detail-input',detail);
 const command=new Element('command',body,'dialog','50'),commandInput=new Element('command-input',command),alert=new Element('guard',body,'alertdialog','80'),alertInput=new Element('guard-cancel',alert),outside=new Element('outside',body);
 command.hidden=true;alert.hidden=true;document.body=body;
 document.querySelectorAll=selector=>[detail,command,alert].filter(node=>selector.includes('[role="'+node.role+'"]'));
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(node,options){this.options=options;}disconnect(){this.disconnected=true;}}
 const cleanup=runInNewContext(code,{shown:true,content:{current:detail},close:{current:()=>closed++},document,HTMLElement:Element,Node:Element,MutationObserver:Observer,getComputedStyle:node=>node.css})();
 const mutation=()=>observers.forEach(observer=>observer.callback());
 const escape=()=>{const event={key:'Escape',prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};emit('keydown',event);return event;};
 try{
  assert.strictEqual(document.activeElement,detail);detailInput.focus();
  command.hidden=false;surface.ariaHidden=true;commandInput.focus();assert.strictEqual(document.activeElement,commandInput);assert.equal(escape().prevented,false);assert.equal(closed,0);mutation();assert.strictEqual(document.activeElement,commandInput);
  surface.ariaHidden=false;commandInput.focus();assert.strictEqual(document.activeElement,commandInput,'higher visible modal owns focus even before aria-hidden is committed');assert.equal(escape().prevented,false);assert.equal(closed,0);
  command.hidden=true;outside.focus();assert.strictEqual(document.activeElement,detailInput,'hidden dialog does not own focus');
  command.hidden=false;command.css.visibility='hidden';outside.focus();assert.strictEqual(document.activeElement,detailInput);
  command.css.visibility='visible';command.css.zIndex='20';outside.focus();assert.strictEqual(document.activeElement,detailInput,'lower dialog is not the modal owner');command.hidden=true;
  for(const kind of ['aria-hidden','visibility','opacity','display','document-hidden']){
   if(kind==='aria-hidden')surface.ariaHidden=true;else if(kind==='document-hidden')document.hidden=true;else surface.css[kind]=kind==='opacity'?'0':kind==='display'?'none':'hidden';
   outside.focus();mutation();assert.strictEqual(document.activeElement,outside);assert.equal(escape().prevented,false);assert.equal(closed,0);
   surface.ariaHidden=false;surface.css.visibility='visible';surface.css.opacity='1';surface.css.display='block';document.hidden=false;mutation();assert.strictEqual(document.activeElement,detailInput);
  }
  alert.hidden=false;alertInput.focus();assert.strictEqual(document.activeElement,alertInput);assert.equal(escape().prevented,false);assert.equal(closed,0);alert.hidden=true;outside.focus();mutation();assert.strictEqual(document.activeElement,detailInput);
  assert.equal(escape().prevented,true);assert.equal(closed,1,'foreground detail retains its guarded Escape handler');
  for(const attribute of ['aria-hidden','style','class','hidden','inert'])assert.ok(observers[0].options.attributeFilter.includes(attribute));
 }finally{cleanup();}
 surface.hidden=true;outside.focus();surface.hidden=false;mutation();assert.strictEqual(document.activeElement,outside,'a queued observer cannot resume retired permission/selection ownership');escape();assert.equal(closed,1);
 await writeFile(path.join(output,'r1-focus-dom-model.json'),JSON.stringify({result:'PASS',executed:'exact production layout-effect callback compiled by TypeScript',dom:'explicit doubles',realBrowser:false,cases:['visible higher dialog','aria-hidden transition','hidden and lower dialog ignored','visibility/opacity/display/document-hidden','AlertDialog control','foreground Escape','cleanup prevents stale observer focus']},null,2));
});
test('I43 actual dialog browser matrix',{timeout:240000},async t=>{
 const {script,css}=await compile();
 const executable=process.env.MEDCOM_EDGE_PATH??process.env.I43_TEST_BROWSER??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'I43 browser NOT_RUN: an already installed Chromium/Edge executable is required; do not install or disable sandbox.');
 const toolchain=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 const {chromium}=(toolchain?createRequire(path.join(path.resolve(toolchain),'package.json')):require)('playwright-core');
 let model,browser,context,page,origin,currentScenario,firstFailure=null,fatal=null;const expectedCases=13,results=[],errors=[],waiters=[],viewportEvidence=[];
 const reset=()=>{model={calls:[],detailStatus:200,holdDetail:false,holdCommand:false,unknown:false,readOnly:false,receipts:new Map(),purchase:structuredClone(purchase),inbound:structuredClone(inbound)};};
 const send=(res,{status,data,headers})=>{if(!res.destroyed){res.writeHead(status,headers);res.end(JSON.stringify(data));}};
 const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,origin??'http://localhost'),route=u.pathname;
  if(route==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(route==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(!route.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');}
  const m=model,parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString();m.calls.push({route,query:Object.fromEntries(u.searchParams),method:req.method,body});
  if(req.method==='GET'&&(route.endsWith('/detail')||route.endsWith('/draft'))&&m.holdDetail)await new Promise(resolve=>waiters.push(resolve));
  if(req.method==='POST'&&!route.endsWith('/csrf')&&m.holdCommand)await new Promise(resolve=>waiters.push(resolve));
  send(res,dialogApiResponse(m,route,u.searchParams,req.method));
 }catch(error){errors.push(String(error));send(res,dialogJson(500,{code:'synthetic_fixture_error'}));}});
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 const release=()=>{model.holdDetail=false;model.holdCommand=false;waiters.splice(0).forEach(done=>done());};
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const notes=()=>page.getByRole('dialog').getByLabel('Ghi chú',{exact:true});
 const snapshot=()=>page.evaluate(()=>({life:window.i43.life,adapters:window.i43.adapters.length,selected:window.i43.navigation?.selectedId}));
 const open=async kind=>{await page.getByRole('button',{name:kind==='purchase'?'Mở đề nghị QA-001':/^Mở phiếu QA-001 ·/}).click();await notes().waitFor();};
 const start=async(kind,width,height=844,hasTouch=false)=>{
  release();await context?.close();reset();currentScenario={kind,width,height,hasTouch,stage:'create-context',responses:[],networkFailures:[]};
  context=await browser.newContext({viewport:{width,height},hasTouch});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const scenario=currentScenario,bounded=(values,value)=>{values.push(value);if(values.length>32)values.shift();};
  page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/erp/'))bounded(scenario.responses,{path:url.pathname,status:response.status()});});
  page.on('requestfailed',request=>bounded(scenario.networkFailures,{path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
  currentScenario.stage='load-fixture';await page.goto(origin+'/?kind='+kind);
  currentScenario.stage='authorized-list';const list=page.getByRole('grid',{name:kind==='purchase'?'Danh sách đề nghị':'Phiếu nhập hàng',exact:true});await list.waitFor();
  currentScenario.stage='exact-open-actions';await list.getByRole('button',{name:kind==='purchase'?'Mở đề nghị QA-001':/^Mở phiếu QA-001 ·/,exact:kind==='purchase'}).waitFor();
  await list.getByRole('button',{name:kind==='purchase'?'Mở đề nghị QA-018':/^Mở phiếu QA-018 ·/,exact:kind==='purchase'}).waitFor();
  assert.deepEqual(await list.locator('[data-grid-row]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-grid-row'))),dialogList(kind,1).rows.map(row=>row.documentId),'All 18 authorized source rows must be present before dialog tests');
  await paint();currentScenario.stage='scenario';
 };
 const diagnose=async(name,error)=>{
  if(firstFailure)return;
  firstFailure={name,error:String(error).slice(0,3000),scenario:currentScenario,completedCases:results.length,expectedCases,pageErrors:errors.slice(0,8),calls:model.calls.slice(-32).map(({route,method,query})=>({route,method,query}))};
  try{firstFailure.dom=await page.evaluate(()=>({readyState:document.readyState,body:document.body?.innerText.slice(0,6000),tables:[...document.querySelectorAll('[data-shared-grid]')].slice(0,3).map(table=>({role:table.getAttribute('role'),label:table.getAttribute('aria-label'),rows:table.querySelectorAll('[data-grid-row]').length,visible:table.getClientRects().length>0})),dialogs:[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].slice(0,4).map(dialog=>({role:dialog.getAttribute('role'),text:dialog.textContent?.slice(0,500),hidden:!!dialog.closest('[hidden],[inert]'),ariaHidden:dialog.getAttribute('aria-hidden'),ariaHiddenAncestor:dialog.closest('[aria-hidden="true"]')?.tagName??null,ancestors:(()=>{const ancestors=[];for(let node=dialog;node&&ancestors.length<8;node=node.parentElement)ancestors.push({tag:node.tagName,role:node.getAttribute('role'),ariaHidden:node.getAttribute('aria-hidden'),ariaLive:node.getAttribute('aria-live'),id:node.id||null});return ancestors;})()})),selected:window.i43?.navigation?.selectedId,denials:window.i43?.denials?.slice(0,8)}));}catch(diagnosticError){firstFailure.domError=String(diagnosticError).slice(0,500);}
  try{firstFailure.pointerState=await page.evaluate(()=>{
   const describe=node=>{if(!node)return null;const css=getComputedStyle(node);return {tag:node.tagName,role:node.getAttribute('role'),slot:node.getAttribute('data-slot'),state:node.getAttribute('data-state'),className:node.className,display:css.display,visibility:css.visibility,opacity:css.opacity,pointerEvents:css.pointerEvents,zIndex:css.zIndex,animationName:css.animationName,animationDuration:css.animationDuration};};
   const button=document.querySelector('.mobile-bottom-nav button'),rect=button?.getBoundingClientRect(),point=rect?{x:rect.x+rect.width/2,y:rect.y+rect.height/2}:null;
   return {body:{inline:document.body.style.pointerEvents,computed:getComputedStyle(document.body).pointerEvents},overlays:[...document.querySelectorAll('[data-slot="alert-dialog-overlay"],[data-slot="alert-dialog-content"],[data-slot="dialog-overlay"]')].map(describe),navigationHit:point?{point,target:describe(document.elementFromPoint(point.x,point.y)),stack:document.elementsFromPoint(point.x,point.y).slice(0,8).map(describe)}:null};
  });}catch(diagnosticError){firstFailure.pointerStateError=String(diagnosticError).slice(0,500);}
  try{firstFailure.retainedAccessibility=await page.locator('[data-request-detail-surface]').evaluate(retainedDetailAccessibility);}catch(diagnosticError){firstFailure.accessibilityError=String(diagnosticError).slice(0,500);}
  try{await page.screenshot({path:path.join(output,'first-failure.png'),fullPage:false,timeout:2000});firstFailure.screenshot='first-failure.png';}catch(diagnosticError){firstFailure.screenshotError=String(diagnosticError).slice(0,500);}
  await writeFile(path.join(output,'first-failure.json'),JSON.stringify(firstFailure,null,2));t.diagnostic(JSON.stringify(firstFailure));
 };
 const run=(name,body)=>runRequiredDialogCase(t,name,body,diagnose);
 const geometry=async()=>{
  const box=await page.getByRole('dialog').boundingBox(),viewport=page.viewportSize();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok(await page.getByRole('dialog').getAttribute('aria-labelledby'));
  await page.keyboard.press('Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);
 };
 const actualViewport=async expected=>{
  const configured=page.viewportSize(),windowViewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio,visualViewport:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null}));
  assert.deepEqual(configured,expected,'The current Playwright viewport must match the named scenario');assert.deepEqual({width:windowViewport.width,height:windowViewport.height},expected,'The rendered window must match the named scenario');
  currentScenario.actualViewport={width:windowViewport.width,height:windowViewport.height};return {configured,windowViewport};
 };
 const captureViewport=async(file,expected,role='dialog')=>{
  const viewport=await actualViewport(expected),box=await page.getByRole(role).boundingBox();assert.ok(box&&box.width>0&&box.height>0&&box.x>=-1&&box.y>=-1&&box.x+box.width<=expected.width+1&&box.y+box.height<=expected.height+1,'Capture the current visible '+role+' within the actual viewport');
  const png=await page.screenshot({path:path.join(output,file),fullPage:false,scale:'css'});assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const imagePixels={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};assert.deepEqual(imagePixels,expected,'Viewport-only evidence must have the actual CSS viewport dimensions');await actualViewport(expected);
  viewportEvidence.push({file,kind:currentScenario.kind,stage:currentScenario.stage,role,fullPage:false,scale:'css',viewport,observedSurfaceBox:box,imagePixels});
  await writeFile(path.join(output,'viewport-evidence.json'),JSON.stringify(viewportEvidence,null,2));
 };
 const attempt=async path=>{if(path==='escape')await page.keyboard.press('Escape');else if(path==='backdrop')await page.locator('.request-detail-backdrop').click({position:{x:2,y:2}});else await page.getByRole('dialog').getByRole('button',{name:path==='x'?'Đóng hộp thoại':/^(Đóng đề nghị|Quay lại danh sách)$/}).click();};
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,chromiumSandbox:true});
  for(const kind of ['purchase','inbound'])await run('I43 R1 '+kind+' higher Radix command modal owns focus and Escape above dirty detail',async()=>{
   await start(kind,390);await open(kind);await notes().fill('R1 COMMAND DIRTY');await page.waitForLoadState('networkidle');const before=await snapshot(),beforeCalls=model.calls.length;
   const retainedNotes=await notes().elementHandle(),retainedClose=await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).elementHandle();
   await page.keyboard.press('Control+k');const command=page.getByRole('dialog',{name:'R1 command modal'});await command.waitFor();
   const input=page.getByRole('textbox',{name:'R1 command input'});await input.focus();await input.fill('COMMAND RETAINS FOCUS');await paint();
   assert.equal(await input.evaluate(node=>node===document.activeElement),true);assert.equal(await input.evaluate(node=>!!node.closest('[aria-hidden="true"],[hidden],[inert]')),false,'The higher command input remains accessibility-exposed');
   for(const control of [retainedNotes,retainedClose])assert.equal(await control.evaluate(node=>node.isConnected&&!!node.closest('[aria-hidden="true"]')),true,'The exact retained Notes/Close nodes are aria-hidden while the command owns focus');
   assert.equal(model.calls.length,beforeCalls,'Opening a pure command modal must not manufacture a new authority observation');
   const retainedSurface=page.locator('[data-request-detail-surface]'),accessibility=await retainedSurface.evaluate(retainedDetailAccessibility);
   assert.ok(accessibility.controlCount>0,'Original retained controls must remain mounted');assert.equal(accessibility.exposedControlCount,0,'Every retained detail control is excluded from accessibility: '+JSON.stringify(accessibility));
   for(const role of ['button','textbox','combobox','checkbox','spinbutton','link','heading','table','grid'])assert.equal(await retainedSurface.getByRole(role).count(),0,'Higher modal hides underlying accessible '+role+' roles');
   if(kind==='purchase'){assert.ok(accessibility.liveCount>0,'Actual purchase live statuses remain mounted');assert.equal(accessibility.exposedLiveCount,accessibility.liveCount,'Radix intentionally preserves live status announcements and their ancestors');}
   await page.keyboard.press('Escape');await command.waitFor({state:'hidden'});await paint();assert.equal(await page.getByRole('alertdialog').count(),0);assert.deepEqual(await snapshot(),before);assert.equal(await notes().inputValue(),'R1 COMMAND DIRTY');
   for(const control of [retainedNotes,retainedClose])assert.equal(await control.evaluate(node=>node.isConnected&&!node.closest('[aria-hidden="true"],[hidden],[inert]')),true,'Escape restores the same retained control nodes to accessibility');assert.equal(model.calls.length,beforeCalls,'Closing the higher modal does not reread or replace retained data');
   assert.equal(await page.getByRole('dialog').evaluate(node=>node.contains(document.activeElement)),true);
   await page.keyboard.press('Meta+k');await command.waitFor();await input.focus();await page.evaluate(()=>window.i43.configure({allowed:false}));await input.fill('NO STALE DETAIL FOCUS');await paint();assert.equal(await input.evaluate(node=>node===document.activeElement),true);
   await page.keyboard.press('Escape');await command.waitFor({state:'hidden'});await paint();assert.equal(await page.locator('[data-request-detail-surface]').evaluate(node=>node.contains(document.activeElement)),false);assert.equal(await page.getByRole('alertdialog').count(),0);assert.deepEqual(await snapshot(),before);
   results.push({case:'R1-command-focus',kind,result:'PASS',lifetime:before,accessibility});
  });
  for(const kind of ['purchase','inbound'])await run('I43 R1 '+kind+' mobile detail intercepts touches above actual later navigation and yields to guard',async()=>{
   await start(kind,390,844,true);const nav=page.locator('.mobile-bottom-nav');await nav.waitFor();
   const navButton=nav.locator('button').first();
   const point=async()=>{const box=await navButton.boundingBox();assert.ok(box);return {x:box.x+box.width/2,y:box.y+box.height/2};};
   let location=await point();await page.touchscreen.tap(location.x,location.y);
   assert.equal(await page.evaluate(()=>window.i43.navCalls.length),1,'real navigation handler responds before detail opens');
   await open(kind);await notes().fill('R1 LAYER RETAINED');const before=await snapshot();location=await point();
   const layers=await page.evaluate(({x,y})=>{
    const surface=document.querySelector('[data-request-detail-surface]'),nav=document.querySelector('.mobile-bottom-nav'),ancestors=[];
    for(let node=surface.parentElement;node&&node!==document.documentElement;node=node.parentElement){const css=getComputedStyle(node);ancestors.push({tag:node.tagName,slot:node.dataset.slot??null,z:css.zIndex,transform:css.transform,filter:css.filter,perspective:css.perspective,opacity:css.opacity,isolation:css.isolation,contain:css.contain});}
    return {surface:Number(getComputedStyle(surface).zIndex),nav:Number(getComputedStyle(nav).zIndex),later:!!(surface.compareDocumentPosition(nav)&Node.DOCUMENT_POSITION_FOLLOWING),hit:!!document.elementFromPoint(x,y)?.closest('.request-detail-dialog'),ancestors};
   },location);
   assert.equal(layers.surface,45);assert.equal(layers.nav,40);assert.equal(layers.later,true);assert.equal(layers.hit,true,'detail owns actual nav-button coordinates');
   for(const ancestor of layers.ancestors){assert.equal(ancestor.z,'auto');assert.equal(ancestor.transform,'none');assert.equal(ancestor.filter,'none');assert.equal(ancestor.perspective,'none');assert.equal(ancestor.opacity,'1');assert.equal(ancestor.isolation,'auto');assert.equal(ancestor.contain,'none');}
   await page.touchscreen.tap(location.x,location.y);assert.equal(await page.evaluate(()=>window.i43.navCalls.length),1);assert.deepEqual(await snapshot(),before);assert.equal(await notes().inputValue(),'R1 LAYER RETAINED');
   await captureViewport('r1-'+kind+'-mobile-dialog-viewport.png',{width:390,height:844});
   await attempt('x');const guard=page.getByRole('alertdialog');await guard.waitFor();
   assert.equal(await guard.evaluate(node=>node.contains(document.activeElement)),true);
   const guardLayers={content:Number(await guard.evaluate(node=>getComputedStyle(node).zIndex)),overlay:Number(await page.locator('[data-slot="alert-dialog-overlay"]').evaluate(node=>getComputedStyle(node).zIndex))};
   assert.deepEqual(guardLayers,{content:80,overlay:79},'The composed workspace guard overrides the base z-50 primitive');
   assert.ok(guardLayers.content>guardLayers.overlay&&guardLayers.overlay>layers.surface&&layers.surface>layers.nav,'Guard content and overlay stay above detail, which stays above later navigation');
   assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-slot=alert-dialog-overlay],[role=alertdialog]'),location),true,'guard overlay owns bottom navigation coordinates above detail');
   const guardBox=await guard.boundingBox();assert.ok(guardBox);
   assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[role=alertdialog]'),{x:guardBox.x+guardBox.width/2,y:guardBox.y+guardBox.height/2}),true,'guard content owns its center');
   await page.touchscreen.tap(location.x,location.y);assert.equal(await guard.isVisible(),true);assert.equal(await page.evaluate(()=>window.i43.navCalls.length),1);
   await page.screenshot({path:path.join(output,'r1-'+kind+'-mobile-guard.png'),fullPage:true});
   await captureViewport('r1-'+kind+'-mobile-guard-viewport.png',{width:390,height:844},'alertdialog');
   await guard.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await waitForGuardDismissal(page);await paint();assert.deepEqual(await snapshot(),before);assert.equal(await notes().inputValue(),'R1 LAYER RETAINED');
   assert.equal(await page.getByRole('dialog').evaluate(node=>node.contains(document.activeElement)),true);
   await attempt('x');await page.getByRole('alertdialog').getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});currentScenario.stage='accepted-guard-dismissal';await waitForGuardDismissal(page);await paint();
   location=await point();assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.mobile-bottom-nav'),location),true);
   await page.touchscreen.tap(location.x,location.y);assert.equal(await page.evaluate(()=>window.i43.navCalls.length),2,'accepted dismissal exposes the unchanged navigation again');
   assert.equal(model.calls.filter(call=>call.method==='POST').length,0);
   results.push({case:'R1-mobile-stacking',kind,result:'PASS',layers,guardLayers,lifetime:before,navCalls:await page.evaluate(()=>window.i43.navCalls)});
  });
  for(const kind of ['purchase','inbound'])for(const width of [1280,390])await run(kind+' '+width+' retained dirty dialog and guarded dismissal matrix',async()=>{
   const scenarioViewport={width,height:844},dismissalPaths=width===390?['x','visible','escape']:['x','visible','escape','backdrop'],dismissalViewports=[];let coveredBackdropPoint=null;await start(kind,scenarioViewport.width,scenarioViewport.height);
   await page.getByLabel(kind==='purchase'?'Tìm mã đề nghị':'Tìm phiếu nhập hàng',{exact:true}).fill('QA');
   await page.getByLabel(kind==='purchase'?'Tìm mã đề nghị':'Tìm phiếu nhập hàng',{exact:true}).press('Enter');await paint();
   await page.getByRole('navigation',{name:kind==='purchase'?'Phân trang đề nghị':'Trang danh sách phiếu'}).getByRole('button',{name:'Trang sau',exact:true}).click();await paint();
   const scroller=page.getByTestId('list-scroll');await scroller.evaluate(e=>e.scrollTop=250);
   const scroll=await scroller.evaluate(e=>e.scrollTop);await open(kind);await notes().fill('I43 DIRTY RETAINED');
   const before=await snapshot(),calls=model.calls.length;
   for(const size of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
    await page.setViewportSize(size);await geometry();assert.equal(await notes().inputValue(),'I43 DIRTY RETAINED');assert.deepEqual(await snapshot(),before);
   }
   // The resize sweep ends on desktop. Restore the named scenario before
   // exercising any dismissal path, not only before writing its screenshot.
   await page.setViewportSize(scenarioViewport);await paint();currentScenario.stage='restored-dismissal-viewport';await actualViewport(scenarioViewport);await geometry();
   assert.equal(await notes().inputValue(),'I43 DIRTY RETAINED');assert.deepEqual(await snapshot(),before);
   const restoredBox=await page.getByRole('dialog').boundingBox();assert.ok(restoredBox);if(width===390)assert.ok(restoredBox.x<=1&&restoredBox.y<=1&&restoredBox.width>=389&&restoredBox.height>=843,'Mobile detail covers the full viewport, including its backdrop');
   for(const path of dismissalPaths){
    currentScenario.stage='dirty-dismissal-'+path;const viewport=await actualViewport(scenarioViewport);await geometry();
    if(path==='backdrop')assert.equal(await page.evaluate(()=>!!document.elementFromPoint(2,2)?.closest('.request-detail-backdrop')),true,'Desktop backdrop point must be genuinely exposed before a normal pointer click');
    await attempt(path);const guard=page.getByRole('alertdialog');await guard.waitFor();
    const guardBox=await guard.boundingBox();assert.ok(guardBox&&guardBox.x>=-1&&guardBox.y>=-1&&guardBox.x+guardBox.width<=width+1&&guardBox.y+guardBox.height<=scenarioViewport.height+1);dismissalViewports.push({path,outcome:'guard-cancel',viewport,guardBox});
    if(width===390&&path==='x')await captureViewport(kind+'-'+width+'-dirty-guard-viewport.png',scenarioViewport,'alertdialog');
    assert.equal(await guard.evaluate(e=>e.contains(document.activeElement)),true);
    assert.ok(Number(await guard.evaluate(e=>getComputedStyle(e).zIndex))>Number(await page.locator('[data-request-detail-surface]').evaluate(e=>getComputedStyle(e).zIndex)));
    await guard.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await waitForGuardDismissal(page);await paint();
    assert.equal(await notes().inputValue(),'I43 DIRTY RETAINED');assert.deepEqual(await snapshot(),before);
    assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);
   }
   if(width===390){
    currentScenario.stage='mobile-covered-backdrop-point';const viewport=await actualViewport(scenarioViewport),point={x:2,y:2};
    assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.request-detail-dialog'),point),true,'The fullscreen mobile dialog, not its covered backdrop, receives this point');
    await page.mouse.click(point.x,point.y);await paint();assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.getByRole('dialog').isVisible(),true);
    assert.equal(await notes().inputValue(),'I43 DIRTY RETAINED');assert.deepEqual(await snapshot(),before);assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);
    coveredBackdropPoint={point,viewport,outcome:'dialog-retained-without-guard'};
   }
   assert.equal(model.calls.length,calls,'presentation and cancellation do not issue API requests');
   currentScenario.stage='retained-dirty-viewport';await captureViewport(kind+'-'+width+'-dirty-viewport.png',scenarioViewport);
   await page.screenshot({path:path.join(output,kind+'-'+width+'-dirty.png'),fullPage:true});
   await attempt('x');await page.getByRole('alertdialog').getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});currentScenario.stage='accepted-guard-dismissal';await waitForGuardDismissal(page);await paint();
   assert.equal(await scroller.evaluate(e=>e.scrollTop),scroll);assert.match(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')??''),/QA-001/);
   assert.equal(await page.getByLabel(kind==='purchase'?'Tìm mã đề nghị':'Tìm phiếu nhập hàng',{exact:true}).inputValue(),'QA');
   assert.equal(model.calls.length,calls);results.push({kind,width,viewport:scenarioViewport,dismissalPaths,dismissalViewports,coveredBackdropPoint,result:'PASS',lifetime:await snapshot(),calls:model.calls});
  });
  for(const kind of ['purchase','inbound'])await run(kind+' obscured custody, current read proof, pending/unknown and navigation fixture adapter',async()=>{
   await start(kind,390);await open(kind);await notes().fill('KEPT THROUGH HIDE');const before=await snapshot();
   await page.evaluate(()=>window.i43.configure({allowed:false}));await page.getByRole('dialog').waitFor({state:'hidden'});
   model.holdDetail=true;await page.evaluate(()=>window.i43.configure({allowed:true}));await paint();assert.equal(await notes().isVisible(),false);
   release();await notes().waitFor();assert.equal(await notes().inputValue(),'KEPT THROUGH HIDE');assert.deepEqual(await snapshot(),before);
   await page.evaluate(()=>window.i43.configure({workspace:false}));await paint();assert.equal(await notes().isVisible(),false);
   await page.evaluate(()=>window.i43.configure({workspace:true,version:2}));await notes().waitFor();assert.equal(await notes().inputValue(),'KEPT THROUGH HIDE');assert.deepEqual(await snapshot(),before);
   await page.getByRole('dialog').getByRole('button',{name:'Rà soát phiếu',exact:true}).click();model.holdCommand=true;
   await page.getByRole('dialog').getByRole('button',{name:kind==='purchase'?'Lưu nháp trên ERP':'Lưu thay đổi',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Đang'));
   await page.evaluate(()=>window.i43.navigation.requestClose());await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('alertdialog').getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
   await page.getByRole('alertdialog').getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await waitForGuardDismissal(page);release();
   await page.getByRole('dialog').getByRole('button',{name:kind==='purchase'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc',exact:true}).waitFor();
   const commands=()=>model.calls.filter(c=>c.method==='POST'&&!c.route.endsWith('/csrf'));assert.equal(commands().length,1);const original=commands()[0].body;
   await page.evaluate(()=>window.i43.navigation.requestClose());await page.getByRole('alertdialog').waitFor();assert.equal((await snapshot()).selected,'QA-001');assert.equal(commands().length,1);
   await page.getByRole('alertdialog').getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await waitForGuardDismissal(page);
   await page.getByRole('dialog').getByRole('button',{name:kind==='purchase'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc',exact:true}).click();
   await page.waitForTimeout(100);assert.equal(commands().length,2);assert.equal(commands()[1].body,original);assert.deepEqual(await snapshot(),before);
   results.push({kind,result:'PASS',lifetime:await snapshot(),commands:commands()});
  });
  for(const kind of ['purchase','inbound'])await run(kind+' loading and failed detail remain guarded and closable',async()=>{
   await start(kind,390);model.holdDetail=true;await page.evaluate(()=>window.i43.navigation.requestOpen('QA-001'));await page.getByRole('dialog').waitFor();
   await page.getByRole('dialog').getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});release();
   model.detailStatus=404;await page.evaluate(()=>window.i43.navigation.requestOpen('QA-001'));await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(model.calls.filter(c=>c.method==='POST').length,0);results.push({kind,result:'PASS',case:'loading/404'});
  });
  await run('inbound independent read-only fallback remains in the same dialog',async()=>{
   await start('inbound',390);model.readOnly=true;await page.evaluate(()=>window.i43.navigation.requestOpen('QA-001'));await page.getByTestId('inbound-request-readonly').waitFor();await geometry();
   await page.getByRole('dialog').getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(model.calls.filter(c=>c.method==='POST').length,0);results.push({result:'PASS',case:'readonly'});
  });
  assert.deepEqual(errors,[]);assert.equal(results.length,expectedCases,'Every required dialog case must complete');
 }catch(error){fatal=String(error);throw error;}finally{
  release();await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({status:fatal||results.length!==expectedCases||errors.length?'failed':'passed',expectedCases,completedCases:results.length,results,errors,firstFailure,fatal,viewportEvidence,composedRootBackForward:'NOT_RUN',note:'Root registration and history integration have separate required composed gates; this gate uses the fixture adapter.'},null,2));
  await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
});
