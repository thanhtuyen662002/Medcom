import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..').replaceAll('\\','/');
const output=path.join(app,'.test-runtime','i17-purchase-workspace');await mkdir(output,{recursive:true});
await build({absWorkingDir:app,entryPoints:['lib/erp/purchase-request-api.ts'],outfile:path.join(output,'api.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
const api=await import(pathToFileURL(path.join(output,'api.mjs')).href);
const {proxyErpRequest}=await import('../.test-runtime/erp-tests/proxy.js');
const {routeAllowed}=await import('../.test-runtime/erp-tests/proxy-policy.js');
const scope='a'.repeat(64);
function document(id='QA-000',branch='QA-A',count=1){return {purchaseRequestId:id,branchId:branch,statusId:1,isLocked:null,
 header:{purchaseDate:'2026-10-06T13:14:15.000',purposeId:1,personSuggest:'SYNTHETIC REQUESTER',department:'SYNTHETIC DEPARTMENT',purposeDescOrClient:null,price:'15.25',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1.25},
 lines:Array.from({length:count},(_,index)=>({lineId:`QA-L${String(index+1).padStart(3,'0')}`,values:{itemId:'QA-ITEM',budget:null,timeRequired:'synthetic wall clock',quantity:'999999999999999999',unitPrice:'2',totalPrice:'7',model:null}}))};}
function readback(doc=document()){return {document:doc,stateToken:'prs1.'+'1'.repeat(64)};}

test('fixed adapter preserves precision/full readback and refuses incomplete mobile projections',()=>{
 const data=readback();const mobile=api.mobilePurchaseSnapshot(data);assert.equal(mobile.values.lines[0].quantity,'999999999999999999');assert.equal(data.document.header.purchaseDate,'2026-10-06T13:14:15.000');assert.equal(data.document.lines[0].values.totalPrice,'7');
 assert.equal(api.mobilePurchaseSnapshot(readback(document('QA-LARGE','QA-A',101))),null);
 const nullable=readback();nullable.document.header.purchaseDate=null;assert.equal(api.mobilePurchaseSnapshot(nullable),null);
 for(const route of ['api/purchase-requests','api/purchase-requests/workspace','api/purchase-requests/detail','api/purchase-requests/lookup']){assert.equal(routeAllowed(route,'GET'),true);assert.equal(routeAllowed(route,'POST'),false);}
 assert.equal(routeAllowed('api/purchase-requests/sql','GET'),false);
});
test('typed responses reject scope mixing, numeric decimal loss and wrong selected identity',async()=>{
 const original=global.fetch;
 try{
  global.fetch=async()=>Response.json({scopeKey:'b'.repeat(64),data:{rows:[],page:1,pageSize:20,hasMore:false}});
  await assert.rejects(api.getPurchaseList(scope,1,'',''),error=>error.code==='purchase_scope_changed');
  const lossy=readback();lossy.document.lines[0].values.quantity=999999999999999999;
  global.fetch=async()=>Response.json({scopeKey:scope,data:lossy});await assert.rejects(api.getPurchaseDetail(scope,'QA-000'),error=>error.code==='invalid_api_response');
  global.fetch=async()=>Response.json({scopeKey:scope,data:readback(document('QA-OTHER'))});await assert.rejects(api.getPurchaseDetail(scope,'QA-000'),error=>error.code==='invalid_api_response');
 }finally{global.fetch=original;}
});

test('detail failures retain a fresh list but never soften authorization or scope denial',async()=>{
 const original=global.fetch;
 try{
  for(const status of [404,503,401,403,409]){
   global.fetch=async url=>String(url).includes('/detail?')?Response.json({code:'synthetic-detail-error'},{status}):Response.json({scopeKey:scope,data:{rows:[],page:1,pageSize:20,hasMore:false}});
   const result=api.getPurchaseDocuments(scope,['QA-A'],1,'','', 'QA-DOC');
   if([401,403,409].includes(status))await assert.rejects(result,error=>error.status===status);
   else{const data=await result;assert.deepEqual(data.list.rows,[]);assert.equal(data.detail,undefined);assert.equal(data.detailError.status,status);}
  }
 }finally{global.fetch=original;}
});

test('production session continuations cannot mutate a retired account',async()=>{
 // Execute the actual function bodies with synthetic I/O, not a second implementation.
 const source=await readFile(path.join(app,'components/erp/workspace.tsx'),'utf8');
 const file=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),bodies=[];
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&['extend','performSignOut'].includes(node.name?.text))bodies.push(node.getText(file));ts.forEachChild(node,visit);};visit(file);assert.equal(bodies.length,2);
 function fixture(){
  let resolveContinue,rejectContinue,resolveLogout,generation=0;const calls=[];
  const continuation=new Promise((resolve,reject)=>{resolveContinue=resolve;rejectContinue=reject;}),logout=new Promise(resolve=>{resolveLogout=resolve;});
  const context={mounted:{current:true},authorityFence:{current:{begin:()=>++generation,isCurrent:value=>value===generation,invalidate:()=>{generation++;}}},
   continueSession:()=>continuation,logout:()=>logout,getWorkspace:async()=>{calls.push('read');return{};},loadWorkspace:async()=>{calls.push('read');},
   setWorkspace:value=>calls.push(['workspace',value]),setSessionError:value=>calls.push(['error',value]),setSessionBusy:()=>{},onDenied:()=>calls.push('denied'),
   queryClient:{clear(){}},ApiError:api.ApiError??class extends Error{},errorMessage:error=>String(error),toast:{success:()=>calls.push('success'),error:()=>calls.push('error')}};
  const code=ts.transpileModule(bodies.join('\n')+'\n({extend,performSignOut});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return{...runInNewContext(code,context),context,calls,resolveContinue,rejectContinue,resolveLogout};
 }
 let f=fixture(),pending=f.extend();f.context.authorityFence.current.invalidate();f.calls.length=0;f.resolveContinue();await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.extend();f.context.authorityFence.current.invalidate();f.calls.length=0;f.rejectContinue(Object.assign(new Error('expired'),{status:401}));await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.performSignOut();f.context.authorityFence.current.invalidate();f.calls.length=0;f.resolveLogout();await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.performSignOut();f.context.mounted.current=false;f.calls.length=0;f.resolveLogout();await pending;assert.deepEqual(f.calls,[]);
});

test('Workspace deadline source callbacks fence a completed login while its new read is delayed',async t=>{
 // Actual source callbacks with mocked hooks/timers. This is not React/browser evidence.
 const source=await readFile(path.join(app,'components/erp/workspace.tsx'),'utf8');
 const file=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let deadline,success,load;
 const visit=node=>{
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0]?.getText(file).includes('const limit=knownSessionLimit.current'))deadline=node.arguments[0].getText(file);
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='loadWorkspace')load=node.initializer.arguments[0].getText(file);
  if(ts.isJsxAttribute(node)&&node.name.getText(file)==='onSuccess'&&node.initializer?.expression?.getText(file).includes('setLoginBoundary'))success=node.initializer.expression.getText(file);
  ts.forEachChild(node,visit);
 };visit(file);assert.ok(deadline&&success&&load,'deadline, login and load must come from production source');
 const code=ts.transpileModule(`const loadWorkspace=${load};({deadline:${deadline},success:${success}});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 function fixture(expiry='idle'){
  const now=Date.parse('2026-10-06T07:00:00.000Z'),limit=now+100,far=now+60000,timers=[];let generation=0,invalidated=0,releaseRead,pendingRead;
  const initial={session:{idleExpiresAt:new Date(expiry==='idle'?limit:far).toISOString(),absoluteExpiresAt:new Date(expiry==='absolute'?limit:far).toISOString()}};
  class Clock extends Date{static now(){return now;}}
  class SessionError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
  const context={workspace:initial,sessionEnded:false,loginBoundary:1,sessionError:null,sessionBusy:false,knownSessionLimit:{current:null},mounted:{current:true},Date:Clock,ApiError:SessionError,
   authorityFence:{current:{begin:()=>++generation,isCurrent:value=>value===generation,invalidate:()=>{invalidated++;generation++;}}},queryClient:{clear(){}},
   getWorkspace:()=>{assert.equal(context.knownSessionLimit.current,null,'clear previous deadline synchronously before starting the new read');pendingRead=new Promise(resolve=>{releaseRead=resolve;});return pendingRead;},
   setWorkspace:value=>{context.workspace=value;},setSessionError:value=>{context.sessionError=value;},setSessionBusy:value=>{context.sessionBusy=value;},setLoginBoundary:update=>{context.loginBoundary=update(context.loginBoundary);},
   setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}};
  return{...runInNewContext(code,context),context,timers,initial,limit,invalidated:()=>invalidated,finishRead:async value=>{releaseRead(value);await pendingRead;await Promise.resolve();await Promise.resolve();}};
 }
 await t.test('queued prior deadline cannot cancel the new login read, before cleanup or after its new deadline is installed',async()=>{
  const f=fixture();f.deadline();const oldTimer=f.timers.at(-1);assert.equal(oldTimer.ms,100);
  f.context.workspace=null;f.deadline();assert.equal(f.context.knownSessionLimit.current,f.limit,'same-session outage retains the old deadline');
  f.success();assert.equal(f.context.knownSessionLimit.current,null);assert.equal(f.context.loginBoundary,2);assert.equal(f.context.sessionBusy,true);
  const invalidations=f.invalidated();oldTimer.fn();assert.equal(f.invalidated(),invalidations);assert.equal(f.context.sessionError,null);
  const count=f.timers.length;f.deadline();assert.equal(f.timers.length,count,'no old deadline is re-armed while the new read waits');
  const next={session:{idleExpiresAt:new Date(f.limit+60000).toISOString(),absoluteExpiresAt:new Date(f.limit+120000).toISOString()}};
  await f.finishRead(next);assert.equal(f.context.workspace,next);assert.equal(f.context.sessionBusy,false);assert.equal(f.context.sessionError,null);
  f.deadline();oldTimer.fn();assert.equal(f.invalidated(),invalidations);assert.equal(f.context.workspace,next);
 });
 for(const expiry of ['idle','absolute'])await t.test(`${expiry} deadline remains authoritative during a same-session outage`,()=>{
  const f=fixture(expiry);f.deadline();f.context.workspace=null;f.deadline();assert.equal(f.context.knownSessionLimit.current,f.limit);assert.equal(f.timers.at(-1).ms,100);
  f.timers.at(-1).fn();assert.equal(f.invalidated(),1);assert.equal(f.context.sessionError.status,401);assert.equal(f.context.sessionError.code,'session_expired');assert.equal(f.context.knownSessionLimit.current,null);
 });
 await t.test('already elapsed deadline uses the same zero-delay guarded timer',()=>{
  const f=fixture();f.context.workspace=null;f.context.knownSessionLimit.current=f.limit-200;f.deadline();
  assert.equal(f.invalidated(),0);assert.equal(f.timers.at(-1).ms,0);f.timers.at(-1).fn();assert.equal(f.context.sessionError.status,401);
 });
});

test('real HTTP → BFF → existing workspace/browser purchase controls and authority fences',async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('Required installed playwright-core unavailable. Set MEDCOM_BROWSER_TOOLCHAIN; no download or skip.');}
 const records=Array.from({length:25},(_,index)=>document(`QA-${String(index).padStart(3,'0')}`,index%2?'QA-B':'QA-A'));
 records.push(document('QA-LARGE','QA-A',101));const nullable=document('QA-NULL','QA-A');nullable.header.purchaseDate=null;records.push(nullable);
 const lifetime={idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()};
 const state={scope,displayName:'SYNTHETIC USER',branches:['QA-A','QA-B'],canRead:true,authenticated:true,hold:false,release:null,started:null};const calls=[];
 function workspace(){return {session:{displayName:state.displayName,tenantId:'qa-tenant',companyId:'qa-company',companyName:'SYNTHETIC COMPANY',authorityVersion:1,
  ...lifetime,capabilities:state.canRead?['purchase-requests.read']:[]},
  navigation:state.canRead?[{id:'purchase-requests',label:'Đề nghị mua hàng',href:'/workspace/?screen=purchase-requests'}]:[],branchIds:state.branches};}
 const send=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
 const backend=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method,cookie:request.headers.cookie??''});
  if(url.pathname==='/health/ready')return send(response,503,{status:'unavailable',checks:[{component:'business_release',status:'not_configured'}]});
  if(!state.authenticated||!request.headers.cookie?.includes('__Host-Medcom.Session=synthetic-i17'))return send(response,401,{code:'authentication_required'});
  if(url.pathname==='/api/workspace')return send(response,200,workspace());
  if(url.pathname.startsWith('/api/purchase-requests')&&!state.canRead)return send(response,403,{code:'forbidden'});
  const envelope=data=>({scopeKey:state.scope,data});
  if(url.pathname==='/api/purchase-requests/workspace')return send(response,200,envelope({branchIds:state.branches,writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[
   {kind:'branches',available:true,reason:null,evidence:'synthetic native branches'},...['items','objects','purposes','currencies'].map(kind=>({kind,available:false,reason:'source_binding_unqualified',evidence:'synthetic UNKNOWN binding'}))]}));
  if(url.pathname==='/api/purchase-requests'){
   const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||20),branch=url.searchParams.get('branchId'),search=url.searchParams.get('search')||'';
   if(branch&&!state.branches.includes(branch))return send(response,403,{code:'forbidden'});
   const filtered=records.filter(record=>state.branches.includes(record.branchId)&&(!branch||record.branchId===branch)&&record.purchaseRequestId.includes(search));
   return send(response,200,envelope({rows:filtered.slice((page-1)*size,page*size).map(record=>({documentId:record.purchaseRequestId,purchaseDate:record.header.purchaseDate,branchId:record.branchId,personSuggest:record.header.personSuggest,department:record.header.department,statusId:record.statusId,isLocked:record.isLocked})),page,pageSize:size,hasMore:filtered.length>page*size}));
  }
  if(url.pathname==='/api/purchase-requests/detail'){
   const record=records.find(record=>record.purchaseRequestId===url.searchParams.get('documentId')&&state.branches.includes(record.branchId));
   if(!record)return send(response,404,{code:'purchase_request_not_found'});
   const answer=envelope(readback(structuredClone(record)));
   if(state.hold){state.started?.();await new Promise(resolve=>{state.release=resolve;});}
   return send(response,200,answer);
  }
  if(url.pathname==='/api/purchase-requests/lookup')return send(response,200,envelope({available:false,reason:'source_binding_unqualified',items:[],page:1,hasMore:false}));
  send(response,404,{code:'endpoint_unavailable'});
 });backend.listen(0,'127.0.0.1');await once(backend,'listening');const backendAddress=`http://127.0.0.1:${backend.address().port}`;
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';import{PurchaseRequestScreen}from'./components/erp/purchase-request-screen';import{NavigationGuardProvider}from'./components/erp/navigation-guard';import{getWorkspace}from'./lib/erp/api';
 function App(){const[controlled,setControlled]=useState(false),[authority,setAuthority]=useState(null),[boundary,setBoundary]=useState(0),[ended,setEnded]=useState(false);window.qa={controlled:async()=>{setAuthority(await getWorkspace());setEnded(false);setControlled(true);},authority:async(retire=false)=>{const next=await getWorkspace();setAuthority(next);setEnded(false);if(retire)setBoundary(value=>value+1);}};
 return controlled?<NavigationGuardProvider><PurchaseRequestScreen workspace={authority} loginBoundary={boundary} sessionEnded={ended} onVerifyWorkspace={async()=>{setAuthority(await getWorkspace());setEnded(false);}} onDenied={error=>{if(error.status===401){setAuthority(null);setEnded(true);}}} onLogin={()=>{}}/></NavigationGuardProvider>:<Workspace/>;}createRoot(document.getElementById('root')).render(<App/>);`;
 // Next's image runtime needs its framework bundler. Only image rendering is shimmed;
 // the workspace, controls, data adapters, BFF and HTTP requests are the production code.
 await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'browser.js'),bundle:true,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',
  plugins:[{name:'fixture-next-image',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'fixture-next-image',namespace:'i17-fixture'}));build.onLoad({filter:/.*/,namespace:'i17-fixture'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return React.createElement('img',{src,alt,width,height});}",resolveDir:app,loader:'jsx'}));}}]});
 const bundle=await readFile(path.join(output,'browser.js'));let frontend;
 frontend=createServer(async(request,response)=>{
  if(request.url.startsWith('/api/erp/')){
   const incoming=new URL(request.url,`http://localhost:${frontend.address().port}`);const headers=new Headers(request.headers);
   const result=await proxyErpRequest(new Request(`https://synthetic-frontend.medcom.test${incoming.pathname}${incoming.search}`,{method:request.method,headers}),incoming.pathname.slice('/api/erp/'.length).split('/'),
    'https://synthetic-backend.medcom.test','https://synthetic-frontend.medcom.test',async(url,init)=>{
     const target=new URL(url);assert.equal(target.origin,'https://synthetic-backend.medcom.test');return fetch(`${backendAddress}${target.pathname}${target.search}`,init);
    });response.writeHead(result.status,Object.fromEntries(result.headers));return response.end(Buffer.from(await result.arrayBuffer()));
  }
  if(request.url==='/browser.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}
  if(request.url.startsWith('/_next/')||request.url.startsWith('/assets/')){response.writeHead(404);return response.end();}
  response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script src="/browser.js"></script></body></html>');
 });frontend.listen(0,'127.0.0.1');await once(frontend,'listening');let browser,context,page;const errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-component-update','--disable-default-apps','--no-default-browser-check']});
  context=await browser.newContext({viewport:{width:390,height:844}});const origin=`http://localhost:${frontend.address().port}`;
  // Chromium permits secure cookies on localhost; no production cookie/TLS policy changes.
  await context.addCookies([{name:'__Host-Medcom.Session',value:'synthetic-i17',domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?screen=purchase-requests');
  const screen=page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true});
  await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).waitFor();
  await t.test('existing workspace navigation mounts the real screen and available read controls',async()=>{
   await page.getByRole('heading',{level:1,name:'Đề nghị mua hàng',exact:true}).waitFor();
   assert.equal(await screen.getByRole('article').count(),20);assert.ok(await screen.getByRole('button',{name:'Tạo đề nghị',exact:true}).isDisabled());
   assert.match(await screen.innerText(),/cấp số, nhật ký lệnh/);assert.ok(calls.some(call=>call.path==='/api/purchase-requests'&&call.cookie.includes('synthetic-i17')));
  });
  await t.test('next/previous pages, branch selection and exact search all use actual BFF HTTP',async()=>{
   await screen.getByRole('button',{name:'Trang sau',exact:true}).click();await screen.getByText('Trang 2',{exact:true}).waitFor();assert.equal(await screen.getByRole('article').count(),7);
   await screen.getByRole('button',{name:'Trang trước',exact:true}).click();await screen.getByText('Trang 1',{exact:true}).waitFor();
   await screen.getByLabel('Chi nhánh',{exact:true}).selectOption('QA-B');await screen.getByRole('button',{name:'Mở đề nghị QA-001',exact:true}).waitFor();assert.equal(await screen.getByRole('article').count(),12);
   await screen.getByLabel('Chi nhánh',{exact:true}).selectOption('');await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).waitFor();
   await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill('QA-003');await screen.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).waitFor();assert.equal(await screen.getByRole('article').count(),1);
   assert.ok(calls.some(call=>call.query.page==='2'));assert.ok(calls.some(call=>call.query.branchId==='QA-B'));assert.ok(calls.some(call=>call.query.search==='QA-003'));
  });
  async function find(id){await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill(id);await screen.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await screen.getByRole('button',{name:`Mở đề nghị ${id}`,exact:true}).waitFor();}
  await t.test('open/refresh/close preserve precise values and the full hidden header',async()=>{
   await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).click();const detail=screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await detail.waitFor();
   assert.match(await detail.innerText(),/2026-10-06T13:14:15.000/);assert.match(await detail.innerText(),/15.25/);assert.match(await detail.innerText(),/999999999999999999/);
   const before=calls.filter(call=>call.path.endsWith('/detail')).length;const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/purchase-requests/detail');await screen.getByRole('button',{name:'Làm mới',exact:true}).click();await refreshed;await detail.waitFor();assert.ok(calls.filter(call=>call.path.endsWith('/detail')).length>before);
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).waitFor();assert.equal(await detail.count(),0);
  });
  await t.test('101 lines and nullable source date have complete read-only fallback without truncation',async()=>{
   await find('QA-LARGE');await screen.getByRole('button',{name:'Mở đề nghị QA-LARGE',exact:true}).click();const table=screen.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});await table.waitFor();assert.equal(await table.locator('tbody tr').count(),101);assert.match(await table.innerText(),/QA-L101/);
   await find('QA-NULL');await screen.getByRole('button',{name:'Mở đề nghị QA-NULL',exact:true}).click();await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();assert.match(await screen.innerText(),/NULL/);
  });
  await t.test('refresh of a deleted selected document retains close/list recovery without stale detail',async()=>{
   await find('QA-003');await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).click();
   const detail=screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await detail.waitFor();
   const index=records.findIndex(record=>record.purchaseRequestId==='QA-003'),[removed]=records.splice(index,1);
   try{
    await screen.getByRole('button',{name:'Làm mới',exact:true}).click();await screen.getByRole('alert').waitFor();
    assert.equal(await detail.count(),0);await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await screen.getByText('Trang 1',{exact:true}).waitFor();
   }finally{records.splice(index,0,removed);}
   await find('QA-000');
  });
  await t.test('new accounts and opaque scope changes retire selected documents and filters at a fixed lifetime',async()=>{
   await page.evaluate(()=>window.qa.controlled());
   for(const [nextScope,nextName] of [['b'.repeat(64),'SYNTHETIC SECOND USER'],['c'.repeat(64),'SYNTHETIC SECOND USER']]){
    await find('QA-000');await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();
    state.scope=nextScope;state.displayName=nextName;await page.evaluate(()=>window.qa.authority());
    await screen.getByRole('button',{name:'Mở đề nghị QA-001',exact:true}).waitFor();
    assert.equal(await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).count(),0);assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'');
   }
  });
  await t.test('late result after a login boundary is discarded, and grant denial removes rows',async()=>{
   await page.evaluate(()=>window.qa.controlled());await find('QA-000');state.hold=true;const started=new Promise(resolve=>{state.started=resolve;});
   await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await started;
   state.canRead=false;await page.evaluate(()=>window.qa.authority(true));state.hold=false;state.release();await page.getByText('Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.',{exact:true}).waitFor();
   await page.waitForTimeout(50);assert.equal(await page.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true}).count(),0);assert.equal(await page.getByRole('article').count(),0);
  });
  assert.deepEqual(errors,[]);assert.equal(calls.some(call=>call.method!=='GET'),false);await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],calls:calls.length,nonGetCalls:0,errors},null,2));
 }catch(error){await writeFile(path.join(output,'synthetic-failure.json'),JSON.stringify({errors,calls,body:await page?.locator('body').innerText().catch(()=>''),error:String(error)},null,2));throw error;}
 finally{state.release?.();await context?.close();await browser?.close();await new Promise(resolve=>frontend.close(resolve));await new Promise(resolve=>backend.close(resolve));}
});

