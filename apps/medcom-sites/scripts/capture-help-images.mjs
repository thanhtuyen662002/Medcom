// Capture actual production components with synthetic, offline-only transport.
// No real records, credentials, backend requests or business writes are used.
// Annotation borders/arrows are browser DOM overlays rendered before capture.
import assert from 'node:assert/strict';
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

const transport = `
const titles={'purchase-requests':'Đề nghị mua hàng','purchase-approvals':'Duyệt đề nghị mua hàng','purchase-orders':'Đặt mua hàng'};
const action=(id,caption)=>({id,caption,visible:true,enabled:true,reason:null,requiresSavedDocument:true,route:null});
const header=module=>({purchaseRequestId:'PR-MINH-HOA-001',documentDate:'2026-10-16',purchaseDate:'2026-10-16',documentDateDisplay:'16/10/2026',branchId:'DEMO',personSuggest:'Người đề nghị minh họa',department:'Bộ phận minh họa',objectName:module==='purchase-orders'?'Nhà cung cấp minh họa':'Đối tượng minh họa',currencyId:'VND',rateExchange:'1',purposeName:'Mua vật tư minh họa',statusId:module==='purchase-approvals'?2:1,statusName:module==='purchase-approvals'?'Chờ duyệt':'Mới lập',isLocked:false,memo:'Dữ liệu dùng cho hướng dẫn'});
const documentId=module=>module==='purchase-orders'?'PO-MINH-HOA-001':'PR-MINH-HOA-001';
export const erpClient={
 async getScreenMetadata(module){return{id:module,caption:titles[module],fields:{},lookups:[],actions:[],evidence:'synthetic-guide-fixture'};},
 async getErpModuleActions(module){return module==='purchase-approvals'?[]:[action('create','Tạo mới')];},
 async getErpModuleList(module){return{rows:[{documentId:documentId(module),branchId:'DEMO',header:header(module)}],page:1,hasMore:false};},
 async getErpModuleDetail(module){return{documentId:documentId(module),branchId:'DEMO',stateToken:'synthetic-only',header:header(module),lines:{rows:[{lineId:'DEMO-LINE-1',fields:{itemId:'HH-MINH-HOA',itemName:'Vật tư minh họa',quantity:'2',unitPrice:'150000',totalPrice:'300000',unit:'Cái'}}],page:1,hasMore:false},history:null,comparison:null,sections:null,actions:module==='purchase-approvals'?[action('approve','Duyệt'),action('reject','Không duyệt')]:[action('save','Sửa thông tin'),action('submit','Gửi đề nghị'),action('send-purchase-order','Gửi đặt mua hàng'),action('delete','Xóa chứng từ')]};},
 async getLookupOptions(module,query){
 const id=query.lookupId;
 const choice=id.includes('PersonSuggest')?{id:'NGUOI-DEMO',label:'Người đề nghị minh họa'}:id.includes('Department')?{id:'BP-DEMO',label:'Bộ phận minh họa'}:id.includes('ObjectID')?{id:'DT-DEMO',label:'Đối tượng minh họa',fields:{ObjectName:'Đối tượng minh họa'}}:id.includes('CurrencyID')?{id:'VND',label:'Việt Nam đồng',fields:{RateExchange:1}}:id.includes('ItemID')?{id:'HH-MINH-HOA',label:'Vật tư minh họa',fields:{ItemName:'Vật tư minh họa',Unit:'Cái'}}:{id:'MD-DEMO',label:'Mục đích minh họa'};
 return{items:[choice],page:1,hasMore:false,requiredParameters:[]};},
 async createDocument(){throw Error('Guide capture never dispatches writes');},
 async executeWorkflowAction(){throw Error('Guide capture never dispatches writes');},
};`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{TabErpScreen}from'./components/untitledui/tab-erp-screen';
const module=new URLSearchParams(location.search).get('module')||'purchase-requests';
createRoot(document.getElementById('root')).render(<TabErpScreen module={module} currentBranch="DEMO" isActive={true}/>);`;
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:app},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning',plugins:[{name:'synthetic-help-transport',setup(builder){
  builder.onResolve({filter:/(?:^|\/)erp-client$/},()=>({path:'transport',namespace:'help-fixture'}));
  builder.onLoad({filter:/.*/,namespace:'help-fixture'},()=>({contents:transport,loader:'js'}));
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
const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:440,height:860},deviceScaleFactor:1,locale:'vi-VN',reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const evidence=[];
await mkdir(output,{recursive:true});
async function visit(module){await page.goto(origin+'/?module='+module);await page.getByPlaceholder('Tìm theo mã chứng từ, người lập, đối tượng...').waitFor();await page.getByText(module==='purchase-orders'?'PO-MINH-HOA-001':'PR-MINH-HOA-001',{exact:true}).first().waitFor();await page.evaluate(()=>document.fonts.ready);}
async function capture(name,targets=[]){
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
      Object.assign(border.style,{position:'fixed',left:(r.x-4)+'px',top:(r.y-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px',border:'2px solid #eb3a45',borderRadius:'9px',zIndex:'99999',pointerEvents:'none',boxShadow:'0 0 0 2px #ffffffb0'});
      const badge=document.createElement('span');badge.textContent=r.label;Object.assign(badge.style,{position:'absolute',left:'-10px',top:'-13px',width:'23px',height:'23px',display:'grid',placeItems:'center',background:'#e73843',color:'white',border:'2px solid white',borderRadius:'50%',font:'bold 12px Arial'});border.append(badge);document.body.append(border);
    }
    const note=document.createElement('div');note.dataset.helpAnnotation='true';note.textContent='ẢNH HƯỚNG DẪN · DỮ LIỆU MINH HỌA';Object.assign(note.style,{position:'fixed',bottom:'0',left:'0',right:'0',zIndex:'99999',textAlign:'center',font:'9px Arial',letterSpacing:'1px',padding:'7px',background:'#102a68',color:'#d9e5ff',pointerEvents:'none'});document.body.append(note);
  },rects);
  await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  evidence.push({name,annotations:rects.length,sha256:createHash('sha256').update(await readFile(path.join(output,name+'.png'))).digest('hex')});
  await page.locator('[data-help-annotation]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
}
const field=label=>page.locator('[role="dialog"] label').filter({hasText:new RegExp('^'+label+'(?:\\s*\\*)?\\s*$')}).first().locator('..').getByRole('button').first();
async function select(label,choice,multiple=false){await field(label).click();await page.getByRole('button',{name:new RegExp(choice)}).last().click();if(multiple)await page.getByRole('button',{name:/Áp dụng|Xong|Hoàn tất/}).last().click();}
async function fillField(label,value){const container=page.locator('[role="dialog"] label').filter({hasText:label}).first().locator('..');await container.locator('input').fill(value);}
try{
  await visit('purchase-requests');
  await capture('pr-list',[page.getByRole('button',{name:'Tạo mới',exact:true}),page.getByRole('button',{name:/Mới lập/}),page.getByText('PR-MINH-HOA-001',{exact:true}).first().locator('..').locator('..').locator('..')]);
  await page.getByRole('button',{name:'Tạo mới',exact:true}).click();
  await page.getByText('Tạo đề nghị mua hàng',{exact:true}).waitFor();
  await capture('pr-header',[field('Người đề nghị'),field('Bộ phận')]);
  await select('Người đề nghị','Người đề nghị minh họa',true);
  await select('Bộ phận','Bộ phận minh họa',true);
  await select('Khách hàng','Đối tượng minh họa');
  // The step tab uses the same validated header eligibility without displaying
  // validation messages for the not-yet-entered line fields in this illustration.
  await page.getByRole('button',{name:'2. Dòng hàng'}).click();
  await page.getByRole('button',{name:'Thêm dòng'}).waitFor();
  await select('Mã hàng','Vật tư minh họa');
  await fillField('Số lượng','2');await fillField('Đơn giá','150000');
  await page.getByRole('button',{name:'Thêm dòng'}).scrollIntoViewIfNeeded();
  await capture('pr-lines',[page.getByRole('button',{name:'Thêm dòng'}),field('Mã hàng'),page.locator('[role="dialog"] label').filter({hasText:'Số lượng'}).first().locator('..').locator('..')]);
  await page.getByRole('button',{name:'Xem lại & tạo'}).click();
  await page.getByRole('button',{name:'Xác nhận tạo phiếu'}).scrollIntoViewIfNeeded();
  await capture('pr-review',[page.getByRole('button',{name:'Xác nhận tạo phiếu'})]);
  await visit('purchase-requests');await page.getByText('PR-MINH-HOA-001',{exact:true}).first().click();
  await page.getByRole('button',{name:'Thao tác chứng từ'}).click();
  await capture('pr-actions',[page.getByRole('button',{name:'Thao tác chứng từ'}),page.getByRole('button',{name:'Gửi đề nghị',exact:true})]);
  await visit('purchase-approvals');
  await capture('approval-list',[page.getByRole('button',{name:/Chờ duyệt/}),page.getByText('PR-MINH-HOA-001',{exact:true}).first().locator('..').locator('..').locator('..')]);
  await page.getByText('PR-MINH-HOA-001',{exact:true}).first().click();await page.getByRole('button',{name:'Thao tác chứng từ'}).click();
  await capture('approval-menu',[page.getByRole('button',{name:'Thao tác chứng từ'}),page.getByRole('button',{name:'Duyệt',exact:true}),page.getByRole('button',{name:'Không duyệt',exact:true})]);
  await page.getByRole('button',{name:'Duyệt',exact:true}).click();
  await page.getByRole('button',{name:'Xác nhận Duyệt',exact:true}).waitFor();
  await capture('approval-confirm',[page.locator('textarea'),page.getByRole('button',{name:'Xác nhận Duyệt',exact:true})]);
  await page.getByRole('button',{name:'Hủy',exact:true}).last().click();
  await page.getByRole('button',{name:'Thao tác chứng từ'}).click();await page.getByRole('button',{name:'Không duyệt',exact:true}).click();
  await page.locator('textarea').fill('Vui lòng kiểm tra số lượng và bổ sung thời gian cần hàng.');
  await capture('approval-reject',[page.locator('textarea'),page.getByRole('button',{name:'Xác nhận Không duyệt',exact:true})]);
  await visit('purchase-orders');
  assert.equal(await page.getByRole('button',{name:'Tạo mới',exact:true}).count(),0,'Do not document a hidden PO create control');
  await capture('po-list',[page.getByPlaceholder('Tìm theo mã chứng từ, người lập, đối tượng...'),page.getByRole('button',{name:/Đang mở \/ Chưa khóa/}),page.getByText('PO-MINH-HOA-001',{exact:true}).first().locator('..').locator('..').locator('..')]);
  await page.getByText('PO-MINH-HOA-001',{exact:true}).first().click();
  await page.getByText('Chi tiết: PO-MINH-HOA-001',{exact:true}).waitFor();
  await capture('po-detail',[page.getByText('Nhà cung cấp minh họa',{exact:true}).last()]);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'manifest.json'),JSON.stringify({kind:'production-components-with-synthetic-offline-transport',viewport:{width:440,height:860},realErpData:false,backendRequests:false,businessWrites:false,images:evidence,sourceFiles:['components/untitledui/tab-erp-screen.tsx','components/untitledui/purchase-request-create-sheet.tsx','components/untitledui/lookup-field.tsx','components/untitledui/bottom-sheet.tsx'],errors},null,2)+'\n');
  console.log(JSON.stringify({images:evidence.map(image=>image.name),errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
