import {serveLocalFont} from './local-font-assets.mjs';
// Actual composed Workspace, production clients, retained request editors and
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
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.MEDCOM_AUTH_EVIDENCE_DIR??path.join(app,'.test-runtime','workspace-auth-integration');
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
let compiled;
async function compile(){
 if(compiled)return compiled;
 const require=createRequire(import.meta.url),{build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './components/erp/workspace';
 window.authFixture={posts:[],ignoreAbort:false,tools:{},life:{},adapters:{},adapterIds:new WeakMap(),nextAdapter:0};window.testVisibility='visible';
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
 Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:(tool,{signal})=>{window.authFixture.tools[tool.name]=tool;signal.addEventListener('abort',()=>{if(window.authFixture.tools[tool.name]===tool)delete window.authFixture.tools[tool.name];});}}});
 const nativeFetch=window.fetch.bind(window);window.fetch=(url,init)=>{if(init?.method==='POST')window.authFixture.posts.push({url:String(url),body:String(init.body)});if(window.authFixture.ignoreAbort){const {signal,...rest}=init??{};void signal;return nativeFetch(url,rest);}return nativeFetch(url,init);};
 const snapshot=id=>({id,version:'configured-v1',values:{note:'INITIAL'},definition:{id:'configured',version:'v1',label:'Configured synthetic editor',sections:[{id:'main',label:'Main'}],fields:[{id:'note',label:'Configured note',sectionId:'main',kind:'text'}],actions:[{id:'save',label:'Save configured',enabled:true}]}});
 const configured={load:async id=>{window.authFixture.configuredLoads=(window.authFixture.configuredLoads??0)+1;return snapshot(id);},adapter:{save:()=>new Promise(resolve=>{window.authFixture.finishConfigured=resolve;window.authFixture.configuredWrites=(window.authFixture.configuredWrites??0)+1;}),reconcile:async()=>({kind:'unknown',message:'Synthetic unknown'}),reload:async id=>snapshot(id)},lookup:async()=>({items:[],hasMore:false})};
 createRoot(document.getElementById('root')).render(<Workspace extensions={new URLSearchParams(location.search).has('configured')?{documentScreens:{'purchase-orders':configured}}:undefined}/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:'auth-fixture.js',bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'observe-production-editor-lifetimes',setup(build){build.onLoad({filter:/[/\\](?:mobile-(?:inbound-)?request|document-editor)\.tsx$/},async args=>{
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
test('compile composed Workspace auth regression with real application CSS',async()=>{const result=await compile();assert.ok(result.script.length>0);assert.match(result.css,/min-height:\s*100dvh/);});
test('composed auth admission, portal fencing and same-intent custody',{timeout:240000},async t=>{
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
 const server=createServer(async(req,res)=>{if(serveLocalFont(req,res))return;const m=model;try{
  const url=new URL(req.url,origin??'http://localhost');
  if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
  if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
  const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method});
  const readHeaders={'X-Medcom-Session-Scope':m.sessionScope,'X-Medcom-Read-Scope':scope};
  if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
  if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
  if(route==='/api/auth/login'){m.loginCalls++;for await(const chunk of req)void chunk;if(m.holdLogin)await new Promise(resolve=>m.loginWaiters.push(resolve));if(m.loginStatus!==200)return send(res,m.loginStatus,{code:'authentication_required'});m.authenticated=true;m.sessionScope=sha('synthetic login '+m.loginCalls);return send(res,200,workspace().session);}
  if(route==='/api/workspace'){const status=m.authenticated?m.workspaceStatus:401,data=workspace();if(m.holdWorkspace)await new Promise(resolve=>m.workspaceWaiters.push(resolve));return send(res,status,status===200?data:{code:status===401?'authentication_required':'backend_unavailable'},readHeaders);}
  if(!m.authenticated)return send(res,401,{code:'authentication_required'});
  if(route==='/api/auth/logout'){m.authenticated=false;return send(res,204,null);}
  if(route==='/api/auth/session/continue')return send(res,200,workspace().session);
   if(route==='/api/purchase-requests/workspace')return send(res,200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
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
 }catch(error){errors.push(String(error));send(res,500,{code:'fixture_failure'});}});
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const eventually=async check=>{const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,'Expected fixture condition did not settle');await new Promise(resolve=>setTimeout(resolve,20));}};
 const start=async(width,screen,patch={})=>{releaseAll();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900}});page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/erp/api/workspace',route=>model.workspaceNetwork?route.abort('failed'):route.continue());await page.goto(origin+'/?screen='+encodeURIComponent(screen)+(patch.configured?'&configured=1':''));};
 const recovery=()=>page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true});
 const refresh=async()=>{const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/erp/api/workspace');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;await paint();};
 const gateOnly=async()=>{await paint();assert.equal(await page.locator('.topbar:visible,.erp-sidebar:visible,.workspace-content:visible,.mobile-bottom-nav:visible').count(),0);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.getByRole('menu').count(),0);assert.equal(await page.locator('[data-sonner-toast]:visible').count(),0);assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('section[tabindex="-1"]')),true);};
 const field=screen=>screen==='purchase-requests'?page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}):page.getByLabel('Số đơn',{exact:true});
 const open=screen=>page.getByRole('button',{name:screen==='purchase-requests'?'Mở đề nghị '+purchase.purchaseRequestId:new RegExp('^Mở phiếu '+inbound.documentId+' '),exact:screen==='purchase-requests'}).click();
 const save=async screen=>{await field(screen).fill('EXACT ORIGINAL AUTH CUSTODY');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi',exact:true}).click();};
 const life=screen=>page.evaluate(name=>({life:window.authFixture.life[name],adapters:window.authFixture.adapters[name]}),screen==='purchase-requests'?'RequestEditor':'InboundEditor');
 const go=id=>page.evaluate(id=>window.authFixture.tools.navigate_medcom_screen.execute({screen:id}),id);
 const run=async(name,fn)=>{await t.test(name,async()=>{await fn();results.push(name);});};
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,chromiumSandbox:true});
  for(const width of [1280,390]){
   for(const screen of ['home','settings','purchase-orders','purchase-requests','purchase-approval','inbound-requests','transfers','sales','accounting','reports','https://untrusted.invalid'])await run(`${width} initial held proof and anonymous ${screen}`,async()=>{
    await start(width,screen,{authenticated:false,holdWorkspace:true});await page.getByRole('heading',{name:'Đang xác minh phiên làm việc…',exact:true}).waitFor();await gateOnly();release('Workspace');await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();await gateOnly();assert.equal(calls.filter(call=>call.route.includes('/documents/')||call.route.startsWith('/api/purchase-requests')).length,0);
   });
   await run(`${width} initial unavailable retry preserves requested route without mounting shell`,async()=>{
    await start(width,'inbound-requests',{workspaceStatus:503});await recovery().waitFor();await gateOnly();assert.equal(new URL(page.url()).searchParams.get('screen'),'inbound-requests');model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByTestId('inbound-request-host').waitFor();assert.equal(new URL(page.url()).searchParams.get('screen'),'inbound-requests');
   });
   await run(`${width} initial network failure remains gated until current retry proof`,async()=>{
    await start(width,'purchase-requests',{workspaceNetwork:true});await recovery().waitFor();await gateOnly();model.workspaceNetwork=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
   });
   await run(`${width} successful login POST is not workspace proof; failed GET retains intent`,async()=>{
    await start(width,'purchase-requests',{authenticated:false,holdLogin:true});const form=page.getByRole('form',{name:'Đăng nhập ERP',exact:true});await form.waitFor();await form.getByLabel('Tên đăng nhập',{exact:true}).fill('synthetic');await form.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await form.getByRole('button',{name:'Đăng nhập',exact:true}).click();await form.evaluate(element=>element.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await eventually(()=>model.loginWaiters.length===1);assert.equal(await form.getByLabel('Mật khẩu',{exact:true}).inputValue(),'');model.holdWorkspace=true;model.workspaceStatus=503;release('Login');await eventually(()=>model.workspaceWaiters.length===1);await gateOnly();assert.equal(model.loginCalls,1);release('Workspace');await recovery().waitFor();await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
   });
   for(const screen of ['purchase-requests','inbound-requests']){
    await run(`${width} ${screen} queued dirty navigation survives mask without auto-approval`,async()=>{
     await start(width,screen);await open(screen);await field(screen).fill('DIRTY AUTH CUSTODY');const editor=await life(screen);await go('home');await page.getByRole('alertdialog').waitFor();model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();assert.deepEqual(await life(screen),editor);await page.keyboard.press('Control+k');await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(new URL(page.url()).searchParams.get('screen'),screen);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();assert.equal(await field(screen).inputValue(),'DIRTY AUTH CUSTODY');assert.deepEqual(await life(screen),editor);assert.equal(model.writes.length,0);
    });
    await run(`${width} ${screen} sent original survives outage, lost ACK and same-session expiry changes`,async()=>{
     await start(width,screen,{holdCommands:true,unknown:true});await open(screen);await save(screen);await eventually(()=>model.commandWaiters.length===1);const original=model.writes[0];const retained=await life(screen);model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();assert.deepEqual(await life(screen),retained);model.holdCommands=false;model.commandWaiters.splice(0).forEach(resolve=>resolve());await eventually(()=>model.effects===1);model.workspaceNetwork=true;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await recovery().waitFor();await gateOnly();assert.deepEqual(await life(screen),retained);model.workspaceNetwork=false;model.workspaceStatus=200;model.version++;model.lifetime.absoluteExpiresAt=new Date(Date.now()+7500000).toISOString();await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('button',{name:screen==='purchase-requests'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc',exact:true}).waitFor();assert.deepEqual(await life(screen),retained);assert.equal(model.writes.length,1);assert.equal(model.writes[0].bodySha256,original.bodySha256);await go('home');await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();
     const reconcile=page.getByRole('button',{name:screen==='purchase-requests'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc',exact:true});await reconcile.click();await eventually(()=>model.reconciles.length===1);assert.equal(model.reconciles[0],original.bodySha256);assert.equal(model.effects,1);assert.equal(model.writes.length,1);evidence.push({width,screen,editorLifetime:await life(screen),originalBodySha256:original.bodySha256,reconcileBodySha256:model.reconciles[0],effects:model.effects,dispatches:model.writes.length});
    });
    await run(`${width} ${screen} recovery recomputes a dirty warning after command dispatch`,async()=>{
     await start(width,screen,{holdCommands:true,unknown:true});await open(screen);await field(screen).fill('QUEUED WARNING ORIGINAL');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await go('home');await page.getByRole('alertdialog').waitFor();const saveLabel=screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi';await page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>button.textContent?.trim()===label)?.click(),saveLabel);await eventually(()=>model.commandWaiters.length===1);model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();model.holdCommands=false;model.commandWaiters.splice(0).forEach(resolve=>resolve());await eventually(()=>model.effects===1);model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);assert.equal(new URL(page.url()).searchParams.get('screen'),screen);assert.equal(model.writes.length,1);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();
    });
    await run(`${width} ${screen} current 401 retires dirty host and queued action`,async()=>{
     await start(width,screen);await open(screen);await field(screen).fill('RETIRED DRAFT');const input=await field(screen).elementHandle();await go('home');await page.getByRole('alertdialog').waitFor();model.workspaceStatus=401;await refresh();await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();await gateOnly();assert.equal(await input.evaluate(element=>element.isConnected),false);model.workspaceStatus=200;const form=page.getByRole('form',{name:'Đăng nhập ERP',exact:true});await form.getByLabel('Tên đăng nhập',{exact:true}).fill('same-name');await form.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await form.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.topbar').waitFor();assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(new URL(page.url()).searchParams.get('screen'),screen);
    });
   }
   await run(`${width} known deadline stays authoritative over an abort-ignoring late workspace`,async()=>{
    await start(width,'home',{lifetime:{idleExpiresAt:new Date(Date.now()+1800).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()}});await page.locator('.topbar').waitFor();await page.evaluate(()=>{window.authFixture.ignoreAbort=true;});model.holdWorkspace=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await eventually(()=>model.workspaceWaiters.length>0);await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();release('Workspace');await paint();await gateOnly();assert.equal(await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).count(),1);
   });
   await run(`${width} configured text editor retains exact node and pending adapter through masking`,async()=>{
    await start(width,'purchase-orders',{configured:true});await page.getByRole('button',{name:'QA-ORDER-1',exact:true}).click();const input=page.getByLabel('Configured note',{exact:true});await input.fill('CONFIGURED ORIGINAL');const node=await input.elementHandle();await page.getByRole('button',{name:'Save configured',exact:true}).click();await eventually(()=>page.evaluate(()=>window.authFixture.configuredWrites===1));model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();assert.equal(await node.evaluate(element=>element.isConnected),true);await page.evaluate(()=>window.authFixture.finishConfigured({kind:'unknown',message:'Synthetic lost ACK'}));model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await input.waitFor();assert.equal(await input.inputValue(),'CONFIGURED ORIGINAL');assert.equal(await input.evaluate((element,original)=>element===original,node),true);await go('home');await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);model.workspaceStatus=401;await refresh();await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();assert.equal(await node.evaluate(element=>element.isConnected),false);
   });
   await run(`${width} healthy visible background verification does not flash login`,async()=>{
    await start(width,'home');await page.locator('.topbar').waitFor();model.holdWorkspace=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await eventually(()=>model.workspaceWaiters.length>0);assert.equal(await page.locator('.topbar').isVisible(),true);assert.equal(await page.getByRole('heading',{name:'Đang xác minh phiên làm việc…',exact:true}).count(),0);release('Workspace');await paint();
   });
   await run(`${width} current allowlist governs model navigation and desktop/mobile entry points`,async()=>{
    await start(width,'home',{capabilities:[],navigation:['sales','purchase-orders']});await page.locator('.topbar').waitFor();await assert.rejects(()=>go('purchase-orders'));assert.equal(new URL(page.url()).searchParams.get('screen'),'home');await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'Tìm màn hình',exact:true}).waitFor();assert.equal(await page.getByRole('option',{name:/Đơn đặt hàng mua|Yêu cầu hóa đơn/}).count(),0);
   });
  }
  assert.deepEqual(errors,[]);await mkdir(output,{recursive:true});await writeFile(path.join(output,'browser-result.json'),JSON.stringify({passed:true,browser:browser.version(),node:process.version,results,evidence,scope:'Actual composed Workspace and production clients; synthetic HTTP. Not ERP/SQL acceptance.'},null,2));
 }finally{releaseAll();await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