// I20 tests run the actual adapter and BFF. These Node/transport-double cases
// are not ASP.NET or production SQL evidence.
await build({absWorkingDir:app,entryPoints:['lib/erp/purchase-request-command-adapter.ts'],outfile:path.join(output,'i20-command.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
test('I20 actual command module and BFF / Node synthetic parity',async t=>{
 const {commandPurchaseSnapshot,freezePurchaseCommand,createPurchaseCommandAdapter}=await import(pathToFileURL(path.join(output,'i20-command.mjs')).href);
 const policy=await import('../.test-runtime/erp-tests/proxy-policy.js');
 const cases=[];const register=(name,run)=>cases.push([name,run]);
const scope='a'.repeat(64),token=n=>'prs1.'+String(n).repeat(64);
function raw(count=2){return {stateToken:token(1),document:{purchaseRequestId:'QA-DOC',branchId:'QA-A',statusId:1,isLocked:null,
 header:{purchaseDate:'2026-10-06T13:14:15.003',purposeId:null,personSuggest:'',department:'QA',purposeDescOrClient:'',price:'9999999999999999.99',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:0.125},
 lines:Array.from({length:count},(_,i)=>({lineId:'L'+String(i).padStart(3,'0'),values:{itemId:'QA-ITEM',budget:null,timeRequired:'',quantity:'999999999999999999',unitPrice:'-2',totalPrice:i%2?null:'7',model:null}}))}};}
function intent(r,action='saveDraft',id=crypto.randomUUID()){const v=commandPurchaseSnapshot(r).values;if(action==='saveDraft')v.notes='Đã kiểm tra';return {intentId:id,action,documentId:r.document.purchaseRequestId,expectedVersion:r.stateToken,values:v};}
function ack(f,n=2,outcome=0){return {scopeKey:scope,data:{outcome,receipt:{actionId:'purchase-request.'+(f.action==='saveDraft'?'save-draft':'submit'),idempotencyKey:f.dto.idempotencyKey,document:structuredClone(f.desired),stateToken:token(n),allocatedLines:[]}}};}
const signal=()=>new AbortController().signal;
register('lossless full raw overlay, timestamp, NULL, empty, float and decimal strings',()=>{
 const r=raw(),i=intent(r);i.values.lines[0].quantity='9007199254740993';const f=freezePurchaseCommand(r,i);
 assert.equal(f.dto.header.price,'9999999999999999.99');assert.equal(f.dto.header.rateExchange,0.125);assert.equal(f.dto.header.purchaseDate,'2026-10-06T13:14:15.003');
 assert.equal(f.dto.header.purposeId,null);assert.equal(f.dto.header.purposeDescOrClient,'');assert.equal(f.dto.lineChanges[0].kind,'Update');assert.equal(f.dto.lineChanges[0].values.quantity,'9007199254740993');
 assert.equal(f.dto.lineChanges[0].values.totalPrice,'7');assert.equal(f.dto.lineChanges[0].values.budget,null);assert.equal(f.dto.lineChanges[0].values.model,null);assert.equal(f.dto.lineChanges[0].values.timeRequired,'');
 assert.equal(f.desired.lines[1].values.totalPrice,null);assert.equal(r.document.header.notes,null);assert.ok(Object.isFrozen(f.dto.header));assert.ok(Object.isFrozen(f.dto.lineChanges[0].values));
});
register('NULL SQL date and unchanged nullable text are retained, not defaulted',()=>{const r=raw();r.document.header.purchaseDate=null;const i=intent(r);i.values.notes='';i.values.department='OTHER';const f=freezePurchaseCommand(r,i);assert.equal(f.dto.header.purchaseDate,null);assert.equal(f.dto.header.notes,null);assert.equal(f.dto.header.purposeDescOrClient,'');});
register('all 500 rows retained; only explicit updates/removals become changes',()=>{const r=raw(500),i=intent(r);i.values.lines=i.values.lines.slice(1);const f=freezePurchaseCommand(r,i);assert.equal(f.desired.lines.length,499);assert.deepEqual(f.dto.lineChanges,[{kind:'Remove',lineId:'L000',clientLineKey:null,values:null}]);});
for(const field of ['branchId','purchaseDate','purposeId','currencyId','objectId'])register('locked field '+field,()=>{const r=raw(),i=intent(r);i.values[field]='different';assert.throws(()=>freezePurchaseCommand(r,i));});
register('no Create/Add, duplicate IDs or item substitution',()=>{for(const change of [i=>i.documentId=null,i=>i.values.lines.push({...i.values.lines[0],lineId:null,localKey:'NEW'}),i=>i.values.lines.push({...i.values.lines[0]}),i=>i.values.lines[0].itemId='OTHER']){const r=raw(),i=intent(r);change(i);assert.throws(()=>freezePurchaseCommand(r,i));}});
register('exact integer edits reject fractions, overflow and malformed nullable value',()=>{for(const value of ['1.5','9999999999999999999','1e9','']){const r=raw(),i=intent(r);i.values.lines[0].quantity=value;assert.throws(()=>freezePurchaseCommand(r,i));}const r=raw(),i=intent(r);i.values.lines[0].quantity='0002';assert.equal(freezePurchaseCommand(r,i).dto.lineChanges[0].values.quantity,'2');});
register('invalid Unicode is rejected before transport',()=>{const r=raw(),i=intent(r);i.values.notes='\ud800';assert.throws(()=>freezePurchaseCommand(r,i));});
register('dirty Submit never dispatches an implicit Save or Submit',async()=>{const r=raw(),i=intent(r,'submit');i.values.notes='dirty';let calls=0;const bridge=createPurchaseCommandAdapter(scope,r,async()=>{calls++});const result=await bridge.adapter.execute(i,signal());assert.equal(result.kind,'rejected');assert.equal(calls,0);assert.equal(bridge.hasPending(),false);});
register('separate Save -> confirmed new token -> intentional Submit, no fresh edit',async()=>{
 const r=raw(),save=intent(r),f=freezePurchaseCommand(r,save),calls=[];
 const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{calls.push({s,route,body});if(route==='save')return ack(f,2);const current=bridge.currentReadback(),sub=intent(current,'submit',JSON.parse(body).idempotencyKey);assert.equal(JSON.parse(body).expectedStateToken,token(2));return ack(freezePurchaseCommand(current,sub),3);});
 const saved=await bridge.adapter.execute(save,signal());assert.equal(saved.kind,'confirmed');assert.equal(bridge.needsFreshRead(),true);
 assert.equal((await bridge.adapter.execute(intent(bridge.currentReadback()),signal())).kind,'rejected');assert.equal(calls.length,1);
 const submitted=await bridge.adapter.execute(intent(bridge.currentReadback(),'submit'),signal());assert.equal(submitted.kind,'confirmed');assert.deepEqual(calls.map(c=>c.route),['save','submit']);assert.equal(submitted.snapshot.confirmation,'submitted');assert.deepEqual(Object.keys(JSON.parse(calls[1].body)),['idempotencyKey','branchId','purchaseRequestId','expectedStateToken']);
});
register('double tap sends exactly one command and keeps first intent',async()=>{const r=raw(),i=intent(r);let release,calls=0;const bridge=createPurchaseCommandAdapter(scope,r,async()=>{calls++;return new Promise(res=>release=res);});const first=bridge.adapter.execute(i,signal());assert.equal((await bridge.adapter.execute(i,signal())).kind,'unknown');assert.equal((await bridge.adapter.execute(intent(r),signal())).kind,'unknown');assert.equal(calls,1);release(ack(freezePurchaseCommand(r,i)));assert.equal((await first).kind,'confirmed');});
register('lost ACK: every non-Committed lookup keeps exact original JSON/key; final committed resolves',async()=>{
 const r=raw(),i=intent(r),f=freezePurchaseCommand(r,i),bodies=[];let outcome=1;
 const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{bodies.push({route,body});if(route==='save')throw Error('ACK lost');return outcome===0?ack(f):{scopeKey:scope,data:{outcome,receipt:null}};});
 assert.equal((await bridge.adapter.execute(i,signal())).kind,'unknown');assert.throws(()=>bridge.adoptReadback(raw()));
 for(outcome of [1,2,3,4,5,6,7,8,9,-1,'Committed',null]){assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'unknown');assert.equal(bridge.hasPending(),true);assert.equal(bridge.currentReadback().stateToken,token(1));}
 outcome=0;assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'confirmed');assert.equal(bridge.hasPending(),false);assert.ok(bodies.every(b=>b.body===f.json));assert.equal(bodies.filter(b=>b.route==='save').length,1);assert.ok(bodies.slice(1).every(b=>b.route==='save/lookup'));
});
register('command Replayed=1 is not lookup Pending=1',async()=>{const r=raw(),i=intent(r);const bridge=createPurchaseCommandAdapter(scope,r,async()=>ack(freezePurchaseCommand(r,i),2,1));assert.equal((await bridge.adapter.execute(i,signal())).kind,'confirmed');});
for(const mutate of [a=>a.scopeKey='b'.repeat(64),a=>a.data.receipt.idempotencyKey='other',a=>a.data.receipt.actionId='purchase-request.submit',a=>a.data.receipt.document.header.price='0.00',a=>a.data.receipt.document.lines.pop(),a=>a.data.receipt.allocatedLines.push({clientLineKey:'x',lineId:'x'}),a=>a.data.receipt.stateToken='not-a-token',a=>a.data.receipt.document.header.notes=null,a=>a.data.receipt.extra='x'])register('malformed/mismatched receipt retains unknown '+mutate.toString(),async()=>{const r=raw(),i=intent(r),answer=ack(freezePurchaseCommand(r,i));mutate(answer);const b=createPurchaseCommandAdapter(scope,r,async()=>answer);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);});
register('abort after dispatch ignores late response; reconciliation still uses original command',async()=>{const r=raw(),i=intent(r);let release;const b=createPurchaseCommandAdapter(scope,r,async(s,route)=>route==='save'?new Promise(res=>release=res):ack(freezePurchaseCommand(r,i)));const c=new AbortController(),p=b.adapter.execute(i,c.signal);c.abort();release(ack(freezePurchaseCommand(r,i)));assert.equal((await p).kind,'unknown');assert.equal(b.currentReadback().stateToken,token(1));assert.equal(b.hasPending(),true);assert.equal((await b.adapter.reconcile(i,signal())).kind,'confirmed');});
register('retired session ignores late receipt and prevents future transport',async()=>{const r=raw(),i=intent(r);let release,calls=0;const b=createPurchaseCommandAdapter(scope,r,async()=>{calls++;return new Promise(res=>release=res);});const p=b.adapter.execute(i,signal());b.retire();release(ack(freezePurchaseCommand(r,i)));assert.equal((await p).kind,'unknown');assert.equal((await b.adapter.reconcile(i,signal())).kind,'unknown');assert.equal(calls,1);});
register('confirmed receipt survives failed read adoption; fresh authorized read admits next edit',async()=>{const r=raw(),i=intent(r);const b=createPurchaseCommandAdapter(scope,r,async()=>ack(freezePurchaseCommand(r,i)));await b.adapter.execute(i,signal());const other=raw();other.document.purchaseRequestId='OTHER';assert.throws(()=>b.adoptReadback(other));assert.equal(b.currentReadback().stateToken,token(2));assert.equal(b.needsFreshRead(),true);b.adoptReadback(structuredClone(b.currentReadback()));assert.equal(b.needsFreshRead(),false);});
const ui='https://ui.medcom.test',backend='https://api.medcom.test';
function request(route='api/purchase-requests/save',body='{}',extra={}){const init={method:'POST',headers:{Origin:ui,'Content-Type':'application/json','X-Purchase-Scope':scope,'X-CSRF-TOKEN':'qa-csrf',Cookie:'__Host-Medcom.Session=qa; other=not-forwarded',...extra.headers},body,...extra};if(body instanceof ReadableStream)init.duplex='half';return new Request(ui+'/api/erp/'+route,init);}
function proxy(req,route='api/purchase-requests/save',fetcher=async()=>Response.json({ok:true})){return proxyErpRequest(req,route.split('/'),backend,ui,fetcher);}
for(const route of ['api/purchase-requests/save','api/purchase-requests/submit','api/purchase-requests/save/lookup','api/purchase-requests/submit/lookup'])register('fixed route and 1MiB boundary '+route,async()=>{assert.equal(policy.routeAllowed(route,'POST'),true);assert.equal(policy.routeAllowed(route,'GET'),false);assert.equal(policy.requestBodyLimit(route,'POST'),1048576);let calls=0;const fetcher=async()=>{calls++;return Response.json({})};const exact=JSON.stringify({x:'x'.repeat(1048576-8)});assert.equal(Buffer.byteLength(exact),1048576);assert.equal((await proxy(request(route,exact),route,fetcher)).status,200);assert.equal((await proxy(request(route,exact+' '),route,fetcher)).status,413);assert.equal(calls,1);});
register('auth remains 16KiB, GET catalogue unchanged, no generic or Create paths',async()=>{const route='api/auth/login';assert.equal(policy.requestBodyLimit(route,'POST'),16384);assert.equal((await proxy(request(route,'x'.repeat(16385)),route)).status,413);assert.equal(policy.routeAllowed('api/purchase-requests/lookup','GET'),true);for(const p of ['api/purchase-requests/create','api/purchase-requests/sql','api/purchase-requests/save/other'])assert.equal(policy.routeAllowed(p,'POST'),false);});
register('bounded chunked stream is cancelled above limit without upstream dispatch',async()=>{let cancelled=false,calls=0;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1048576));c.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});const r=await proxy(request(undefined,stream),undefined,async()=>{calls++;return Response.json({})});assert.equal(r.status,413);assert.equal(calls,0);assert.equal(cancelled,true);});
for(const body of [new Uint8Array([123,34,120,34,58,34,195,40,34,125]),'{',JSON.stringify(null),'[]',new Uint8Array([239,187,191,123,125])])register('malformed JSON/UTF8/BOM/root rejected '+JSON.stringify(body),async()=>{let calls=0;assert.equal((await proxy(request(undefined,body),undefined,async()=>{calls++;return Response.json({})})).status,400);assert.equal(calls,0);});
register('origin, scope, content-type, query, malformed length fail before upstream',async()=>{for(const [headers,status] of [[{Origin:'https://evil.test'},403],[{'X-Purchase-Scope':'bad'},409],[{'Content-Type':'application/jsonp'},415],[{'content-length':'NaN'},400],[{'content-length':'1048577'},413]]){let calls=0;const req=request();for(const [k,v] of Object.entries(headers))req.headers.set(k,v);assert.equal((await proxy(req,undefined,async()=>{calls++;return Response.json({})})).status,status);assert.equal(calls,0);}const req=request('api/purchase-requests/save?table=x');assert.equal((await proxy(req)).status,400);});
register('actual Node loopback HTTP + production BFF preserves bytes/cookie/CSRF/scope and no-store; NOT ASP.NET',async()=>{
 let received;const server=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);received={headers:req.headers,body:Buffer.concat(chunks).toString(),url:req.url};res.setHeader('Content-Type','application/json');res.end('{"outcome":0}');});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const r=raw(),i=intent(r),body=freezePurchaseCommand(r,i).json;const result=await proxy(request(undefined,body),undefined,async(url,init)=>{assert.equal(new URL(url).origin,backend);assert.equal(init.cache,'no-store');assert.equal(init.redirect,'manual');return fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,init);});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(received.body,body);assert.equal(received.headers.origin,backend);assert.equal(received.headers['x-csrf-token'],'qa-csrf');assert.equal(received.headers['x-purchase-scope'],scope);assert.equal(received.headers.cookie,'__Host-Medcom.Session=qa');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
