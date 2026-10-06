// Actual composed Workspace + production API client in an installed browser.
// The HTTP backend and session cookies are synthetic. This is not ASP.NET/SQL
// acceptance. Deterministic visibility events supplement real tab activation
// because headless Chromium does not consistently occlude background targets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','i29-workspace-retention');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('I29 actual Workspace retains same-session read controls and fences retired data',{timeout:240000},async t=>{
 const require=createRequire(import.meta.url);let build,chromium,postcss,tailwind;
 try{
  ({build}=require('esbuild'));postcss=require('postcss');tailwind=require('@tailwindcss/postcss');
  const tools=process.env.MEDCOM_BROWSER_TOOLCHAIN;
  ({chromium}=(tools?createRequire(path.join(path.resolve(tools),'package.json')):require)('playwright-core'));
 }catch{throw Error('I29 browser NOT_RUN: existing locked esbuild/React/Tailwind/browser toolchain required; no install or skip.');}
 const executable=process.env.MEDCOM_EDGE_PATH??process.env.I29_TEST_BROWSER??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'Existing installed Chromium/Edge is required.');
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';
 window.i29={ignoreAbort:false,aborted:0,completed:0};window.i29Visibility='visible';
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.i29Visibility});
 const native=window.fetch.bind(window);window.fetch=(input,init)=>{
  if(window.i29.ignoreAbort&&String(input).startsWith('/api/erp/api/')){
   const{signal,...rest}=init??{};signal?.addEventListener('abort',()=>window.i29.aborted++);
   return native(input,rest).then(response=>{window.i29.completed++;return response;});
  }return native(input,init);
 };createRoot(document.getElementById('root')).render(<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'i29-image'}));build.onLoad({filter:/.*/,namespace:'i29-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const css=(await postcss([tailwind({base:app})]).process(await readFile(path.join(app,'app/globals.css'),'utf8'),{from:path.join(app,'app/globals.css')})).css;
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
 let serial=0,models,origin,browser,context,page;const calls=[],errors=[],results=[],failures=[],held=new Set(),waiters=new Map();
 function reset(){held.clear();for(const queue of waiters.values())queue.splice(0).forEach(done=>done());waiters.clear();calls.length=0;serial++;
  models=Object.fromEntries(['A','B'].map(id=>[id,{id,sessionScope:digest(['synthetic session',serial,id]),version:1,branches:['BR-A','BR-B'],capabilities:['purchase-orders.read','inbound-requests.read'],failure:{},missing:false,wrong:false,removed:false,lifetime:{idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()}}]));
 }
 const scope=model=>({sessionScope:model.sessionScope,readScope:digest([model.sessionScope,[...model.branches].sort(),[...model.capabilities].sort()])});
 const workspace=model=>({session:{displayName:'SAME SYNTHETIC NAME',tenantId:'T',companyId:'C',companyName:'Synthetic',authorityVersion:model.version,...model.lifetime,capabilities:model.capabilities},branchIds:model.branches,navigation:model.capabilities.map(cap=>({id:cap.replace('.read',''),label:cap,href:'/?screen='+cap.replace('.read','')}))});
 const rows=(model,p)=>Array.from({length:20},(_,i)=>({documentId:`${model.id}-P${p}-${String(i).padStart(2,'0')}`,documentDate:'2026-10-06',branchId:model.branches[0]??'BR-A',statusId:1,isLocked:false})).filter(row=>!model.removed||!row.documentId.endsWith('-00'));
 async function wait(kind){if(held.has(kind))await new Promise(resolve=>{const queue=waiters.get(kind)??[];queue.push(resolve);waiters.set(kind,queue);});}
 function release(kind){held.delete(kind);(waiters.get(kind)??[]).splice(0).forEach(done=>done());}
 function send(res,status,data,headers={}){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(status===204?undefined:JSON.stringify(data));}
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin??'http://localhost');
   if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].contents);}
   if(url.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
   if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
   const route=url.pathname.slice('/api/erp'.length),id=/I29Session=([AB])/.exec(req.headers.cookie??'')?.[1],model=models[id];
   calls.push({route,query:Object.fromEntries(url.searchParams),session:id,method:req.method});
   if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
   if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-csrf'});
   if(route==='/api/auth/login'){const data=[];for await(const part of req)data.push(part);const selected=JSON.parse(Buffer.concat(data)).username==='B'?'B':'A';models[selected].sessionScope=digest(['new synthetic login',++serial,selected]);return send(res,200,workspace(models[selected]).session,{'Set-Cookie':`I29Session=${selected}; Path=/; HttpOnly; SameSite=Lax`});}
   if(!model)return send(res,401,{code:'authentication_required'});
   if(route==='/api/auth/logout')return send(res,204,null,{'Set-Cookie':'I29Session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax'});
   if(route==='/api/auth/session/continue')return send(res,200,workspace(model).session);
   const kind=route==='/api/workspace'?'workspace':route.endsWith('/detail')?'detail':route.startsWith('/api/documents/')?'list':null;
   if(!kind)return send(res,404,{code:'unavailable'});
   const p=Number(url.searchParams.get('page')??1),captured=scope(model),status=model.failure[kind]??200;
   const headers=model.missing?{}:{'X-Medcom-Session-Scope':model.wrong&&kind!=='workspace'?'f'.repeat(64):captured.sessionScope,'X-Medcom-Read-Scope':captured.readScope};
   const data=kind==='workspace'?workspace(model):kind==='list'?{rows:rows(model,p),page:p,pageSize:50,hasMore:p<3}:{document:{...rows(model,2)[0],documentId:url.searchParams.get('documentId')},purchaseOrderLines:Array.from({length:60},(_,i)=>({lineId:String(i),itemId:`${model.id}-ITEM-P${p}-${i}`,quantity:'1.0000',quantity2:null})),inboundRequestLines:[],page:p,pageSize:100,hasMore:p<3};
   await wait(kind);return send(res,status,status===200?data:{code:'synthetic_failure'},status===200?headers:{});
  }catch(error){errors.push(String(error));send(res,500,{code:'synthetic_fixture_error'});}
 });
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const eventually=async(check)=>{const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,'condition did not settle');await new Promise(resolve=>setTimeout(resolve,20));}};
 const start=async(width=1280)=>{for(const kind of held)release(kind);await context?.close();reset();context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'I29Session',value:'A',url:origin,httpOnly:true,sameSite:'Lax'}]);page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?screen=purchase-orders');await page.getByLabel('Tìm mã chứng từ',{exact:true}).waitFor();await eventually(async()=>await page.locator('.document-link').count()===20);await paint();};
 const visibility=async(value)=>{await page.evaluate(value=>{window.i29Visibility=value;document.dispatchEvent(new Event('visibilitychange'));if(value==='visible')window.dispatchEvent(new Event('focus'));},value);await paint();};
 const focus=async()=>{const before=calls.filter(c=>c.route==='/api/workspace').length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await eventually(()=>calls.filter(c=>c.route==='/api/workspace').length>before);await paint();};
 const prepare=async(width=1280)=>{await start(width);const input=page.getByLabel('Tìm mã chứng từ',{exact:true});await input.fill('APPLIED');await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await page.getByRole('combobox',{name:'Chi nhánh',exact:true}).click();await page.getByRole('option',{name:'BR-A',exact:true}).click();await page.getByRole('button',{name:'Trang tiếp theo',exact:true}).click();await eventually(()=>calls.some(c=>c.route==='/api/documents/purchase-orders'&&c.query.page==='2'&&c.query.search==='APPLIED'&&c.query.branchId==='BR-A'));await input.fill('UNSUBMITTED DRAFT');await paint();
  if(width>=768){await page.locator('.desktop-grid-viewport').evaluate(element=>{element.scrollTop=220;element.scrollLeft=80;});await paint();await page.getByRole('button',{name:'A-P2-00',exact:true}).click();}
  else await page.locator('.mobile-document-card').filter({hasText:'A-P2-00'}).click();
  await page.getByRole('button',{name:'Trang dòng hàng tiếp theo',exact:true}).click();await page.locator('.detail-sheet :is(.desktop-detail-lines,.mobile-detail-lines):visible').getByText('A-ITEM-P2-0',{exact:true}).waitFor();await page.locator('.detail-sheet').evaluate(element=>{element.scrollTop=140;});if(width>=768)await page.locator('.desktop-grid-viewport').evaluate(element=>{element.scrollTop=220;element.scrollLeft=80;});await paint();
 };
 const freshDetail=async()=>{await page.getByRole('heading',{name:'A-P2-00',exact:true}).waitFor();await page.locator('.detail-sheet :is(.desktop-detail-lines,.mobile-detail-lines):visible').getByText('A-ITEM-P2-0',{exact:true}).waitFor();await paint();};
 const hiddenData=async()=>{assert.equal(await page.locator('.document-link').count(),0);assert.equal(await page.getByText('A-ITEM-P2-0',{exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'A-P2-00',exact:true}).count(),0);};
 const checkControls=async()=>{assert.equal(await page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue(),'UNSUBMITTED DRAFT');assert.match(await page.locator('.branch-select').innerText(),/BR-A/);assert.match(await page.locator('.document-panel .pagination').innerText(),/Trang 2/);assert.ok(calls.some(c=>c.route==='/api/documents/purchase-orders'&&c.query.page==='2'&&c.query.search==='APPLIED'&&c.query.branchId==='BR-A'));};
 async function run(name,fn){await t.test(name,async()=>{try{await fn();results.push(name);}catch(error){failures.push(name);throw error;}});}
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
  await run('real tab activation and visibility/focus preserve selection, both pages, draft, branch and scroll after healthy observation changes',async()=>{
   await prepare();const scroll=await page.locator('.desktop-grid-viewport').evaluate(e=>({top:e.scrollTop,left:e.scrollLeft}));const detailScroll=await page.locator('.detail-sheet').evaluate(e=>e.scrollTop);assert.ok(scroll.top>0);assert.ok(detailScroll>0);
   const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await visibility('hidden');await hiddenData();
   models.A.version+=20;models.A.capabilities.reverse();models.A.branches.reverse();models.A.lifetime.idleExpiresAt=new Date(Date.now()+3700000).toISOString();models.A.lifetime.absoluteExpiresAt=new Date(Date.now()+7400000).toISOString();held.add('workspace');await page.bringToFront();await visibility('visible');await eventually(()=>waiters.get('workspace')?.length);await hiddenData();await checkControls();release('workspace');await freshDetail();await checkControls();assert.deepEqual(await page.locator('.desktop-grid-viewport').evaluate(e=>({top:e.scrollTop,left:e.scrollLeft})),scroll);assert.equal(await page.locator('.detail-sheet').evaluate(e=>e.scrollTop),detailScroll);await other.close();
  });
  for(const width of [1280,390])await run(`${width}px transient workspace outage hides rows and retains screen/controls until same-session recovery`,async()=>{
   await prepare(width);models.A.failure.workspace=503;await focus();await eventually(()=>page.locator('.connection-banner').count());await hiddenData();assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-orders');assert.equal(await page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue(),'UNSUBMITTED DRAFT');models.A.failure.workspace=null;await focus();await freshDetail();await checkControls();
  });
  for(const kind of ['list','detail'])await run(`${kind} failure cannot display previous rows and recovery preserves controls`,async()=>{
   await prepare();models.A.failure[kind]=503;const failed=page.waitForResponse(response=>response.status()===503&&(kind==='list'?new URL(response.url()).pathname.endsWith('/purchase-orders'):new URL(response.url()).pathname.endsWith('/detail')));await focus();await failed;await paint();assert.equal(await page.getByText('A-ITEM-P2-0',{exact:true}).count(),0);await checkControls();models.A.failure[kind]=null;await focus();await freshDetail();
  });
  for(const mutation of ['branch','capability','session'])await run(`${mutation} replacement clears controls before accepting new scoped data`,async()=>{
   await prepare();await visibility('hidden');if(mutation==='branch')models.A.branches=['BR-B'];else if(mutation==='capability')models.A.capabilities=[];else await context.addCookies([{name:'I29Session',value:'B',url:origin,httpOnly:true,sameSite:'Lax'}]);await visibility('visible');await eventually(()=>page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue().then(value=>value===''));assert.equal(await page.getByRole('heading',{name:'A-P2-00',exact:true}).count(),0);assert.equal(await page.getByText('A-ITEM-P2-0',{exact:true}).count(),0);assert.match(await page.locator('.document-panel .pagination').innerText(),/Trang 1/);
  });
  for(const kind of ['workspace','list','detail'])await run(`late canceled ${kind} reply cannot repopulate a replaced cookie session`,async()=>{
   await prepare();await page.evaluate(()=>{window.i29.ignoreAbort=true;});held.add(kind);await focus();await eventually(()=>waiters.get(kind)?.length);await visibility('hidden');await context.addCookies([{name:'I29Session',value:'B',url:origin,httpOnly:true,sameSite:'Lax'}]);release(kind);await visibility('visible');await eventually(()=>page.locator('.document-link').first().textContent().then(value=>value?.includes('B-P1')));await paint();assert.equal(await page.getByText('A-ITEM-P2-0',{exact:true}).count(),0);assert.equal(await page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue(),'');assert.ok(await page.evaluate(()=>window.i29.aborted)>0);
  });
  for(const status of [401,403])await run(`current document ${status} cannot keep old selection`,async()=>{
   await prepare();models.A.failure.list=status;const failed=page.waitForResponse(response=>response.status()===status&&new URL(response.url()).pathname.endsWith('/purchase-orders'));await focus();await failed;await eventually(()=>page.getByRole('heading',{name:'A-P2-00',exact:true}).count().then(count=>count===0));assert.equal(await page.getByText('A-ITEM-P2-0',{exact:true}).count(),0);if(status===403){await paint();const snapshot=calls.length;await new Promise(resolve=>setTimeout(resolve,300));await paint();assert.equal(calls.length,snapshot,'persistent denial must not cause automatic list/workspace retries');}
  });
  await run('confirmed logout and same-display-name explicit login never reuse read controls',async()=>{
   await prepare();await page.keyboard.press('Escape');await page.locator('.topbar .user-button').click();await page.getByRole('menuitem',{name:'Đăng xuất ERP',exact:true}).click();await eventually(()=>page.locator('.connection-banner').count());await page.locator('.connection-banner').getByRole('button',{name:'Đăng nhập ERP',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Đăng nhập ERP',exact:true});await dialog.getByLabel('Tên đăng nhập',{exact:true}).fill('B');await dialog.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await dialog.getByRole('button',{name:'Đăng nhập',exact:true}).click();await eventually(()=>page.locator('.document-link').first().textContent().then(value=>value?.includes('B-P1')));assert.equal(await page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue(),'');
  });
  await run('a syntactically valid substituted list session marker is rejected against verified workspace',async()=>{
   await prepare();models.A.wrong=true;const substituted=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/purchase-orders')&&response.headers()['x-medcom-session-scope']==='f'.repeat(64));await focus();await substituted;await eventually(()=>page.getByLabel('Tìm mã chứng từ',{exact:true}).inputValue().then(value=>value===''));await hiddenData();models.A.wrong=false;await focus();await eventually(()=>page.locator('.document-link').count().then(count=>count===20));
  });
  await run('inbound read rows are masked during authority revalidation and refreshed before redisplay',async()=>{
   await start();await page.goto(origin+'/?screen=inbound-requests');await page.getByLabel('Tìm phiếu nhập hàng',{exact:true}).waitFor();await eventually(()=>calls.some(call=>call.route==='/api/documents/inbound-requests'));await page.getByRole('button',{name:/^Mở phiếu A-P1-00 ·/}).first().waitFor();held.add('workspace');await visibility('hidden');await visibility('visible');await eventually(()=>waiters.get('workspace')?.length);assert.equal(await page.getByRole('button',{name:/^Mở phiếu A-P1-00 ·/}).count(),0);models.A.version++;release('workspace');await page.getByRole('button',{name:/^Mở phiếu A-P1-00 ·/}).first().waitFor();
  });
  await run('missing response markers fail closed and fresh-list removal closes the selected document',async()=>{
   await prepare();models.A.missing=true;await focus();await eventually(()=>page.locator('.connection-banner').count());await hiddenData();models.A.missing=false;models.A.removed=true;await focus();await eventually(()=>page.locator('.document-link').count().then(count=>count===19));assert.equal(await page.getByRole('heading',{name:'A-P2-00',exact:true}).count(),0);
   const saved=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));assert.deepEqual(saved.session,{});assert.deepEqual(Object.keys(saved.local),['medcom.preferences.v1']);assert.doesNotMatch(JSON.stringify(saved),/A-P2|ITEM|UNSUBMITTED|sessionScope|readScope/);
  });
  assert.deepEqual(failures,[],'all named browser cases must pass before writing successful evidence');assert.deepEqual(errors,[]);await mkdir(output,{recursive:true});await writeFile(path.join(output,'browser-result.json'),JSON.stringify({passed:true,node:process.version,browser:browser.version(),results,errors,scope:'Actual Workspace and production read client with synthetic HTTP backend/cookies; controlled visibility plus tab activation; no ASP.NET/SQL/production acceptance.'},null,2));
 }finally{for(const kind of [...held])release(kind);for(const queue of waiters.values())queue.splice(0).forEach(done=>done());await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
