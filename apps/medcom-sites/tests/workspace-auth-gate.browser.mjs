// Synthetic controlled root fixture; does not claim existing Workspace integration.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.I44_EVIDENCE_DIR??path.join(app,'.test-runtime/i44-browser');
test('I44 production auth surfaces, controlled root and protected body portal',{timeout:120000},async()=>{
 const require=createRequire(import.meta.url),toolchain=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 const {chromium}=(toolchain?createRequire(path.join(path.resolve(toolchain),'package.json')):require)('playwright-core');
 const executable=process.env.MEDCOM_EDGE_PATH??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {createPortal,flushSync} from 'react-dom';
 import {WorkspaceAuthGate,protectedPresentationProps} from './components/erp/workspace-auth-gate';
 import {deriveWorkspaceAuthState,resolveWorkspaceReturnTarget} from './lib/erp/workspace-auth-state';
 window.evidence={mounts:0,unmounts:0,calls:0,success:0,actions:0,retries:0};
 let input={lifecycleKey:'A',session:'unresolved',hasAuthenticatedProof:false,authority:'verifying',proofLifecycleKey:null,signOutPending:false};
 let grants=['home','settings','purchase-orders','purchase-requests','purchase-approval','inbound-requests','transfers','accounting','reports'];
 const requested=new URLSearchParams(location.search).get('screen');const root=createRoot(document.getElementById('root'));
 function Business({allowed,target}){React.useEffect(()=>{window.evidence.mounts++;return()=>window.evidence.unmounts++;},[]);const [filter,setFilter]=React.useState('draft');const [intent]=React.useState('unresolved');return <><h2>Protected {target}</h2><input aria-label='Filter' value={filter} onChange={e=>setFilter(e.target.value)}/><span data-intent={intent}/>{createPortal(<div data-protected-portal {...protectedPresentationProps(allowed)}><button onClick={()=>{if(allowed)window.evidence.actions++;}}>Protected command</button></div>,document.body)}</>}
 function render(){const state=deriveWorkspaceAuthState(input);root.render(<WorkspaceAuthGate state={state} onRetry={()=>{window.evidence.retries++;window.transition({authority:'verifying'});}} login={{configured:true,authenticate:()=>{window.evidence.calls++;return new Promise((resolve,reject)=>{window.finishLogin={resolve,reject};});},onSuccess:()=>{window.evidence.success++;}}}><Business allowed={state.presentationAllowed} target={resolveWorkspaceReturnTarget(requested,grants,state)}/></WorkspaceAuthGate>);}
 window.transition=(patch)=>flushSync(()=>{input={...input,...patch};render();});window.setGrants=(next)=>{grants=next;window.transition({});};window.transition({});`;
 const bundle=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:'fixture.js',bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).contents;
 assert.ok(existsSync(executable),'NOT_RUN: existing installed Chromium/Edge required; no download or security relaxation');
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;let browser;const evidence=[];
 try{
  // Keep browser security defaults; hosts requiring sandbox bypass are NOT_RUN.
  browser=await chromium.launch({executablePath:executable,headless:true});await mkdir(output,{recursive:true});
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:800}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const transition=patch=>page.evaluate(p=>window.transition(p),patch);
   const proof={session:'live',hasAuthenticatedProof:true,authority:'verified',proofLifecycleKey:'A'};
   for(const screen of ['home','settings','purchase-orders','purchase-requests','purchase-approval','inbound-requests','transfers','accounting','reports']){
    await page.goto(origin+'/?screen='+screen);await page.getByRole('heading',{name:'Đang xác minh phiên làm việc…'}).waitFor();assert.equal(await page.getByRole('heading',{name:/Protected/}).count(),0);assert.equal(await page.evaluate(()=>window.evidence.mounts),0);
    await transition({authority:'unavailable'});await page.getByRole('button',{name:'Thử lại'}).click();assert.equal(await page.evaluate(()=>window.evidence.retries),1);await transition(proof);await page.getByRole('heading',{name:'Protected '+screen,exact:true}).waitFor();
   }
   await page.getByLabel('Filter').fill('retained filter');await page.getByRole('button',{name:'Protected command'}).focus();
   for(const authority of ['unavailable','verifying']){
    await transition({authority,proofLifecycleKey:null});assert.equal(await page.getByRole('button',{name:'Protected command'}).count(),0);assert.equal(await page.locator('[data-protected-portal]').evaluate(e=>e.hidden&&e.inert&&e.getAttribute('aria-hidden')==='true'),true);assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SECTION');
    await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.textContent),'Protected command');
   }
   await transition(proof);assert.equal(await page.getByLabel('Filter').inputValue(),'retained filter');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Protected command');assert.deepEqual(await page.evaluate(()=>[window.evidence.mounts,window.evidence.unmounts]),[1,0]);assert.equal(await page.locator('[data-intent]').getAttribute('data-intent'),'unresolved');
   await transition({signOutPending:true});assert.equal(await page.getByRole('button',{name:'Protected command'}).count(),0);
   await transition({session:'expired',signOutPending:false});await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc'}).waitFor();
   await page.getByLabel('Tên đăng nhập',{exact:true}).fill('synthetic');await page.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Hiện mật khẩu'}).click();assert.equal(await page.getByLabel('Mật khẩu',{exact:true}).getAttribute('type'),'text');
   await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();assert.equal(await page.getByLabel('Mật khẩu',{exact:true}).inputValue(),'');assert.equal(await page.evaluate(()=>window.evidence.calls),1);
   await page.evaluate(()=>window.finishLogin.reject(Error('private diagnostic')));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').evaluate(e=>e===document.activeElement),true);assert.doesNotMatch(await page.locator('body').innerText(),/private diagnostic/);
   await page.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.evaluate(()=>window.finishLogin.resolve({}));await page.getByText('Đang chờ xác minh quyền làm việc…').waitFor();assert.equal(await page.getByRole('button',{name:'Protected command'}).count(),0);
   await transition({lifecycleKey:'B',session:'unresolved',hasAuthenticatedProof:false,authority:'verifying',proofLifecycleKey:null});await transition({session:'live',hasAuthenticatedProof:true,authority:'verified',proofLifecycleKey:'A'});assert.equal(await page.getByRole('button',{name:'Protected command'}).count(),0);await transition({proofLifecycleKey:'B'});assert.deepEqual(await page.evaluate(()=>[window.evidence.mounts,window.evidence.unmounts]),[2,1]);
   await page.evaluate(()=>window.setGrants(['settings']));await page.getByRole('heading',{name:'Protected settings'}).waitFor();
   await transition({session:'anonymous',hasAuthenticatedProof:false});assert.equal(await page.getByRole('button',{name:'Protected command'}).count(),0);await page.getByRole('heading',{name:'Đăng nhập ERP',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,`login-${width}.png`),fullPage:true});
   if(width===390){await page.setViewportSize({width,height:380});await page.getByLabel('Mật khẩu',{exact:true}).focus();await page.getByRole('button',{name:'Đăng nhập',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   evidence.push({width,...await page.evaluate(()=>window.evidence),errors});assert.deepEqual(errors,[]);await context.close();
  }
  await writeFile(path.join(output,'result.json'),JSON.stringify({status:'PASS',scope:'Controlled synthetic root, production gate/login/helpers; not Workspace or ERP acceptance',evidence},null,2));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