register('upstream redirect is never followed',async()=>{const result=await proxy(request(),undefined,async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}));assert.equal(result.status,502);});

register('changed effect with unchanged token cannot confirm',async()=>{const r=raw(),i=intent(r),a=ack(freezePurchaseCommand(r,i),1);const b=createPurchaseCommandAdapter(scope,r,async()=>a);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);});
register('HTTP200 without valid bound receipt remains unknown',async()=>{const r=raw(),i=intent(r);for(const answer of [{ok:true},{scopeKey:scope,data:{outcome:0,receipt:null}},{scopeKey:scope,data:{outcome:'Committed',receipt:ack(freezePurchaseCommand(r,i)).data.receipt}}]){const b=createPurchaseCommandAdapter(scope,r,async()=>answer);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);}});
register('changed DTO cannot replace frozen original during reconciliation',async()=>{const r=raw(),i=intent(r);let calls=0;const b=createPurchaseCommandAdapter(scope,r,async()=>{calls++;throw Error('lost')});await b.adapter.execute(i,signal());const altered=structuredClone(i);altered.values.notes='replacement';assert.equal((await b.adapter.reconcile(altered,signal())).kind,'unknown');assert.equal(calls,1);assert.equal(b.hasPending(),true);});

register('a GET started before dispatch or ACK cannot overwrite the confirmed receipt',async()=>{
 const r=raw(),i=intent(r);let release;const b=createPurchaseCommandAdapter(scope,r,async()=>new Promise(resolve=>release=resolve));
 const beforeDispatch=b.readVersion(),sending=b.adapter.execute(i,signal()),beforeAck=b.readVersion();
 release(ack(freezePurchaseCommand(r,i)));assert.equal((await sending).kind,'confirmed');const confirmed=b.currentReadback();
 for(const epoch of [beforeDispatch,beforeAck])assert.throws(()=>b.adoptReadback(r,epoch));
 assert.deepEqual(b.currentReadback(),confirmed);assert.equal(b.needsFreshRead(),true);
 b.adoptReadback(confirmed,b.readVersion());assert.equal(b.needsFreshRead(),false);
});
 for(const [name,run] of cases)await t.test(name,run);
});

