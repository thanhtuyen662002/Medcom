// Actual composed Workspace detail-history regression, production clients and
// NavigationGuardProvider. Synthetic HTTP only; not ERP/SQL acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.MEDCOM_HISTORY_EVIDENCE_DIR??path.join(app,'.test-runtime','request-detail-history');
const sha=value=>createHash('sha256').update(value).digest('hex');
const scope='a'.repeat(64),session='b'.repeat(64);
const purchase={purchaseRequestId:'QA-PURCHASE-001',branchId:'QA-BRANCH',statusId:1,isLocked:false,
 header:{purchaseDate:'2026-10-01T14:22:11.003',purposeId:1,personSuggest:'Nhân viên tổng hợp kiểm thử với tên hiển thị dài',department:'Bộ phận kinh doanh tổng hợp kiểm thử',purposeDescOrClient:'Nội dung tổng hợp để kiểm tra xuống dòng trên màn hình nhỏ.',price:'999999999999999999',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1},
 lines:[{lineId:'QA-LINE-001',values:{itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',budget:null,timeRequired:null,quantity:'999999999999999999',unitPrice:'1',totalPrice:null,model:''}}]};
const inbound={documentId:'QA-INBOUND-001',statusId:0,stateEqualityToken:'C'.repeat(64),costRowCount:0,costEditingSupported:false,
 header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'Đơn tổng hợp kiểm thử với nội dung đủ dài',invoiceNo:'',departurePoint:'Điểm đi tổng hợp',destinationPoint:'Điểm đến tổng hợp',orderTypeId:'QA-TYPE',branchId:'QA-BRANCH',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:''},
 details:[{rowId:'QA-ROW-001',clientLineId:null,itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',lotNumberByDocument:'QA-LOT',setQuantityByDocument:'999999999999999999',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'}]};

const orderRow=index=>({documentId:'QA-ORDER-'+index,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:1,isLocked:false});
const readonlyProjection=(documentId,page=1)=>({document:{documentId,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:0,isLocked:false},purchaseOrderLines:[],inboundRequestLines:[],page,pageSize:50,hasMore:false});
// Currency label is its exact source ID; the human-readable name is separate.
const historyCurrency={id:'VND',label:'VND',currencyName:'Synthetic currency',rateExchange:1};
test('history currency fixture passes the actual strict lookup client',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild');await mkdir(output,{recursive:true});const file=path.join(output,'currency-fixture-contract.mjs');
 await build({absWorkingDir:app,stdin:{contents:'export {getPurchaseLookup} from "./lib/erp/purchase-request-api";',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
 const {getPurchaseLookup}=await import(pathToFileURL(file).href),native=globalThis.fetch;let item=historyCurrency;
 globalThis.fetch=async()=>Response.json({scopeKey:scope,data:{available:true,reason:null,items:[item],page:1,hasMore:false}});
 try{
  const valid=await getPurchaseLookup(scope,'currencies','VND',1);assert.deepEqual(valid.items,[historyCurrency]);
  item={...historyCurrency,label:'Synthetic currency'};await assert.rejects(()=>getPurchaseLookup(scope,'currencies','VND',1),error=>error.code==='invalid_api_response');
 }finally{globalThis.fetch=native;}
});
let compiled;
async function compile(){
 if(compiled)return compiled;
 const require=createRequire(import.meta.url),{build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './components/erp/workspace';
 window.authFixture={posts:[],ignoreAbort:false,tools:{},life:{},adapters:{},adapterIds:new WeakMap(),nextAdapter:0};window.testVisibility='visible';
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
 Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:(tool,{signal})=>{window.authFixture.tools[tool.name]=tool;signal.addEventListener('abort',()=>{if(window.authFixture.tools[tool.name]===tool)delete window.authFixture.tools[tool.name];});}}});
 const nativeHistoryGo=history.go.bind(history);window.authFixture.historyCalls=[];window.authFixture.heldHistory=[];window.authFixture.holdHistory=false;
 history.go=delta=>{window.authFixture.historyCalls.push({delta,index:history.state?.medcomWorkspace?.index});if(window.authFixture.holdHistory)window.authFixture.heldHistory.push(delta);else nativeHistoryGo(delta);};
 window.authFixture.userTraverse=nativeHistoryGo;window.authFixture.releaseHistory=()=>{if(window.authFixture.heldHistory.length)nativeHistoryGo(window.authFixture.heldHistory.shift());};
 const nativeFetch=window.fetch.bind(window);window.fetch=(url,init)=>{if(init?.method==='POST')window.authFixture.posts.push({url:String(url),body:String(init.body)});if(window.authFixture.ignoreAbort){const {signal,...rest}=init??{};void signal;return nativeFetch(url,rest);}return nativeFetch(url,init);};
 createRoot(document.getElementById('root')).render(<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:'auth-fixture.js',bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'observe-production-detail-seam',setup(build){build.onLoad({filter:/[/\\]request-detail-dialog\.tsx$/},async args=>{
  const original=await readFile(args.path,'utf8'),needle='export function useRequestDetailNavigation(register: RegisterRequestDetailNavigation | undefined, navigation: RequestDetailNavigation) {';
  assert.ok(original.includes(needle),'Observe the actual production navigation seam, never replace it');
  return {loader:'tsx',resolveDir:path.dirname(args.path),contents:original.replace(needle,needle+'\n useLayoutEffect(() => {window.authFixture.navigation = navigation; return () => {if(window.authFixture.navigation === navigation)window.authFixture.navigation = null;};});')};
 });}},{name:'observe-production-editor-lifetimes',setup(build){build.onLoad({filter:/[/\\](?:mobile-(?:inbound-)?request|document-editor)\.tsx$/},async args=>{
  const name=args.path.endsWith('mobile-request.tsx')?'RequestEditor':args.path.endsWith('mobile-inbound-request.tsx')?'InboundEditor':'DocumentEditor';
  const original=await readFile(args.path,'utf8'),header=original.match(new RegExp('function '+name+'\\([^]*?\\)\\s*\\{'))?.[0];assert.ok(header,'Production editor function must remain observable');
  const instrumentation=`
   observeEditorLifecycle(()=>{const life=window.authFixture.life['${name}']??={mounts:0,unmounts:0};life.mounts++;return()=>{life.unmounts++;};},[]);
   observeEditorLifecycle(()=>{if(adapter){let id=window.authFixture.adapterIds.get(adapter);if(!id){id=++window.authFixture.nextAdapter;window.authFixture.adapterIds.set(adapter,id);}const seen=window.authFixture.adapters['${name}']??=[];if(!seen.includes(id))seen.push(id);}});
  `;
  return {loader:'tsx',resolveDir:path.dirname(args.path),contents:original.replace('"use client";','"use client";\nimport {useLayoutEffect as observeEditorLifecycle} from "react";').replace(header,header+instrumentation)};
 });}},{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'auth-image'}));build.onLoad({filter:/.*/,namespace:'auth-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const emitted=built.outputFiles.find(file=>file.path.endsWith('.css'));assert.ok(emitted?.contents.length,'Auth CSS modules must be emitted');
 const css=Buffer.from(emitted.contents).toString()+(await postcss([tailwind({base:app})]).process(await readFile(path.join(app,'app/globals.css'),'utf8'),{from:path.join(app,'app/globals.css')})).css;
 assert.ok(!css.includes('@import "tailwindcss"'),'Compile real application CSS');
 compiled={script:built.outputFiles.find(file=>file.path.endsWith('.js')).contents,css,logo:await readFile(path.join(app,'public/medcom-logo.png'))};return compiled;
}
test('compile composed Workspace detail history with real application CSS',async()=>{const result=await compile();assert.ok(result.script.length>0);assert.match(result.css,/min-height:\s*100dvh/);});
test('composed request detail history, guarded traversal and original custody',{timeout:360000},async t=>{
 const {script,css,logo}=await compile(),require=createRequire(import.meta.url),toolchain=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 const {chromium}=(toolchain?createRequire(path.join(path.resolve(toolchain),'package.json')):require)('playwright-core');
 const executable=process.env.MEDCOM_EDGE_PATH??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'NOT_RUN: existing supported browser required; never install or bypass sandbox');
 let model,browser,context,page,origin;const calls=[],errors=[],results=[],evidence=[];
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
 const reset=(patch={})=>{model={authenticated:true,loginStatus:200,loginCalls:0,holdLogin:false,loginWaiters:[],workspaceStatus:200,holdWorkspace:false,workspaceWaiters:[],sessionScope:session,version:1,lifetime:{idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()},writable:true,status:200,holdList:false,waiters:[],listResponses:0,holdDetail:false,detailWaiters:[],detailStatus:200,draftResponses:0,projectionStatus:200,projectionResponses:0,holdProjection:false,projectionWaiters:[],purchase:structuredClone(purchase),inbound:structuredClone(inbound),purchaseVersion:1,inboundVersion:1,originals:new Map(),receipts:new Map(),writes:[],reconciles:[],effects:0,holdCommands:false,commandWaiters:[],commandResponses:0,unknown:false,...patch};calls.length=0;};
 const workspace=()=>({session:{displayName:'SYNTHETIC USER',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:model.version,...model.lifetime,capabilities:model.capabilities??['purchase-requests.read','inbound-requests.read','purchase-orders.read']},branchIds:['QA-BRANCH'],navigation:(model.navigation??['purchase-requests','inbound-requests','purchase-orders']).map(id=>({id,label:id,href:'https://untrusted.invalid/'+id}))});
 const send=(res,status,data,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(status===204?undefined:JSON.stringify(data));};
 const release=kind=>{model['hold'+kind]=false;(model[kind[0].toLowerCase()+kind.slice(1)+'Waiters']??[]).splice(0).forEach(resolve=>resolve());};
 const releaseAll=()=>{for(const kind of ['Workspace','Login','Commands','Detail','Projection'])release(kind);model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());model.commandWaiters.splice(0).forEach(resolve=>resolve());};
 const server=createServer(async(req,res)=>{const m=model;try{
  const url=new URL(req.url,origin??'http://localhost');
  if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
  if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
  const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method,query:url.search});
  const readHeaders={'X-Medcom-Session-Scope':m.sessionScope,'X-Medcom-Read-Scope':scope};
  if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
  if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
  if(route==='/api/auth/login'){m.loginCalls++;for await(const chunk of req)void chunk;if(m.holdLogin)await new Promise(resolve=>m.loginWaiters.push(resolve));if(m.loginStatus!==200)return send(res,m.loginStatus,{code:'authentication_required'});m.authenticated=true;m.sessionScope=sha('synthetic login '+m.loginCalls);return send(res,200,workspace().session);}
  if(route==='/api/workspace'){const status=m.authenticated?m.workspaceStatus:401,data=workspace();if(m.holdWorkspace)await new Promise(resolve=>m.workspaceWaiters.push(resolve));return send(res,status,status===200?data:{code:status===401?'authentication_required':'backend_unavailable'},readHeaders);}
  if(!m.authenticated)return send(res,401,{code:'authentication_required'});
  if(route==='/api/auth/logout'){m.authenticated=false;return send(res,204,null);}
  if(route==='/api/auth/session/continue')return send(res,200,workspace().session);
   if(route==='/api/purchase-requests/workspace')return send(res,200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
   if(route==='/api/purchase-requests/lookup')return send(res,200,{scopeKey:scope,data:{available:true,reason:null,items:url.searchParams.get('kind')==='purposes'?[{id:'1',label:'Synthetic purpose'}]:[historyCurrency],page:Number(url.searchParams.get('page')??1),hasMore:false}});
   if(route==='/api/documents/purchase-orders'){
    const page=Number(url.searchParams.get('page')??1),pages=m.orderPages??[[orderRow(1)]];
    return send(res,200,{rows:pages[page-1]??[],page,pageSize:50,hasMore:page<pages.length},readHeaders);
   }
   if(route==='/api/documents/purchase-orders/detail'){
    const document=(m.orderPages??[[orderRow(1)]]).flat().find(row=>row.documentId===url.searchParams.get('documentId'));
    if(!document)return send(res,404,{code:'request_failed'},readHeaders);
    return send(res,200,{document,purchaseOrderLines:[{lineId:'QA-ORDER-LINE-001',itemId:'QA-ORDER-ITEM-001',quantity:'999999999999999999.0001',quantity2:null}],inboundRequestLines:[],page:Number(url.searchParams.get('page')??1),pageSize:50,hasMore:false},readHeaders);
   }
   if(route==='/api/purchase-requests'||route==='/api/documents/inbound-requests'){
    if(m.holdList)await new Promise(resolve=>m.waiters.push(resolve));
    if(m.status!==200){if(m.status===403)m.deniedLists++;return send(res,m.status,{code:'request_failed'},readHeaders);}
    const isPurchase=route==='/api/purchase-requests';
    const rows=m.empty?[]:isPurchase?(m.purchaseDocuments??[m.purchase]).map(document=>({documentId:document.purchaseRequestId,purchaseDate:document.header.purchaseDate,branchId:document.branchId,personSuggest:document.header.personSuggest,department:document.header.department,statusId:document.statusId,statusName:"Trạng thái tổng hợp",isLocked:document.isLocked})):(m.inboundDocuments??[m.inbound]).map(document=>({documentId:document.documentId,documentDate:'2026-10-01',branchId:document.header.branchId,statusId:document.statusId,statusName:"Trạng thái tổng hợp",isLocked:false}));
    const page=Number(url.searchParams.get('page')??1),size=isPurchase?20:50;const data={rows:m.paged?rows.slice((page-1)*size,page*size):rows,page,pageSize:size,hasMore:m.paged&&page*size<rows.length};m.listResponses++;return send(res,200,isPurchase?{scopeKey:scope,data}:data,isPurchase?readHeaders:m.listResponseHeaders??readHeaders);
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
 }catch(error){errors.push(String(error));send(res,500,{code:'fixture_failure'});}});
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const eventually=async check=>{const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,'Expected fixture condition did not settle');await new Promise(resolve=>setTimeout(resolve,20));}};
 const start=async(width,screen,patch={})=>{releaseAll();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900}});page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/erp/api/workspace',route=>model.workspaceNetwork?route.abort('failed'):route.continue());await page.goto(origin+'/?screen='+encodeURIComponent(screen)+(patch.configured?'&configured=1':''));};
 const recovery=()=>page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true});
 const refresh=async()=>{const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/erp/api/workspace');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;await paint();};
 const gateOnly=async()=>{await paint();assert.equal(await page.locator('.topbar:visible,.erp-sidebar:visible,.workspace-content:visible,.mobile-bottom-nav:visible').count(),0);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.getByRole('menu').count(),0);assert.equal(await page.locator('[data-sonner-toast]:visible').count(),0);assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('section[tabindex="-1"]')),true);};
 const field=screen=>page.getByLabel(screen==='purchase-requests'?'Ghi chú':'Số đơn',{exact:true});
 const open=screen=>page.getByRole('button',{name:screen==='purchase-requests'?'Mở đề nghị '+purchase.purchaseRequestId:new RegExp('^Mở phiếu '+inbound.documentId+' '),exact:screen==='purchase-requests'}).click();
 const save=async screen=>{await field(screen).fill('EXACT ORIGINAL AUTH CUSTODY');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi',exact:true}).click();};
 const life=screen=>page.evaluate(name=>({life:window.authFixture.life[name],adapters:window.authFixture.adapters[name]}),screen==='purchase-requests'?'RequestEditor':'InboundEditor');
 const go=id=>page.evaluate(id=>window.authFixture.tools.navigate_medcom_screen.execute({screen:id}),id);
 const run=async(name,fn)=>{await t.test(name,async()=>{await fn();results.push(name);});};
 const selected=()=>page.evaluate(()=>window.authFixture.navigation?.selectedId??null);
 const index=()=>page.evaluate(()=>history.state?.medcomWorkspace?.index);
 const atIndex=async expected=>{await paint();await eventually(async()=>await index()===expected);};
 const warning=()=>page.getByRole('alertdialog');
 const cancel=()=>page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();
 const accept=()=>page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();
 const idFor=screen=>screen==='purchase-requests'?purchase.purchaseRequestId:inbound.documentId;
 const openReady=async screen=>{await open(screen);await field(screen).waitFor();await eventually(async()=>await selected()===idFor(screen));await paint();};
 const back=()=>page.evaluate(()=>history.back());
 const forward=()=>page.evaluate(()=>history.forward());
 const privacy=async()=>{
  const state=await page.evaluate(()=>({url:location.href,state:history.state,local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))}));
  assert.doesNotMatch(JSON.stringify(state),/QA-(?:PURCHASE|INBOUND|ROW|LINE)|stateEqualityToken|idempotencyKey|operationId/);
  assert.deepEqual(Object.keys(state.state.medcomWorkspace).sort(),['index','owner']);assert.equal(state.state.medcomInboundHost,undefined);
 };
 const commandLabel=screen=>screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi';
 const reconcileLabel=screen=>screen==='purchase-requests'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc';
 const dispatchReviewed=screen=>page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>button.textContent?.trim()===label)?.click(),commandLabel(screen));
 const releaseHistory=()=>page.evaluate(()=>window.authFixture.releaseHistory());
 const heldHistory=()=>page.evaluate(()=>window.authFixture.heldHistory.length);
 const login=async()=>{const form=page.getByRole('form',{name:'Đăng nhập ERP',exact:true});await form.getByLabel('Tên đăng nhập',{exact:true}).fill('same-synthetic-name');await form.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await form.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.topbar').waitFor();};
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,chromiumSandbox:true});
  for(const width of [1280,390])for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${width} ${screen} accepted open Back Forward close preserve filtered page and scroll`,async()=>{
    const isPurchase=screen==='purchase-requests',size=isPurchase?20:50;
    const documents=Array.from({length:size*2},(_,i)=>isPurchase?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-PAGE-'+String(i+1).padStart(3,'0')}:{...structuredClone(inbound),documentId:'QA-INBOUND-PAGE-'+String(i+1).padStart(3,'0')});
    const target=isPurchase?documents[size].purchaseRequestId:documents[size].documentId;
    await start(width,screen,{paged:true,[isPurchase?'purchaseDocuments':'inboundDocuments']:documents});
    const search=page.getByLabel(isPurchase?'Tìm mã đề nghị':'Tìm phiếu nhập hàng',{exact:true});await search.fill('QA');
    await page.getByLabel(isPurchase?'Chi nhánh':'Lọc chi nhánh',{exact:true}).selectOption('QA-BRANCH');await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();
    const pager=page.getByRole('navigation',{name:isPurchase?'Phân trang đề nghị':'Trang danh sách phiếu',exact:true});
    await pager.getByRole('button',{name:'Trang sau',exact:true}).click();await pager.getByText('Trang 2',{exact:true}).waitFor();
    const opener=page.getByRole('button',{name:isPurchase?'Mở đề nghị '+target:new RegExp('^Mở phiếu '+target+' '),exact:isPurchase});await opener.waitFor();
    const list=await page.locator('.erp-grid').first().elementHandle();
    // Set only naturally scrollable production ancestors. Do not replace CSS or
    // inject a fake viewport; zero-overflow ancestors legitimately stay at zero.
    const offsets=await opener.evaluate(element=>{const result=[];for(let node=element.parentElement;node;node=node.parentElement){node.scrollTop=37;node.scrollLeft=29;result.push({top:node.scrollTop,left:node.scrollLeft});}element.focus({preventScroll:true});return result;});
    assert.ok(offsets.some(value=>value.top>0),'Fixture must exercise real vertical overflow');
    await opener.evaluate(element=>element.click());await field(screen).waitFor();await atIndex(1);await privacy();
    await page.keyboard.press('Control+k');assert.equal(await page.locator('.command-modal:visible').count(),0);
    const box=await page.locator('.request-detail-dialog:visible').boundingBox();assert.ok(box);assert.ok(box.x>=-1&&box.x+box.width<=width+1);assert.ok(box.y>=-1&&box.y+box.height<=901);
    if(width===390){assert.ok(box.width>=389);assert.ok(box.height>=899);}else assert.ok(box.width<width);
    await back();await eventually(async()=>await selected()===null);await atIndex(0);assert.equal(await search.inputValue(),'QA');assert.equal(await page.getByLabel(isPurchase?'Chi nhánh':'Lọc chi nhánh',{exact:true}).inputValue(),'QA-BRANCH');await pager.getByText('Trang 2',{exact:true}).waitFor();
    assert.equal(await list.evaluate(element=>element.isConnected),true);await eventually(()=>opener.evaluate(element=>document.activeElement===element));
    assert.deepEqual(await opener.evaluate(element=>{const result=[];for(let node=element.parentElement;node;node=node.parentElement)result.push({top:node.scrollTop,left:node.scrollLeft});return result;}),offsets);
    await forward();await field(screen).waitFor();await eventually(async()=>await selected()===target);await atIndex(1);
    await page.keyboard.press('Escape');await eventually(async()=>await selected()===null);await atIndex(0);await forward();await field(screen).waitFor();await atIndex(1);
    await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await eventually(async()=>await selected()===null);await atIndex(0);await forward();await field(screen).waitFor();await atIndex(1);await go(screen);await eventually(async()=>await selected()===null);await atIndex(0);
    await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'Tìm màn hình',exact:true}).waitFor();await page.keyboard.press('Escape');
    assert.equal(model.writes.length,0);assert.ok(calls.some(call=>call.query.includes('page=2')&&call.query.includes('QA')));await privacy();
   });
   await run(`${width} ${screen} dirty canceled close and open never advance history or run obsolete choice`,async()=>{
    const second=screen==='purchase-requests'?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-002'}:{...structuredClone(inbound),documentId:'QA-INBOUND-002'};
    const secondId=second.purchaseRequestId??second.documentId;
    await start(width,screen,{[screen==='purchase-requests'?'purchaseDocuments':'inboundDocuments']:[screen==='purchase-requests'?structuredClone(purchase):structuredClone(inbound),second]});await openReady(screen);await atIndex(1);await field(screen).fill('RETAIN ON CANCEL');
    await back();await warning().waitFor();await atIndex(1);await back();await warning().waitFor();await atIndex(1);await cancel();await paint();assert.equal(await selected(),idFor(screen));assert.equal(await field(screen).inputValue(),'RETAIN ON CANCEL');
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();await cancel();await atIndex(1);assert.equal(await selected(),idFor(screen));
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();const obsolete=await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).elementHandle();
    await back();await warning().waitFor();await atIndex(1);await cancel();await obsolete.evaluate(element=>element.click());await paint();assert.equal(await selected(),idFor(screen));assert.equal(await field(screen).inputValue(),'RETAIN ON CANCEL');
    await back();await warning().waitFor();await accept();await eventually(async()=>await selected()===null);await atIndex(0);await forward();await openReadyOrExisting(screen);await atIndex(1);assert.equal(await selected(),idFor(screen));assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} newer route while apply is held supersedes prior detail traversal`,async()=>{
    await start(width,screen);await openReady(screen);await atIndex(1);
    await page.evaluate(()=>{window.authFixture.holdHistory=true;history.back();});await eventually(async()=>await heldHistory()===1);assert.equal(await selected(),idFor(screen));
    await releaseHistory();await eventually(async()=>await heldHistory()===1&&await selected()===null);await atIndex(1);
    await go('home');await releaseHistory();await eventually(async()=>await heldHistory()===1);await page.evaluate(()=>{window.authFixture.holdHistory=false;window.authFixture.releaseHistory();});
    await eventually(()=>new URL(page.url()).searchParams.get('screen')==='home');await atIndex(2);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} final screen apply rechecks newly dispatched non-discardable original`,async()=>{
    await start(width,'home',{holdCommands:true,unknown:true});await page.locator('.topbar').waitFor();await go(screen);await openReady(screen);await atIndex(2);await field(screen).fill('LATE ORIGINAL');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();
    await page.evaluate(()=>{window.authFixture.holdHistory=true;window.authFixture.userTraverse(-2);});await eventually(async()=>await heldHistory()===1);await releaseHistory();await warning().waitFor();await atIndex(2);await accept();await eventually(async()=>await heldHistory()===1);
    await dispatchReviewed(screen);await eventually(()=>model.commandWaiters.length===1);const original=model.writes[0];await paint();await releaseHistory();await eventually(async()=>await heldHistory()===1);await page.evaluate(()=>{window.authFixture.holdHistory=false;window.authFixture.releaseHistory();});await warning().waitFor();await atIndex(2);
    assert.equal(await selected(),idFor(screen));assert.equal(new URL(page.url()).searchParams.get('screen'),screen);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);assert.equal(model.writes.length,1);assert.equal(model.writes[0].bodySha256,original.bodySha256);await cancel();release('Commands');await eventually(()=>model.effects===1);await privacy();
   });
   await run(`${width} ${screen} pending unknown and readback custody survive Back outage and recovery`,async()=>{
    await start(width,screen,{holdCommands:true,unknown:true});await openReady(screen);await save(screen);await eventually(()=>model.commandWaiters.length===1);const original=model.writes[0],retained=await life(screen);
    await back();await warning().waitFor();await atIndex(1);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
    model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();assert.deepEqual(await life(screen),retained);release('Commands');await eventually(()=>model.effects===1);
    await back();await paint();await atIndex(1);await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await field(screen).waitFor();await paint();assert.equal(await selected(),idFor(screen));await back();await warning().waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);await cancel();
    if(screen==='inbound-requests')model.holdDetail=true;
    await page.getByRole('button',{name:reconcileLabel(screen),exact:true}).click();await eventually(()=>model.reconciles.length===1);assert.equal(model.reconciles[0],original.bodySha256);
    if(screen==='inbound-requests'){await eventually(()=>model.detailWaiters.length>0);await back();await warning().waitFor();await atIndex(1);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);await cancel();release('Detail');}
    assert.equal(model.writes.length,1);assert.equal(model.effects,1);assert.deepEqual(await life(screen),retained);evidence.push({width,screen,originalBodySha256:original.bodySha256,reconcileBodySha256:model.reconciles[0],dispatches:model.writes.length,effects:model.effects});await privacy();
   });
   await run(`${width} ${screen} rejected or canceled Forward cannot capture a later manual Open`,async()=>{
    const isPurchase=screen==='purchase-requests',second=isPurchase?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-002'}:{...structuredClone(inbound),documentId:'QA-INBOUND-002'},secondId=second.purchaseRequestId??second.documentId;
    const rowsPatch={[isPurchase?'purchaseDocuments':'inboundDocuments']:[isPurchase?structuredClone(purchase):structuredClone(inbound),second]};
    await start(width,screen,rowsPatch);await openReady(screen);await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await eventually(async()=>await selected()===secondId);await atIndex(2);await field(screen).waitFor();
    await back();await eventually(async()=>await selected()===idFor(screen));await atIndex(1);await field(screen).waitFor();await back();await eventually(async()=>await selected()===null);await atIndex(0);
    model.empty=true;await refresh();await eventually(()=>page.getByText(isPurchase?'Không có đề nghị phù hợp':'Không có phiếu trong trang này.',{exact:true}).isVisible());
    await forward();await paint();await atIndex(0);assert.equal(await selected(),null);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);
    model.empty=false;await refresh();await page.getByRole('button',{name:isPurchase?'Mở đề nghị '+idFor(screen):new RegExp('^Mở phiếu '+idFor(screen)+' '),exact:isPurchase}).waitFor();
    const afterRefusal=await page.evaluate(()=>window.authFixture.historyCalls.length);await openReady(screen);await atIndex(1);assert.equal(await page.evaluate(()=>window.authFixture.historyCalls.length),afterRefusal,'A later manual Open creates a new entry, never applies a refused Forward');await forward();await paint();await atIndex(1);assert.equal(await selected(),idFor(screen),'Manual Open truncates the old Forward B entry');
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await eventually(async()=>await selected()===secondId);await atIndex(2);await field(screen).waitFor();await back();await eventually(async()=>await selected()===idFor(screen));await atIndex(1);await field(screen).fill('CANCELED FORWARD');
    await forward();await warning().waitFor();await atIndex(1);await cancel();const afterCancel=await page.evaluate(()=>window.authFixture.historyCalls.length);
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();await accept();await eventually(async()=>await selected()===secondId);await atIndex(2);assert.equal(await page.evaluate(()=>window.authFixture.historyCalls.length),afterCancel,'Cancel retires the old Forward expectation before a later accepted manual Open');assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} queued history is masked by outage and obsolete login details cannot replay`,async()=>{
    await start(width,screen);await openReady(screen);await field(screen).fill('OLD LOGIN DRAFT');await back();await warning().waitFor();await atIndex(1);model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await warning().waitFor();await cancel();assert.equal(await field(screen).inputValue(),'OLD LOGIN DRAFT');await atIndex(1);
    model.workspaceStatus=401;await refresh();await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();await gateOnly();model.workspaceStatus=200;await login();assert.equal(new URL(page.url()).searchParams.get('screen'),screen);await eventually(()=>page.evaluate(()=>!!window.authFixture.navigation));assert.equal(await selected(),null);
    await back();await atIndex(0);await forward();await atIndex(1);assert.equal(await selected(),null);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);assert.equal(await warning().count(),0);assert.equal(model.writes.length,0);await privacy();
   });
  }
  assert.deepEqual(errors,[]);
  const sourcePaths=['components/erp/workspace.tsx','components/erp/navigation-guard.tsx','components/erp/request-detail-dialog.tsx','components/erp/purchase-request-screen.tsx','components/erp/inbound-request-screen.tsx','tests/request-detail-history.browser.mjs'];
  const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async file=>[file,sha(await readFile(path.join(app,file)))])));
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'evidence.json'),JSON.stringify({status:'passed',passed:true,results,errors,browserVersion:browser.version(),node:process.version,sourceHashes,evidence,scope:'Actual composed Workspace, request hosts, production clients and guard; synthetic HTTP and native history timing instrumentation. Not ERP/SQL acceptance.'},null,2));
 }finally{releaseAll();await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 async function openReadyOrExisting(screen){await field(screen).waitFor();await eventually(async()=>await selected()===idFor(screen));}
});
