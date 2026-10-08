// Production component + real validated GET client against synthetic HTTP data.
// No ERP/SQL/history/production qualification is established by this fixture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('I48 read-only reference presentation and lifetime at desktop and 390px',{timeout:120000},async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild');
 const browserTools=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 const {chromium}=(browserTools?createRequire(path.join(path.resolve(browserTools),'package.json')):require)('playwright-core');
 const executable=process.env.MEDCOM_EDGE_PATH??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'I48 browser NOT_RUN: installed supported Chromium/Edge required; no install, skip or security relaxation.');
 const output=process.env.I48_EVIDENCE_DIR??path.join(app,'.test-runtime','i48-browser');
 await mkdir(output,{recursive:true});
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{PurchaseReferenceDetails}from'./components/erp/purchase-reference-details';
 const root=createRoot(document.getElementById('root'));
 window.input={scopeKey:'a'.repeat(64),readIdentity:'A-1',authorityKey:'authority-A',documentId:'DOC-A',allowed:true,presentationAllowed:true,purposeId:7,currencyId:'USD',documentRateExchange:9.125};
 window.contexts=[];window.render=(patch={})=>{window.input={...window.input,...patch};root.render(<><p>Authoritative document rate: 9.125</p><PurchaseReferenceDetails {...window.input} onContextChange={value=>window.contexts.push(value)}/></>);};window.render();`;
 const built=await build({stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
 let mode='resolved',held=false,queue=[];
 const calls=[],errors=[],results=[];
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return;}
  if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main style="padding:12px"><div id="root"></div></main><script src="/fixture.js"></script>');return;}
  const query=Object.fromEntries(url.searchParams),captured=mode;
  calls.push({query,method:req.method});
  let reply={scopeKey:'a'.repeat(64),data:{available:true,reason:null,page:+query.page,hasMore:false,items:query.kind==='purposes'?[{id:query.search,label:captured==='null'?null:'P'.repeat(50)}]:[{id:query.search,label:query.search,currencyName:'C'.repeat(100),rateExchange:-2.75}]}};
  if(held)await new Promise(resolve=>queue.push(resolve));
  if(captured==='error'){res.statusCode=503;reply={code:'private_sql_evidence_never_show'};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(reply));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 const release=()=>{held=false;queue.splice(0).forEach(resolve=>resolve());};
 try{
  // Intentionally no browser download or security-disabling launch argument.
  browser=await chromium.launch({executablePath:executable,headless:true});
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();
   p.on('pageerror',error=>errors.push(error.message));mode='resolved';await p.goto(origin);
   await p.getByText('Đã khớp ID chính xác:',{exact:false}).first().waitFor();
   assert.match(await p.locator('body').innerText(),/Tỷ giá lưu trên chứng từ: 9.125/);
   assert.match(await p.locator('body').innerText(),/hiện tại: -2.75/);
   async function noOverflow(){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'viewport overflow');
    assert.equal(await p.locator('input,select,textarea').count(),0);}
   await noOverflow();await p.screenshot({path:path.join(output,'resolved-'+width+'.png'),fullPage:true});
   mode='null';await p.evaluate(()=>window.render({readIdentity:'null-2'}));
   await p.getByText('Nguồn ERP không có tên (NULL).',{exact:true}).waitFor();await noOverflow();
   await p.screenshot({path:path.join(output,'null-'+width+'.png'),fullPage:true});
   held=true;await p.evaluate(()=>window.render({readIdentity:'loading-3',documentId:'DOC-B',purposeId:8}));
   await p.getByText('Đang đọc tham chiếu ERP…',{exact:true}).first().waitFor();await noOverflow();
   await p.screenshot({path:path.join(output,'loading-'+width+'.png'),fullPage:true});
   const oldCalls=calls.length;
   await p.evaluate(()=>window.render({allowed:false,presentationAllowed:false,readIdentity:'logout-4'}));
   await p.waitForFunction(()=>document.querySelector('[aria-label="Tham chiếu mua hàng chỉ đọc"]')===null);
   release();await p.waitForTimeout(100);
   assert.equal(await p.locator('[aria-label="Tham chiếu mua hàng chỉ đọc"]').count(),0);
   assert.equal(calls.length,oldCalls);
   mode='error';await p.evaluate(()=>window.render({allowed:true,presentationAllowed:true,readIdentity:'recovery-5'}));
   await p.getByRole('button',{name:'Thử lại tham chiếu mục đích',exact:true}).waitFor();await noOverflow();
   const text=await p.locator('body').innerText();assert.doesNotMatch(text,/private_sql/);assert.match(text,/Authoritative document rate: 9.125/);
   await p.screenshot({path:path.join(output,'error-'+width+'.png'),fullPage:true});
   mode='resolved';await p.getByRole('button',{name:'Thử lại tham chiếu mục đích',exact:true}).click();
   await p.getByText('Đã khớp ID chính xác:',{exact:false}).first().waitFor();
   results.push({width,contexts:await p.evaluate(()=>window.contexts),calls:calls.length});await context.close();
  }
  assert.deepEqual(errors,[]);assert.ok(calls.every(c=>c.method==='GET'&&['purposes','currencies'].includes(c.query.kind)));
  await writeFile(path.join(output,'lifetime-call-count.json'),JSON.stringify({results,calls,errors},null,2));
 }finally{release();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