test('I20 React mobile intent lifecycle / production component and adapter with explicit transport double',async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('I20 browser tests require the pinned playwright-core toolchain; no skip or download.');}
 const fixture={document:document('QA-DOC','QA-A',2),stateToken:'prs1.'+'1'.repeat(64)};
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{MobileRequest}from'./components/erp/mobile-request';
 import{NavigationGuardProvider,useNavigationGuard}from'./components/erp/navigation-guard';
 import{commandPurchaseSnapshot,createPurchaseCommandAdapter}from'./lib/erp/purchase-request-command-adapter';
 const first=${JSON.stringify(fixture)},scope='a'.repeat(64);const clone=v=>structuredClone(v);
 const qa={calls:[],mode:'commit',outcome:1,release:null,receipt:null,persisted:clone(first.document),serial:1};window.qa=qa;
 async function transport(s,route,body,signal){
  qa.calls.push({scope:s,route,body});const dto=JSON.parse(body);
  if(route.endsWith('/lookup'))return{scopeKey:s,data:{outcome:qa.outcome,receipt:qa.outcome===0?clone(qa.receipt):null}};
  if(route==='save'){
   qa.persisted.header=clone(dto.header);
   for(const c of dto.lineChanges){if(c.kind==='Remove')qa.persisted.lines=qa.persisted.lines.filter(l=>l.lineId!==c.lineId);else if(c.kind==='Update'){const l=qa.persisted.lines.find(l=>l.lineId===c.lineId);if(!l)throw Error('missing');l.values=clone(c.values);}else throw Error('Add forbidden');}
  }else{qa.persisted.statusId=2;qa.persisted.isLocked=true;}
  qa.receipt={actionId:'purchase-request.'+(route==='save'?'save-draft':'submit'),idempotencyKey:dto.idempotencyKey,document:clone(qa.persisted),stateToken:'prs1.'+String(++qa.serial).repeat(64),allocatedLines:[]};
  if(qa.mode==='lost')throw Error('synthetic lost ACK');
  if(qa.mode==='hold')await new Promise(resolve=>{qa.release=resolve;});
  return{scopeKey:s,data:{outcome:0,receipt:clone(qa.receipt)}};
 }
 function Harness(){
  const[bridge,setBridge]=useState(()=>createPurchaseCommandAdapter(scope,first,transport));
  const[adapter,setAdapter]=useState(()=>bridge.adapter),[initial,setInitial]=useState(()=>commandPurchaseSnapshot(first)),[revision,setRevision]=useState(0),[visible,setVisible]=useState(true),[receipt,setReceipt]=useState(''),[error,setError]=useState('');
  const[access,setAccess]=useState({scopeKey:scope,canRead:true,canEdit:true,canSaveDraft:true,canSubmit:true,canReconcile:true,available:true,existingOnly:true,canAddLines:false,authorityKey:'one',requiresFreshRead:false,branches:[],currencies:[],purposes:[],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:'items',objectLookupId:'objects'});
  const{request}=useNavigationGuard();
  qa.raw=()=>bridge.currentReadback();qa.pending=()=>bridge.hasPending();
  qa.refreshFailure=()=>{setError('Synthetic refresh failed');setAccess(a=>({...a,requiresFreshRead:true}));};
  qa.readAgain=()=>{bridge.adoptReadback(clone(bridge.currentReadback()));setInitial(commandPurchaseSnapshot(bridge.currentReadback()));setRevision(n=>n+1);setAccess(a=>({...a,requiresFreshRead:false}));setError('');};
  qa.revoke=()=>setAccess(a=>({...a,canRead:false,canSaveDraft:false,canSubmit:false,canReconcile:false,authorityKey:'two'}));
  qa.restore=()=>setAccess(a=>({...a,canRead:true,canSaveDraft:true,canSubmit:true,canReconcile:true,authorityKey:'three'}));
  qa.swapAdapter=()=>setAdapter({...bridge.adapter});
  qa.selectOther=()=>{const d=clone(first);d.document.purchaseRequestId='QA-OTHER';d.document.header.notes='OTHER DOCUMENT';setInitial(commandPurchaseSnapshot(d));};
  qa.newSession=()=>{bridge.retire();const d=clone(first);d.document.header.notes='NEW ACCOUNT';const next=createPurchaseCommandAdapter('b'.repeat(64),d,transport);setBridge(next);setAdapter(next.adapter);setInitial(commandPurchaseSnapshot(d));setAccess(a=>({...a,scopeKey:'b'.repeat(64),authorityKey:'new-session'}));};
  return <><button onClick={()=>request(()=>setVisible(false))}>Rời phiếu thử nghiệm</button>{error&&<p role='alert'>{error}</p>}<p data-testid='receipt'>{receipt}</p>{visible&&<MobileRequest initial={initial} access={access} adapter={adapter} readRevision={revision} onConfirmed={(snap,id)=>{setReceipt(id);setInitial(old=>old.documentId===snap.documentId?snap:old);setAccess(a=>({...a,requiresFreshRead:true}));}}/>}</>;
 }createRoot(document.getElementById('root')).render(<NavigationGuardProvider><Harness/></NavigationGuardProvider>);`;
 await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'i20-mobile-browser.js'),bundle:true,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning'});
 const bundle=await readFile(path.join(output,'i20-mobile-browser.js'));
 const server=createServer((request,response)=>{if(request.url==='/browser.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/browser.js"></script></html>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');let browser,context,page;const errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  const origin=`http://localhost:${server.address().port}`;await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  async function reset(){await page.goto(origin);await page.getByRole('form',{name:'Đề nghị mua hàng trên điện thoại'}).waitFor();}
  async function edited(mode='commit'){await reset();await page.evaluate(m=>window.qa.mode=m,mode);await page.getByLabel('Ghi chú',{exact:true}).fill('MOBILE EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();}
  async function save(){await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();}
  await t.test('dirty Submit disabled, separate Save then Submit uses receipt token and no Add',async()=>{
   await edited();assert.ok(await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).isDisabled());await save();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await page.getByText('ERP đã xác nhận gửi phiếu',{exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.qa.calls);assert.deepEqual(calls.map(c=>c.route),['save','submit']);assert.equal(JSON.parse(calls[1].body).expectedStateToken,'prs1.'+'2'.repeat(64));assert.equal(JSON.parse(calls[0].body).header.purchaseDate,fixture.document.header.purchaseDate);
  });
  await t.test('double tap and navigation guard keep one unresolved request',async()=>{
   await edited('hold');await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).evaluate(el=>{el.click();el.click();});await page.waitForFunction(()=>window.qa.calls.length===1);
   await page.getByRole('button',{name:'Rời phiếu thử nghiệm',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
   await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.evaluate(()=>window.qa.release());await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
  });
  await t.test('lost ACK and all eight negative lookup outcomes preserve exact body, only Committed clears',async()=>{
   await edited('lost');await save();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();
   for(const n of [1,2,3,4,5,6,7,8]){await page.evaluate(value=>window.qa.outcome=value,n);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qa.pending()),true);}
   await page.evaluate(()=>window.qa.outcome=0);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.qa.calls);assert.equal(calls.filter(c=>c.route==='save').length,1);assert.ok(calls.every(c=>c.body===calls[0].body));assert.equal(await page.evaluate(()=>window.qa.pending()),false);
  });
  await t.test('confirmed receipt remains after refresh error; edits require successful fresh read',async()=>{
   await edited();await save();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();const id=await page.getByTestId('receipt').innerText();await page.evaluate(()=>window.qa.refreshFailure());await page.getByText('Synthetic refresh failed',{exact:true}).waitFor();assert.equal(await page.getByTestId('receipt').innerText(),id);
   assert.ok(await page.getByRole('button',{name:'Quay lại chỉnh sửa',exact:true}).isDisabled());await page.evaluate(()=>window.qa.readAgain());await page.getByLabel('Ghi chú',{exact:true}).waitFor();assert.equal(await page.getByLabel('Ghi chú',{exact:true}).inputValue(),'MOBILE EDIT');assert.ok(await page.getByLabel('Ghi chú',{exact:true}).isEnabled());
   assert.ok(await page.getByRole('button',{name:'Thêm dòng hàng',exact:true}).isDisabled());assert.ok(await page.getByLabel('Ngày đề nghị',{exact:true}).isDisabled());assert.equal(await page.getByRole('combobox',{name:'Chi nhánh'}).count(),0);
  });
  await t.test('authority revocation discards late ACK but retains original for authorized lookup',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.revoke());await page.getByText('Đăng nhập bằng tài khoản được cấp quyền để mở phiếu.',{exact:true}).waitFor();await page.evaluate(()=>window.qa.release());assert.equal(await page.evaluate(()=>window.qa.raw().stateToken),'prs1.'+'1'.repeat(64));await page.evaluate(()=>{window.qa.restore();window.qa.outcome=0;});await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
  });
  await t.test('adapter replacement cannot adopt old ACK or resend through a replacement adapter',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.swapAdapter());await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();await page.evaluate(()=>window.qa.release());assert.ok(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).isDisabled());assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
  });
  await t.test('external document switch queues selection without moving old receipt to the new document',async()=>{
   await edited('lost');await save();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();await page.evaluate(()=>window.qa.selectOther());await page.getByRole('region',{name:'Chờ xác nhận phiếu trước',exact:true}).waitFor();await page.evaluate(()=>window.qa.outcome=0);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('QA-OTHER',{exact:true}).waitFor();assert.equal(await page.getByLabel('Ghi chú',{exact:true}).inputValue(),'OTHER DOCUMENT');
  });
  await t.test('true session boundary retires old in-flight receipt',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.newSession());await page.getByLabel('Ghi chú',{exact:true}).waitFor();assert.equal(await page.getByLabel('Ghi chú',{exact:true}).inputValue(),'NEW ACCOUNT');await page.evaluate(()=>window.qa.release());assert.equal(await page.getByLabel('Ghi chú',{exact:true}).inputValue(),'NEW ACCOUNT');assert.equal(await page.getByTestId('receipt').innerText(),'');
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'i20-react-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],transport:'explicit Node-free browser double; NOT ASP.NET/SQL',errors},null,2));
 }finally{await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

// I20 custody regression: mount the REAL Workspace (not just MobileRequest or a
// test-owned workspace prop). Its background getWorkspace failure must actually
// set workspace=null. HTTP responses are synthetic; this is not ASP.NET/SQL.
test('I20 Workspace custody across unverified authority / actual React mobile hierarchy', {timeout:180000}, async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('Required installed playwright-core unavailable for Workspace custody regression; NOT_RUN, no skip.');}
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';
 // Deliberately let an old HTTP save response finish even after the application's
 // AbortSignal fires. The production adapter/editor must reject that late ACK.
 // Lost ACK is an explicit transport seam: consume the entire synthetic HTTP
 // response, then discard it. Do not destroy a pre-header socket and invite an
 // unobserved browser HTTP retry. This does not simulate a SQL engine failure.
 const nativeFetch=window.fetch.bind(window);window.custodyIO={aborted:0,replies:0,rejected:0,discarded:0,executes:[],fetches:[]};
 window.fetch=(input,init)=>{
  const path=String(input).split('?')[0];
  if(path.startsWith('/api/erp/api/purchase-requests/')&&init?.method==='POST')window.custodyIO.fetches.push({path,body:init.body,idempotencyKey:JSON.parse(init.body).idempotencyKey});
  if(path==='/api/erp/api/purchase-requests/save'&&init?.method==='POST'){
   const {signal,...rest}=init;signal?.addEventListener('abort',()=>window.custodyIO.aborted++);
   return nativeFetch(input,rest).then(async response=>{
    window.custodyIO.replies++;
    if(response.headers.get('X-Synthetic-Lost-Ack')==='discard-completed-response'){await response.arrayBuffer();window.custodyIO.discarded++;throw Error('Synthetic seam discarded a completed save response');}
    return response;
   },error=>{window.custodyIO.rejected++;throw error;});
  }
  return nativeFetch(input,init);
 };
 createRoot(document.getElementById('root')).render(<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',
  plugins:[{name:'custody-command-execute-observer',setup(build){
   // Wrap only the exported entry point; the original adapter still runs unchanged.
   build.onResolve({filter:/purchase-request-command-adapter$/},()=>({path:'command-observer',namespace:'custody-command-observer'}));
   build.onLoad({filter:/.*/,namespace:'custody-command-observer'},()=>({contents:`
    export * from ${JSON.stringify(path.join(app,'lib/erp/purchase-request-command-adapter.ts'))};
    import {createPurchaseCommandAdapter as create} from ${JSON.stringify(path.join(app,'lib/erp/purchase-request-command-adapter.ts'))};
    export function createPurchaseCommandAdapter(...args){const bridge=create(...args),execute=bridge.adapter.execute;
     bridge.adapter.execute=(intent,signal)=>{window.custodyIO.executes.push({intentId:intent.intentId,action:intent.action});return execute(intent,signal);};return bridge;}
   `,resolveDir:app,loader:'js'}));
  }},{name:'custody-next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'custody-image'}));build.onLoad({filter:/.*/,namespace:'custody-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return React.createElement('img',{src,alt,width,height});}",resolveDir:app,loader:'jsx'}));}}]});
 const bundle=built.outputFiles[0].contents;
 const lifetime={idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()};
 const access={canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'synthetic_only_NOT_runtime_qualified'};
 const calls=[],errors=[],dispatchEvidence=new Map();let state;
 function reset(mode){
  state={failure:null,readerFailure:null,scope,displayName:'SYNTHETIC CUSTODY ACCOUNT A',lifetime:{...lifetime},canRead:true,
   saveMode:mode,record:document('QA-CUSTODY','QA-A',2),stateToken:'prs1.'+'1'.repeat(64),originalBody:null,receipt:null,
   releaseSave:null,holdScope:false,scopeStarted:null,releaseScope:null,holdWorkspace:false,releaseWorkspace:null,effects:0};calls.length=0;
 }
 function workspace(){return{session:{displayName:state.displayName,tenantId:'qa-tenant',companyId:'qa-company',companyName:'SYNTHETIC COMPANY',authorityVersion:1,...state.lifetime,capabilities:state.canRead?['purchase-requests.read']:[]},
  navigation:state.canRead?[{id:'purchase-requests',label:'Đề nghị mua hàng',href:'/workspace/?screen=purchase-requests'}]:[],branchIds:['QA-A']};}
 const json=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
 const server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost'),route=url.pathname;
   if(route==='/custody.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}
   if(!route.startsWith('/api/erp/')){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}button{min-height:44px}input,textarea,select{max-width:100%}[role=alertdialog]{position:fixed;inset:5%;z-index:99;background:white;padding:20px}</style><div id="root"></div><script src="/custody.js"></script></html>');}
   const p=route.slice('/api/erp'.length),parts=[];for await(const part of request)parts.push(part);const body=Buffer.concat(parts).toString('utf8');
   calls.push({path:p,method:request.method,body,scope:request.headers['x-purchase-scope']??null,idempotencyKey:p.startsWith('/api/purchase-requests/')&&body?JSON.parse(body).idempotencyKey??null:null});
   if(p==='/health/ready')return json(response,503,{status:'unavailable',checks:[{component:'business_release',status:'not_configured'}]});
   if(p==='/health/live')return json(response,200,{status:'healthy'});
   if(p==='/api/auth/csrf')return json(response,200,{token:'synthetic-custody-csrf'});
   if(p==='/api/auth/login'){assert.equal(request.method,'POST');return json(response,200,workspace().session);}
   if(p==='/api/workspace'){
    if(state.holdWorkspace)await new Promise(resolve=>{state.releaseWorkspace=resolve;});
    if(state.failure==='network'){response.destroy();return;}
    if(state.failure===503||state.failure===401)return json(response,state.failure,{code:state.failure===401?'authentication_required':'identity_unavailable'});
    return json(response,200,workspace());
   }
   if(state.failure===401)return json(response,401,{code:'authentication_required'});
   const scoped=data=>({scopeKey:state.scope,data});
   if(p==='/api/purchase-requests/workspace'){
    if(state.readerFailure===401)return json(response,401,{code:'authentication_required'});
    if(state.holdScope){state.scopeStarted?.();await new Promise(resolve=>{state.releaseScope=resolve;});}
    return json(response,200,scoped({branchIds:['QA-A'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}));
   }
   if(p==='/api/purchase-requests'){
    const d=state.record;return json(response,200,scoped({rows:[{documentId:d.purchaseRequestId,purchaseDate:d.header.purchaseDate,branchId:d.branchId,personSuggest:d.header.personSuggest,department:d.header.department,statusId:d.statusId,isLocked:d.isLocked}],page:Number(url.searchParams.get('page')||1),pageSize:20,hasMore:false}));
   }
   if(p==='/api/purchase-requests/detail')return json(response,200,scoped({document:state.record,stateToken:state.stateToken,commandAccess:access}));
   if(p==='/api/purchase-requests/save'){
    assert.equal(request.method,'POST');assert.equal(request.headers['x-csrf-token'],'synthetic-custody-csrf');assert.equal(request.headers['x-purchase-scope'],state.scope);
    assert.equal(state.originalBody,null,'writer must be called at most once in this scenario');state.originalBody=body;
    const dto=JSON.parse(body),desired=structuredClone(state.record);desired.header=structuredClone(dto.header);
    for(const change of dto.lineChanges){assert.notEqual(change.kind,'Add');if(change.kind==='Remove')desired.lines=desired.lines.filter(line=>line.lineId!==change.lineId);else{const line=desired.lines.find(line=>line.lineId===change.lineId);assert.ok(line);line.values=structuredClone(change.values);}}
    state.effects++;state.record=desired;state.stateToken='prs1.'+'2'.repeat(64);state.receipt={actionId:'purchase-request.save-draft',idempotencyKey:dto.idempotencyKey,document:structuredClone(desired),stateToken:state.stateToken,allocatedLines:[]};
    const answer=scoped({outcome:0,receipt:structuredClone(state.receipt)});
    if(state.saveMode==='lost'){response.setHeader('X-Synthetic-Lost-Ack','discard-completed-response');return json(response,200,answer);}
    await new Promise(resolve=>{state.releaseSave=resolve;});return json(response,200,answer);
   }
   if(p==='/api/purchase-requests/save/lookup'){
    assert.equal(request.method,'POST');assert.equal(request.headers['x-purchase-scope'],state.scope);
    assert.equal(body,state.originalBody,'lookup must use the EXACT original JSON, including key and pre-save token');
    return json(response,200,scoped({outcome:0,receipt:state.receipt}));
   }
   return json(response,404,{code:'endpoint_unavailable'});
  }catch(error){errors.push(String(error));if(!response.headersSent)json(response,500,{code:'synthetic_fixture_failure'});else response.destroy();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://localhost:${server.address().port}`;let browser,context,page;
 const writers=()=>calls.filter(call=>['/api/purchase-requests/save','/api/purchase-requests/submit'].includes(call.path));
 const lookups=()=>calls.filter(call=>call.path==='/api/purchase-requests/save/lookup');
 async function assertSingleWriter(){
  const io=await page.evaluate(()=>window.custodyIO),http=writers(),fetches=io.fetches.filter(call=>['/api/erp/api/purchase-requests/save','/api/erp/api/purchase-requests/submit'].includes(call.path));
  const diagnostics=JSON.stringify({executes:io.executes,fetches,http,effects:state.effects});
  assert.equal(io.executes.length,1,diagnostics);assert.equal(fetches.length,1,diagnostics);assert.equal(http.length,1,diagnostics);assert.equal(state.effects,1,diagnostics);
  const key=JSON.parse(state.originalBody).idempotencyKey;
  assert.deepEqual(io.executes,[{intentId:key,action:'saveDraft'}]);assert.equal(fetches[0].body,state.originalBody);assert.equal(fetches[0].idempotencyKey,key);assert.equal(http[0].body,state.originalBody);assert.equal(http[0].idempotencyKey,key);
  const clientLookups=io.fetches.filter(call=>call.path.endsWith('/save/lookup'));
  assert.equal(clientLookups.length,lookups().length,diagnostics);
  for(const call of [...clientLookups,...lookups()]){assert.equal(call.body,state.originalBody);assert.equal(call.idempotencyKey,key);}
  if(state.saveMode==='lost'){assert.equal(io.discarded,1);assert.equal(io.rejected,0);}
  dispatchEvidence.set(key,{transport:'completed-response discard / abort-ignoring save seams; synthetic HTTP only',executes:io.executes,fetches:io.fetches,http:[...http,...lookups()],effects:state.effects,discarded:io.discarded});
 }
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 let screen;
 async function begin(mode,{expiry}={}){
  state?.releaseSave?.();state?.releaseScope?.();state?.releaseWorkspace?.();await context?.close();reset(mode);
  const now=Date.now();if(expiry){const soon=new Date(now+30000).toISOString(),far=new Date(now+300000).toISOString();state.lifetime={idleExpiresAt:expiry==='idle'?soon:far,absoluteExpiresAt:expiry==='absolute'?soon:far};}
  context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  if(expiry)await page.clock.install({time:new Date(now)});
  await page.goto(origin+'/?screen=purchase-requests');screen=page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true});
  // Let both the initial and the real Workspace background authority read settle.
  await screen.getByRole('button',{name:'Mở đề nghị QA-CUSTODY',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill('FILTER-CUSTODY');await screen.getByRole('button',{name:'Mở đề nghị QA-CUSTODY',exact:true}).click();
  await screen.getByLabel('Ghi chú',{exact:true}).fill('SYNTHETIC ORIGINAL INTENT — giữ NULL/time/18 digits');
  await screen.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/purchase-requests/save');
  await screen.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).evaluate(button=>{button.click();button.click();});await sent;
  if(mode==='lost')await screen.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();
  else await screen.getByText('Đang gửi yêu cầu…',{exact:true}).waitFor();
  // Request arrival precedes the synthetic handler's body read by a microtask.
  const deadline=Date.now()+5000;while(!state.originalBody){assert.ok(Date.now()<deadline,'synthetic writer did not receive original DTO');await new Promise(resolve=>setTimeout(resolve,1));}
  await assertSingleWriter();return {body:state.originalBody,dto:JSON.parse(state.originalBody)};
 }
 async function continueGuard(){
  const guard=page.getByRole('alertdialog');await guard.waitFor({state:'visible'});
  assert.equal(await guard.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
  await guard.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await guard.waitFor({state:'hidden'});
 }
 async function suspend(failure){
  state.failure=failure;
  const failed=failure==='network'?page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname==='/api/erp/api/workspace'):
   page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===503);
  // Do not inject PurchaseRequestScreen props: invoke Workspace's real focus listener.
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await failed;
  // The modal makes the background aria-inaccessible. Verify the nondiscardable
  // guard and dismiss via Continue before querying the real recovery region.
  await continueGuard();
  await page.getByRole('region',{name:'Xác minh lại phiên mua hàng',exact:true}).waitFor();await paint();
  assert.equal(await screen.locator('input,textarea,select,table').count(),0);
  assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|SYNTHETIC REQUESTER|QA-L001/);
  assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
 }
 async function recoverSame(){
  state.failure=null;state.holdScope=true;state.releaseScope=null;
  const started=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/purchase-requests/workspace');
  await page.getByRole('button',{name:'Xác minh lại phiên ERP',exact:true}).click();await started;
  const deadline=Date.now()+5000;while(!state.releaseScope){assert.ok(Date.now()<deadline,'synthetic scope verification did not start');await new Promise(resolve=>setTimeout(resolve,1));}await paint();
  assert.equal(await screen.locator('input,textarea,select,table').count(),0,'a workspace 200 alone must NOT expose the old scope');
  assert.equal(lookups().length,0);await assertSingleWriter();
  state.holdScope=false;state.releaseScope();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).waitFor();
  assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'FILTER-CUSTODY','same-session parent recovery preserves local filter only after scope revalidation');
  assert.equal(await screen.getByText(/^ERP đã xác nhận yêu cầu /).count(),0,'late ACK must not resolve retained unknown');
 }
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-component-update','--disable-default-apps','--no-default-browser-check']});
  for(const mode of ['lost','hold'])for(const failure of ['network',503])await t.test(`Save ${mode} → background ${failure} → same session → exact original lookup`,async()=>{
   const original=await begin(mode);await suspend(failure);
   if(mode==='hold'){state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();assert.ok(await page.evaluate(()=>window.custodyIO.aborted>=1));}
   assert.equal(lookups().length,0);await assertSingleWriter();
   await recoverSame();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();
   await screen.getByText(`ERP đã xác nhận yêu cầu ${original.dto.idempotencyKey}. Receipt vẫn được giữ khi đọc lại thất bại.`,{exact:true}).waitFor();
   assert.equal(lookups().length,1);assert.equal(lookups()[0].body,original.body);assert.deepEqual(JSON.parse(lookups()[0].body),original.dto);
   assert.equal(JSON.parse(lookups()[0].body).expectedStateToken,'prs1.'+'1'.repeat(64),'do not rebuild from fresh detail token 2');await assertSingleWriter();
  });
  await t.test('repeated failed verification preserves custody; recovery still uses the original writer body',async()=>{
   const original=await begin('lost');await suspend('network');state.failure=503;
   const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===503);
   await page.getByRole('button',{name:'Xác minh lại phiên ERP',exact:true}).click();await response;await continueGuard();await paint();
   assert.equal(await screen.locator('input,textarea,select,table').count(),0);await assertSingleWriter();assert.equal(lookups().length,0);
   await recoverSame();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await screen.getByText(/^ERP đã xác nhận yêu cầu /).waitFor();assert.equal(lookups()[0].body,original.body);await assertSingleWriter();
  });
  for(const change of ['session-tuple','opaque-scope'])await t.test(`verified ${change} after null retires prior data and delayed ACK`,async()=>{
   await begin('hold');await suspend(503);state.failure=null;state.scope='b'.repeat(64);state.displayName='SYNTHETIC ACCOUNT B';
   if(change==='session-tuple')state.lifetime.absoluteExpiresAt=new Date(Date.now()+14400000).toISOString();
   state.record=document('QA-NEW-ACCOUNT','QA-A',1);state.record.header.personSuggest='SYNTHETIC NEW ACCOUNT ONLY';state.stateToken='prs1.'+'3'.repeat(64);
   await page.getByRole('button',{name:'Xác minh lại phiên ERP',exact:true}).click();await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-ACCOUNT',exact:true}).waitFor();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await screen.getByText(/^ERP đã xác nhận yêu cầu /).count(),0);
   assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|SYNTHETIC REQUESTER|QA-CUSTODY/);await assertSingleWriter();assert.equal(lookups().length,0);
   await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-ACCOUNT',exact:true}).click();await screen.getByLabel('Ghi chú',{exact:true}).waitFor();assert.equal(await screen.getByLabel('Ghi chú',{exact:true}).inputValue(),'');
  });
  await t.test('confirmed server logout (401), unlike 503, retires original intent before a delayed ACK',async()=>{
   await begin('hold');await suspend(503);state.failure=401;
   const ended=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===401);
   await page.getByRole('button',{name:'Xác minh lại phiên ERP',exact:true}).click();await ended;await paint();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   assert.equal(await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|QA-CUSTODY/);
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  await t.test('same-session recovery restores parent polling; focus refresh re-verifies current read authority before lookup',async()=>{
   const original=await begin('lost');await suspend(503);await recoverSame();
   state.canRead=false;
   const deniedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await deniedRefresh;await continueGuard();
   await screen.getByText('Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.',{exact:true}).waitFor();
   await paint();assert.equal(await screen.locator('input,textarea,select,table').count(),0);assert.equal(lookups().length,0);await assertSingleWriter();
   state.canRead=true;
   const allowedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await allowedRefresh;
   await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).waitFor();
   await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await screen.getByText(/^ERP đã xác nhận yêu cầu /).waitFor();
   assert.equal(lookups().length,1);assert.equal(lookups()[0].body,original.body);assert.deepEqual(JSON.parse(lookups()[0].body),original.dto);await assertSingleWriter();
  });
  for(const expiry of ['idle','absolute'])await t.test(`${expiry} expiry after same-session recovery retires custody and rejects a delayed ACK`,async()=>{
   await begin('hold',{expiry});const originalLifetime={...state.lifetime};await suspend(503);await recoverSame();
   assert.deepEqual(state.lifetime,originalLifetime,'the original idle/absolute tuple must remain unchanged through recovery');
   await page.clock.fastForward(30000);
   await page.getByText('Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.',{exact:true}).waitFor({timeout:5000});await paint();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);assert.equal(await page.getByText('QA-CUSTODY',{exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  await t.test('completed login survives the previous deadline while the new Workspace read is delayed',async()=>{
   await begin('hold',{expiry:'idle'});const previousLimit=Date.parse(state.lifetime.idleExpiresAt);await suspend(503);
   state.failure=null;state.holdWorkspace=true;state.scope='b'.repeat(64);state.displayName='SYNTHETIC NEW LOGIN';
   state.lifetime={idleExpiresAt:new Date(previousLimit+300000).toISOString(),absoluteExpiresAt:new Date(previousLimit+600000).toISOString()};
   state.record=document('QA-NEW-LOGIN','QA-A',1);state.stateToken='prs1.'+'3'.repeat(64);
   await page.locator('.connection-banner').getByRole('button',{name:'Đăng nhập ERP',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Đăng nhập ERP',exact:true});await dialog.getByLabel('Tên đăng nhập',{exact:true}).fill('synthetic-login');await dialog.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');
   const started=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/workspace');
   await dialog.getByRole('button',{name:'Đăng nhập',exact:true}).click();await started;await dialog.waitFor({state:'hidden'});
   const deadline=Date.now()+5000;while(!state.releaseWorkspace){assert.ok(Date.now()<deadline,'new login Workspace read did not start');await new Promise(resolve=>setTimeout(resolve,1));}
   await page.clock.fastForward(30000);await paint();
   assert.equal(await page.getByText('Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.',{exact:true}).count(),0,'old deadline must not expire a completed login');
   assert.equal(await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-LOGIN',exact:true}).count(),0,'new authority still waits for the held read');
   state.holdWorkspace=false;state.releaseWorkspace();await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-LOGIN',exact:true}).waitFor();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByText('Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.',{exact:true}).count(),0);
   assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'');assert.equal(await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);
   assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|QA-CUSTODY/);assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  await t.test('reader 401 after parent recovery ends the session, clears filter/selection and fences the delayed ACK',async()=>{
   await begin('hold');await suspend(503);await recoverSame();state.readerFailure=401;
   const reader401=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/purchase-requests/workspace'&&response.status()===401);
   const parentRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await parentRefresh;await reader401;await paint();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);assert.equal(await page.getByText('QA-CUSTODY',{exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'i20-workspace-custody-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],hierarchy:'actual Workspace → PurchaseRequestScreen → MobileRequest → command adapter',transport:'synthetic HTTP API; completed-response discard and save-only abort-ignoring seams; NOT ASP.NET/SQL',dispatchEvidence:[...dispatchEvidence.values()],errors},null,2));
 }catch(error){await writeFile(path.join(output,'i20-workspace-custody-failure.json'),JSON.stringify({error:String(error),errors,calls,io:await page?.evaluate(()=>window.custodyIO).catch(()=>null),body:await page?.locator('body').innerText().catch(()=>''),dispatchEvidence:[...dispatchEvidence.values()]},null,2));throw error;}
 finally{state?.releaseSave?.();state?.releaseScope?.();state?.releaseWorkspace?.();await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
