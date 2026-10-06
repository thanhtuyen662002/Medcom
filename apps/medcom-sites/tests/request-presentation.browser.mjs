// Actual Workspace and production request components with compiled application
// Tailwind CSS. API data is entirely synthetic; this is not SQL/server acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','i30-request-presentation');
const sha=value=>createHash('sha256').update(value).digest('hex');
const scope='a'.repeat(64),session='b'.repeat(64);
const purchase={purchaseRequestId:'QA-PURCHASE-001',branchId:'QA-BRANCH',statusId:1,isLocked:false,
 header:{purchaseDate:'2026-10-01T14:22:11.003',purposeId:1,personSuggest:'Nhân viên tổng hợp kiểm thử với tên hiển thị dài',department:'Bộ phận kinh doanh tổng hợp kiểm thử',purposeDescOrClient:'Nội dung tổng hợp để kiểm tra xuống dòng trên màn hình nhỏ.',price:'999999999999999999',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1},
 lines:[{lineId:'QA-LINE-001',values:{itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',budget:null,timeRequired:null,quantity:'999999999999999999',unitPrice:'1',totalPrice:null,model:''}}]};
const inbound={documentId:'QA-INBOUND-001',statusId:0,stateEqualityToken:'C'.repeat(64),costRowCount:0,costEditingSupported:false,
 header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'Đơn tổng hợp kiểm thử với nội dung đủ dài',invoiceNo:'',departurePoint:'Điểm đi tổng hợp',destinationPoint:'Điểm đến tổng hợp',orderTypeId:'QA-TYPE',branchId:'QA-BRANCH',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:''},
 details:[{rowId:'QA-ROW-001',clientLineId:null,itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',lotNumberByDocument:'QA-LOT',setQuantityByDocument:'999999999999999999',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'}]};

// Both production command-service Unavailable shapes deny all draft rights.
// Neither one authorizes READ; that proof belongs to the separate detail GET.
const unavailableDraft=nullScope=>({scopeKey:nullScope?null:scope,
 access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},
 data:{outcome:'Unavailable',document:null}});
const readonlyLines=Array.from({length:51},(_,index)=>({
 lineId:'QA-READONLY-LINE-'+String(index+1).padStart(3,'0')+'-'+(index===0?'L'.repeat(96):'SYNTHETIC'),
 itemId:'QA-READONLY-ITEM-'+String(index+1).padStart(3,'0')+'-'+(index===0||index===50?'X'.repeat(112):'SYNTHETIC'),
 setQuantityByDocument:index===50?'1234567890123456789012345678.0001':'9999999999999999999999999999.9999',
 barrelQuantityByDocument:index===50?'0.0000':null,
 setQuantityByReal:index===50?null:'-1234567890123456789012345678.0001',
 barrelQuantityByReal:index===50?'-0.0001':'0.0000'}));
const readonlyProjection=(documentId,page=1)=>({document:{documentId,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:null,isLocked:null},
 purchaseOrderLines:[],inboundRequestLines:structuredClone(readonlyLines.slice((page-1)*50,page*50)),page,pageSize:50,hasMore:page===1});

test('I30 compiled application presentation at 320,390,1440',{timeout:240000},async t=>{
 const require=createRequire(import.meta.url);let build,postcss,tailwind,chromium;
 try{({build}=require('esbuild'));postcss=require('postcss');tailwind=require('@tailwindcss/postcss');
  const tools=process.env.MEDCOM_BROWSER_TOOLCHAIN;({chromium}=(tools?createRequire(path.join(path.resolve(tools),'package.json')):require)('playwright-core'));
 }catch{throw Error('I30 NOT_RUN: installed locked application and browser toolchain required; no skip or automatic install.');}
 const executable=process.env.MEDCOM_EDGE_PATH??process.env.I30_TEST_BROWSER??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'Installed Chromium/Edge is required.');await mkdir(output,{recursive:true});
 const contractFile=path.join(output,'inbound-fixture-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['lib/erp/inbound-draft.ts'],outfile:contractFile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {observedView}=await import(pathToFileURL(contractFile).href);
 assert.deepEqual(observedView({outcome:'Observed',document:inbound},inbound.documentId),inbound,'Synthetic inbound data must satisfy the production read contract before browser execution');
 const notificationFile=path.join(output,'notification-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['components/erp/request-notifications.ts'],outfile:notificationFile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {createRequestNotifications}=await import(pathToFileURL(notificationFile).href);
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';import{RequestError}from'./components/erp/request-presentation';import{ApiError}from'./lib/erp/api';import{MobileInboundRequest}from'./components/erp/mobile-inbound-request';import{NavigationGuardProvider,useNavigationGuard}from'./components/erp/navigation-guard';import{Toaster}from'sonner';
 function installReadonlyClockDiagnostics(){
  if(!window.i33ObserveClock)return;
  const nativeSetInterval=window.setInterval,nativeClearInterval=window.clearInterval,active=new Map(),events=[];let serial=0,droppedEvents=0;
  const initialClock=window.i33ClockOrigin,clock=()=>({browserTime:Date.now(),clockDelta:Date.now()-initialClock,performanceTime:performance.now(),visibility:['visible','hidden','prerender'].includes(document.visibilityState)?document.visibilityState:'other',hidden:document.hidden===true});
  const observe=event=>{try{events.push({...event,...clock()});if(events.length>128){events.shift();droppedEvents++;}}catch{}};
  window.setInterval=function(...args){
   const delegated=[...args],observed=args[1]===60000,callback=args[0],timer=observed?{id:++serial,armedAt:Date.now(),lastFireAt:null,fires:0,nominalDue:Date.now()+60000}:null;
   if(timer&&typeof callback==='function')delegated[0]=function(...callbackArgs){
    try{timer.fires++;timer.lastFireAt=Date.now();observe({type:'interval-fire',timer:timer.id,fires:timer.fires,previousNominalDue:timer.nominalDue});timer.nominalDue=timer.lastFireAt+60000;}catch{}
    return Reflect.apply(callback,this,callbackArgs);
   };
   const handle=Reflect.apply(nativeSetInterval,this,delegated);
   if(timer){try{active.set(handle,timer);observe({type:'interval-arm',timer:timer.id,delay:60000,callbackType:typeof callback==='function'?'function':'other',nominalDue:timer.nominalDue});}catch{}}
   return handle;
  };
  window.clearInterval=function(...args){
   const result=Reflect.apply(nativeClearInterval,this,args);
   try{const timer=active.get(args[0]);if(timer){observe({type:'interval-clear',timer:timer.id,fires:timer.fires,nominalDue:timer.nominalDue});active.delete(args[0]);}}catch{}
   return result;
  };
  for(const type of ['focus','blur'])window.addEventListener(type,event=>{if(event.target===window)observe({type:'window-'+type,trusted:event.isTrusted===true});});
  document.addEventListener('visibilitychange',event=>observe({type:'document-visibilitychange',trusted:event.isTrusted===true}));
  window.i33ClockDiagnostics={snapshot:()=>({...clock(),initialClock,activeTimerCount:active.size,activeTimers:[...active.values()].slice(-16).map(timer=>({...timer})),events:events.map(event=>({...event})),droppedEvents})};
 }
 installReadonlyClockDiagnostics();
 window.i30SaveDispatches=[];window.i30ControlDispatches=[];window.i33ReadDispatches=[];window.i33WorkspaceDispatches=[];window.i33WorkspaceDispatchState={total:0,settled:0,pending:0};const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{const pathname=typeof input==='string'?new URL(input,location.href).pathname:'';if(init?.method==='POST'){if(pathname==='/api/erp/api/inbound-requests/draft/save')window.i30SaveDispatches.push(String(init.body));if(pathname.startsWith('/i30/network-control/'))window.i30ControlDispatches.push({kind:pathname.split('/').at(-1),body:String(init.body)});}const pending=nativeFetch(input,init);if(window.i33ObserveClock&&pathname==='/api/erp/api/workspace'){const event={startedAt:Date.now(),settled:false,httpStatus:null,fetchState:'pending'};window.i33WorkspaceDispatchState.total++;window.i33WorkspaceDispatchState.pending++;window.i33WorkspaceDispatches.push(event);if(window.i33WorkspaceDispatches.length>128)window.i33WorkspaceDispatches.shift();void pending.then(response=>{event.httpStatus=response.status;event.fetchState='fulfilled';event.settled=true;event.settledAt=Date.now();window.i33WorkspaceDispatchState.settled++;window.i33WorkspaceDispatchState.pending--;},()=>{event.fetchState='rejected';event.settled=true;event.settledAt=Date.now();window.i33WorkspaceDispatchState.settled++;window.i33WorkspaceDispatchState.pending--;}).catch(()=>{});}if(['/api/erp/api/inbound-requests/draft','/api/erp/api/documents/inbound-requests/detail'].includes(pathname)){const event={path:pathname,settled:false,hasCommandScope:new Headers(init?.headers).has('X-Inbound-Scope')};if(window.i33ObserveClock)Object.assign(event,{startedAt:Date.now(),httpStatus:null,fetchState:'pending'});window.i33ReadDispatches.push(event);void pending.then(async response=>{if(window.i33ObserveClock)Object.assign(event,{httpStatus:response.status,fetchState:'fulfilled'});try{await response.clone().arrayBuffer();}finally{event.settled=true;if(window.i33ObserveClock)event.settledAt=Date.now();}},()=>{event.settled=true;if(window.i33ObserveClock)Object.assign(event,{fetchState:'rejected',settledAt:Date.now()});}).catch(()=>{});}return pending;};
 window.i30Notices=[];const seenNotices=new WeakSet();new MutationObserver(()=>{for(const node of document.querySelectorAll('[data-sonner-toast]'))if(!seenNotices.has(node)){seenNotices.add(node);window.i30Notices.push({type:node.getAttribute('data-type'),text:node.textContent});}}).observe(document.documentElement,{childList:true,subtree:true});
 // Separate component contract fixture, never a replacement for the mounted HTTP bridge.
 const params=new URLSearchParams(location.search),terminalOutcome=params.get('component-outcome');window.i30ComponentCalls=[];window.i30ComponentLeft=false;
 const componentDocument=${JSON.stringify(inbound)},componentAccess={scopeKey:'${scope}',canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576};
 const componentAdapter={read:async()=>({outcome:'Observed',document:structuredClone(componentDocument)}),execute:async command=>{window.i30ComponentCalls.push({body:JSON.stringify(command),frozen:Object.isFrozen(command)&&Object.isFrozen(command.header)});return {outcome:terminalOutcome,receipt:null,code:null};},reconcile:async()=>({outcome:'OutcomeUnknown',receipt:null,code:null})};
 function ComponentLeave(){const guard=useNavigationGuard();return <button type='button' onClick={()=>guard.request(()=>{window.i30ComponentLeft=true;})}>Rời kiểm thử thành phần</button>;}
 function TerminalComponentFixture(){return <NavigationGuardProvider><main className='workspace-content'><h1>Kiểm thử thành phần với adapter tổng hợp</h1><p>Không đi qua Workspace hoặc API. Phản hồi xác định chỉ thuộc hợp đồng thành phần.</p><MobileInboundRequest documentId={componentDocument.documentId} access={componentAccess} adapter={componentAdapter}/><ComponentLeave/></main><Toaster position='top-center' duration={3000} offset='88px' mobileOffset={{top:'76px'}}/></NavigationGuardProvider>;}
 createRoot(document.getElementById('root')).render(params.has('diagnostics')?<RequestError error={new ApiError(503,'PRIVATE_SQL_SENTINEL','PRIVATE_COOKIE_SENTINEL')}/>:['Rejected','Conflict'].includes(terminalOutcome)?<TerminalComponentFixture/>:<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'i30-image'}));build.onLoad({filter:/.*/,namespace:'i30-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const cssSource=await readFile(path.join(app,'app/globals.css'),'utf8');
 const css=(await postcss([tailwind({base:app})]).process(cssSource,{from:path.join(app,'app/globals.css')})).css;
 assert.ok(!css.includes('@import "tailwindcss"'),'Application Tailwind must actually compile.');
 const script=Buffer.from(built.outputFiles[0].contents),logo=await readFile(path.join(app,'public/medcom-logo.png'));
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
 let model,serial=0,browser,context,page,origin,completed=false,fatal=null;const expectedCases=26;const errors=[],results=[],failures=[],captures=[],calls=[],transportEvidence=[],readonlyEvidence=[];
 const reset=(patch={})=>{model={serial:++serial,writable:false,empty:false,status:200,holdList:false,waiters:[],listResponses:0,listResponseHeaders:null,holdDetail:false,detailWaiters:[],detailStatus:200,draftEnvelope:null,draftNetwork:false,draftNetworkFailures:0,draftMalformed:false,draftResponses:0,afterWriteDraftEnvelope:null,holdProjection:false,projectionWaiters:[],projectionStatus:200,projectionKind:null,projectionResponses:0,unknown:false,workspaceReads:0,workspaceResponses:0,workspaceVersions:[],advanceAuthority:false,deniedLists:0,workspaceStatus:200,purchase:structuredClone(purchase),inbound:structuredClone(inbound),purchaseVersion:1,inboundVersion:1,effects:0,originals:new Map(),receipts:new Map(),writes:[],reconciles:[],control:{closed:[],bff:[]},holdCommands:false,commandWaiters:[],commandResponses:0,rejected:false,conflict:false,malformed:false,...patch};calls.length=0;};
 const workspace=()=>({session:{displayName:'SYNTHETIC USER',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:model.advanceAuthority?model.workspaceReads:1,idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString(),capabilities:model.workspaceCapabilities??['purchase-requests.read','inbound-requests.read','purchase-orders.read']},branchIds:['QA-BRANCH'],navigation:['purchase-requests','inbound-requests','purchase-orders'].map(id=>({id,label:id,href:'/?screen='+id}))});
 const send=(res,status,data,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 const readHeaders={'X-Medcom-Session-Scope':session,'X-Medcom-Read-Scope':scope};
 const server=createServer(async(req,res)=>{
  const m=model;try{
   const url=new URL(req.url,origin??'http://localhost');
   if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
   if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
   if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
   if(['/i30/network-control/closed','/i30/network-control/bff'].includes(url.pathname)){
    const parts=[];for await(const part of req)parts.push(part);const digest=sha(Buffer.concat(parts));const kind=url.pathname.endsWith('/closed')?'closed':'bff';m.control[kind].push(digest);
    if(kind==='closed'){res.destroy();return;}return send(res,503,{code:'backend_unavailable'});
   }
   if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
   const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method,documentId:url.searchParams.get('documentId'),page:url.searchParams.get('page'),pageSize:url.searchParams.get('pageSize')});
   if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
   if(route==='/api/workspace'){m.workspaceReads++;const current=workspace();m.workspaceVersions.push(current.session.authorityVersion);m.workspaceResponses++;return send(res,m.workspaceStatus,m.workspaceStatus===200?current:{code:m.workspaceStatus===401?'authentication_required':'backend_unavailable'},readHeaders);}
   if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
   if(route==='/api/purchase-requests/workspace')return send(res,200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
   if(route==='/api/purchase-requests'||route==='/api/documents/inbound-requests'){
    if(m.holdList)await new Promise(resolve=>m.waiters.push(resolve));
    if(m.status!==200){if(m.status===403)m.deniedLists++;return send(res,m.status,{code:'request_failed'},readHeaders);}
    const isPurchase=route==='/api/purchase-requests';
    const rows=m.empty?[]:isPurchase?(m.purchaseDocuments??[m.purchase]).map(document=>({documentId:document.purchaseRequestId,purchaseDate:document.header.purchaseDate,branchId:document.branchId,personSuggest:document.header.personSuggest,department:document.header.department,statusId:document.statusId,isLocked:document.isLocked})):(m.inboundDocuments??[m.inbound]).map(document=>({documentId:document.documentId,documentDate:'2026-10-01',branchId:document.header.branchId,statusId:document.statusId,isLocked:false}));
    const data={rows,page:Number(url.searchParams.get('page')??1),pageSize:isPurchase?20:50,hasMore:false};m.listResponses++;return send(res,200,isPurchase?{scopeKey:scope,data}:data,isPurchase?readHeaders:m.listResponseHeaders??readHeaders);
   }
   if(route==='/api/documents/inbound-requests/detail'){
    const detail=readonlyProjection(url.searchParams.get('documentId'),Number(url.searchParams.get('page')??1));
    let headers=readHeaders;const status=m.projectionStatus;
    if(m.projectionKind==='malformed')detail.inboundRequestLines[0].setQuantityByDocument=42;
    if(m.projectionKind==='wrong-document')detail.document.documentId='QA-OTHER-DOCUMENT';
    if(m.projectionKind==='wrong-branch')detail.document.branchId='QA-UNAUTHORIZED-BRANCH';
    if(m.projectionKind==='wrong-page')detail.page++;
    if(m.projectionKind==='wrong-page-size'&&detail.page===2)detail.pageSize=25;
    if(m.projectionKind==='wrong-read-scope')headers={...readHeaders,'X-Medcom-Read-Scope':'c'.repeat(64)};
    if(m.projectionKind==='wrong-session-scope')headers={...readHeaders,'X-Medcom-Session-Scope':'c'.repeat(64)};
    if(m.projectionKind==='missing-read-scope')headers={};
    if(m.holdProjection)await new Promise(resolve=>m.projectionWaiters.push(resolve));
    m.projectionResponses++;return send(res,status,status===200?detail:{code:'request_failed'},headers);
   }
   if(route==='/api/purchase-requests/detail'||route==='/api/inbound-requests/draft'){
    if(m.holdDetail)await new Promise(resolve=>m.detailWaiters.push(resolve));if(route==='/api/inbound-requests/draft')m.draftResponses++;if(m.detailStatus!==200)return send(res,m.detailStatus,{code:'backend_unavailable'});
    const id=url.searchParams.get('documentId');
    if(route==='/api/purchase-requests/detail'){const document=m.purchaseDocuments?m.purchaseDocuments.find(document=>document.purchaseRequestId===id):m.purchase;if(!document)return send(res,404,{code:'request_failed'});return send(res,200,{scopeKey:scope,data:{document,stateToken:'prs1.'+m.purchaseVersion.toString(16).padStart(64,'0'),commandAccess:{canSave:m.writable,canSubmit:m.writable,canLookup:m.writable,canAddLines:false,reason:m.writable?'available':'command_access_provider_unavailable'}}});}
    if(m.draftMalformed){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"scopeKey":');}
    if(m.draftEnvelope)return send(res,200,m.draftEnvelope);
    const document=m.inboundDocuments?m.inboundDocuments.find(document=>document.documentId===id):m.inbound;if(!document)return send(res,404,{code:'request_failed'});return send(res,200,{scopeKey:scope,access:{canRead:true,canSave:m.writable,canSend:m.writable,available:true,maxCommandBytes:1048576},data:{outcome:'Observed',document}});
   }
   if(req.method==='POST'&&['/api/inbound-requests/draft/save','/api/inbound-requests/draft/send-to-warehouse','/api/inbound-requests/draft/reconcile','/api/purchase-requests/save','/api/purchase-requests/submit','/api/purchase-requests/save/lookup','/api/purchase-requests/submit/lookup'].includes(route)){
    const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString('utf8'),command=JSON.parse(body);
    const isPurchase=route.startsWith('/api/purchase-requests/'),lookup=route.endsWith('/reconcile')||route.endsWith('/lookup');
    const id=isPurchase?command.idempotencyKey:command.operationId;
    if(lookup){assert.equal(body,m.originals.get(id),'Reconciliation preserves the exact original body');m.reconciles.push(sha(body));if(!isPurchase&&!m.receipts.has(id)&&(m.rejected||m.conflict))return send(res,200,{scopeKey:scope,data:{outcome:'OutcomeUnknown',receipt:null,code:null}});assert.ok(m.receipts.get(id),'Only a committed fixture receipt may be replayed');return send(res,200,{scopeKey:scope,data:isPurchase?{outcome:0,receipt:m.receipts.get(id)}:{outcome:'Replayed',receipt:m.receipts.get(id),code:null}});}
    m.writes.push({operationId:id,bodySha256:sha(body)});
    if(m.originals.has(id)){assert.equal(m.originals.get(id),body);return send(res,503,{code:'backend_unavailable'});}
    m.originals.set(id,body);if(m.holdCommands)await new Promise(resolve=>m.commandWaiters.push(resolve));
    if(m.rejected||m.conflict){m.commandResponses++;return send(res,200,{scopeKey:scope,data:{outcome:m.conflict?'Conflict':'Rejected',receipt:null,code:null}});}
    let receipt;
    if(isPurchase){
     const submit=route.endsWith('/submit');if(submit){m.purchase.statusId=2;m.purchase.isLocked=true;}else{m.purchase.header=structuredClone(command.header);for(const line of command.lineChanges){if(line.kind==='Remove')m.purchase.lines=m.purchase.lines.filter(row=>row.lineId!==line.lineId);else if(line.kind==='Update')m.purchase.lines=m.purchase.lines.map(row=>row.lineId===line.lineId?{lineId:line.lineId,values:line.values}:row);}}
     m.purchaseVersion++;receipt={actionId:'purchase-request.'+(submit?'submit':'save-draft'),idempotencyKey:id,document:structuredClone(m.purchase),stateToken:'prs1.'+m.purchaseVersion.toString(16).padStart(64,'0'),allocatedLines:[]};
    }else{
     if(command.action==='Save'){m.inbound.header=structuredClone(command.header);m.inbound.details=m.inbound.details.filter(row=>!command.removedDetailIds.includes(row.rowId));for(const row of command.detailUpserts){const next={...row,rowId:row.rowId??'QA-NEW-ROW',clientLineId:null};const at=m.inbound.details.findIndex(old=>old.rowId===next.rowId);if(at<0)m.inbound.details.push(next);else m.inbound.details[at]=next;}}else m.inbound.statusId=2;
     m.inbound.stateEqualityToken=(++m.inboundVersion).toString(16).toUpperCase().padStart(64,'0');receipt={operationId:id,documentId:m.inbound.documentId,statusId:m.inbound.statusId,stateEqualityToken:m.inbound.stateEqualityToken,auditId:'22222222-2222-4222-8222-222222222222',committedAtUtc:new Date().toISOString()};
    }
    m.receipts.set(id,receipt);m.effects++;m.commandResponses++;if(!isPurchase&&m.afterWriteDraftEnvelope)m.draftEnvelope=structuredClone(m.afterWriteDraftEnvelope);if(m.unknown)return send(res,503,{code:'backend_unavailable'});
    const wireReceipt=m.malformed?(isPurchase?{...receipt,idempotencyKey:'not-original'}:{...receipt,auditId:'invalid'}):receipt;
    return send(res,200,{scopeKey:scope,data:isPurchase?{outcome:0,receipt:wireReceipt}:{outcome:'Committed',receipt:wireReceipt,code:null}});
   }
   return send(res,404,{code:'request_failed'});
  }catch(error){errors.push('Synthetic server failure: '+String(error));send(res,500,{code:'request_failed'});}
 });
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const eventually=async predicate=>{const deadline=Date.now()+10000;while(!(await predicate())){t.signal.throwIfAborted();assert.ok(Date.now()<deadline,'Synthetic request did not reach expected state');await new Promise(resolve=>setTimeout(resolve,20));}};
 const release=()=>{model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());model.holdDetail=false;model.detailWaiters.splice(0).forEach(resolve=>resolve());model.holdCommands=false;model.commandWaiters.splice(0).forEach(resolve=>resolve());model.holdProjection=false;model.projectionWaiters.splice(0).forEach(resolve=>resolve());};
 // Repeatable teardown also closes resources whose launch completed after abort.
 const cleanup=async()=>{
  release();server.closeAllConnections();
  const outcomes=await Promise.allSettled([context?.close(),browser?.close(),new Promise((resolve,reject)=>server.close(error=>{
   if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);else resolve();
  }))]);
  const rejected=outcomes.filter(value=>value.status==='rejected');
  if(rejected.length)throw new AggregateError(rejected.map(value=>value.reason),'I30 browser teardown failed');
 };
 const abortCleanup=()=>{void cleanup().catch(error=>errors.push(String(error)));};
 t.signal.addEventListener('abort',abortCleanup,{once:true});
 async function start(width,screen,patch={},query=''){release();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900},locale:'vi-VN',serviceWorkers:'block'});page=await context.newPage();if(patch.installClock){const clockTime=new Date();await page.clock.install({time:clockTime});await page.addInitScript(clockOrigin=>{window.i33ObserveClock=true;window.i33ClockOrigin=clockOrigin;},clockTime.getTime());}page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(model.draftNetwork&&url.pathname==='/api/erp/api/inbound-requests/draft'){model.draftNetworkFailures++;return route.abort('failed');}return route.continue();});await page.goto(origin+'/?screen='+screen+query);}
 const host=screen=>screen==='purchase-requests'?page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true}):page.getByTestId('inbound-request-host');
 async function layout(width,screen){await paint();const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:document.documentElement.scrollWidth<=innerWidth?[]:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+.5||r.left<-.5);}).slice(0,24).map(el=>({tag:el.tagName,className:typeof el.className==='string'?el.className:'',width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))}));assert.ok(overflow.scrollWidth<=overflow.width,'Page overflow at '+width+': '+JSON.stringify(overflow));
  const checks=await host(screen).locator('button:visible,input:not([type=checkbox]):visible,textarea:visible,select:visible,summary:visible').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})));
  assert.ok(checks.length);assert.ok(checks.every(v=>v.height>=43.5),'Request touch targets must be at least 44px: '+JSON.stringify(checks));
  if(width<768)assert.ok(checks.filter(v=>['INPUT','TEXTAREA','SELECT'].includes(v.tag)).every(v=>v.font>=16),'Mobile input/textarea fonts must be 16px');
 }
 async function capture(name,{viewport=false,keepFocus=false}={}){if(!keepFocus)await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await paint();const file=name+'.png';await page.screenshot({path:path.join(output,file),fullPage:!viewport});const bytes=await readFile(path.join(output,file));captures.push({file,sha256:sha(bytes),fullPage:!viewport,keepsFocus:keepFocus});}
 async function expandFullReadback(){const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await region.waitFor();const disclosure=region.locator('details');if(!await disclosure.evaluate(el=>el.open))await disclosure.locator('summary').click();return region;}
 const open=screen=>screen==='purchase-requests'?page.getByRole('button',{name:'Mở đề nghị '+model.purchase.purchaseRequestId,exact:true}):page.getByRole('button',{name:new RegExp('^Mở phiếu '+model.inbound.documentId+' ')});
 async function run(name,fn){await t.test(name,async()=>{try{await fn();results.push(name);}catch(error){failures.push(name);throw error;}});}
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});t.signal.throwIfAborted();
  for(const width of [320,390,1440])for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${width} ${screen} list and authorized read-only detail`,async()=>{
    await start(width,screen);await open(screen).waitFor();if(screen==='inbound-requests')assert.equal(await page.getByText('Phiên hoặc quyền đọc hiện tại không khả dụng. Dữ liệu của phiên trước được ẩn.',{exact:true}).isVisible(),false);await layout(width,screen);assert.match(await host(screen).innerText(),/01\/10\/2026/);await capture(`${screen}-list-${width}`);
    const filter=host(screen).locator('input').first();await filter.focus();assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
    await open(screen).click();if(screen==='purchase-requests')await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();
    await layout(width,screen);assert.equal(calls.filter(v=>v.method==='POST').length,0);assert.equal((await page.evaluate(()=>window.i30Notices)).length,0,'Read-only reads do not notify');
    if(screen==='purchase-requests'){await capture(`${screen}-disclosure-closed-${width}`);await expandFullReadback();const table=page.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});assert.equal(await table.getByRole('columnheader').count(),8);assert.equal(await table.locator('tbody tr').count(),purchase.lines.length);assert.equal(await table.getByRole('cell').count(),8*purchase.lines.length);assert.match(await table.innerText(),/999999999999999999/);assert.equal(await table.getByText('QA-ITEM-WITH-LONG-SYNTHETIC-CODE',{exact:true}).isVisible(),true);}
    await capture(`${screen}-readonly-${width}`);
    if(width<768){
     // Production source limits differ: purchase IDs permit 100 characters;
     // inbound draft IDs permit 50. Exercise both unbroken maximum identities.
     const longId=(screen==='purchase-requests'?'P':'I').repeat(screen==='purchase-requests'?100:50);
     await start(width,screen,screen==='purchase-requests'?{purchase:{...structuredClone(purchase),purchaseRequestId:longId}}:{inbound:{...structuredClone(inbound),documentId:longId}});await open(screen).waitFor();await layout(width,screen);
     const identity=host(screen).getByText(longId,{exact:true}).first();assert.equal(await identity.textContent(),longId);assert.equal(await identity.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].every(rect=>rect.left>=0&&rect.right<=innerWidth)&&el.scrollWidth<=Math.ceil(el.clientWidth);}),true,'Every maximum-width identifier character remains contained and readable');await capture(`${screen}-maximum-id-${width}`);
     await open(screen).click();if(screen==='purchase-requests')await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await capture(`${screen}-maximum-id-detail-${width}`);await layout(width,screen);assert.equal(calls.filter(v=>v.method==='POST').length,0);
    }
   });
  }
  for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${screen} loading, empty and failed list`,async()=>{
    await start(390,screen,{holdList:true});await eventually(()=>model.waiters.length>0);await host(screen).getByRole('status').first().waitFor();await capture(`${screen}-loading-390`);release();await open(screen).waitFor();
    await start(390,screen,{empty:true});await host(screen).getByText(/Không có|Chưa có/).first().waitFor();await layout(390,screen);await capture(`${screen}-empty-390`);
    await start(320,screen,{status:503});await host(screen).getByText(/Chưa tải|Không thể|khả dụng/).first().waitFor();await layout(320,screen);await capture(`${screen}-error-320`);
    await start(390,screen,{status:403});await eventually(()=>model.deniedLists>0);
    if(screen==='purchase-requests'){
     await eventually(()=>model.workspaceReads>=2);
     await page.getByRole('region',{name:'Xác minh lại phiên mua hàng',exact:true}).waitFor();
     assert.equal(await host(screen).getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);
     assert.equal(await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).count(),0);
     await paint();assert.equal(model.workspaceReads,2,'A denied read permits one bounded parent recheck');assert.equal(model.deniedLists,1);
     assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
    }else await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();
    await capture(`${screen}-denied-390`);assert.equal(await open(screen).count(),0);
   });
  }
  await run('mobile editable exact values and unresolved Save keep custody',async()=>{
   await start(390,'inbound-requests',{writable:true,unknown:true});
   const control=await page.evaluate(async()=>{const results=[];for(const kind of ['closed','bff']){try{const response=await fetch('/i30/network-control/'+kind,{method:'POST',body:'SYNTHETIC TRANSPORT CONTROL'});results.push({kind,status:response.status});}catch{results.push({kind,status:null});}}return results;});
   const controlDispatches=await page.evaluate(()=>window.i30ControlDispatches);for(const kind of ['closed','bff'])assert.equal(controlDispatches.filter(event=>event.kind===kind).length,1);assert.equal(control[0].status,null);assert.ok(model.control.closed.length>=1);assert.equal(new Set(model.control.closed).size,1);assert.equal(model.control.bff.length,1);assert.equal(control[1].status,503);
   await open('inbound-requests').click();const order=page.getByLabel('Số đơn',{exact:true});await order.waitFor();await order.fill('SYNTHETIC EDIT');await order.focus();await layout(390,'inbound-requests');
   assert.equal(await page.getByLabel('Số lượng bộ theo chứng từ',{exact:true}).inputValue(),'999999999999999999');
   await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');assert.equal(await page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).isEnabled(),true);
   assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);assert.equal(model.effects,1);assert.equal((await page.evaluate(()=>window.i30SaveDispatches)).length,1);await layout(390,'inbound-requests');await capture('inbound-requests-unresolved-390');
   await page.getByRole('button',{name:'Đóng phiếu nhập hàng',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);await capture('inbound-requests-custody-390');assert.equal((await page.evaluate(()=>window.i30Notices)).length,0,'Unknown result is never a success or failure toast');
   await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='editing');
   assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC EDIT');assert.equal(model.effects,1);assert.equal(model.writes.length,1);assert.equal(model.reconciles.length,1);assert.equal(model.reconciles[0],model.writes[0].bodySha256);
   const clientBodies=await page.evaluate(()=>window.i30SaveDispatches);assert.equal(clientBodies.length,1);assert.equal(sha(clientBodies[0]),model.writes[0].bodySha256);
   transportEvidence.push({control:{responses:control,clientCalls:controlDispatches.map(event=>({kind:event.kind,bodySha256:sha(event.body)})),closedServerRequests:model.control.closed.length,closedBodyHashes:model.control.closed,bffServerRequests:model.control.bff.length},applicationSaveDispatches:clientBodies.length,serverSaveRequests:model.writes.length,effects:model.effects,originalBodySha256:model.writes[0].bodySha256,reconcileBodySha256:model.reconciles[0]});await capture('inbound-requests-reconciled-390');await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await paint();assert.equal((await page.evaluate(()=>window.i30Notices)).length,1);assert.equal(model.effects,1);assert.equal(model.writes.length,1);
  });
  await run('notification ledger deduplicates receipts and fences scopes without changing outcomes',async()=>{
   const emitted=[],dismissed=[];const sink={success:(message)=>{emitted.push(['success',message]);return emitted.length;},error:(message)=>{emitted.push(['error',message]);return emitted.length;},warning:(message)=>{emitted.push(['warning',message]);return emitted.length;},dismiss:id=>dismissed.push(id)};
   const notices=createRequestNotifications(sink);notices.configure('A',true);for(const receipt of [{operationId:'receipt-1',receiptId:'first'},{operationId:'receipt-1',receiptId:'different'}])notices.notify('A',receipt.operationId,'saved');assert.equal(emitted.length,1);
   notices.configure('A',false);assert.deepEqual(dismissed,[1]);notices.notify('A','receipt-2','saved');assert.equal(emitted.length,1);
   notices.configure('A',true);notices.notify('A','receipt-1','saved');assert.equal(emitted.length,1);notices.notify('A','receipt-2','submitted');assert.equal(emitted.length,2);
   notices.configure('B',true);notices.notify('A','receipt-3','saved');assert.equal(emitted.length,2);notices.retire();notices.notify('B','receipt-4','saved');assert.equal(emitted.length,2);
   // Output receipt identity is not the operation identity: independent operations
   // may share that output, while a replay may return different output metadata.
   const independent=[],byIntent=createRequestNotifications({...sink,success:message=>{independent.push(message);return 'operation-'+independent.length;}});byIntent.configure('A',true);
   for(const receipt of [{intentId:'original-A',receiptId:'shared'},{intentId:'original-B',receiptId:'shared'}])byIntent.notify('A',receipt.intentId,'saved');assert.equal(independent.length,2);
   byIntent.notify('A',{intentId:'original-A',receiptId:'changed'}.intentId,'saved');assert.equal(independent.length,2);byIntent.retire();
   const terminalMessages=[],terminal=createRequestNotifications({...sink,error:message=>{terminalMessages.push(['error',message]);return 'rejected';},warning:message=>{terminalMessages.push(['warning',message]);return 'conflict';}});terminal.configure('A',true);terminal.notify('A','definitive-rejection','rejected');terminal.notify('A','definitive-conflict','conflict');assert.deepEqual(terminalMessages,[['error','Chưa thể hoàn tất thao tác. Kiểm tra thông tin trên phiếu.'],['warning','Phiếu đã thay đổi trên ERP. Kiểm tra trước khi thao tác lại.']]);terminal.retire();
   const broken=createRequestNotifications({...sink,success:()=>{throw Error('synthetic notification failure');}});broken.configure('A',true);assert.doesNotThrow(()=>broken.notify('A','receipt','saved'));
  });
  const notices=()=>page.evaluate(()=>structuredClone(window.i30Notices));
  const toastText=text=>page.locator('[data-sonner-toast]').filter({hasText:text});
  const inboundReady=()=>page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='editing'&&!document.getElementById('inbound-header-orderNumber')?.matches(':disabled'));
  const saveInbound=async()=>{await open('inbound-requests').click();await inboundReady();await page.getByLabel('Số đơn',{exact:true}).fill('SYNTHETIC TOAST EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();};
  await run('purchase Save and Submit notify once from validated receipts',async()=>{
   await start(390,'purchase-requests',{writable:true});await open('purchase-requests').click();await page.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC TOAST EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();
   await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await toastText('ERP đã xác nhận gửi đề nghị mua hàng.').waitFor();await page.getByRole('button',{name:'Làm mới',exact:true}).click();await paint();
   assert.deepEqual((await notices()).map(v=>v.type),['success','success']);assert.equal(calls.filter(v=>v.route==='/api/purchase-requests/save').length,1);assert.equal(calls.filter(v=>v.route==='/api/purchase-requests/submit').length,1);await capture('purchase-request-toast-390');
  });
  await run('inbound Save and Send notify once and survive readback without duplicates',async()=>{
   await start(390,'inbound-requests',{writable:true});await saveInbound();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();await inboundReady();await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await toastText('ERP đã xác nhận gửi yêu cầu nhập kho.').waitFor();await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await paint();
   assert.deepEqual((await notices()).map(v=>v.type),['success','success']);assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/send-to-warehouse').length,1);await capture('inbound-request-toast-390');
  });
  await run('hosted no-receipt rejection and conflict remain unknown without false terminal notices',async()=>{
   for(const kind of ['rejected','conflict']){
    await start(390,'inbound-requests',{writable:true,[kind]:true});await saveInbound();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');const reconcile=page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true});assert.equal(await reconcile.isEnabled(),true);
    assert.deepEqual(await notices(),[]);assert.equal(model.effects,0);assert.equal(model.writes.length,1);assert.equal((await page.evaluate(()=>window.i30SaveDispatches)).length,1);await reconcile.click();await eventually(()=>model.reconciles.length===1);await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');assert.equal(await reconcile.isEnabled(),true);
    assert.equal(model.reconciles.length,1);assert.equal(model.reconciles[0],model.writes[0].bodySha256);assert.equal(model.effects,0);assert.equal(model.writes.length,1);assert.deepEqual(await notices(),[]);await capture(`inbound-no-receipt-${kind}-390`);
   }
  });
  await run('component contract only: trusted definitive outcomes render real Sonner errors and warnings',async()=>{
   for(const outcome of ['Rejected','Conflict']){
    await start(390,'inbound-requests',{},'&component-outcome='+outcome);await page.getByRole('heading',{name:'Kiểm thử thành phần với adapter tổng hợp',exact:true}).waitFor();await inboundReady();await page.getByLabel('Số đơn',{exact:true}).fill('SYNTHETIC DEFINITIVE ADAPTER EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    const text=outcome==='Rejected'?'Chưa thể hoàn tất thao tác. Kiểm tra thông tin trên phiếu.':'Phiếu đã thay đổi trên ERP. Kiểm tra trước khi thao tác lại.';await toastText(text).waitFor();assert.deepEqual((await notices()).map(notice=>notice.type),[outcome==='Rejected'?'error':'warning']);assert.equal(await page.getByTestId('inbound-editor').getAttribute('data-phase'),outcome==='Rejected'?'failed':'conflict');
    const commands=await page.evaluate(()=>window.i30ComponentCalls);assert.equal(commands.length,1);assert.equal(commands[0].frozen,true);assert.equal(JSON.parse(commands[0].body).header.orderNumber,'SYNTHETIC DEFINITIVE ADAPTER EDIT');assert.equal(calls.length,0,'This labelled component contract fixture makes no HTTP/API claims or requests');
    await page.getByRole('button',{name:'Rời kiểm thử thành phần',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.i30ComponentLeft),false);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC DEFINITIVE ADAPTER EDIT');await capture(`component-terminal-${outcome.toLowerCase()}-toast-390`,{viewport:true});
   }
  });
  await run('malformed purchase and inbound acknowledgments never announce success',async()=>{
   for(const screen of ['purchase-requests','inbound-requests']){
    await start(390,screen,{writable:true,malformed:true});
    if(screen==='inbound-requests'){await saveInbound();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');}
    else{await open(screen).click();await page.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC MALFORMED ACK');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();}
    await paint();assert.deepEqual(await notices(),[]);assert.equal(model.commandResponses,1);
   }
  });
  await run('retired command acknowledgment cannot produce a late success notification',async()=>{
   await start(390,'inbound-requests',{writable:true,holdCommands:true});await saveInbound();await eventually(()=>model.commandWaiters.length===1);model.workspaceStatus=401;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByTestId('inbound-editor').waitFor({state:'detached'});release();await eventually(()=>model.commandResponses===1);await paint();assert.deepEqual(await notices(),[]);
  });
  await run('workspace outage dismisses scoped notices and polls stay quiet',async()=>{
   await start(390,'inbound-requests',{writable:true});await saveInbound();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();await inboundReady();model.workspaceStatus=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByLabel('Số đơn',{exact:true}).waitFor({state:'detached'});await page.locator('[data-sonner-toast]').waitFor({state:'detached'});assert.equal((await notices()).length,1);
   model.workspaceStatus=200;await page.getByRole('button',{name:'Xác minh lại phiên nhập hàng',exact:true}).click();await inboundReady();await paint();assert.equal((await notices()).length,1);
  });
  await run('disclosure exposes every one of 101 and 500 source rows with exact values',async()=>{
   for(const [width,count] of [[320,101],[390,500]]){
    const document=structuredClone(purchase);document.lines=Array.from({length:count},(_,index)=>({...structuredClone(purchase.lines[0]),lineId:'QA-LINE-'+String(index+1).padStart(3,'0')}));
    await start(width,'purchase-requests',{purchase:document});await open('purchase-requests').click();const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await region.waitFor();
    assert.equal(await region.locator('details').evaluate(el=>el.open),false);assert.equal(await region.locator('table').isVisible(),false);assert.equal(await region.locator('tbody tr').count(),count,'Disclosure does not drop hidden rows');
    await expandFullReadback();const table=region.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});assert.equal(await table.getByRole('columnheader').count(),8);assert.equal(await table.locator('tbody tr').count(),count);assert.equal(await table.getByRole('cell').count(),8*count);
    assert.match(await region.innerText(),/2026-10-01T14:22:11.003/);assert.match(await region.innerText(),/NULL/);const last=table.locator('tbody tr').last();assert.match(await last.innerText(),new RegExp('QA-LINE-'+String(count).padStart(3,'0')));assert.match(await last.innerText(),/999999999999999999/);assert.match(await last.innerText(),/""/);
    await layout(width,'purchase-requests');await last.scrollIntoViewIfNeeded();await capture(`purchase-full-${count}-last-row-${width}`,{viewport:true,keepFocus:true});assert.equal(calls.filter(v=>v.method==='POST').length,0);
   }
  });
  await run('dark request surfaces retain keyboard focus, native disclosure and mobile containment',async()=>{
   for(const width of [390,1440])for(const screen of ['purchase-requests','inbound-requests']){
    await start(width,screen);await open(screen).waitFor();await page.getByRole('button',{name:'Chuyển giao diện tối',exact:true}).click();await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    const filter=host(screen).locator('input').first();await page.keyboard.press('Tab');await filter.focus();assert.equal(await filter.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')),true);const focus=await filter.evaluate(el=>{const style=getComputedStyle(el);return {outline:style.outlineStyle,width:parseFloat(style.outlineWidth),shadow:style.boxShadow};});assert.ok(focus.outline!=='none'&&focus.width>=2,'Keyboard focus must have the actual 2px outline, not merely an unfocused default shadow');await layout(width,screen);await filter.scrollIntoViewIfNeeded();await capture(`${screen}-dark-focus-${width}`,{viewport:true,keepFocus:true});
    await open(screen).click();if(screen==='purchase-requests'){const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});const summary=region.locator('summary');await summary.waitFor();await summary.focus();await page.keyboard.press('Enter');assert.equal(await region.locator('details').evaluate(el=>el.open),true);await page.keyboard.press('Space');assert.equal(await region.locator('details').evaluate(el=>el.open),false);}else await page.getByLabel('Số đơn',{exact:true}).waitFor();await layout(width,screen);await capture(`${screen}-dark-readonly-${width}`);assert.equal(calls.filter(v=>v.method==='POST').length,0);
   }
  });
  const fullLists=()=>({purchaseDocuments:Array.from({length:20},(_,index)=>({...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-'+String(index+1).padStart(3,'0')})),inboundDocuments:Array.from({length:50},(_,index)=>({...structuredClone(inbound),documentId:'QA-INBOUND-'+String(index+1).padStart(3,'0')}))});
  const focusRegion=screen=>page.getByRole('region',{name:screen==='purchase-requests'?'Phiếu mua hàng hiện có':'Phiếu nhập hàng đã chọn',exact:true});
  const openRow=(screen,index)=>screen==='purchase-requests'?page.getByRole('button',{name:'Mở đề nghị QA-PURCHASE-'+String(index).padStart(3,'0'),exact:true}):page.getByRole('button',{name:new RegExp('^Mở phiếu QA-INBOUND-'+String(index).padStart(3,'0')+' ')});
  const closeSelection=screen=>page.getByRole('button',{name:screen==='purchase-requests'?'Đóng đề nghị':'Đóng phiếu nhập hàng',exact:true});
  async function focusedVisible(locator){await eventually(()=>locator.evaluate(element=>document.activeElement===element));await paint();const metrics=await locator.evaluate(element=>({top:element.getBoundingClientRect().top,header:document.querySelector('.topbar')?.getBoundingClientRect().bottom??0,height:innerHeight,tag:element.tagName}));assert.ok(metrics.top>=metrics.header-1&&metrics.top<metrics.height-90,JSON.stringify(metrics));assert.ok(!['INPUT','TEXTAREA','SELECT'].includes(metrics.tag));}
  await run('full20/50-row lists move explicit pointer and keyboard Open to detail and Close to origin',async()=>{
   for(const width of [320,390,1440])for(const screen of ['purchase-requests','inbound-requests']){
    await start(width,screen,fullLists());await openRow(screen,1).waitFor();assert.equal(await host(screen).getByRole('button',{name:screen==='purchase-requests'?/^Mở đề nghị QA-PURCHASE-/:/^Mở phiếu QA-INBOUND-/}).count(),screen==='purchase-requests'?20:50);
    const filter=host(screen).locator('input').first();await filter.fill('UNAPPLIED FILTER DRAFT');
    await openRow(screen,1).click();await focusedVisible(focusRegion(screen));await capture(`${screen}-full-list-open-${width}`,{viewport:true,keepFocus:true});await layout(width,screen);await closeSelection(screen).click();await focusedVisible(openRow(screen,1));assert.equal(await filter.inputValue(),'UNAPPLIED FILTER DRAFT');
    const middle=screen==='purchase-requests'?11:26;await openRow(screen,middle).focus();await page.keyboard.press('Enter');await focusedVisible(focusRegion(screen));await capture(`${screen}-full-list-keyboard-open-${width}`,{viewport:true,keepFocus:true});await openRow(screen,middle).click();await focusedVisible(focusRegion(screen));await closeSelection(screen).focus();await page.keyboard.press('Enter');await focusedVisible(openRow(screen,middle));await capture(`${screen}-full-list-close-${width}`,{viewport:true,keepFocus:true});assert.equal(await filter.inputValue(),'UNAPPLIED FILTER DRAFT');assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('late or failed explicit reads never steal later input or refresh focus',async()=>{
   for(const screen of ['purchase-requests','inbound-requests']){
    await start(390,screen,{...fullLists(),holdDetail:true});await openRow(screen,1).click();await eventually(()=>model.detailWaiters.length>0);const filter=host(screen).locator('input').first();await filter.fill('KEEP USER FOCUS');release();await focusRegion(screen).waitFor();if(screen==='purchase-requests')await page.getByLabel('Ghi chú',{exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();assert.equal(await filter.evaluate(element=>document.activeElement===element),true);await capture(`${screen}-cancelled-focus-390`,{viewport:true,keepFocus:true});
    await start(390,screen,{...fullLists(),holdDetail:true});await openRow(screen,1).click();await eventually(()=>model.detailWaiters.length>0);assert.equal(await page.evaluate(()=>document.hidden),false);await page.evaluate(()=>window.dispatchEvent(new FocusEvent('blur')));release();if(screen==='purchase-requests')await page.getByLabel('Ghi chú',{exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();assert.equal(await focusRegion(screen).evaluate(element=>document.activeElement===element),false,'A window-blur signal retires focus even while the document remains visible');
    await start(390,screen,{...fullLists(),detailStatus:503});await openRow(screen,1).click();const retry=page.getByRole('button',{name:screen==='purchase-requests'?'Làm mới':'Xác minh lại quyền nhập hàng',exact:true});if(screen==='purchase-requests')await host(screen).getByRole('alert').waitFor();else await host(screen).getByText('Chưa xác minh được quyền nhập hàng. Ý định đang giữ không bị bỏ; thử xác minh lại trong đúng phiên.',{exact:true}).waitFor();model.detailStatus=200;await retry.click();if(screen==='purchase-requests')await page.getByLabel('Ghi chú',{exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();assert.equal(await focusRegion(screen).evaluate(element=>document.activeElement===element),false);await openRow(screen,1).click();await focusedVisible(focusRegion(screen));assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('support details never expose arbitrary errors or references',async()=>{
   await page.goto(origin+'/?diagnostics=1');await page.getByText('Thông tin hỗ trợ',{exact:true}).click();const text=await page.locator('body').innerText();assert.match(text,/503/);assert.match(text,/unknown_code/);assert.doesNotMatch(text,/PRIVATE_SQL_SENTINEL|PRIVATE_COOKIE_SENTINEL/);
  });
  const projectionRoute='/api/documents/inbound-requests/detail';
  const readonlyPanel=()=>page.getByTestId('inbound-request-readonly');
  const projectionCalls=()=>calls.filter(call=>call.route===projectionRoute);
  const draftCalls=()=>page.evaluate(()=>window.i33ReadDispatches.filter(event=>event.path==='/api/erp/api/inbound-requests/draft'));
  async function settledReads(){await page.waitForFunction(()=>window.i33ReadDispatches.length>0&&window.i33ReadDispatches.every(event=>event.settled));await paint();}
  async function readonlyReady(number){await page.waitForFunction(number=>{const panel=document.querySelector('[data-testid=inbound-request-readonly]');return panel?.getAttribute('data-phase')==='ready'&&(number===undefined||panel.querySelector('article h4')?.textContent==='Dòng '+((number-1)*50+1));},number);}
  async function noReadonlyValues(){assert.equal(await page.getByText(readonlyLines[0].itemId,{exact:true}).count(),0);assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0);assert.equal(await page.getByLabel('Số đơn',{exact:true}).count(),0);assert.equal(calls.filter(call=>call.method==='POST').length,0);}
  function releaseDraft(){model.holdDetail=false;model.detailWaiters.splice(0).forEach(resolve=>resolve());}
  function releaseProjection(){model.holdProjection=false;model.projectionWaiters.splice(0).forEach(resolve=>resolve());}
  let diagnosticSnapshots=0;
  async function recordReadonlyClockSnapshot(group,observation,stage){
   if(diagnosticSnapshots++>=64)return;
   const count=route=>calls.filter(call=>call.route===route).length;
   const server={requests:{workspace:count('/api/workspace'),list:count('/api/documents/inbound-requests'),draft:count('/api/inbound-requests/draft'),projection:projectionCalls().length},responseAttempts:{workspace:model.workspaceResponses,list:model.listResponses,draft:model.draftResponses,projection:model.projectionResponses},authorityObservationCount:model.workspaceVersions.length,authorityVersions:model.workspaceVersions.slice(-32)};
   try{
    const client=await page.evaluate(()=>{
     const fixedPhase=(element,allowed)=>{const phase=element?.getAttribute('data-phase');return phase===undefined||phase===null?'absent':allowed.includes(phase)?phase:'other';};
     const host=document.querySelector('[data-testid=inbound-request-host]'),panel=document.querySelector('[data-testid=inbound-request-readonly]'),editor=document.querySelector('[data-testid=inbound-editor]');
     const summarize=(events,counts)=>({total:counts?.total??events.length,retained:events.length,settled:counts?.settled??events.filter(event=>event.settled).length,pending:counts?.pending??events.filter(event=>!event.settled).length,recent:events.slice(-32).map(event=>({kind:event.path==='/api/erp/api/inbound-requests/draft'?'draft':event.path==='/api/erp/api/documents/inbound-requests/detail'?'projection':'workspace',settled:event.settled===true,hasCommandScope:event.hasCommandScope===true,fetchState:['pending','fulfilled','rejected'].includes(event.fetchState)?event.fetchState:'unobserved',httpStatus:Number.isInteger(event.httpStatus)?event.httpStatus:null,startedClockDelta:Number.isFinite(event.startedAt)?event.startedAt-window.i33ClockOrigin:null,settledClockDelta:Number.isFinite(event.settledAt)?event.settledAt-window.i33ClockOrigin:null}))});
     return {clock:window.i33ClockDiagnostics?.snapshot()??null,fetch:{workspace:summarize(window.i33WorkspaceDispatches??[],window.i33WorkspaceDispatchState),reads:summarize(window.i33ReadDispatches??[])},ui:{hostPresent:!!host,hostPhase:!host?'absent':host.getAttribute('data-readback-pending')==='true'?'readback-pending':host.querySelector('button[aria-label^="Mở phiếu "][aria-pressed=true]')?'visible-selected-row':'no-visible-selected-row',readbackPending:host?.getAttribute('data-readback-pending')==='true',panelPhase:fixedPhase(panel,['pending','ready','failed']),editorPhase:fixedPhase(editor,['empty','loading','editing','checking','pending','unknown','reconciling','failed','conflict','confirmed','readFailed']),selectedRowCount:host?.querySelectorAll('button[aria-label^="Mở phiếu "][aria-pressed=true]').length??0,listRowCount:host?.querySelectorAll('button[aria-label^="Mở phiếu "]').length??0,detailFocused:document.activeElement?.getAttribute('aria-label')==='Phiếu nhập hàng đã chọn'}};
    });
    readonlyEvidence.push({kind:'clock-observation-diagnostic',group,observation,stage,server,client});
   }catch{readonlyEvidence.push({kind:'clock-observation-diagnostic',group,observation,stage,server,clientUnavailable:true});}
  }
  async function roundedKeyboardFocus(locator){
   assert.equal(await locator.evaluate(element=>element===document.activeElement&&element.matches(':focus-visible')),true);
   const style=await locator.evaluate(element=>{const value=getComputedStyle(element);return {outline:value.outlineStyle,width:parseFloat(value.outlineWidth),radius:parseFloat(value.borderTopLeftRadius)};});
   assert.ok(style.outline!=='none'&&style.width>=2,'Actual keyboard focus outline is at least 2px: '+JSON.stringify(style));
   assert.ok(style.radius>=8,'Actual keyboard focus target has rounded corners: '+JSON.stringify(style));
  }
  async function exactReadonlyPage(number){
   await readonlyReady(number);const panel=readonlyPanel(),expected=readonlyProjection(model.inbound.documentId,number);
   assert.equal(await panel.getAttribute('aria-label'),'Phiếu nhập hàng chỉ đọc');
   assert.equal(await panel.locator('time').getAttribute('datetime'),expected.document.documentDate);assert.equal(await panel.locator('time').innerText(),'01/10/2026');
   assert.equal(await panel.getByRole('heading',{name:expected.document.documentId,exact:true}).count(),1);assert.equal(await panel.getByText('Trạng thái: NULL',{exact:true}).count(),1);
   assert.equal(await panel.locator('header dd').last().textContent(),'NULL');
   assert.deepEqual(await panel.locator('article').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('dd')].map(value=>value.textContent))),expected.inboundRequestLines.map(line=>[line.lineId,line.itemId,line.setQuantityByDocument,line.barrelQuantityByDocument,line.setQuantityByReal,line.barrelQuantityByReal].map(value=>value??'NULL')));
   assert.equal(await panel.locator('input,textarea,select,form,[contenteditable=true]').count(),0,'The projection has no editable form or keyboard input');
   assert.equal(await panel.getByRole('button',{name:'Dòng trước',exact:true}).isEnabled(),number>1);assert.equal(await panel.getByRole('button',{name:'Dòng tiếp',exact:true}).isEnabled(),expected.hasMore);
   assert.equal(calls.filter(call=>call.method==='POST').length,0);
  }
  await run('I33 typed closed Unavailable opens independent scoped exact read-only pages at 320,390,1440',async()=>{
   for(const width of [320,390,1440])for(const nullScope of [false,true]){
    const shape=nullScope?'null-scope':'scoped',documents=fullLists(),document={...structuredClone(inbound),documentId:'I'.repeat(50)};documents.inboundDocuments[0]=document;
    await start(width,'inbound-requests',{...documents,inbound:document,advanceAuthority:true,draftEnvelope:unavailableDraft(nullScope),holdDetail:true,holdProjection:true});
    await open('inbound-requests').waitFor();assert.equal(await host('inbound-requests').getByRole('button',{name:/^Mở phiếu /}).count(),50);
    const filter=host('inbound-requests').locator('input').first();await filter.fill('UNAPPLIED READONLY FILTER');
    await open('inbound-requests').click();await eventually(()=>model.detailWaiters.length===1);await paint();assert.equal(projectionCalls().length,0,'READ projection waits for the typed command-service outcome');
    assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false);assert.equal(await readonlyPanel().count(),0);
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await paint();assert.equal(await readonlyPanel().getAttribute('data-phase'),'pending');
    assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false,'Command Unavailable alone never completes Open focus');
    assert.equal(await page.evaluate(()=>document.activeElement?.matches('input,textarea,select,[contenteditable=true]')),false);assert.equal(await page.getByText(readonlyLines[0].itemId,{exact:true}).count(),0);
    releaseProjection();await exactReadonlyPage(1);await focusedVisible(focusRegion('inbound-requests'));await layout(width,'inbound-requests');await capture(`inbound-readonly-${shape}-open-${width}`,{viewport:true,keepFocus:true});
    const first=readonlyPanel().locator('article').first();await first.scrollIntoViewIfNeeded();assert.equal(await first.locator('dd').evaluateAll(elements=>elements.every(element=>{const range=document.createRange();range.selectNodeContents(element);return [...range.getClientRects()].every(rect=>rect.left>=0&&rect.right<=innerWidth)&&element.scrollWidth<=Math.ceil(element.clientWidth);})),true,'Long READ line IDs, item IDs and exact decimals remain fully contained');await capture(`inbound-readonly-${shape}-long-values-${width}`,{viewport:true,keepFocus:true});
    await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).click();await exactReadonlyPage(2);await layout(width,'inbound-requests');await readonlyPanel().locator('article').first().scrollIntoViewIfNeeded();await capture(`inbound-readonly-${shape}-page2-${width}`,{viewport:true,keepFocus:true});
    assert.equal(await readonlyPanel().getByText(readonlyLines[0].itemId,{exact:true}).count(),0,'Paging does not retain previous-page values');
    assert.equal((await draftCalls()).length,1,'Paging cannot bootstrap draft rights or retry a draft command');
    // A healthy VISIBLE refresh advances observation authority, but retains
    // the independently READ-authorized panel/list and their exact DOM nodes.
    // Hold all three reads so a remount, collapse or scroll jump is observable.
    const continuity=await page.evaluateHandle(()=>{
     const panel=document.querySelector('[data-testid=inbound-request-readonly]'),buttons=[...panel.querySelectorAll('nav button')],rows=[...document.querySelectorAll('[data-testid=inbound-request-host] button[aria-label^="Mở phiếu "]')];
     return {panel,buttons,rows,scrollY,scrollX,articleTop:panel.querySelector('article').getBoundingClientRect().top};
    });
    async function stableHealthyRead(fenced){
     await paint();const state=await page.evaluate(previous=>{
      const panel=document.querySelector('[data-testid=inbound-request-readonly]'),buttons=[...panel.querySelectorAll('nav button')],rows=[...document.querySelectorAll('[data-testid=inbound-request-host] button[aria-label^="Mở phiếu "]')];
      return {samePanel:panel===previous.panel,sameButtons:buttons.length===previous.buttons.length&&buttons.every((button,index)=>button===previous.buttons[index]),sameRows:rows.length===previous.rows.length&&rows.every((row,index)=>row===previous.rows[index]),rowCount:rows.length,scrollDelta:Math.abs(scrollY-previous.scrollY),horizontalDelta:Math.abs(scrollX-previous.scrollX),articleDelta:Math.abs(panel.querySelector('article').getBoundingClientRect().top-previous.articleTop)};
     },continuity);
     assert.equal(state.samePanel,true,'Healthy same-READ-scope observation keeps the exact panel node');assert.equal(state.sameButtons,true,'Healthy refresh keeps both page2 paging button nodes');assert.equal(state.sameRows,true,'Healthy refresh keeps every existing list-row node');assert.equal(state.rowCount,50);
     assert.ok(state.scrollDelta<=1&&state.horizontalDelta<=1&&state.articleDelta<=1,'Healthy refresh cannot jump the page or move its visible content: '+JSON.stringify(state));
     assert.deepEqual(await readonlyPanel().locator('article').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('dd')].map(value=>value.textContent))),readonlyProjection(document.documentId,2).inboundRequestLines.map(line=>[line.lineId,line.itemId,line.setQuantityByDocument,line.barrelQuantityByDocument,line.setQuantityByReal,line.barrelQuantityByReal].map(value=>value??'NULL')));
     assert.equal(await readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).isEnabled(),!fenced);assert.equal(await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).isEnabled(),false);
     assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false);assert.equal(calls.filter(call=>call.method==='POST').length,0);
    }
    model.holdList=true;model.holdDetail=true;model.holdProjection=true;const visibleWorkspaceReads=model.workspaceReads;
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});
    await eventually(()=>model.workspaceReads>visibleWorkspaceReads);await eventually(()=>model.detailWaiters.length===1&&model.waiters.length===1);await stableHealthyRead(true);assert.equal(projectionCalls().length,2,'Healthy refresh waits for current draft eligibility without removing prior READ data');
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await stableHealthyRead(true);assert.deepEqual(projectionCalls().at(-1),{route:projectionRoute,method:'GET',documentId:document.documentId,page:'2',pageSize:'50'});
    const listResponses=model.listResponses;model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());await eventually(()=>model.listResponses>listResponses);await stableHealthyRead(true);
    releaseProjection();await eventually(()=>model.projectionResponses===3);await settledReads();await eventually(()=>readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).isEnabled());await exactReadonlyPage(2);await stableHealthyRead(false);assert.deepEqual(model.workspaceVersions,[1,2]);await continuity.dispose();
    await capture('inbound-readonly-'+shape+'-page2-healthy-refresh-'+width,{viewport:true,keepFocus:true});
    // Reuse the Workspace observation harness: a hidden/visible cycle suspends
    // authority, then verifies the SAME scope. A remembered page is only UI
    // intent; both draft eligibility and a fresh scoped page2 GET remain due.
    model.holdDetail=true;model.holdProjection=true;const workspaceReads=model.workspaceReads;
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.i33Visibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.i33Visibility});document.dispatchEvent(new Event('visibilitychange'));});
    await readonlyPanel().waitFor({state:'detached'});await paint();assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0,'Page2 values are masked while Workspace authority is unverified');assert.equal(projectionCalls().length,3);
    await page.evaluate(()=>{window.i33Visibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
    await eventually(()=>model.workspaceReads>workspaceReads);await eventually(()=>model.detailWaiters.length===1);await open('inbound-requests').waitFor();
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(await readonlyPanel().count(),0);assert.equal(projectionCalls().length,3,'Same-scope refresh still waits for current typed Unavailable');
    assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0);assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false);
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await paint();assert.equal(await readonlyPanel().getAttribute('data-phase'),'pending');
    assert.deepEqual(projectionCalls().at(-1),{route:projectionRoute,method:'GET',documentId:document.documentId,page:'2',pageSize:'50'});assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0,'Remembered page2 cannot expose cached values before the current READ response');
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false);
    releaseProjection();await exactReadonlyPage(2);await paint();assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false,'Workspace revalidation cannot auto-focus the restored page');
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(model.workspaceVersions,[1,2,3],'Both healthy and temporarily unverified observations advance authority while retaining READ markers');
    await readonlyPanel().locator('article').first().scrollIntoViewIfNeeded();await capture('inbound-readonly-'+shape+'-page2-revalidated-'+width,{viewport:true,keepFocus:true});
    await readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).click();await exactReadonlyPage(1);
    assert.deepEqual(projectionCalls().map(call=>[call.method,call.documentId,call.page,call.pageSize]),[1,2,2,2,1].map(number=>['GET',document.documentId,String(number),'50']));assert.equal((await draftCalls()).length,3,'Only the explicit Workspace observation cycle revalidates draft eligibility');
    // The temporary authority gap correctly retires the old focus origin.
    // A new explicit Open establishes today's origin without another GET.
    await open('inbound-requests').click();await focusedVisible(focusRegion('inbound-requests'));assert.equal(projectionCalls().length,5);
    await closeSelection('inbound-requests').click();await focusedVisible(open('inbound-requests'));assert.equal(await readonlyPanel().count(),0);assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');
    await openRow('inbound-requests',26).focus();await page.keyboard.press('Enter');await readonlyReady();await focusedVisible(focusRegion('inbound-requests'));await roundedKeyboardFocus(focusRegion('inbound-requests'));assert.equal(await readonlyPanel().getByRole('heading',{name:'QA-INBOUND-026',exact:true}).count(),1);
    await closeSelection('inbound-requests').focus();await page.keyboard.press('Enter');await focusedVisible(openRow('inbound-requests',26));await roundedKeyboardFocus(openRow('inbound-requests',26));assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(await notices(),[]);
    readonlyEvidence.push({kind:'scoped-readonly-success',width,shape,closedAccessVerified:true,revalidatedPage:2,healthyDomContinuityVerified:true,advancingAuthorityVersions:[...model.workspaceVersions],draftDispatches:(await draftCalls()).length,projectionRequests:projectionCalls(),writeRequests:0});
   }
  });
  await run('I33 draft denial, transport failure and non-Unavailable outcomes never authorize fallback',async()=>{
   const variants=[...[401,403,404,409].map(status=>({name:'draft-http-'+status,patch:{detailStatus:status}})),
    {name:'draft-network',patch:{draftNetwork:true}},{name:'draft-malformed-json',patch:{draftMalformed:true}},
    ...['Denied','NotFound','Conflict','Rejected','InvalidInput','OutcomeUnknown'].map(outcome=>({name:'draft-'+outcome,patch:{draftEnvelope:{...unavailableDraft(false),data:{outcome,document:null}}}})),
    {name:'missing-edit-Denied-available-true',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true},data:{outcome:'Denied',document:null}}}},
    {name:'inconsistent-Unavailable-available-true',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true}}}},
    {name:'available-false-alone',patch:{draftEnvelope:{...unavailableDraft(true),data:{outcome:'NumberingUnavailable',document:null}}}},
    {name:'Unavailable-with-document',patch:{draftEnvelope:{...unavailableDraft(false),data:{outcome:'Unavailable',document:structuredClone(inbound)}}}},
    {name:'service-Unavailable-with-current-read-right',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true,canRead:true}}}}];
   for(const {name,patch} of variants){
    const expectedReads=name==='service-Unavailable-with-current-read-right'?2:1;
    await start(390,'inbound-requests',patch);await open('inbound-requests').click();await page.waitForFunction(expected=>window.i33ReadDispatches.filter(event=>event.path==='/api/erp/api/inbound-requests/draft').length>=expected,expectedReads);await settledReads();
    assert.equal(await readonlyPanel().count(),0,name);assert.equal(projectionCalls().length,0,name+' must not issue detail GET');await noReadonlyValues();
    // Current canRead/available legitimately binds I18 after bootstrap. Its one
    // scoped full read rejects Unavailable; it is not a replacement retry.
    assert.equal((await draftCalls()).length,expectedReads,name+' has exactly the source-required read phases');assert.deepEqual((await draftCalls()).map(event=>event.hasCommandScope),expectedReads===2?[false,true]:[false],name+' distinguishes bootstrap from the bound full read');await page.waitForTimeout(100);await settledReads();assert.equal((await draftCalls()).length,expectedReads,name+' stays quiet after settled reads');if(patch.draftNetwork)assert.equal(model.draftNetworkFailures,1);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Phiếu nhập hàng đã chọn"]')].some(element=>document.activeElement===element)),false,name+' cannot complete Open focus');
    readonlyEvidence.push({kind:'draft-fail-closed',scenario:name,draftDispatches:(await draftCalls()).length,projectionRequests:0,writeRequests:0});
   }
  });
  await run('I33 independent READ denials and invalid scopes hide values and late reads cannot steal focus',async()=>{
   const variants=[...[401,403,404,409].map(status=>({name:'projection-http-'+status,patch:{projectionStatus:status}})),
    ...['malformed','wrong-document','wrong-branch','wrong-page','wrong-page-size','wrong-read-scope','wrong-session-scope','missing-read-scope'].map(kind=>({name:'projection-'+kind,patch:{projectionKind:kind}}))];
   for(const {name,patch} of variants){
    const wrongPageSize=patch.projectionKind==='wrong-page-size';
    await start(390,'inbound-requests',{draftEnvelope:unavailableDraft(false),...patch});await open('inbound-requests').click();
    if(wrongPageSize){await exactReadonlyPage(1);await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).click();}
    await eventually(()=>model.projectionResponses===(wrongPageSize?2:1));await settledReads();
    if(wrongPageSize){
     assert.equal(readonlyProjection(inbound.documentId,2).inboundRequestLines.length,1,'The invalid pageSize fixture is below25 rows, so row-count overflow cannot explain rejection');
     assert.equal(projectionCalls().at(-1).page,'2');assert.equal(projectionCalls().at(-1).pageSize,'50');assert.equal(await readonlyPanel().getAttribute('data-phase'),'failed','A response pageSize25 cannot satisfy the requested page2/pageSize50 identity');
    }
    await noReadonlyValues();assert.equal(projectionCalls().length,wrongPageSize?2:1,name+' has no automatic retry');assert.equal(await readonlyPanel().locator('article').count(),0,name+' never renders projection rows');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Phiếu nhập hàng đã chọn"]')].some(element=>document.activeElement===element)),false,name+' cannot complete pending Open focus');
    readonlyEvidence.push({kind:'projection-fail-closed',scenario:name,projectionRequests:projectionCalls(),writeRequests:0});
   }
   // Use the real Workspace 60-second polling interval. The clock advances
   // scheduling only; production readers and every HTTP boundary stay mounted.
   // Each workspace response advances authorityVersion while its session/read
   // scope markers remain identical, so constant-version fixtures cannot hide
   // a 403 -> parent reload -> projection retry feedback loop.
   await start(390,'inbound-requests',{installClock:true,advanceAuthority:true,draftEnvelope:unavailableDraft(false),projectionStatus:403});
   await open('inbound-requests').click();const deniedCounts=[];
   async function boundedDeniedObservation(label,expected){
    await recordReadonlyClockSnapshot('projection-403',label,'before');
    try{
    await eventually(()=>model.projectionResponses>=expected);await settledReads();
    await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();
    await noReadonlyValues();const counts=()=>({workspace:model.workspaceReads,draft:calls.filter(call=>call.route==='/api/inbound-requests/draft').length,projection:projectionCalls().length});
    assert.deepEqual(counts(),{workspace:expected,draft:expected,projection:expected},label+' permits one projection attempt per deliberate observation');
    assert.equal((await draftCalls()).length,expected);assert.equal(await readonlyPanel().count(),0);
    await page.clock.fastForward(1000);await settledReads();assert.deepEqual(counts(),{workspace:expected,draft:expected,projection:expected},label+' cannot trigger an autonomous 403 retry cycle');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Phiếu nhập hàng đã chọn"]')].some(element=>document.activeElement===element)),false);
    deniedCounts.push({observation:label,...counts()});
    await recordReadonlyClockSnapshot('projection-403',label,'after');
    }catch(error){await recordReadonlyClockSnapshot('projection-403',label,'failure');throw error;}
   }
   await boundedDeniedObservation('initial-selection',1);
   await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});
   await boundedDeniedObservation('synthetic-window-focus',2);
   await page.clock.fastForward(60001);await boundedDeniedObservation('actual-60-second-poll',3);
   await page.evaluate(()=>{window.i33Visibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.i33Visibility});window.dispatchEvent(new FocusEvent('blur'));document.dispatchEvent(new Event('visibilitychange'));});await paint();
   await page.evaluate(()=>{window.i33Visibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
   await boundedDeniedObservation('synthetic-visibility-focus',4);
   await page.clock.fastForward(60001);await boundedDeniedObservation('next-60-second-poll',5);
   assert.deepEqual(model.workspaceVersions,[1,2,3,4,5]);assert.equal(calls.filter(call=>call.method==='POST').length,0);
   readonlyEvidence.push({kind:'persistent-read-403-bounded',sameReadMarkers:true,advancingAuthorityVersions:[...model.workspaceVersions],observations:deniedCounts,writeRequests:0});
   // Exercise the actual Workspace-bound LIST reader, not a list test seam.
   // Valid-looking scope markers from another authority must not expose even
   // the synthetic50-row summary or permit selection/projection bootstrap.
   for(const [name,listResponseHeaders] of [
    ['wrong-list-read-scope',{...readHeaders,'X-Medcom-Read-Scope':'c'.repeat(64)}],
    ['wrong-list-session-scope',{...readHeaders,'X-Medcom-Session-Scope':'c'.repeat(64)}],
    ['wrong-list-both-scopes',{'X-Medcom-Session-Scope':'c'.repeat(64),'X-Medcom-Read-Scope':'d'.repeat(64)}],
   ]){
    assert.ok(Object.values(listResponseHeaders).every(value=>/^[a-f0-9]{64}$/.test(value)),'Scope-denial fixtures use valid marker syntax');assert.notDeepEqual(listResponseHeaders,readHeaders);
    await start(390,'inbound-requests',{...fullLists(),installClock:true,advanceAuthority:true,listResponseHeaders,draftEnvelope:unavailableDraft(false)});
    const observations=[];
    async function boundedListScopeDenial(label,expected){
     await recordReadonlyClockSnapshot(name,label,'before');
     try{
     await eventually(()=>model.listResponses>=expected);await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();await paint();
     const counts=()=>({workspace:model.workspaceReads,list:calls.filter(call=>call.route==='/api/documents/inbound-requests').length,draft:calls.filter(call=>call.route==='/api/inbound-requests/draft').length,projection:projectionCalls().length});
     const expectedCounts={workspace:expected,list:expected,draft:0,projection:0};
     assert.deepEqual(counts(),expectedCounts,name+' '+label+' permits one scoped list attempt per deliberate observation');
     assert.equal(await host('inbound-requests').getByRole('button',{name:/^Mở phiếu /}).count(),0,'An invalid list scope cannot expose source rows');assert.equal(await focusRegion('inbound-requests').count(),0,'An invalid list scope cannot create a visible selection');assert.equal(await readonlyPanel().count(),0);assert.equal((await draftCalls()).length,0);await noReadonlyValues();
     await page.clock.fastForward(1000);await paint();assert.deepEqual(counts(),expectedCounts,name+' cannot create a 409-to-parent-reload feedback loop');assert.equal(calls.filter(call=>call.method==='POST').length,0);
     observations.push({observation:label,...counts()});
     await recordReadonlyClockSnapshot(name,label,'after');
     }catch(error){await recordReadonlyClockSnapshot(name,label,'failure');throw error;}
    }
    await boundedListScopeDenial('initial-list',1);
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});await boundedListScopeDenial('synthetic-window-focus',2);
    await page.clock.fastForward(60001);await boundedListScopeDenial('actual-60-second-poll',3);
    assert.deepEqual(model.workspaceVersions,[1,2,3]);
    readonlyEvidence.push({kind:'list-scope-fail-closed',scenario:name,advancingAuthorityVersions:[...model.workspaceVersions],observations,writeRequests:0});
   }
   for(const laterAction of ['input','window-blur','close','read-capability-loss']){
    await start(390,'inbound-requests',{...fullLists(),draftEnvelope:unavailableDraft(true),holdProjection:true});await openRow('inbound-requests',1).click();await eventually(()=>model.projectionWaiters.length===1);
    const filter=host('inbound-requests').locator('input').first();
    if(laterAction==='input')await filter.fill('KEEP READONLY USER FOCUS');
    else if(laterAction==='window-blur'){assert.equal(await page.evaluate(()=>document.hidden),false);await page.evaluate(()=>window.dispatchEvent(new FocusEvent('blur')));}
    else if(laterAction==='close'){await closeSelection('inbound-requests').click();await focusedVisible(openRow('inbound-requests',1));}
    else{const before=model.workspaceReads;model.workspaceCapabilities=['purchase-requests.read','purchase-orders.read'];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await eventually(()=>model.workspaceReads>before);await readonlyPanel().waitFor({state:'detached'});}
    releaseProjection();await eventually(()=>model.projectionResponses===1);await settledReads();
    if(laterAction==='close'||laterAction==='read-capability-loss'){assert.equal(await readonlyPanel().count(),0);await noReadonlyValues();if(laterAction==='close')await focusedVisible(openRow('inbound-requests',1));}
    else{await readonlyReady();assert.equal(await focusRegion('inbound-requests').evaluate(element=>document.activeElement===element),false,'Late projection cannot revive a cancelled focus ticket');if(laterAction==='input')assert.equal(await filter.evaluate(element=>document.activeElement===element),true);await capture(`inbound-readonly-late-${laterAction}-390`,{viewport:true,keepFocus:true});}
    assert.equal(projectionCalls().length,1);assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('I33 unavailable command reads never replace unknown or confirmed-readback custody',async()=>{
   for(const mode of ['unknown','confirmed-readback'])for(const nullScope of [false,true]){
    await start(390,'inbound-requests',{...fullLists(),writable:true,unknown:mode==='unknown',afterWriteDraftEnvelope:unavailableDraft(nullScope)});await saveInbound();
    await eventually(()=>model.commandResponses===1);if(mode==='unknown')await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');else await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending')==='true');
    const unavailableReads=model.draftResponses;await page.getByRole('button',{name:'Xác minh lại quyền nhập hàng',exact:true}).click();await eventually(()=>model.draftResponses>unavailableReads);await settledReads();const bodies=await page.evaluate(()=>window.i30SaveDispatches);assert.equal(bodies.length,1);const originalBody=bodies[0],bodySha256=sha(originalBody);
    assert.equal(model.writes.length,1);assert.equal(model.writes[0].bodySha256,bodySha256);assert.equal(model.originals.get(model.writes[0].operationId),originalBody);assert.equal(model.effects,1);assert.equal(projectionCalls().length,0,'Custody blocks even an otherwise eligible independent projection');assert.equal(await readonlyPanel().count(),0);
    const attempts=[()=>closeSelection('inbound-requests').click(),()=>openRow('inbound-requests',26).click(),()=>page.getByRole('button',{name:'Áp dụng lọc nhập hàng',exact:true}).click(),()=>page.getByRole('navigation',{name:'Điều hướng nhanh trên điện thoại',exact:true}).getByRole('button',{name:'Không gian làm việc',exact:true}).click()];
    for(const attempt of attempts){await attempt();await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);assert.equal(new URL(page.url()).searchParams.get('screen'),'inbound-requests');assert.equal(await host('inbound-requests').locator('button[aria-label^="Mở phiếu QA-INBOUND-001 "]').getAttribute('aria-pressed'),'true');assert.equal(await host('inbound-requests').locator('button[aria-label^="Mở phiếu QA-INBOUND-026 "]').getAttribute('aria-pressed'),'false');assert.equal(projectionCalls().length,0);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'detached'});}
    assert.deepEqual(await page.evaluate(()=>window.i30SaveDispatches),[originalBody]);assert.equal(model.effects,1);assert.equal(model.writes.length,1);await capture(`inbound-readonly-custody-${mode}-${nullScope?'null-scope':'scoped'}-390`,{viewport:true,keepFocus:true});
    // Recover only through current full-draft rights and the original receipt.
    // The paginated READ projection can never discharge either custody gate.
    model.draftEnvelope=null;model.inboundDocuments[0]=structuredClone(model.inbound);await page.getByRole('button',{name:'Xác minh lại quyền nhập hàng',exact:true}).click();
    if(mode==='unknown'){const reconcile=page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true});await eventually(()=>reconcile.isEnabled());await reconcile.click();}
    await inboundReady();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending')==='false');
    assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC TOAST EDIT');assert.equal(model.effects,1);assert.equal(model.writes.length,1);assert.deepEqual(await page.evaluate(()=>window.i30SaveDispatches),[originalBody]);assert.deepEqual(model.reconciles,mode==='unknown'?[bodySha256]:[]);assert.equal(projectionCalls().length,0);
    readonlyEvidence.push({kind:'custody-kept',mode,shape:nullScope?'null-scope':'scoped',originalBodySha256:bodySha256,saveDispatches:1,serverSaveRequests:1,effects:1,reconcileBodyHashes:[...model.reconciles],projectionRequests:0});
    await closeSelection('inbound-requests').click();await focusedVisible(openRow('inbound-requests',1));
   }
  });
  t.signal.throwIfAborted();assert.deepEqual(errors,[]);assert.equal(results.length,expectedCases,'Every required presentation case must finish');completed=true;
 }catch(error){fatal=String(error);throw error;}finally{
  let teardownError;try{await cleanup();}catch(error){teardownError=error;errors.push(String(error));}
  t.signal.removeEventListener('abort',abortCleanup);
  const evidence={node:process.version,css:{sourceSha256:sha(cssSource),compiledSha256:sha(css),bytes:Buffer.byteLength(css)},viewportWidths:[320,390,1440],hierarchy:'Actual Workspace and production request components',backend:'Synthetic HTTP host plus separately labelled trusted-adapter component contract; no ERP/SQL acceptance',status:completed&&!t.signal.aborted&&!fatal&&!failures.length&&!errors.length&&results.length===expectedCases?'passed':'failed',expectedCases,completedCases:results.length,fatal,results,failures,captures,transportEvidence,readonlyEvidence,errors};
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify(evidence,null,2));
  if(teardownError)throw teardownError;
 }
});
