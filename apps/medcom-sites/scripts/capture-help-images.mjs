// Capture actual production components with synthetic, offline-only transport.
// No real records, credentials, backend requests or business writes are used.
// Annotation borders/arrows are browser DOM overlays rendered before capture.
import assert from 'node:assert/strict';
import {captureHelpScenes} from './fixtures/help-scenes.mjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, 'public/help/images');
const require = createRequire(import.meta.url);
const { chromium } = (process.env.MEDCOM_BROWSER_TOOLCHAIN ? createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN), 'package.json')) : require)('playwright');
const preview = process.env.MEDCOM_HELP_PREVIEW ?? 'http://localhost:3000';
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(preview), 'Only an explicit local preview is allowed');
const response = await fetch(preview + '/help');
assert.equal(response.status, 200, 'Start the local Next preview before capture');
const html = await response.text();
const styleUrls = [...html.matchAll(/<link[^>]+href="([^"]+\.css(?:\?[^\"]*)?)"[^>]*>/g)].map(match => match[1].replaceAll('&amp;', '&'));
assert.ok(styleUrls.length, 'Use the real compiled application CSS');
const css = (await Promise.all(styleUrls.map(async url => { const r = await fetch(new URL(url, preview)); assert.equal(r.status, 200); return r.text(); }))).join('\n');

const transport=await readFile(path.join(app,'scripts/fixtures/help-transport.mjs'),'utf8');
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{TabErpScreen}from'./components/untitledui/tab-erp-screen';
const module=new URLSearchParams(location.search).get('module')||'purchase-requests';
createRoot(document.getElementById('root')).render(<TabErpScreen module={module} currentBranch="DEMO" isActive={true}/>);`;
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:app},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning',plugins:[{name:'synthetic-help-transport',setup(builder){
  builder.onResolve({filter:/(?:^|\/)erp-client$/},()=>({path:'transport',namespace:'help-fixture'}));
  builder.onLoad({filter:/.*/,namespace:'help-fixture'},()=>({contents:transport,loader:'js'}));
  builder.onResolve({filter:/(?:^|\/)erp-screen-api$/},()=>({path:'api',namespace:'help-api'}));
  builder.onLoad({filter:/.*/,namespace:'help-api'},()=>({loader:'js',contents: "export async function getSalesOrderAttachments(){return {supported:true,slots:[],canUpload:false,canDelete:false,documentStateToken:'synthetic-only',rows:[],page:1,pageSize:20,hasMore:false};} export async function uploadSalesOrderAttachment(){globalThis.__helpWrites=(globalThis.__helpWrites??0)+1;throw Error('Capture cannot write');}"}));
}}]});
const server = createServer(async(req,res)=>{
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return; }
  if (url.pathname === '/style.css') { res.setHeader('Content-Type','text/css');res.end(css);return; }
  if (url.pathname.startsWith('/api/')) {res.statusCode=500;res.end('No backend access in guide capture');return;}
  if (url.pathname.startsWith('/fonts/') || url.pathname === '/medcom-logo.png') { try {res.end(await readFile(path.join(app,'public',url.pathname)));}catch{res.statusCode=404;res.end();}return; }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#f5f7fb"><header style="padding:15px 20px;background:white;border-bottom:1px solid #e4eaf4;display:flex;align-items:center;justify-content:space-between"><img src="/medcom-logo.png" style="width:111px;height:36px;object-fit:contain" alt="MEDCOMTECH"><span style="font:10px Arial;color:#8a98ad">DỮ LIỆU MINH HỌA</span></header><main id="root" style="padding:18px 16px"></main><script src="/fixture.js"></script></body></html>');
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const device=process.env.MEDCOM_CAPTURE_DEVICE??'mobile';
const viewport=device==='mobile'?{width:390,height:844}:{width:1440,height:1000};
const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile',permissions:['camera'],locale:'vi-VN',reducedMotion:'reduce'});
page.setDefaultTimeout(12000);
const forbidden=[];await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&!u.pathname.startsWith('/api/'))return route.continue();forbidden.push(u.origin+u.pathname);return route.abort();});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const evidence=[];
await mkdir(output,{recursive:true});
async function visit(module,open=false){const id=module==='sales-qr'?'PXK-MINH-HOA-001':module.startsWith('sales-')?'DH-MINH-HOA-001':module==='purchase-orders'?'PO-MINH-HOA-001':'PR-MINH-HOA-001';await page.goto(origin+'/?module='+module);await page.getByText(id,{exact:true}).filter({visible:true}).first().waitFor();await page.evaluate(()=>document.fonts.ready);if(open){await page.getByText(id,{exact:true}).filter({visible:true}).first().click();await page.getByRole('dialog').first().waitFor();await page.getByRole('dialog').first().getByText(module==='purchase-orders'?'Nhà cung cấp minh họa':'Khách hàng minh họa',{exact:false}).last().waitFor();}}
async function capture(name,targets=[],fullPage=false){
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('[data-help-annotation]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
  const rects=[];
  for(let i=0;i<targets.length;i++){
    const rect=await targets[i].boundingBox();assert.ok(rect,'Annotation target exists: '+name);
    rects.push({...rect,label:String(i+1)});
  }
  await page.evaluate(rects=>{
    for(const r of rects){
      const border=document.createElement('div');border.dataset.helpAnnotation='true';
      Object.assign(border.style,{position:'absolute',left:(r.x-4+scrollX)+'px',top:(r.y-4+scrollY)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px',border:'2px solid #eb3a45',borderRadius:'9px',zIndex:'99999',pointerEvents:'none',boxShadow:'0 0 0 2px #ffffffb0'});
      const badge=document.createElement('span');badge.textContent=r.label;Object.assign(badge.style,{position:'absolute',left:'-10px',top:'-13px',width:'23px',height:'23px',display:'grid',placeItems:'center',background:'#e73843',color:'white',border:'2px solid white',borderRadius:'50%',font:'bold 12px Arial'});border.append(badge);document.body.append(border);
    }
    const note=document.createElement('div');note.dataset.helpAnnotation='true';note.textContent='ẢNH HƯỚNG DẪN · DỮ LIỆU MINH HỌA';Object.assign(note.style,{position:'fixed',top:'6px',right:'6px',borderRadius:'5px',zIndex:'99999',textAlign:'center',font:'10px Segoe UI,Arial',letterSpacing:'.3px',padding:'7px',background:'#102a68',color:'#d9e5ff',pointerEvents:'none'});document.body.append(note);
  },rects);
  const sharp=require(require.resolve('sharp',{paths:[require.resolve('next')]}));
  const png=await page.screenshot({type:'png',fullPage,animations:'disabled'});
  const bytes=await sharp(png).webp({lossless:true}).toBuffer();
  const filename=name+'-'+device+'.webp';await writeFile(path.join(output,filename),bytes);
  const {width,height}=await sharp(bytes).metadata();
  evidence.push({name,device,src:'/help/images/'+filename,width,height,annotations:rects.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  console.log('Captured '+filename);
  await page.locator('[data-help-annotation]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
}
const field=label=>page.locator('[role="dialog"] label').filter({hasText:new RegExp('^'+label+'(?:\\s*\\*)?')}).first().locator('..').getByRole('button').first();
async function select(label,choice,multiple=false){await field(label).click();await page.getByRole('button',{name:new RegExp(choice)}).last().click();if(multiple)await page.getByRole('button',{name:/Áp dụng|Xong|Hoàn tất/}).last().click();}
async function fillField(label,value){const container=page.locator('[role="dialog"] label').filter({hasText:label}).first().locator('..');await container.locator('input').fill(value);}
try{
  await captureHelpScenes({page,device,visit,capture,field,select,fillField});
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert.equal(await page.evaluate(()=>globalThis.__helpWrites??0),0);
  let prior=[];try{prior=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8')).images.filter(row=>row.device);}catch{}
  const images=[...prior.filter(row=>!evidence.some(next=>next.src===row.src)),...evidence].sort((a,b)=>a.src.localeCompare(b.src));
  await writeFile(path.join(output,'manifest.json'),JSON.stringify({kind:'production-components-with-synthetic-offline-transport',capturedAt:new Date().toISOString(),realErpData:false,backendRequests:false,businessWrites:false,images,sourceFiles:['components/untitledui/tab-erp-screen.tsx','components/erp/sales-order-form.tsx','components/erp/sales-order-status-filter.tsx','components/erp/sales-order-detail-tabs.tsx','components/erp/sales-order-line-editor.tsx','components/untitledui/purchase-request-create-sheet.tsx','scripts/fixtures/help-transport.mjs'],errors},null,2)+'\n');
  await writeFile(path.join(app,'lib/help/image-dimensions.json'),JSON.stringify(Object.fromEntries(images.map(row=>[row.src,{width:row.width,height:row.height}])),null,2)+'\n');
  console.log(JSON.stringify({captured:evidence.length,total:images.length,errors}));
}catch(error){console.error((await page.locator('body').innerText()).slice(-4500));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
