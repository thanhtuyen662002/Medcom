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
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';import{RequestError}from'./components/erp/request-presentation';import{ApiError}from'./lib/erp/api';
 const diagnostics=new URLSearchParams(location.search).has('diagnostics');createRoot(document.getElementById('root')).render(diagnostics?<RequestError error={new ApiError(503,'PRIVATE_SQL_SENTINEL','PRIVATE_COOKIE_SENTINEL')}/>:<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'i30-image'}));build.onLoad({filter:/.*/,namespace:'i30-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const cssSource=await readFile(path.join(app,'app/globals.css'),'utf8');
 const css=(await postcss([tailwind({base:app})]).process(cssSource,{from:path.join(app,'app/globals.css')})).css;
 assert.ok(!css.includes('@import "tailwindcss"'),'Application Tailwind must actually compile.');
 const script=Buffer.from(built.outputFiles[0].contents),logo=await readFile(path.join(app,'public/medcom-logo.png'));
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
 let model,serial=0,browser,context,page,origin,completed=false,fatal=null;const expectedCases=10;const errors=[],results=[],failures=[],captures=[],calls=[];
 const reset=(patch={})=>{model={serial:++serial,writable:false,empty:false,status:200,holdList:false,waiters:[],unknown:false,workspaceReads:0,deniedLists:0,...patch};calls.length=0;};
 const workspace=()=>({session:{displayName:'SYNTHETIC USER',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:1,idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString(),capabilities:['purchase-requests.read','inbound-requests.read','purchase-orders.read']},branchIds:['QA-BRANCH'],navigation:['purchase-requests','inbound-requests','purchase-orders'].map(id=>({id,label:id,href:'/?screen='+id}))});
 const send=(res,status,data,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 const readHeaders={'X-Medcom-Session-Scope':session,'X-Medcom-Read-Scope':scope};
 const server=createServer(async(req,res)=>{
  const m=model;try{
   const url=new URL(req.url,origin??'http://localhost');
   if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
   if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
   if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
   if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
   const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method});
   if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
   if(route==='/api/workspace'){m.workspaceReads++;return send(res,200,workspace(),readHeaders);}
   if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
   if(route==='/api/purchase-requests/workspace')return send(res,200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
   if(route==='/api/purchase-requests'||route==='/api/documents/inbound-requests'){
    if(m.holdList)await new Promise(resolve=>m.waiters.push(resolve));
    if(m.status!==200){if(m.status===403)m.deniedLists++;return send(res,m.status,{code:'request_failed'},readHeaders);}
    const isPurchase=route==='/api/purchase-requests';
    const rows=m.empty?[]:isPurchase?[{documentId:purchase.purchaseRequestId,purchaseDate:purchase.header.purchaseDate,branchId:purchase.branchId,personSuggest:purchase.header.personSuggest,department:purchase.header.department,statusId:1,isLocked:false}]:[{documentId:inbound.documentId,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:0,isLocked:false}];
    const data={rows,page:Number(url.searchParams.get('page')??1),pageSize:isPurchase?20:50,hasMore:false};return send(res,200,isPurchase?{scopeKey:scope,data}:data,readHeaders);
   }
   if(route==='/api/purchase-requests/detail')return send(res,200,{scopeKey:scope,data:{document:purchase,stateToken:'prs1.'+'d'.repeat(64),commandAccess:{canSave:m.writable,canSubmit:m.writable,canLookup:m.writable,canAddLines:false,reason:m.writable?'available':'command_access_provider_unavailable'}}});
   if(route==='/api/inbound-requests/draft')return send(res,200,{scopeKey:scope,access:{canRead:true,canSave:m.writable,canSend:m.writable,available:true,maxCommandBytes:1048576},data:{outcome:'Observed',document:inbound}});
   if(req.method==='POST'&&route==='/api/inbound-requests/draft/save'){for await(const part of req)void part;if(m.unknown){res.destroy();return;}return send(res,503,{code:'request_failed'});}
   return send(res,404,{code:'request_failed'});
  }catch(error){errors.push('Synthetic server failure: '+String(error));send(res,500,{code:'request_failed'});}
 });
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const eventually=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){t.signal.throwIfAborted();assert.ok(Date.now()<deadline,'Synthetic request did not reach expected state');await new Promise(resolve=>setTimeout(resolve,20));}};
 const release=()=>{model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());};
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
 async function start(width,screen,patch={}){release();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900},locale:'vi-VN',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await page.goto(origin+'/?screen='+screen);}
 const host=screen=>screen==='purchase-requests'?page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true}):page.getByTestId('inbound-request-host');
 async function layout(width,screen){await paint();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow at '+width);
  const checks=await host(screen).locator('button:visible,input:not([type=checkbox]):visible,textarea:visible,select:visible').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})));
  assert.ok(checks.length);assert.ok(checks.every(v=>v.height>=43.5),'Request touch targets must be at least 44px: '+JSON.stringify(checks));
  if(width<768)assert.ok(checks.filter(v=>v.tag!=='BUTTON').every(v=>v.font>=16),'Mobile input/textarea fonts must be 16px');
 }
 async function capture(name){await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await paint();const file=name+'.png';await page.screenshot({path:path.join(output,file),fullPage:true});const bytes=await readFile(path.join(output,file));captures.push({file,sha256:sha(bytes)});}
 const open=screen=>screen==='purchase-requests'?page.getByRole('button',{name:'Mở đề nghị QA-PURCHASE-001',exact:true}):page.getByRole('button',{name:/^Mở phiếu QA-INBOUND-001 /});
 async function run(name,fn){await t.test(name,async()=>{try{await fn();results.push(name);}catch(error){failures.push(name);throw error;}});}
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});t.signal.throwIfAborted();
  for(const width of [320,390,1440])for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${width} ${screen} list and authorized read-only detail`,async()=>{
    await start(width,screen);await open(screen).waitFor();await layout(width,screen);assert.match(await host(screen).innerText(),/01\/10\/2026/);await capture(`${screen}-list-${width}`);
    const filter=host(screen).locator('input').first();await filter.focus();assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
    await open(screen).click();if(screen==='purchase-requests')await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();
    await layout(width,screen);assert.equal(calls.filter(v=>v.method==='POST').length,0);
    if(screen==='purchase-requests'){const table=page.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});assert.equal(await table.getByRole('columnheader').count(),8);assert.equal(await table.locator('tbody tr').count(),purchase.lines.length);assert.equal(await table.getByRole('cell').count(),8*purchase.lines.length);assert.match(await table.innerText(),/999999999999999999/);}
    await capture(`${screen}-readonly-${width}`);
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
   await start(390,'inbound-requests',{writable:true,unknown:true});await open('inbound-requests').click();const order=page.getByLabel('Số đơn',{exact:true});await order.waitFor();await order.fill('SYNTHETIC EDIT');await order.focus();await layout(390,'inbound-requests');
   assert.equal(await page.getByLabel('Số lượng bộ theo chứng từ',{exact:true}).inputValue(),'999999999999999999');
   await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).waitFor();
   assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);await layout(390,'inbound-requests');await capture('inbound-requests-unresolved-390');
   await page.getByRole('button',{name:'Đóng phiếu nhập hàng',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);await capture('inbound-requests-custody-390');
  });
  await run('support details never expose arbitrary errors or references',async()=>{
   await page.goto(origin+'/?diagnostics=1');await page.getByText('Thông tin hỗ trợ',{exact:true}).click();const text=await page.locator('body').innerText();assert.match(text,/503/);assert.match(text,/unknown_code/);assert.doesNotMatch(text,/PRIVATE_SQL_SENTINEL|PRIVATE_COOKIE_SENTINEL/);
  });
  t.signal.throwIfAborted();assert.deepEqual(errors,[]);assert.equal(results.length,expectedCases,'Every required presentation case must finish');completed=true;
 }catch(error){fatal=String(error);throw error;}finally{
  let teardownError;try{await cleanup();}catch(error){teardownError=error;errors.push(String(error));}
  t.signal.removeEventListener('abort',abortCleanup);
  const evidence={node:process.version,css:{sourceSha256:sha(cssSource),compiledSha256:sha(css),bytes:Buffer.byteLength(css)},viewportWidths:[320,390,1440],hierarchy:'Actual Workspace and production request components',backend:'Synthetic HTTP only; no ERP/SQL acceptance',status:completed&&!t.signal.aborted&&!fatal&&!failures.length&&!errors.length&&results.length===expectedCases?'passed':'failed',expectedCases,completedCases:results.length,fatal,results,failures,captures,errors};
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify(evidence,null,2));
  if(teardownError)throw teardownError;
 }
});
