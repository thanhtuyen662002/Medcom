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
 function App(){const[controlled,setControlled]=useState(false),[authority,setAuthority]=useState(null),[boundary,setBoundary]=useState(0);window.qa={controlled:async()=>{setAuthority(await getWorkspace());setControlled(true);},authority:async(retire=false)=>{const next=await getWorkspace();setAuthority(next);if(retire)setBoundary(value=>value+1);}};
 return controlled?<NavigationGuardProvider><PurchaseRequestScreen workspace={authority} loginBoundary={boundary} onDenied={error=>{if(error.status===401)setAuthority(null);}} onLogin={()=>{}}/></NavigationGuardProvider>:<Workspace/>;}createRoot(document.getElementById('root')).render(<App/>);`;
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
   const before=calls.filter(call=>call.path.endsWith('/detail')).length;await screen.getByRole('button',{name:'Làm mới',exact:true}).click();await detail.waitFor();assert.ok(calls.filter(call=>call.path.endsWith('/detail')).length>before);
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
