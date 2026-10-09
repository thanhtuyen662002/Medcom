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

// Both production command-service Unavailable shapes deny all draft rights.
// Neither one authorizes READ; that proof belongs to the separate detail GET.
const unavailableDraft=nullScope=>({scopeKey:nullScope?null:scope,
 access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},
 data:{outcome:'Unavailable',document:null}});
const readonlyLines=Array.from({length:51},(_,index)=>({
 lineId:'QA-READONLY-LINE-'+String(index+1).padStart(3,'0')+'-'+(index===0?'L'.repeat(96):'SYNTHETIC'),
 itemId:'QA-READONLY-ITEM-'+String(index+1).padStart(3,'0')+'-'+(index===0||index===50?'X'.repeat(112):'SYNTHETIC'),
 setQuantityByDocument:index===50?'1234567890123456789012345678.0001':'9999999999999999999999999999.9999',
 barrelQuantityByDocument:index===50?'0.0000':null,
 setQuantityByReal:index===50?null:'-1234567890123456789012345678.0001',
 barrelQuantityByReal:index===50?'-0.0001':'0.0000'}));
const orderRow=index=>({documentId:'QA-ORDER-'+String(index).padStart(3,'0'),documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:999,statusName:null,isLocked:false});
const orderPages=()=>[Array.from({length:12},(_,index)=>orderRow(index+1)),Array.from({length:3},(_,index)=>orderRow(index+13))];
const readonlyProjection=(documentId,page=1)=>({document:{documentId,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:null,isLocked:null},
 purchaseOrderLines:[],inboundRequestLines:structuredClone(readonlyLines.slice((page-1)*50,page*50)),page,pageSize:50,hasMore:page===1});

test('I42 actual shared components render one safe semantic surface without a browser',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),{createElement:h,createRef}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 await mkdir(output,{recursive:true});const file=path.join(output,'i42-shared-components.mjs');
 await build({absWorkingDir:app,stdin:{contents:'export {ErpGrid} from "./components/erp/grid"; export {RequestListTable,RequestListToolbar,RequestSearch,RequestBranch,RequestPagination} from "./components/erp/request-list-shell"; export {RequestSelect,RequestStatus} from "./components/erp/request-presentation"; export {ServerQueryControls} from "./components/erp/query-controls";',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning'});
 const {ErpGrid,RequestListTable,RequestListToolbar,RequestSearch,RequestBranch,RequestPagination,RequestSelect,RequestStatus,ServerQueryControls}=await import(pathToFileURL(file).href);
 const exact='1234567890123456789012345678.0001',ref=createRef(),calls=[];
 const rows=[{id:'QA-SSR-001',cells:['<script>synthetic</script>',exact,h(RequestStatus,{value:null})],action:'Mở',actionLabel:'Mở QA-SSR-001',buttonRef:ref,onOpen:()=>calls.push('open-1')},{id:'QA-SSR-002',cells:['QA-SSR-002',null,h(RequestStatus,{value:999,statusName:'<img src=x onerror=synthetic>'})],action:'Mở',actionLabel:'Mở QA-SSR-002',buttonRef:createRef(),onOpen:()=>calls.push('open-2')}];
 const html=renderToStaticMarkup(h(RequestListTable,{label:'SSR request adapter',columns:[{id:'identity',label:'Mã kiểm thử'},{id:'amount',label:'Số lượng'},{id:'status',label:'Trạng thái'}],rows}));
 assert.equal((html.match(/<table\b/g)??[]).length,1);assert.match(html,/role="grid"/);assert.match(html,/data-shared-grid="true"/);assert.equal((html.match(/data-grid-row=/g)??[]).length,2);
 for(const row of rows)assert.equal((html.match(new RegExp('aria-label="'+row.actionLabel+'"','g'))??[]).length,1,'Each supplied request has one exact Open action');
 assert.doesNotMatch(html,/mobile-document-list|role="checkbox"/);assert.match(html,/Tùy chỉnh bảng/);assert.match(html,/&lt;script&gt;synthetic&lt;\/script&gt;/);assert.match(html,/&lt;img src=x onerror=synthetic&gt;/);assert.doesNotMatch(html,/<script|<img/);assert.ok(html.includes(exact));assert.match(html,/Chưa có trạng thái/);assert.deepEqual(calls,[]);
 const controls=renderToStaticMarkup(h(RequestListToolbar,{onSubmit:()=>calls.push('submit')},h(RequestSearch,{label:'Tìm kiểm thử',placeholder:'Tìm…',value:'QA',onChange:()=>{},inputRef:createRef(),maxLength:50,shortcut:'Ctrl F'}),h(RequestBranch,{label:'Chi nhánh kiểm thử',value:'QA-BRANCH',branches:['QA-BRANCH'],onChange:()=>{}}),h(RequestSelect,{name:'native-contract',disabled:true,'aria-label':'Native contract',value:'one',onChange:()=>{},ref:createRef()},h('option',{value:'one'},'Một'))));
 assert.match(controls,/class="request-list-toolbar"/);assert.match(controls,/<input[^>]*aria-label="Tìm kiểm thử"[^>]*maxLength="50"/);assert.equal((controls.match(/<select\b/g)??[]).length,2);assert.match(controls,/<select[^>]*name="native-contract"[^>]*disabled=""/);assert.match(controls,/<option value="QA-BRANCH" selected="">QA-BRANCH<\/option>/);assert.doesNotMatch(controls,/role="combobox"|data-slot="select-trigger"/);
 const pager=renderToStaticMarkup(h(RequestPagination,{label:'Phân trang kiểm thử',page:2,previousDisabled:false,nextDisabled:true,onPrevious:()=>{},onNext:()=>{},previousLabel:'Trang trước',nextLabel:'Trang sau'}));assert.match(pager,/<nav[^>]*aria-label="Phân trang kiểm thử"/);assert.match(pager,/request-panel-footer/);assert.match(pager,/request-list-pagination/);assert.match(pager,/Trang 2/);assert.match(pager,/<button[^>]*aria-label="Trang sau"[^>]*disabled=""/);
 const contextualPager=renderToStaticMarkup(h(RequestPagination,{label:"Phân trang ngữ cảnh",page:1,previousDisabled:true,nextDisabled:false,onPrevious:()=>{},onNext:()=>{},nextLabel:"Chứng từ kế tiếp"}));assert.match(contextualPager,/aria-label="Trang sau — Chứng từ kế tiếp"/);
 const advanced=renderToStaticMarkup(h(ErpGrid,{rows:[{id:'QA-GRID-001',amount:exact}],columns:[{id:'id',label:'Identity',width:200,required:true},{id:'amount',label:'Amount',width:160}],rowId:row=>row.id,renderCell:(row,id)=>row[id],rowAction:row=>({label:'Open',accessibleLabel:'Open '+row.id}),onOpen:()=>{},schemaVersion:'ssr-v1',scopeKey:'ssr-scope',compact:false,label:'SSR advanced grid'}));assert.match(advanced,/role="grid"/);assert.match(advanced,/data-compact="false"/);assert.match(advanced,/Tùy chỉnh bảng/);assert.match(advanced,/Chọn tất cả dòng trên trang này/);assert.match(advanced,/role="separator"/);assert.ok(advanced.includes(exact));assert.equal((advanced.match(/aria-label="Open QA-GRID-001"/g)??[]).length,1);
 const query=renderToStaticMarkup(h(ServerQueryControls,{fields:[],sortFields:[],groups:[],value:{filters:[],sort:[]},busy:false,onApply:()=>calls.push('query')}));assert.match(query,/Lọc &amp; sắp xếp/);assert.deepEqual(calls,[]);
 // SSR can verify accepted public props and safe markup; live focus/ref attachment,
 // responsive geometry and query edits remain browser-only assertions below.
});

test('I43 actual selection-focus hook keeps modal focus bounded without bypassing read visibility (DOM model)',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),React=require('react'),{act,create}=require('react-test-renderer');
 await mkdir(output,{recursive:true});const file=path.join(output,'selection-focus-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['components/erp/request-selection-focus.ts'],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {useRequestSelectionFocus}=await import(pathToFileURL(file).href);
 const names=['document','window','Node','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const events=()=>{const handlers=new Map();return {addEventListener(name,fn){const set=handlers.get(name)??new Set();set.add(fn);handlers.set(name,set);},removeEventListener(name,fn){handlers.get(name)?.delete(fn);},emit(name,event){for(const fn of [...handlers.get(name)??[]])fn(event);}};};
 const document={...events(),hidden:false,activeElement:null,body:null,querySelector:()=>guard};
 const window=events(),frames=new Map(),focusCalls=[];let frameId=0,guard=null,renderer,api;
 class Node {
  constructor(id,parentElement=null){Object.assign(this,{id,parentElement,isConnected:true,hidden:false,inert:false,ariaHidden:false,visibility:'visible',scrollTop:0,scrollLeft:0,tagName:'DIV',role:null,className:''});}
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
  closest(selector){if(selector==='.request-detail-dialog[role="dialog"]'){if(this.role==='dialog'&&this.className==='request-detail-dialog')return this;}else if(this.hidden||this.inert||this.ariaHidden)return this;return this.parentElement?.closest(selector)??null;}
  matches(){return ['INPUT','TEXTAREA','SELECT'].includes(this.tagName);}
  getClientRects(){return this.hidden?[]:[{}];}
  focus(options){focusCalls.push({id:this.id,options});document.activeElement=this;document.emit('focusin',{isTrusted:true,target:this});}
 }
 const body=new Node('body'),scroller=new Node('scroller',body),row=new Node('row',scroller),list=new Node('list',scroller),dialog=new Node('owned-dialog',body),region=new Node('read-proved-region',dialog),later=new Node('later-modal-control',dialog),higher=new Node('higher-dialog',body),higherInput=new Node('higher-dialog-input',higher);
 dialog.role=higher.role='dialog';dialog.className='request-detail-dialog';higherInput.tagName='INPUT';document.body=body;document.activeElement=row;
 const owner={};let options={owner,selected:null,listKey:'list-A',openReady:false,openFailed:false,listReady:true,listFailed:false};
 function Harness({value}){api=useRequestSelectionFocus(value);return null;}
 const flush=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();};
 const update=async patch=>{options={...options,...patch};await act(async()=>{const value=React.createElement(Harness,{value:options});if(renderer)renderer.update(value);else renderer=create(value);});};
 const reset=async()=>{api.cancel();guard=null;document.hidden=false;region.hidden=region.inert=region.ariaHidden=dialog.hidden=false;region.visibility=dialog.visibility='visible';region.parentElement=dialog;await update({owner,selected:null,listKey:'list-A',openReady:false,openFailed:false});api.detail(region);api.list(list);api.row('DOC-A',row);focusCalls.length=0;document.activeElement=row;};
 const open=async()=>{api.open('DOC-A');await update({selected:'DOC-A',openReady:true});flush();};
 try{
  Object.assign(globalThis,{document,window,Node,getComputedStyle:node=>({visibility:node.visibility}),requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),IS_REACT_ACT_ENVIRONMENT:true});
  await update({});await reset();scroller.scrollTop=740;dialog.scrollTop=23;await open();
  assert.deepEqual(focusCalls,[{id:'owned-dialog',options:{preventScroll:true}}]);assert.equal(scroller.scrollTop,740);assert.equal(dialog.scrollTop,23,'Open never scrolls either owner');
  api.open('DOC-A');flush();assert.deepEqual(focusCalls.map(call=>call.id),['owned-dialog','owned-dialog'],'Repeated Open targets the bounded current owned frame, never its potentially huge region');
  scroller.scrollTop=991;api.close();await update({selected:null});flush();assert.equal(focusCalls.at(-1).id,'row');assert.equal(scroller.scrollTop,740,'Close still restores the original row scroll');
  await reset();region.parentElement=body;await open();assert.deepEqual(focusCalls,[{id:'read-proved-region',options:{preventScroll:true}}],'Non-modal selection keeps the prior exact target');
  for(const field of ['hidden','inert','ariaHidden']){await reset();region[field]=true;await open();assert.deepEqual(focusCalls,[],'A visible frame cannot bypass '+field+' on its original read-proved region');}
  await reset();region.visibility='hidden';await open();assert.deepEqual(focusCalls,[],'Hidden computed region visibility also fences the frame');
  await reset();dialog.visibility='hidden';await open();assert.deepEqual(focusCalls,[],'The chosen frame must independently remain visible');
  for(const patch of [{owner:null},{openFailed:true},{listKey:'list-B'}]){await reset();api.open('DOC-A');await update({selected:'DOC-A',openReady:true,...patch});flush();assert.deepEqual(focusCalls,[],'Authority, failed read and list identity retire pending focus');}
  await reset();api.open('DOC-A');await update({selected:'DOC-A'});flush();assert.deepEqual(focusCalls,[],'Selection alone cannot focus before full read readiness');await update({openReady:true});flush();assert.equal(focusCalls[0].id,'owned-dialog');
  for(const target of [later,higherInput]){await reset();api.open('DOC-A');await update({selected:'DOC-A'});target.focus({preventScroll:true});focusCalls.length=0;await update({openReady:true});flush();assert.deepEqual(focusCalls,[],'A later owned or higher-modal focus retires the old Open ticket');assert.strictEqual(document.activeElement,target);}
  for(const event of ['keydown','blur','visibilitychange']){await reset();api.open('DOC-A');if(event==='blur')window.emit(event,{target:window});else{if(event==='visibilitychange')document.hidden=true;document.emit(event,{isTrusted:true});}await update({selected:'DOC-A',openReady:true});flush();assert.deepEqual(focusCalls,[],event+' suppresses stale focus');}
  await reset();guard=new Node('guard',body);api.open('DOC-A');await update({selected:'DOC-A',openReady:true});flush();assert.deepEqual(focusCalls,[],'A captured mounted guard retains focus ownership');guard.isConnected=false;flush();assert.deepEqual(focusCalls,[],'Wait one frame after the guard unmounts');flush();assert.equal(focusCalls[0].id,'owned-dialog');
  await reset();api.open('DOC-A');await update({selected:'DOC-A',openReady:true});await act(async()=>renderer.unmount());renderer=null;flush();assert.deepEqual(focusCalls,[],'An unmounted host cannot restore focus');
  await writeFile(path.join(output,'selection-focus-dom-model.json'),JSON.stringify({status:'passed',actualProductionHook:true,browserExecuted:false,dom:'explicit doubles',cases:['bounded owned frame','repeat Open','nonmodal fallback','no Open scroll','Close row scroll restoration','hidden/inert/aria-hidden original region','hidden original/target visibility','authority/read/list gates','later modal focus','keyboard/blur/visibility cancellation','captured guard ownership','unmount']},null,2));
 }finally{if(renderer)await act(async()=>renderer.unmount());for(const [name,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});

test('I48 actual reference retry and continuation actions retain shared 44px button contract',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),React=require('react'),{act,create}=require('react-test-renderer');
 await mkdir(output,{recursive:true});const file=path.join(output,'reference-actions-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['components/erp/purchase-reference-details.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning'});
 const {PurchaseReferenceDetails}=await import(pathToFileURL(file).href),savedFetch=globalThis.fetch,savedAct=globalThis.IS_REACT_ACT_ENVIRONMENT;
 const evidence=[];let renderer;
 try{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  for(const mode of ['retry','continue']){
   const calls=[];globalThis.fetch=async(url,init)=>{const query=Object.fromEntries(new URL(url,'http://synthetic.invalid').searchParams);calls.push({query,method:init.method??'GET'});return mode==='retry'?Response.json({code:'backend_unavailable'},{status:503}):Response.json({scopeKey:scope,data:{available:true,reason:null,items:[],page:Number(query.page),hasMore:true}});};
   await act(async()=>{renderer=create(React.createElement(PurchaseReferenceDetails,{scopeKey:scope,readIdentity:'selection-A',authorityKey:'authority-A',documentId:'QA-PURCHASE-001',allowed:true,presentationAllowed:true,purposeId:1,currencyId:'VND',documentRateExchange:1}));await new Promise(resolve=>setImmediate(resolve));});
   const buttons=renderer.root.findAllByType('button');assert.equal(buttons.length,2,'Both purpose and currency expose their explicit action');
   for(const button of buttons){assert.match(button.props.className,/\brequest-button\b/);assert.match(button.props.className,/\bmin-h-11\b/);assert.match(button.props.className,/\bmin-w-11\b/);assert.match(button.props.className,/\bmax-w-full\b/);assert.match(button.props.className,/\bwhitespace-normal\b/);assert.match(button.props.className,/focus-visible:/);assert.equal(button.props.type,'button');}
   assert.equal(calls.length,2);await act(async()=>{buttons[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));});assert.equal(calls.length,3,'Shared control preserves its exact explicit lookup action');assert.equal(calls.at(-1).query.kind,'purposes');assert.equal(calls.at(-1).query.page,mode==='continue'?'2':'1');assert.ok(calls.every(call=>call.method==='GET'));
   evidence.push({mode,controls:2,calls,shared44pxClass:true,browserExecuted:false});await act(async()=>renderer.unmount());renderer=null;
  }
  await writeFile(path.join(output,'reference-actions-contract.json'),JSON.stringify(evidence,null,2));
 }finally{if(renderer)await act(async()=>renderer.unmount());globalThis.fetch=savedFetch;if(savedAct===undefined)delete globalThis.IS_REACT_ACT_ENVIRONMENT;else globalThis.IS_REACT_ACT_ENVIRONMENT=savedAct;}
});

// Test-only observation of the native focus method. Preserve its receiver,
// options, result and exceptions; count repeated calls on an already active frame.
function installDetailFocusObserver(){
 const native=HTMLElement.prototype.focus;window.requestDetailFocusCalls=[];
 HTMLElement.prototype.focus=function(...args){
  const frame=this.matches('.request-detail-dialog[role="dialog"]');
  if(frame||this.matches('[aria-label="Phiếu mua hàng hiện có"],[role="region"][aria-label="Phiếu nhập hàng đã chọn"]')){
   const heading=frame?document.getElementById(this.getAttribute('aria-labelledby')):null;
   // The title text and current record number occupy separate nodes in the shared heading.
   window.requestDetailFocusCalls.push({kind:frame?'frame':'region',label:frame?heading?.firstChild?.textContent:this.getAttribute('aria-label'),documentNumber:frame?heading?.querySelector('.record-document-number')?.textContent??null:null});
  }
  return Reflect.apply(native,this,args);
 };
}
test('detail focus observer preserves native behavior and counts repeated frame calls separately from regions',()=>{
 const require=createRequire(import.meta.url),{runInNewContext}=require('node:vm'),nativeCalls=[],token={},error=Error('synthetic-native-error'),headings=new Map();
 class HTMLElement{
  constructor(frame,label='Phiếu nhập hàng đã chọn',documentNumber=null){this.frame=frame;this.label=label;this.titleId='title-'+headings.size;headings.set(this.titleId,{textContent:label+(documentNumber??''),firstChild:{textContent:label},querySelector:()=>documentNumber===null?null:{textContent:documentNumber}});}
  matches(selector){return selector.startsWith('.request-detail-dialog')?this.frame:!this.frame&&this.label==='Phiếu nhập hàng đã chọn';}
  getAttribute(name){return name==='aria-labelledby'?this.titleId:this.label;}
  focus(...args){nativeCalls.push({receiver:this,args});if(args[0]?.fail)throw error;return token;}
 }
 const window={},document={getElementById:id=>headings.get(id)};
 runInNewContext(`(${installDetailFocusObserver.toString()})();`,{window,document,HTMLElement,Reflect});
 const frame=new HTMLElement(true),region=new HTMLElement(false,'Phiếu nhập hàng đã chọn'),other=new HTMLElement(false,'other'),options={preventScroll:true};
 assert.strictEqual(frame.focus(options),token);assert.strictEqual(frame.focus(options),token);assert.strictEqual(region.focus(options),token);assert.strictEqual(other.focus(options),token);
 assert.deepEqual(nativeCalls.map(call=>call.receiver),[frame,frame,region,other]);assert.ok(nativeCalls.every(call=>call.args.length===1&&call.args[0]===options));
 assert.deepEqual(JSON.parse(JSON.stringify(window.requestDetailFocusCalls)),[{kind:'frame',label:'Phiếu nhập hàng đã chọn',documentNumber:null},{kind:'frame',label:'Phiếu nhập hàng đã chọn',documentNumber:null},{kind:'region',label:'Phiếu nhập hàng đã chọn',documentNumber:null}]);
 assert.throws(()=>other.focus({fail:true}),caught=>caught===error);assert.equal(nativeCalls.length,5);assert.equal(window.requestDetailFocusCalls.length,3);
 for(const label of ['Phiếu nhập hàng đã chọn','Phiếu mua hàng hiện có'])for(const documentNumber of [null,'DOC-A','DOC-B'])new HTMLElement(true,label,documentNumber).focus(options);
 assert.deepEqual(JSON.parse(JSON.stringify(window.requestDetailFocusCalls.slice(-6))),['Phiếu nhập hàng đã chọn','Phiếu mua hàng hiện có'].flatMap(label=>[null,'DOC-A','DOC-B'].map(documentNumber=>({kind:'frame',label,documentNumber}))), 'Both exact dialog titles retain separate changing document identities');
});

let compiledPresentation;
async function compilePresentation(){
 if(compiledPresentation)return compiledPresentation;
 compiledPresentation=(async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 await mkdir(output,{recursive:true});
 const contractFile=path.join(output,'inbound-fixture-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['lib/erp/inbound-draft.ts'],outfile:contractFile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {observedView}=await import(pathToFileURL(contractFile).href);
 assert.deepEqual(observedView({outcome:'Observed',document:inbound},inbound.documentId),inbound,'Synthetic inbound data must satisfy the production read contract before browser execution');
 const notificationFile=path.join(output,'notification-contract.mjs');
 await build({absWorkingDir:app,entryPoints:['components/erp/request-notifications.ts'],outfile:notificationFile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 const {createRequestNotifications}=await import(pathToFileURL(notificationFile).href);
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';import {PurchaseRequestScreen} from './components/erp/purchase-request-screen';import {InboundRequestScreen} from './components/erp/inbound-request-screen';import{RequestError}from'./components/erp/request-presentation';import{ApiError}from'./lib/erp/api';import{MobileInboundRequest}from'./components/erp/mobile-inbound-request';import{NavigationGuardProvider,useNavigationGuard}from'./components/erp/navigation-guard';import{Toaster}from'sonner';import{ServerQueryControls}from'./components/erp/query-controls';import{ErpGrid}from'./components/erp/grid';
 function installReadonlyClockDiagnostics(){
  if(!window.i33ObserveClock)return;
  const nativeSetInterval=window.setInterval,nativeClearInterval=window.clearInterval,active=new Map(),events=[];let serial=0,droppedEvents=0;
  const initialClock=window.i33ClockOrigin,clock=()=>({timerMode:window.i33FakeClock?'fake':'real',browserTime:Date.now(),clockDelta:Date.now()-initialClock,performanceTime:performance.now(),visibility:['visible','hidden','prerender'].includes(document.visibilityState)?document.visibilityState:'other',hidden:document.hidden===true});
  const observe=event=>{try{events.push({...event,...clock()});if(events.length>128){events.shift();droppedEvents++;}}catch{}};
  window.setInterval=function(...args){
   const delegated=[...args],observed=args[1]===60000,callback=args[0],timer=observed?{id:++serial,armedAt:Date.now(),lastFireAt:null,fires:0,nominalDue:Date.now()+60000}:null;
   if(timer&&typeof callback==='function')delegated[0]=function(...callbackArgs){
    try{timer.fires++;timer.lastFireAt=Date.now();observe({type:'interval-fire',timer:timer.id,fires:timer.fires,previousNominalDue:timer.nominalDue});timer.nominalDue=timer.lastFireAt+60000;}catch{}
    return Reflect.apply(callback,this,callbackArgs);
   };
   const handle=Reflect.apply(nativeSetInterval,this,delegated);
   if(timer){try{active.set(handle,timer);observe({type:'interval-arm',timer:timer.id,delay:60000,callbackType:typeof callback==='function'?'function':'other',nominalDue:timer.nominalDue});}catch{}}
   return handle;
  };
  window.clearInterval=function(...args){
   const result=Reflect.apply(nativeClearInterval,this,args);
   try{const timer=active.get(args[0]);if(timer){observe({type:'interval-clear',timer:timer.id,fires:timer.fires,nominalDue:timer.nominalDue});active.delete(args[0]);}}catch{}
   return result;
  };
  for(const type of ['focus','blur'])window.addEventListener(type,event=>{if(event.target===window)observe({type:'window-'+type,trusted:event.isTrusted===true});});
  document.addEventListener('visibilitychange',event=>observe({type:'document-visibilitychange',trusted:event.isTrusted===true}));
  window.i33ClockDiagnostics={snapshot:()=>({...clock(),initialClock,activeTimerCount:active.size,activeTimers:[...active.values()].slice(-16).map(timer=>({...timer})),events:events.map(event=>({...event})),droppedEvents})};
 }
 installReadonlyClockDiagnostics();
 window.i30SaveDispatches=[];window.i30ControlDispatches=[];window.i33ReadDispatches=[];window.i33WorkspaceDispatches=[];window.i33WorkspaceDispatchState={total:0,settled:0,pending:0};const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{const pathname=typeof input==='string'?new URL(input,location.href).pathname:'';if(init?.method==='POST'){if(pathname==='/api/erp/api/inbound-requests/draft/save')window.i30SaveDispatches.push(String(init.body));if(pathname.startsWith('/i30/network-control/'))window.i30ControlDispatches.push({kind:pathname.split('/').at(-1),body:String(init.body)});}const pending=nativeFetch(input,init);if(window.i33ObserveClock&&pathname==='/api/erp/api/workspace'){const event={startedAt:Date.now(),settled:false,httpStatus:null,fetchState:'pending'};window.i33WorkspaceDispatchState.total++;window.i33WorkspaceDispatchState.pending++;window.i33WorkspaceDispatches.push(event);if(window.i33WorkspaceDispatches.length>128)window.i33WorkspaceDispatches.shift();void pending.then(async response=>{event.httpStatus=response.status;event.fetchState='fulfilled';try{await response.clone().arrayBuffer();}finally{event.settled=true;event.settledAt=Date.now();window.i33WorkspaceDispatchState.settled++;window.i33WorkspaceDispatchState.pending--;}},()=>{event.fetchState='rejected';event.settled=true;event.settledAt=Date.now();window.i33WorkspaceDispatchState.settled++;window.i33WorkspaceDispatchState.pending--;}).catch(()=>{});}if(['/api/erp/api/inbound-requests/draft','/api/erp/api/documents/inbound-requests/detail'].includes(pathname)){const event={path:pathname,settled:false,hasCommandScope:new Headers(init?.headers).has('X-Inbound-Scope')};if(window.i33ObserveClock)Object.assign(event,{startedAt:Date.now(),httpStatus:null,fetchState:'pending'});window.i33ReadDispatches.push(event);void pending.then(async response=>{if(window.i33ObserveClock)Object.assign(event,{httpStatus:response.status,fetchState:'fulfilled'});try{await response.clone().arrayBuffer();}finally{event.settled=true;if(window.i33ObserveClock)event.settledAt=Date.now();}},()=>{event.settled=true;if(window.i33ObserveClock)Object.assign(event,{fetchState:'rejected',settledAt:Date.now()});}).catch(()=>{});}return pending;};
 window.i30Notices=[];const seenNotices=new WeakSet();new MutationObserver(()=>{for(const node of document.querySelectorAll('[data-sonner-toast]'))if(!seenNotices.has(node)){seenNotices.add(node);window.i30Notices.push({type:node.getAttribute('data-type'),text:node.textContent});}}).observe(document.documentElement,{childList:true,subtree:true});
 // Separate component contract fixture, never a replacement for the mounted HTTP bridge.
 const params=new URLSearchParams(location.search),terminalOutcome=params.get('component-outcome');window.i30ComponentCalls=[];window.i30ComponentLeft=false;
 const componentDocument=${JSON.stringify(inbound)},componentAccess={scopeKey:'${scope}',canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576};
 const componentAdapter={read:async()=>({outcome:'Observed',document:structuredClone(componentDocument)}),execute:async command=>{window.i30ComponentCalls.push({body:JSON.stringify(command),frozen:Object.isFrozen(command)&&Object.isFrozen(command.header)});return {outcome:terminalOutcome,receipt:null,code:null};},reconcile:async()=>({outcome:'OutcomeUnknown',receipt:null,code:null})};
 function ComponentLeave(){const guard=useNavigationGuard();return <button type='button' onClick={()=>guard.request(()=>{window.i30ComponentLeft=true;})}>Rời kiểm thử thành phần</button>;}
 function TerminalComponentFixture(){return <NavigationGuardProvider><main className='workspace-content'><h1>Kiểm thử thành phần với adapter tổng hợp</h1><p>Không đi qua Workspace hoặc API. Phản hồi xác định chỉ thuộc hợp đồng thành phần.</p><MobileInboundRequest documentId={componentDocument.documentId} access={componentAccess} adapter={componentAdapter}/><ComponentLeave/></main><Toaster position='top-center' duration={3000} offset='88px' mobileOffset={{top:'76px'}}/></NavigationGuardProvider>;}
 // Real generic component with synthetic definitions; deliberately not wired to
 // Workspace, a list query, or any backend capability claim.
 window.i42QueryApplied=[];
 const queryFields=[{id:'status',label:'Trạng thái kiểm thử',kind:'enum',operators:['eq'],options:[{id:'draft',label:'Nháp kiểm thử'},{id:'sent',label:'Đã gửi kiểm thử'}]},{id:'date',label:'Ngày kiểm thử',kind:'date',operators:['gte','lte']},{id:'amount',label:'Số lượng kiểm thử',kind:'decimal',operators:['gte','lte','eq']}];
 function QueryControlsComponentFixture(){const[value,setValue]=React.useState({filters:[],sort:[]});return <main data-testid='i42-query-fixture' className='workspace-content'><h1>ServerQueryControls component contract</h1><p>Isolated component with synthetic definitions. Not connected to Workspace or the ERP API.</p><ServerQueryControls fields={queryFields} sortFields={[{id:'date',label:'Ngày kiểm thử'},{id:'amount',label:'Số lượng kiểm thử'}]} groups={[{id:'branch',label:'Chi nhánh kiểm thử'}]} value={value} busy={false} onApply={next=>{window.i42QueryApplied.push(structuredClone(next));setValue(next);}}/></main>;}
 const wideColumns=[{id:'identity',label:'Identity',width:200,required:true},...Array.from({length:16},(_,index)=>({id:'c'+String(index+1).padStart(2,'0'),label:'Field '+String(index+1).padStart(2,'0'),width:160}))],wideRows=[{id:'QA-WIDE-001'},{id:'QA-WIDE-002'}];window.i42WideOpens=[];
 function WideGridComponentFixture(){return <main data-testid='i42-wide-grid-fixture' className='workspace-content'><h1>Wide ErpGrid component contract</h1><p>Isolated virtual-column fixture with synthetic rows. Not connected to Workspace or the ERP API.</p><section style={{width:880,maxWidth:'100%'}}><ErpGrid rows={wideRows} columns={wideColumns} rowId={row=>row.id} renderCell={(row,id)=>id==='identity'?row.id:row.id+' '+id} rowAction={row=>({label:'Open',accessibleLabel:'Open '+row.id})} onOpen={row=>window.i42WideOpens.push(row.id)} schemaVersion='wide-fixture-v1' scopeKey='wide-fixture' compact={false} label='Wide column component contract'/></section></main>;}
 // I50 R1 synthetic host presentation loss retains genuine editor adapters/grants.
 const hostWorkspace={session:{displayName:'SYNTHETIC',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:1,absoluteExpiresAt:'2099-01-01T00:00:00Z',capabilities:['purchase-requests.read','inbound-requests.read']},branchIds:['QA-BRANCH'],sessionScope:'${session}',readScope:'${scope}',navigation:[]};
 const hostDenied=error=>{throw error;},hostVerify=async()=>{},hostLogin=()=>{};
 function PresentationHostFixture(){const[allowed,setAllowed]=React.useState(true);window.i50Presentation=setAllowed;const kind=params.get('screen');return <NavigationGuardProvider authority={{lifecycleKey:'synthetic-presentation',presentationAllowed:allowed}}><main className='workspace-content'>{kind==='purchase-requests'?<PurchaseRequestScreen workspace={hostWorkspace} loginBoundary={1} sessionEnded={false} onVerifyWorkspace={hostVerify} onDenied={hostDenied} onLogin={hostLogin} presentationAllowed={allowed}/>:<InboundRequestScreen workspace={hostWorkspace} loginKey='synthetic-presentation' historyOwner='workspace' presentationAllowed={allowed} onDenied={hostDenied}/>}</main></NavigationGuardProvider>;}
 createRoot(document.getElementById('root')).render(params.has('i50-presentation')?<PresentationHostFixture/>:params.has('wide-grid-component')?<WideGridComponentFixture/>:params.has('query-component')?<QueryControlsComponentFixture/>:params.has('diagnostics')?<RequestError error={new ApiError(503,'PRIVATE_SQL_SENTINEL','PRIVATE_COOKIE_SENTINEL')}/>:['Rejected','Conflict'].includes(terminalOutcome)?<TerminalComponentFixture/>:<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'app.js'),bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'i30-image'}));build.onLoad({filter:/.*/,namespace:'i30-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const cssSource=await readFile(path.join(app,'app/globals.css'),'utf8');
 const applicationCss=(await postcss([tailwind({base:app})]).process(cssSource,{from:path.join(app,'app/globals.css')})).css;
 assert.ok(!applicationCss.includes('@import "tailwindcss"'),'Application Tailwind must actually compile.');
 const javascript=built.outputFiles.find(file=>file.path.endsWith('.js'));
 const cssModules=built.outputFiles.filter(file=>file.path.endsWith('.css'));
 assert.ok(javascript?.contents.length,'Browser fixture must include emitted JavaScript.');
 assert.ok(cssModules.length>0&&cssModules.every(file=>file.contents.length>0),'Workspace auth CSS modules must be emitted, not replaced with empty CSS.');
 const css=applicationCss+'\n'+cssModules.map(file=>file.text).join('\n');
 assert.match(css,/min-height:\s*100dvh/,'The actual full-page auth gate styles are served with Tailwind.');
 const script=Buffer.from(javascript.contents),logo=await readFile(path.join(app,'public/medcom-logo.png'));
 return {script,logo,css,cssSource,createRequestNotifications,cssModules:cssModules.map(file=>({file:path.basename(file.path),sha256:sha(file.contents),bytes:file.contents.length}))};
 })();
 return compiledPresentation;
}
test('I30 actual Workspace presentation fixture compiles with Tailwind and CSS modules',async()=>{await compilePresentation();});
test('I50 compiled mobile cells override customizable desktop clipping without changing desktop density',async()=>{
 const require=createRequire(import.meta.url),postcss=require('postcss'),{css}=await compilePresentation(),root=postcss.parse(css),rules=[];
 root.walkRules(rule=>rules.push(rule));
 const exact=selector=>rules.filter(rule=>rule.selectors.includes(selector));
 const desktop=exact('.erp-grid[data-customizable=true] .shared-grid-table td');
 const mobile=exact('.erp-grid[data-customizable=true] .request-list-table td');
 assert.equal(desktop.length,1);assert.equal(mobile.length,1,'Mobile must match the customizable desktop selector specificity');
 const [d]=desktop,[m]=mobile;
 assert.equal(d.parent.type,'root');assert.equal(m.parent.type,'atrule');assert.equal(m.parent.name,'media');assert.match(m.parent.params,/^\(max-width:\s*767px\)$/);assert.equal(m.parent.parent.type,'root');
 // These exact selectors each contain two classes, one attribute and one tag.
 // Equal unlayered specificity makes the later mobile declarations win.
 assert.ok(rules.indexOf(m)>rules.indexOf(d));
 const declaration=(rule,name)=>{const matches=rule.nodes.filter(node=>node.type==='decl'&&node.prop===name);assert.equal(matches.length,1,name);return matches[0];};
 for(const [name,desktopValue,mobileValue] of [['white-space','nowrap','normal'],['overflow','hidden','visible']]){
  assert.equal(declaration(d,name).value,desktopValue);assert.equal(declaration(d,name).important,undefined);assert.equal(declaration(m,name).value,mobileValue);
 }
 assert.deepEqual(m.nodes.filter(node=>node.type==='decl').map(node=>node.prop).sort(),['overflow','white-space'],'The higher-specificity repair must not override hidden mobile cell display');
 const base=exact('.erp-grid .request-list-table td'),hidden=exact('.erp-grid .request-list-table .grid-select-cell');assert.equal(base.length,1);assert.equal(hidden.length,1);
 assert.strictEqual(base[0].parent,m.parent);assert.strictEqual(hidden[0].parent,m.parent);assert.deepEqual(base[0].selectors,['.erp-grid .request-list-table td']);assert.ok(hidden[0].selectors.includes('.erp-grid .request-list-table .grid-spacer'));
 // Hidden selection/spacer cells retain (0,3,0), above the unchanged base
 // display:block rule's (0,2,1); the narrow repair has no display declaration.
 assert.equal(declaration(base[0],'display').value,'block');assert.equal(declaration(hidden[0],'display').value,'none');
 assert.equal(declaration(d,'height').value,'var(--grid-row-height)');assert.equal(declaration(base[0],'height').value,'auto');assert.equal(declaration(base[0],'height').important,true);assert.equal(declaration(base[0],'overflow-wrap').value,'anywhere');
 // Compilation/cascade admission only; the unchanged native range geometry
 // assertion below still proves that every identifier character is readable.
});
test('I30 compiled application presentation at 320,360,390,1440',{timeout:240000},async t=>{
 const require=createRequire(import.meta.url),tools=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 let chromium;
 try{({chromium}=(tools?createRequire(path.join(path.resolve(tools),'package.json')):require)('playwright-core'));}
 catch{throw Error('I30 NOT_RUN: installed locked browser toolchain required; no skip or automatic install.');}
 const executable=process.env.MEDCOM_EDGE_PATH??process.env.I30_TEST_BROWSER??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'Installed Chromium/Edge is required.');
 const {script,logo,css,cssSource,cssModules,createRequestNotifications}=await compilePresentation();
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
 let model,serial=0,browser,context,page,origin,completed=false,fatal=null,clockPaused=false;const expectedCases=39;const errors=[],results=[],failures=[],captures=[],calls=[],transportEvidence=[],readonlyEvidence=[],commandGeometryEvidence=[],sharedGridEvidence=[],stickyToolbarEvidence=[],portalPresentationEvidence=[];
 const reset=(patch={})=>{model={serial:++serial,writable:false,empty:false,status:200,holdList:false,waiters:[],listResponses:0,listResponseHeaders:null,holdDetail:false,detailWaiters:[],detailStatus:200,draftEnvelope:null,draftNetwork:false,draftNetworkFailures:0,draftMalformed:false,draftResponses:0,afterWriteDraftEnvelope:null,holdProjection:false,projectionWaiters:[],projectionStatus:200,projectionKind:null,projectionResponses:0,unknown:false,workspaceReads:0,workspaceResponses:0,workspacePending:0,workspaceVersions:[],advanceAuthority:false,deniedLists:0,workspaceStatus:200,purchase:structuredClone(purchase),inbound:structuredClone(inbound),purchaseVersion:1,inboundVersion:1,effects:0,originals:new Map(),receipts:new Map(),writes:[],reconciles:[],control:{closed:[],bff:[]},holdCommands:false,commandWaiters:[],commandResponses:0,rejected:false,conflict:false,malformed:false,...patch};calls.length=0;};
 const workspace=()=>({session:{displayName:'SYNTHETIC USER',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:model.advanceAuthority?model.workspaceReads:1,idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString(),capabilities:model.workspaceCapabilities??['purchase-requests.read','inbound-requests.read','purchase-orders.read']},branchIds:['QA-BRANCH'],navigation:['purchase-requests','inbound-requests','purchase-orders'].map(id=>({id,label:id,href:'/?screen='+id}))});
 const send=(res,status,data,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 const readHeaders={'X-Medcom-Session-Scope':session,'X-Medcom-Read-Scope':scope};
 const server=createServer(async(req,res)=>{
  const m=model;try{
   const url=new URL(req.url,origin??'http://localhost');
   if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
   if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
   if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
   if(['/i30/network-control/closed','/i30/network-control/bff'].includes(url.pathname)){
    const parts=[];for await(const part of req)parts.push(part);const digest=sha(Buffer.concat(parts));const kind=url.pathname.endsWith('/closed')?'closed':'bff';m.control[kind].push(digest);
    if(kind==='closed'){res.destroy();return;}return send(res,503,{code:'backend_unavailable'});
   }
   if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
   const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method,documentId:url.searchParams.get('documentId'),page:url.searchParams.get('page'),pageSize:url.searchParams.get('pageSize'),search:url.searchParams.get('search'),branchId:url.searchParams.get('branchId')});
   if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
   if(route==='/api/workspace'){
    m.workspaceReads++;m.workspacePending++;let settled=false;
    const settle=()=>{if(!settled){settled=true;m.workspacePending--;}};res.once('finish',settle);res.once('close',settle);if(res.destroyed||res.writableFinished)settle();
    const current=workspace();m.workspaceVersions.push(current.session.authorityVersion);m.workspaceResponses++;return send(res,m.workspaceStatus,m.workspaceStatus===200?current:{code:m.workspaceStatus===401?'authentication_required':'backend_unavailable'},readHeaders);
   }
   if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
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
  }catch(error){errors.push('Synthetic server failure: '+String(error));send(res,500,{code:'request_failed'});}
 });
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const scenarioClock=()=>page.evaluate(()=>({wall:Date.now(),ticks:performance.now(),timers:window.i33ClockDiagnostics.snapshot().activeTimers.map(timer=>({id:timer.id,fires:timer.fires,nominalDue:timer.nominalDue}))}));
 // Pinned Playwright1.56.1 can overlap its live real-time pump with a manual
 // advance. Keep only the existing clock scenarios paused after initial mount.
 // https://playwright.dev/docs/clock#consistent-time-and-timers
 const nativeFrameDrain=async()=>{await page.evaluate(()=>{window.i33NativeDrainFrames=0;});await page.waitForFunction(()=>++window.i33NativeDrainFrames===3);};
 async function pauseScenarioClock(){
  await page.getByTestId('inbound-request-host').waitFor();await page.waitForFunction(()=>window.i33ClockDiagnostics.snapshot().activeTimerCount===1);
  // Workspace/LIST GETs in api.ts have no client timeout. The inbound API's
  // 30000ms timeout is not armed until a selected document starts a draft read.
  assert.deepEqual(await page.evaluate(()=>({reads:window.i33ReadDispatches.length,selected:document.querySelectorAll('[data-testid=inbound-request-host] button[aria-label^="Mở phiếu "][aria-pressed=true]').length})),{reads:0,selected:0});
  const target=await page.evaluate(()=>window.i33ClockOrigin+30000),before=await scenarioClock();assert.ok(before.wall<target);assert.equal(before.timers[0].fires,0);assert.ok(target<before.timers[0].nominalDue);
  // Stop the automatic pump, drain any already-running native task, then set
  // the same fixed anchor once. This is a serial transition, never a retry.
  // waitForFunction uses Playwright's saved native RAF, not the paused page RAF.
  await page.clock.pauseAt(target);await nativeFrameDrain();await page.clock.pauseAt(target);
  const anchored=await scenarioClock();await nativeFrameDrain();assert.deepEqual(await scenarioClock(),anchored,'Paused clock stays stable through native frames before observations');assert.equal(anchored.wall,target);assert.deepEqual(anchored.timers,before.timers);
  clockPaused=true;readonlyEvidence.push({kind:'paused-clock-baseline',before,anchored,target});
 }
 async function advanceScenarioClock(ticks,intervalFires){
  assert.equal(clockPaused,true);const before=await scenarioClock();assert.equal(before.timers.length,1);
  // Keep jump semantics for poll/quiet steps: do not run a newly armed HTTP
  // timeout before real network IO settles. Paint alone needs both RAF ticks.
  if(ticks===32)await page.clock.runFor(ticks);else await page.clock.fastForward(ticks);const after=await scenarioClock();
  assert.deepEqual({wall:after.wall,ticks:after.ticks},{wall:before.wall+ticks,ticks:before.ticks+ticks},'Manual clock advance is exact and monotonic');
  assert.deepEqual(after.timers.map(timer=>({id:timer.id,fires:timer.fires})),before.timers.map(timer=>({id:timer.id,fires:timer.fires+intervalFires})),'Only the intended original60000ms interval fires');
  if(ticks!==32)readonlyEvidence.push({kind:'paused-clock-advance',milliseconds:ticks,intervalFires,before,after});
 }
 const paint=async()=>{
  if(!clockPaused)return page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>{window.i33PaintPromise=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await advanceScenarioClock(32,0);await page.evaluate(()=>window.i33PaintPromise);
 };
 const eventually=async predicate=>{const deadline=Date.now()+10000;while(!(await predicate())){t.signal.throwIfAborted();assert.ok(Date.now()<deadline,'Synthetic request did not reach expected state');await new Promise(resolve=>setTimeout(resolve,20));}};
 const release=()=>{model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());model.holdDetail=false;model.detailWaiters.splice(0).forEach(resolve=>resolve());model.holdCommands=false;model.commandWaiters.splice(0).forEach(resolve=>resolve());model.holdProjection=false;model.projectionWaiters.splice(0).forEach(resolve=>resolve());};
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
 async function start(width,screen,patch={},query=''){clockPaused=false;release();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900},locale:'vi-VN',serviceWorkers:'block'});page=await context.newPage();await page.addInitScript(installDetailFocusObserver);if(patch.installClock||patch.observeWorkspace){const clockTime=new Date();if(patch.installClock)await page.clock.install({time:clockTime});await page.addInitScript(({clockOrigin,fakeClock})=>{window.i33ObserveClock=true;window.i33ClockOrigin=clockOrigin;window.i33FakeClock=fakeClock;},{clockOrigin:clockTime.getTime(),fakeClock:!!patch.installClock});}page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(model.draftNetwork&&url.pathname==='/api/erp/api/inbound-requests/draft'){model.draftNetworkFailures++;return route.abort('failed');}return route.continue();});await page.goto(origin+'/?screen='+screen+query);if(patch.installClock)await pauseScenarioClock();}
 const host=screen=>screen==='purchase-requests'?page.getByRole('region',{name:'Danh sách đề nghị mua hàng',exact:true}):page.getByTestId('inbound-request-host');
 const detailDialog=screen=>page.getByRole('dialog',{name:screen==='purchase-requests'?/^Phiếu mua hàng hiện có/:/^Phiếu nhập hàng đã chọn/});
 // A modal legitimately blocks pointer access to background list/navigation.
 // Programmatic activation below challenges those existing guard entry points;
 // it is never presented as a user reaching through the dialog backdrop.
 const backgroundActivate=locator=>locator.evaluate(element=>element.click());
 async function focusedDetail(screen){
  const dialog=detailDialog(screen);await dialog.waitFor();
  await eventually(()=>dialog.evaluate(element=>element.contains(document.activeElement)&&!document.activeElement.matches('input,textarea,select,[contenteditable=true]')));
  await paint();const metrics=await dialog.evaluate(element=>{const box=element.getBoundingClientRect(),active=document.activeElement.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,activeTop:active.top,activeBottom:active.bottom};});
  assert.ok(metrics.left>=0&&metrics.right<=metrics.width&&metrics.top>=0&&metrics.bottom<=metrics.height,'Detail modal fits the current viewport: '+JSON.stringify(metrics));
  assert.ok(metrics.activeTop>=metrics.top&&metrics.activeBottom<=metrics.bottom,'Explicit Open focuses a visible non-input target inside the dialog: '+JSON.stringify(metrics));
 }

 async function layout(width,screen){await paint();const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:document.documentElement.scrollWidth<=innerWidth?[]:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+.5||r.left<-.5);}).slice(0,24).map(el=>({tag:el.tagName,className:typeof el.className==='string'?el.className:'',width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))}));assert.ok(overflow.scrollWidth<=overflow.width,'Page overflow at '+width+': '+JSON.stringify(overflow));
  const checks=await host(screen).locator('button:visible,input:not([type=checkbox]):visible,textarea:visible,select:visible,summary:visible').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,name:el.getAttribute('aria-label')??el.textContent?.trim().slice(0,100)??'',height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})));
  assert.ok(checks.length);assert.ok(checks.every(v=>v.height>=43.5),'Request touch targets must be at least 44px: '+JSON.stringify(checks));
  if(width<768)assert.ok(checks.filter(v=>['INPUT','TEXTAREA','SELECT'].includes(v.tag)).every(v=>v.font>=16),'Mobile input/textarea fonts must be 16px');
 }
 // I59 measures usable native text space, not just the outer control rectangle.
 // Canvas uses the control's computed font; no test-only presentation overrides.
 async function toolbarContentGeometry(toolbar,width,screen){
  const measured=await toolbar.evaluate(element=>{
   const rect=node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
   const visible=node=>{if(!node)return false;const box=rect(node),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0;};
   const content=node=>{const box=rect(node),style=getComputedStyle(node),left=box.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft),right=box.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight),canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const text=node.tagName==='SELECT'?node.selectedOptions[0]?.textContent??'':node.value;return {...box,contentLeft:left,contentRight:right,contentWidth:right-left,text,textWidth:context.measureText(text).width,font:parseFloat(style.fontSize),disabled:node.disabled};};
   const input=element.querySelector('.request-list-search input'),select=element.querySelector('.request-list-branch select'),refresh=element.querySelector('.request-list-refresh'),chevron=element.querySelector('.request-list-branch > svg:last-child'),searchIcon=element.querySelector('.request-list-search > svg'),badge=element.querySelector('.request-list-search > kbd'),refreshIcon=refresh.querySelector('svg');
   const pointUncovered=node=>{const box=rect(node),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return hit===node||node.contains(hit);};
   return {search:content(input),branch:content(select),refresh:{...rect(refresh),label:refresh.getAttribute('aria-label'),iconVisible:visible(refreshIcon),textVisible:visible(refresh.querySelector('.request-list-refresh-label')),uncovered:pointUncovered(refresh)},searchIcon:{...rect(searchIcon),visible:visible(searchIcon)},chevron:{...rect(chevron),visible:visible(chevron)},badgeVisible:visible(badge),badge:badge?rect(badge):null,searchUncovered:pointUncovered(input),branchUncovered:pointUncovered(select)};
  });
  const diagnostic=JSON.stringify({screen,width,...measured});
  for(const control of [measured.search,measured.branch,measured.refresh])assert.ok(control.height>=43.5&&control.width>=43.5,'Toolbar targets remain at least 44px in both dimensions: '+diagnostic);
  assert.equal(measured.refresh.label,'Làm mới');assert.equal(measured.refresh.iconVisible,true,'Every list uses the same visible refresh icon: '+diagnostic);
  assert.ok(measured.searchUncovered&&measured.branchUncovered&&measured.refresh.uncovered,'Toolbar input, branch and refresh remain reachable: '+diagnostic);
  assert.equal(measured.chevron.visible,true,'Native branch selection has a visible dropdown affordance: '+diagnostic);
  assert.ok(measured.branch.contentRight<=measured.chevron.left&&measured.chevron.right<=measured.branch.right,'Branch text cannot collide with the chevron: '+diagnostic);
  assert.ok(measured.searchIcon.visible&&measured.searchIcon.right<=measured.search.contentLeft,'Search icon cannot collide with typed text: '+diagnostic);
  if(width<768){
   assert.ok(measured.search.contentWidth>=120&&measured.search.contentWidth>=measured.search.textWidth+2,'Mobile typed search has readable content space: '+diagnostic);
   assert.ok(measured.branch.contentWidth>=measured.branch.textWidth+2,'The selected source branch is fully readable on mobile: '+diagnostic);
   assert.equal(measured.badgeVisible,false,'Desktop shortcut badge is hidden on mobile');assert.equal(measured.refresh.textVisible,false,'Mobile refresh stays compact without losing its accessible name');
   assert.ok(measured.search.bottom<=measured.branch.top&&Math.abs(measured.branch.top-measured.refresh.top)<=1,'Shared mobile controls use two compact aligned rows: '+diagnostic);
  }else{
   assert.equal(measured.refresh.textVisible,true,'Desktop keeps the refresh text');
   assert.equal(measured.badgeVisible,screen==='purchase-orders','Only Orders retains its visible desktop shortcut badge');
   if(screen==='purchase-orders')assert.ok(measured.search.contentRight<=measured.badge.left&&measured.badge.right<=measured.search.right,'Desktop shortcut remains outside the search text content area: '+diagnostic);
   else assert.equal(measured.badge,null,'Requests and Inbound do not invent a desktop shortcut badge');
  }
  return measured;
 }
 async function capture(name,{viewport=false,keepFocus=false}={}){if(!keepFocus)await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await paint();const file=name+'.png';await page.screenshot({path:path.join(output,file),fullPage:!viewport});const bytes=await readFile(path.join(output,file));captures.push({file,sha256:sha(bytes),fullPage:!viewport,keepsFocus:keepFocus});}
 // Read-only, bounded diagnostics. Preserve the original two-frame fit sample:
 // screenshots and later samples cannot turn a failing measurement into a pass.
 async function resizeGeometry(){return page.evaluate(()=>{
  const root=document.documentElement,viewport={width:innerWidth,height:innerHeight,scrollX,scrollY,visual:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}:null};
  const rect=element=>{const value=element.getBoundingClientRect();return {left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height};};
  const identity=element=>({tag:element.tagName,id:element.id||null,className:typeof element.className==='string'?element.className.slice(0,400):'',slot:element.getAttribute('data-slot'),state:element.getAttribute('data-state'),sidebar:element.getAttribute('data-sidebar'),customizable:element.getAttribute('data-customizable'),mobileCard:element.getAttribute('data-mobile-card')});
  const describe=element=>{const css=getComputedStyle(element);return {...identity(element),rect:rect(element),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,style:{display:css.display,visibility:css.visibility,position:css.position,width:css.width,minWidth:css.minWidth,maxWidth:css.maxWidth,boxSizing:css.boxSizing,overflowX:css.overflowX,overflowY:css.overflowY,whiteSpace:css.whiteSpace,overflowWrap:css.overflowWrap,wordBreak:css.wordBreak,flex:css.flex,flexBasis:css.flexBasis,gridTemplateColumns:css.gridTemplateColumns,transform:css.transform,transitionProperty:css.transitionProperty,transitionDuration:css.transitionDuration,transitionDelay:css.transitionDelay,animationName:css.animationName}};};
  const documentSize={clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,bodyClientWidth:document.body.clientWidth,bodyScrollWidth:document.body.scrollWidth};
  const candidates=[...document.querySelectorAll('body *')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&(box.right>viewport.width||box.left<0);});
  const offenders=candidates.slice(0,48).map(element=>({...describe(element),ancestors:(()=>{const values=[];for(let parent=element.parentElement;parent&&values.length<4;parent=parent.parentElement)values.push(describe(parent));return values;})()}));
  const animationState=animation=>({playState:animation.playState,pending:animation.pending,currentTime:animation.currentTime,animationName:animation.animationName??null,transitionProperty:animation.transitionProperty??null,endTime:animation.effect?.getComputedTiming().endTime,target:animation.effect?.target instanceof Element?identity(animation.effect.target):null});
  const animations=root.getAnimations({subtree:true}).filter(animation=>animation.pending||animation.playState==='running').slice(0,24).map(animationState);
  const search=document.querySelector('.global-search'),globalSearch=search?{...describe(search),animations:search.getAnimations({subtree:true}).slice(0,8).map(animationState)}:null;
  const layout=[...document.querySelectorAll('[data-slot=sidebar-wrapper],[data-slot=sidebar-gap],[data-slot=sidebar-container],[data-slot=sidebar-inset],.topbar,.topbar-context,.topbar-actions,.global-search,.user-button,.workspace-content,.request-list-toolbar,.desktop-grid-viewport,.request-list-table,.request-list-pagination,.mobile-bottom-nav')].slice(0,24).map(describe);
  return {viewport,documentSize,mobileMedia:matchMedia('(max-width: 767px)').matches,fits:documentSize.scrollWidth<=viewport.width,offenderCount:candidates.length,offenders,animations,globalSearch,layout,activeElement:document.activeElement instanceof Element?identity(document.activeElement):null};
 });}
 // Test-only observation of the locked React renderer's own row key. IDs stay
 // internal: do not add DOM attributes or expose them to users to satisfy tests.
 async function retainedLineIdentity(rows,lines,indexed=false){
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(element=>{
   const names=Object.keys(element).filter(name=>name.startsWith('__reactFiber$'));
   if(names.length!==1||typeof element[names[0]]?.key!=='string')throw Error('Exactly one own keyed React row fiber is required');
   return element[names[0]].key;
  })),lines.map((line,index)=>indexed?`${index}:${line.lineId}`:line.lineId),'Every source line keeps its exact internal identity and order');
 }
 async function hiddenLineIdentities(container,lines){
  const ids=lines.map(line=>line.lineId);
  const leaks=await container.evaluate((element,ids)=>({text:ids.filter(id=>element.textContent.includes(id)),markup:ids.filter(id=>element.outerHTML.includes(id))}),ids);
  assert.deepEqual(leaks,{text:[],markup:[]},'Internal line IDs must not become rendered text or DOM/accessibility attributes');
 }
 const sourceValue=value=>value===null?'NULL':value===''?'""':String(value);
 const purchaseLineValues=document=>document.lines.map((line,index)=>[index+1,line.values.itemId,line.values.budget,line.values.timeRequired,line.values.quantity,line.values.unitPrice,line.values.totalPrice,line.values.model].map(sourceValue));
 const readonlyLineValues=detail=>detail.inboundRequestLines.map((line,index)=>[(detail.page-1)*detail.pageSize+index+1,line.setQuantityByDocument,line.barrelQuantityByDocument,line.setQuantityByReal,line.barrelQuantityByReal].map(sourceValue));
 async function exactItemIdentityGroups(groups,lines){
  assert.equal(await groups.count(),lines.length,'Every source row retains exactly one item identity group');
  assert.deepEqual(await groups.evaluateAll(elements=>elements.map(group=>[...group.querySelectorAll(':scope > div > dt')].map(value=>value.textContent))),lines.map(()=>['Mã hàng','Mã hàng NSX','Tên hàng / dịch vụ','ĐVT']));
  assert.deepEqual(await groups.evaluateAll(elements=>elements.map(group=>[...group.querySelectorAll(':scope > div > dd')].map(value=>value.textContent))),lines.map(line=>[line.itemId,'Chưa có thông tin','Chưa có thông tin','Chưa có thông tin']),'Exact source ItemID and all three unavailable metadata fields remain separate');
 }
 async function exactReadonlyLines(panel,detail){
  const rows=panel.locator('article');assert.equal(await rows.count(),detail.inboundRequestLines.length);
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(row=>({identity:row.querySelectorAll(':scope > dl[aria-label="Thông tin mặt hàng"]').length,quantities:row.querySelectorAll(':scope > dl:not([aria-label="Thông tin mặt hàng"])').length}))),detail.inboundRequestLines.map(()=>({identity:1,quantities:1})),'Each source row owns exactly one item group and one quantitative group; adjacent rows cannot borrow groups');
  await exactItemIdentityGroups(rows.locator(':scope > dl[aria-label="Thông tin mặt hàng"]'),detail.inboundRequestLines);
  const quantities=rows.locator(':scope > dl:not([aria-label="Thông tin mặt hàng"])');assert.equal(await quantities.count(),detail.inboundRequestLines.length);
  assert.deepEqual(await quantities.evaluateAll(elements=>elements.map(group=>[...group.querySelectorAll(':scope > div > dt')].map(value=>value.textContent))),detail.inboundRequestLines.map(()=>['STT','Số bộ theo chứng từ','Số thùng theo chứng từ','Số bộ thực tế','Số thùng thực tế']));
  const expectedQuantities=readonlyLineValues(detail);
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(row=>[...row.querySelectorAll(':scope > dl > div > dd')].map(value=>value.textContent))),detail.inboundRequestLines.map((line,index)=>[line.itemId,'Chưa có thông tin','Chưa có thông tin','Chưa có thông tin',...expectedQuantities[index]]),'Each source row retains its exact ItemID, metadata, page-adjusted STT and four raw quantities/NULL values in order');
  await retainedLineIdentity(rows,detail.inboundRequestLines,true);await hiddenLineIdentities(panel,readonlyLines);
 }
 async function expandFullReadback(){const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await region.waitFor();const disclosure=region.locator('details');if(!await disclosure.evaluate(el=>el.open))await disclosure.locator('summary').click();return region;}
 const open=screen=>screen==='purchase-requests'?page.getByRole('button',{name:'Mở đề nghị '+model.purchase.purchaseRequestId,exact:true}):page.getByRole('button',{name:new RegExp('^Mở phiếu '+model.inbound.documentId+' ')});
 async function run(name,fn){await t.test(name,async()=>{try{await fn();results.push(name);}catch(error){failures.push(name);throw error;}});}
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,chromiumSandbox:true});t.signal.throwIfAborted();
  await run('I50 R1 native viewport sticky scroll across all three actual list hosts',async()=>{
   for(const width of [390,1440])for(const screen of ['purchase-requests','purchase-orders','inbound-requests']){
    const documents=Array.from({length:20},(_,index)=>({...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-'+String(index+1).padStart(3,'0')}));
    const inbounds=Array.from({length:50},(_,index)=>({...structuredClone(inbound),documentId:'QA-INBOUND-'+String(index+1).padStart(3,'0')}));
    await start(width,screen,{purchaseDocuments:documents,inboundDocuments:inbounds,orderPages:[Array.from({length:20},(_,index)=>orderRow(index+1))]});await page.setViewportSize({width,height:360});
    const panel=page.locator('.request-list-panel:visible');await panel.locator('[data-grid-row]').first().waitFor();await paint();
    const toolbar=panel.locator('.request-list-toolbar');const initial=await toolbar.evaluate(element=>{const box=element.getBoundingClientRect(),nav=document.querySelector('.topbar').getBoundingClientRect(),panel=element.closest('.request-list-panel'),style=getComputedStyle(panel);return {documentTop:box.top+scrollY,navBottom:nav.bottom,position:getComputedStyle(element).position,overflowX:style.overflowX,overflowY:style.overflowY,maxScroll:document.scrollingElement.scrollHeight-innerHeight};});
    assert.equal(initial.position,'sticky');assert.equal(initial.overflowX,'visible');assert.equal(initial.overflowY,'visible');
    const first=initial.documentTop-initial.navBottom+24,second=first+80;assert.ok(initial.maxScroll>=second,'Natural production list geometry must provide actual viewport scroll range: '+JSON.stringify(initial));
    const measure=()=>toolbar.evaluate(element=>({scrollY,top:element.getBoundingClientRect().top,navBottom:document.querySelector('.topbar').getBoundingClientRect().bottom,panelTop:element.closest('.request-list-panel').getBoundingClientRect().top,gridScroll:element.closest('.request-list-panel').querySelector('.desktop-grid-viewport').scrollTop}));
    await page.evaluate(y=>window.scrollTo(0,y),first);await paint();const a=await measure();await page.evaluate(y=>window.scrollTo(0,y),second);await paint();const b=await measure();
    assert.ok(b.scrollY-a.scrollY>=79,'The real viewport scrolls, rather than a simulated DOM model');assert.ok(b.panelTop<a.panelTop-79);
    for(const value of [a,b])assert.ok(Math.abs(value.top-value.navBottom)<=2,'Toolbar remains immediately below navigation: '+JSON.stringify(value));assert.equal(a.gridScroll,b.gridScroll,'Viewport test does not scroll the inner table instead');
    assert.ok(calls.every(call=>call.method==='GET'));stickyToolbarEvidence.push({screen,width,nativeScroll:'PASS',initial,first:a,second:b});
   }
   assert.equal(stickyToolbarEvidence.length,6);
  });
  await run('I50 R1 native body portal and footer obey actual purchase/inbound host presentation loss',async()=>{
   for(const screen of ['purchase-requests','inbound-requests']){
    await start(390,screen,{writable:true},'&i50-presentation');await open(screen).click();
    const form=screen==='purchase-requests'?page.locator('form[aria-label="Đề nghị mua hàng trên điện thoại"]'):page.getByTestId('inbound-editor');await form.waitFor();
    const note=form.locator(screen==='purchase-requests'?'textarea[name="notes"]':'textarea#inbound-header-notes');await note.fill('SYNTHETIC PRESENTATION CUSTODY');const editor=await note.elementHandle();
    const lines=()=>form.locator(screen==='purchase-requests'?'article':'fieldset.request-line');const count=await lines().count();assert.ok(count>0);
    if(screen==='purchase-requests'){
     assert.equal(await form.getByRole('button',{name:/^Bỏ dòng /}).count(),0,'ExistingOnly has no Remove affordance');assert.equal(await form.getByRole('button',{name:'Thêm dòng hàng',exact:true}).isDisabled(),true);
     // Capture the production line callbacks even though this fixed profile has
     // no removal control or dialog. No synthetic no-op may stand in for them.
     await lines().first().evaluate(element=>{
      const key=Object.keys(element).find(key=>key.startsWith('__reactFiber$'));let owner=key?element[key]:null;
      while(owner&&!(Array.isArray(owner.memoizedProps?.lines)&&typeof owner.memoizedProps.onRemove==='function'&&typeof owner.memoizedProps.onAdd==='function'))owner=owner.return;
      if(!owner||!owner.memoizedProps.lines[0]?.localKey)throw Error('Actual purchase line callbacks required');
      const {onRemove,onAdd,lines}=owner.memoizedProps;window.i50QueuedConfirm=()=>{onRemove(lines[0].localKey);onAdd();};
     });
     await page.evaluate(()=>window.i50QueuedConfirm());await paint();assert.equal(await lines().count(),count);assert.equal(await page.getByRole('alertdialog').count(),0,'Fixed profile cannot open a removal portal');
    }else{
     await form.getByRole('button',{name:'Xóa dòng 1',exact:true}).click();const confirmation=page.getByRole('alertdialog');await confirmation.waitFor();
     assert.equal(await confirmation.evaluate(element=>element.closest('[data-testid="inbound-request-host"],[aria-label="Danh sách đề nghị mua hàng"]')===null),true,'Radix confirmation is a real body portal');
     await confirmation.getByRole('button',{name:'Xóa dòng',exact:true}).evaluate(element=>{const key=Object.keys(element).find(key=>key.startsWith('__reactProps$'));if(!key||typeof element[key].onClick!=='function')throw Error('Actual React confirmation handler required');window.i50QueuedConfirm=element[key].onClick;});
    }
    const ownerForm=screen==='purchase-requests'?form:form.locator('form');await ownerForm.evaluate(element=>{const key=Object.keys(element).find(key=>key.startsWith('__reactProps$'));if(!key||typeof element[key].onSubmit!=='function')throw Error('Actual portaled footer form owner required');window.i50QueuedReview=element[key].onSubmit;});
    await page.evaluate(()=>window.i50Presentation(false));await paint();assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.locator('.record-dialog-actions .request-action-bar:visible').count(),0);
    await page.evaluate(()=>(()=>{window.i50QueuedConfirm({preventDefault(){},stopPropagation(){}});window.i50QueuedReview({preventDefault(){}});})());await paint();assert.equal(await lines().count(),count);assert.equal(await editor.evaluate(element=>element.isConnected),true);
    await page.evaluate(()=>window.i50Presentation(true));await note.waitFor();await eventually(()=>note.isEnabled());await paint();await page.evaluate(()=>(()=>{window.i50QueuedConfirm({preventDefault(){},stopPropagation(){}});window.i50QueuedReview({preventDefault(){}});})());await paint();
    assert.equal(await lines().count(),count);assert.equal(await page.getByRole('alertdialog').count(),0,'Restore does not revive the old confirmation');assert.equal(await note.inputValue(),'SYNTHETIC PRESENTATION CUSTODY');assert.equal(await page.getByRole('button',{name:'Quay lại chỉnh sửa',exact:true}).count(),0,'Old footer/form action cannot revive review on restore');
    assert.equal(await page.locator('.record-dialog-actions .request-action-bar:visible').count(),1);assert.ok(calls.every(call=>call.method==='GET'));
    if(screen==='purchase-requests'){assert.equal(await form.getByRole('button',{name:/^Bỏ dòng /}).count(),0);assert.equal(await form.getByRole('button',{name:'Thêm dòng hàng',exact:true}).isDisabled(),true);}
    portalPresentationEvidence.push({screen,nativePortal:screen==='purchase-requests'?'absent by existingOnly profile':'PASS',maskedConfirmation:'hidden',maskedFooter:'hidden',queuedAction:'rejected during loss and after restore',lineCount:count,requests:'GET only'});
   }
  });
  for(const width of [320,390,1440])for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${width} ${screen} list and authorized read-only detail`,async()=>{
    await start(width,screen);await open(screen).waitFor();if(screen==='inbound-requests')assert.equal(await page.getByText('Phiên hoặc quyền đọc hiện tại không khả dụng. Dữ liệu của phiên trước được ẩn.',{exact:true}).isVisible(),false);await layout(width,screen);assert.match(await host(screen).innerText(),/01\/10\/2026/);assert.equal(await host(screen).getByText('Trạng thái tổng hợp',{exact:true}).count(),1);await capture(`${screen}-list-${width}`);
    const filter=host(screen).locator('input').first();await filter.focus();assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
    await open(screen).click();if(screen==='purchase-requests')await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();
    await layout(width,screen);assert.equal(calls.filter(v=>v.method==='POST').length,0);assert.equal((await page.evaluate(()=>window.i30Notices)).length,0,'Read-only reads do not notify');
    if(screen==='purchase-requests'){await capture(`${screen}-disclosure-closed-${width}`);await expandFullReadback();const table=page.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});assert.equal(await table.getByRole('columnheader').count(),8);assert.equal(await table.locator('tbody tr').count(),purchase.lines.length);assert.equal(await table.getByRole('cell').count(),8*purchase.lines.length);assert.match(await table.innerText(),/999999999999999999/);assert.equal(await table.getByText('QA-ITEM-WITH-LONG-SYNTHETIC-CODE',{exact:true}).isVisible(),true);}
    await capture(`${screen}-readonly-${width}`);
    if(width<768){
     // Production source limits differ: purchase IDs permit 100 characters;
     // inbound draft IDs permit 50. Exercise both unbroken maximum identities.
     const longId=(screen==='purchase-requests'?'P':'I').repeat(screen==='purchase-requests'?100:50);
     await start(width,screen,screen==='purchase-requests'?{purchase:{...structuredClone(purchase),purchaseRequestId:longId}}:{inbound:{...structuredClone(inbound),documentId:longId}});await open(screen).waitFor();await layout(width,screen);
     const identity=host(screen).getByText(longId,{exact:true}).first();assert.equal(await identity.textContent(),longId);assert.equal(await identity.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].every(rect=>rect.left>=0&&rect.right<=innerWidth)&&el.scrollWidth<=Math.ceil(el.clientWidth);}),true,'Every maximum-width identifier character remains contained and readable');await capture(`${screen}-maximum-id-${width}`);
     await open(screen).click();if(screen==='purchase-requests')await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await capture(`${screen}-maximum-id-detail-${width}`);await layout(width,screen);assert.equal(calls.filter(v=>v.method==='POST').length,0);
    }
   });
  }
  for(const width of [320,390,1440])await run(`I36 compact shell and command dialog ${width}`,async()=>{
   await start(width,'purchase-requests');await open('purchase-requests').waitFor();
   const table=host('purchase-requests').getByRole('grid',{name:'Danh sách đề nghị',exact:true});
   assert.equal(await table.locator('[data-grid-row]').count(),1);assert.equal(await table.getByRole('columnheader').count(),7);
   assert.equal(await table.getByRole('button',{name:'Mở đề nghị '+purchase.purchaseRequestId,exact:true}).count(),1,'One responsive row has one focus destination');
   const expectedShortcut=await page.evaluate(()=>/Mac|iPhone|iPad|iPod/i.test(navigator.platform)?{label:'Cmd+K',keys:'Meta+K'}:{label:'Ctrl+K',keys:'Control+K'});
   assert.equal(await page.locator('.global-search kbd').textContent(),expectedShortcut.label);assert.equal(await page.locator('.global-search').getAttribute('aria-keyshortcuts'),expectedShortcut.keys);
   if(width>=768){
    for(const headerWidth of [1024,1180,1440]){
     await page.setViewportSize({width:headerWidth,height:900});await paint();
     const fit=await page.locator('.global-search').evaluate(el=>{const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {button:bounds(el),icon:bounds(el.querySelector('svg')),label:bounds(el.querySelector('.global-search-label')),badge:bounds(el.querySelector('kbd'))};});
     assert.ok(fit.button.left<=fit.icon.left&&fit.icon.right<=fit.label.left&&fit.label.right<=fit.badge.left&&fit.badge.right<=fit.button.right-8,'Search icon, shrinking label and complete shortcut must stay separated and inside the button: '+JSON.stringify({headerWidth,fit}));
     await capture('i61-header-'+headerWidth,{viewport:true});
    }
    await page.setViewportSize({width,height:900});await paint();
   }
   const topbar=await page.locator('.topbar').evaluate(el=>({background:getComputedStyle(el).backgroundColor,card:getComputedStyle(document.querySelector('.request-list-header')).backgroundColor}));assert.equal(topbar.background,topbar.card,'Sticky shell must use an opaque card background');
   if(width<768){const nav=page.locator('.mobile-bottom-nav');const labels=await nav.locator('.mobile-nav-item > span:last-child').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),nowrap:getComputedStyle(el).whiteSpace})));assert.ok(labels.every(el=>el.nowrap==='nowrap'&&el.height<=el.line+1));await nav.getByRole('button',{name:'Tìm màn hình được cấp quyền',exact:true}).evaluate(el=>window.i36ExpectedOpener=el);await nav.getByRole('button',{name:'Tìm màn hình được cấp quyền',exact:true}).click();}
   else {await page.locator('.global-search').evaluate(el=>window.i36ExpectedOpener=el);await page.locator('.global-search').click();}
   const dialog=page.getByRole('dialog',{name:'Tìm màn hình',exact:true});await dialog.waitFor();
   await paint();assert.equal(await dialog.getByRole('combobox').evaluate(el=>el===document.activeElement),true,'Opening command search focuses its input without test intervention');
   for(let n=0;n<5;n++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,'Tab focus stays in modal');}
   const commandGeometry=()=>dialog.evaluate(el=>{
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {top:r.top,bottom:r.bottom,height:innerHeight,transform:style.transform,scale:style.scale,
     animations:el.getAnimations({subtree:true}).map(animation=>({playState:animation.playState,pending:animation.pending,currentTime:animation.currentTime,
      endTime:animation.effect?.getComputedTiming().endTime,animationName:animation instanceof CSSAnimation?animation.animationName:null})),
     rows:[...el.querySelectorAll('[data-slot=command-item]')].map((row,index)=>({index,height:row.getBoundingClientRect().height,offsetHeight:row.offsetHeight,
      minHeight:getComputedStyle(row).minHeight,display:getComputedStyle(row).display,visibility:getComputedStyle(row).visibility,hidden:row.hidden,
      role:row.getAttribute('role'),ariaDisabled:row.getAttribute('aria-disabled'),rectCount:row.getClientRects().length,
      ancestors:(()=>{const values=[];for(let ancestor=row.parentElement;ancestor;ancestor=ancestor.parentElement){const css=getComputedStyle(ancestor);
       values.push({role:ancestor.getAttribute('role'),slot:ancestor.getAttribute('data-slot'),display:css.display,visibility:css.visibility,hidden:ancestor.hidden,
        transform:css.transform,scale:css.scale,animations:ancestor.getAnimations().map(animation=>({playState:animation.playState,pending:animation.pending,currentTime:animation.currentTime,endTime:animation.effect?.getComputedTiming().endTime}))});
       if(ancestor===el)break;}return values;})()}))};
   });
   const opening=await commandGeometry();commandGeometryEvidence.push({width,phase:'opening',...opening});
   await capture(`i36-command-opening-${width}`,{viewport:true,keepFocus:true});
   // Touch-target geometry is measured after the real finite entrance animation,
   // not at an arbitrary number of frames while an ancestor may still be scaled.
   // Keep both layout and transformed geometry as evidence; a genuine small row
   // still fails the unchanged 44px rendered-height requirement below.
   await dialog.evaluate(async el=>{
    await Promise.all(el.getAnimations({subtree:true}).filter(animation=>
     (animation.pending||animation.playState==='running')&&Number.isFinite(animation.effect?.getComputedTiming().endTime)
    ).map(animation=>animation.finished));
   });
   await paint();const geometry=await commandGeometry();commandGeometryEvidence.push({width,phase:'settled',...geometry});
   await capture(`i36-command-${width}`,{viewport:true,keepFocus:true});
   await writeFile(path.join(output,`i36-command-geometry-${width}.json`),JSON.stringify({opening,settled:geometry},null,2));
   assert.ok(!geometry.animations.some(animation=>(animation.pending||animation.playState==='running')&&Number.isFinite(animation.endTime)),'Command entrance animations must be finished: '+JSON.stringify(geometry));
   assert.ok(geometry.top>=0&&geometry.bottom<=geometry.height,'Command dialog must fit the viewport: '+JSON.stringify(geometry));
   assert.ok(geometry.rows.length>0&&geometry.rows.every(row=>row.offsetHeight>=44&&row.height>=44),'Every command row must retain at least 44px layout and rendered height: '+JSON.stringify(geometry));
   await dialog.getByRole('button',{name:'Đóng tìm màn hình',exact:true}).click();await dialog.waitFor({state:'hidden'});await paint();assert.equal(await page.evaluate(()=>document.activeElement===window.i36ExpectedOpener),true,'Close restores the search opener');
   if(width<768)await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Tìm màn hình được cấp quyền',exact:true}).click();else await page.locator('.global-search').click();
   await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await paint();assert.equal(await page.evaluate(()=>document.activeElement===window.i36ExpectedOpener),true,'Escape restores the search opener');assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
   const searchInput=host('purchase-requests').getByLabel('Tìm mã đề nghị',{exact:true});await searchInput.focus();await page.keyboard.press('Control+k');await dialog.waitFor();await paint();assert.equal(await dialog.getByRole('combobox').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await paint();assert.equal(await searchInput.evaluate(el=>el===document.activeElement),true,'Keyboard invocation restores its original focused field');
   await searchInput.focus();await page.keyboard.press('Meta+k');await dialog.waitFor();await paint();assert.equal(await dialog.getByRole('combobox').evaluate(el=>el===document.activeElement),true,'Cmd+K opens the same guarded screen finder');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await paint();assert.equal(await searchInput.evaluate(el=>el===document.activeElement),true,'Cmd+K dismissal restores the original field');
   await start(width,'purchase-orders');await page.getByText('QA-ORDER-001',{exact:true}).locator('visible=true').first().waitFor();await paint();
   if(width>=768){const widths=await page.locator('.desktop-grid-viewport').evaluate(el=>({viewport:el.clientWidth,table:el.querySelector('table').getBoundingClientRect().width}));assert.ok(Math.abs(widths.table-widths.viewport)<=1,'Orders table fills its available viewport');const lastHeader=page.locator('.shared-grid-table th').filter({hasText:'Khóa chứng từ'});const before=await lastHeader.evaluate(el=>el.getBoundingClientRect().width);const resize=page.getByRole('separator',{name:'Độ rộng Khóa chứng từ',exact:true});await resize.focus();await page.keyboard.press('ArrowRight');await paint();assert.ok(Math.abs((await lastHeader.evaluate(el=>el.getBoundingClientRect().width))-before-16)<=1,'Trailing data column keeps its real resize behavior even with viewport fill');await page.keyboard.press('ArrowLeft');await paint();}
   assert.equal(await page.getByText('Trạng thái chưa xác định (mã 999)',{exact:true}).locator('visible=true').count(),1);
   await capture(`i36-orders-${width}`,{viewport:true});
  });
  for(const width of [320,360,390,1440])await run(`I42 shared list surface and native controls ${width}`,async()=>{
   for(const screen of ['purchase-requests','inbound-requests','purchase-orders']){
    await start(width,screen);
    const orders=screen==='purchase-orders',list=orders?page.locator('.document-panel'):host(screen);
    const action=orders?list.getByRole('button',{name:'Mở chứng từ QA-ORDER-001',exact:true}):open(screen);
    await action.waitFor();await paint();
    const table=list.locator('table.request-list-table.shared-grid-table[data-shared-grid=true]');
    assert.equal(await table.count(),1,'Each list uses exactly one shared table');
    assert.equal(await table.locator('tbody tr[data-grid-row]').count(),1,'Mobile and desktop reuse the same semantic data row');
    assert.equal(await list.locator('.mobile-document-list').count(),0,'There is no duplicate hidden mobile renderer');
    assert.equal(await table.evaluate(el=>el.getAttribute('role')??'table'),'grid','Shared customizable tables expose one keyboard surface');
    const toolbar=list.locator('form.request-list-toolbar'),pager=orders?list.locator('.request-list-pagination'):list.getByRole('navigation',{name:screen==='purchase-requests'?'Phân trang đề nghị':'Trang danh sách phiếu',exact:true});
    assert.equal(await toolbar.count(),1);assert.equal(await pager.count(),1);
    assert.equal(await pager.evaluate(el=>el.classList.contains('request-panel-footer')),true,'All list pagers share the request footer surface');
    const pagerGeometry=await pager.evaluate(el=>{
     const controls=el.querySelector('.request-list-page-controls'),current=el.querySelector('[aria-current="page"]');
     return {footerRight:el.getBoundingClientRect().right,controlsRight:controls.getBoundingClientRect().right,width:controls.getBoundingClientRect().width,current:current?.textContent,shadcn:el.getAttribute('data-slot'),list:controls.tagName};
    });
    assert.equal(pagerGeometry.shadcn,'pagination');assert.equal(pagerGeometry.list,'UL');assert.equal(pagerGeometry.current,'Trang 1');
    assert.ok(pagerGeometry.footerRight-pagerGeometry.controlsRight<=24,'Pagination stays together in the right corner');
    assert.ok(pagerGeometry.width<=340,'Previous, current and Next never spread across the footer');
    assert.match(await pager.innerText(),/Trang 1/);assert.equal(await pager.getByRole('button',{name:/^Trang (trước|phiếu trước)$/}).isDisabled(),true);assert.equal(await pager.getByRole('button',{name:/^Trang (sau|tiếp theo|phiếu tiếp)$/}).isDisabled(),true);
    const branch=toolbar.getByLabel(screen==='inbound-requests'?'Lọc chi nhánh':'Chi nhánh',{exact:true});
    assert.equal(await branch.evaluate(el=>el.tagName),'SELECT','Every branch control uses the native select contract');
    assert.deepEqual(await branch.locator('option').allTextContents(),['Tất cả','QA-BRANCH']);
    const controlGeometry=await toolbar.locator('button,input,select').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().width>0).map(el=>({tag:el.tagName,height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})));
    assert.ok(controlGeometry.length>=3);assert.ok(controlGeometry.every(control=>control.height>=43.5),'Shared toolbar touch targets remain 44px: '+JSON.stringify(controlGeometry));
    if(width<768)assert.ok(controlGeometry.filter(control=>['INPUT','SELECT'].includes(control.tag)).every(control=>control.font>=16),'Mobile native input fonts remain 16px');
    const route=orders?'/api/documents/purchase-orders':screen==='purchase-requests'?'/api/purchase-requests':'/api/documents/inbound-requests';
    const search=toolbar.locator('input');await search.fill('QA');await branch.selectOption('QA-BRANCH');
    await toolbar.locator('input').press('Enter');
    await eventually(()=>calls.some(call=>call.route===route&&call.search==='QA'&&call.branchId==='QA-BRANCH'&&call.page==='1'));
    await action.waitFor();await paint();
    // Exercise a useful-length draft without applying a different query, then
    // restore the existing QA filter before continuing the original scenarios.
    await search.fill('QA-SEARCH-001');await paint();
    const toolbarGeometry=await toolbarContentGeometry(toolbar,width,screen);
    await capture(`i59-${screen}-toolbar-${width}`,{viewport:true});
    await search.fill('QA');await paint();
    // Count every DOM node, including hidden nodes, and retain its identity through
    // both responsive modes. A visually hidden duplicate can steal the row ref.
    const actionSelector=orders?'button[aria-label="Mở chứng từ QA-ORDER-001"]':screen==='purchase-requests'?'button[aria-label="Mở đề nghị QA-PURCHASE-001"]':'button[aria-label^="Mở phiếu QA-INBOUND-001 "]';
    assert.equal(await list.locator(actionSelector).count(),1);await action.evaluate(el=>window.i42LiveOpen=el);
    for(const nextWidth of [width<768?1440:320,width]){
     const previousWidth=page.viewportSize().width;
     await page.setViewportSize({width:nextWidth,height:900});await paint();
     assert.equal(await action.evaluate(el=>el===window.i42LiveOpen&&el.isConnected),true,'Responsive changes preserve the one live Open action and its ref');
     assert.equal(await list.locator(actionSelector).count(),1);
     const measured=await resizeGeometry(),name=`i42-${screen}-resize-${width}-from-${previousWidth}-to-${nextWidth}`;
     const diagnostic={kind:'resize-geometry',screen,initialWidth:width,previousWidth,nextWidth,measured,screenshot:name+'.png',afterScreenshot:null};
     sharedGridEvidence.push(diagnostic);
     await writeFile(path.join(output,name+'.json'),JSON.stringify(diagnostic,null,2));
     await capture(name,{viewport:true,keepFocus:true});
     diagnostic.afterScreenshot=await resizeGeometry();await writeFile(path.join(output,name+'.json'),JSON.stringify(diagnostic,null,2));
     assert.equal(measured.fits,true,`${screen} must stay contained at ${nextWidth}px: `+JSON.stringify({viewport:measured.viewport,documentSize:measured.documentSize,offenderCount:measured.offenderCount,offenders:measured.offenders.slice(0,8),animations:measured.animations,globalSearch:measured.globalSearch}));
    }
    if(!orders){
     await action.focus();await page.keyboard.press('Enter');await focusedDetail(screen);
     await page.getByRole('button',{name:screen==='purchase-requests'?'Đóng đề nghị':'Quay lại danh sách',exact:true}).click();
     await eventually(()=>action.evaluate(el=>el===document.activeElement));
     assert.equal(await search.inputValue(),'QA','Opening and closing preserves the applied filter draft');
    }
    if(width<768){
     assert.equal(await table.locator('.grid-select-cell:visible,.grid-spacer:visible').count(),0,'Mobile hides selection and virtual spacer cells after customizable wrapping changes');
     assert.equal(await table.locator('.column-resizer[tabindex]:not([tabindex="-1"])').count(),0,'Mobile never retains a hidden keyboard-focusable column resizer');
     assert.equal(await list.getByRole('button',{name:'Tùy chỉnh bảng',exact:true}).isVisible(),false,'Mobile tools omit customization');
     assert.equal(await page.getByRole('dialog',{name:'Tùy chỉnh bảng',exact:true}).count(),0);
    }
    assert.equal(calls.filter(call=>call.method==='POST').length,0);
    sharedGridEvidence.push({kind:'shared-list',screen,width,sharedTables:await table.count(),liveOpenActions:await list.locator(actionSelector).count(),nativeBranch:true,responsiveNodeIdentity:true,controlGeometry,toolbarGeometry});
    await capture(`i42-${screen}-shared-${width}`,{viewport:true});
   }
  });
  await run('I42 Orders keyboard, page-scoped selection and real detail activation',async()=>{
   await start(1440,'purchase-orders',{orderPages:orderPages()});
   const grid=page.getByRole('grid',{name:'Đặt mua hàng',exact:true}),panel=page.locator('.document-panel');
   await grid.locator('[data-cell="0:0"]').waitFor();assert.equal(await grid.locator('tbody tr[data-grid-row]').count(),12);
   const cell=(row,col)=>grid.locator(`[data-cell="${row}:${col}"]`);
   async function key(key,row,col){await page.keyboard.press(key);await eventually(()=>cell(row,col).evaluate(el=>el===document.activeElement));assert.equal(await grid.locator('[data-cell][tabindex="0"]').count(),1,'Advanced grid keeps one roving data-cell tab stop');}
   await cell(0,0).focus();await key('ArrowRight',0,1);await key('ArrowDown',1,1);await key('Home',1,0);await key('End',1,4);await key('Control+Home',0,0);await key('PageDown',8,0);await key('PageUp',0,0);await key('Control+End',11,4);await key('ArrowDown',11,4);await key('ArrowRight',11,4);await key('Control+Home',0,0);
   await page.keyboard.press('Space');assert.equal(await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-001',exact:true}).getAttribute('data-state'),'checked');
   await key('ArrowDown',1,0);await key('ArrowDown',2,0);await page.keyboard.press('Shift+Space');
   assert.match(await panel.locator('.grid-selection').innerText(),/Đã chọn 3\/12/);await page.keyboard.press('Escape');assert.equal(await panel.locator('.grid-selection').count(),0);
   const all=grid.getByRole('checkbox',{name:'Chọn tất cả dòng trên trang này',exact:true});
   await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-002',exact:true}).click();assert.equal(await all.getAttribute('data-state'),'indeterminate');
   await all.click();assert.match(await panel.locator('.grid-selection').innerText(),/Đã chọn 12\/12/);
   const pager=panel.locator('.request-list-pagination');await pager.getByRole('button',{name:'Trang sau',exact:true}).click();
   await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-013',exact:true}).waitFor();assert.equal(await grid.locator('tbody tr[data-grid-row]').count(),3);assert.equal(await panel.locator('.grid-selection').count(),0);assert.equal(await all.getAttribute('data-state'),'unchecked');
   await all.click();assert.match(await panel.locator('.grid-selection').innerText(),/Đã chọn 3\/3/);assert.equal(await pager.getByRole('button',{name:'Trang sau',exact:true}).isDisabled(),true);
   await pager.getByRole('button',{name:'Trang trước',exact:true}).click();await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-001',exact:true}).waitFor();assert.equal(await panel.locator('.grid-selection').count(),0);assert.equal(await all.getAttribute('data-state'),'unchecked','Returning to a page does not revive stale selection');
   // Enter on a cell and Enter on the embedded document button must each dispatch
   // one real detail read, never bubble into a duplicate Open activation.
   for(const source of ['cell','document-button']){
    const before=calls.filter(call=>call.route==='/api/documents/purchase-orders/detail').length;
    await (source==='cell'?cell(0,0):cell(0,0).getByRole('button',{name:'QA-ORDER-001',exact:true})).focus();await page.keyboard.press('Enter');
    const detail=page.getByRole('dialog',{name:'Đơn đặt hàng mua QA-ORDER-001',exact:true});await detail.waitFor();await detail.getByText('QA-ORDER-ITEM-001',{exact:true}).locator('visible=true').waitFor();
    assert.equal(calls.filter(call=>call.route==='/api/documents/purchase-orders/detail').length,before+1,'Exactly one detail GET per keyboard activation');
    await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});
   }
   await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-001',exact:true}).click();await panel.getByLabel('Chi nhánh',{exact:true}).selectOption('QA-BRANCH');await eventually(()=>calls.some(call=>call.route==='/api/documents/purchase-orders'&&call.branchId==='QA-BRANCH'));await grid.getByRole('checkbox',{name:'Chọn QA-ORDER-001',exact:true}).waitFor();assert.equal(await panel.locator('.grid-selection').count(),0,'Changing branch clears selection even when the returned row identities overlap');
   await page.keyboard.press('Control+f');assert.equal(await panel.getByLabel('Tìm mã chứng từ',{exact:true}).evaluate(el=>el===document.activeElement),true,'Orders preserves its keyboard search shortcut');
   await cell(11,4).focus();model.orderPages[0]=model.orderPages[0].slice(0,3);
   const shrunk=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/documents/purchase-orders');await panel.getByRole('button',{name:'Làm mới',exact:true}).click();await shrunk;await eventually(async()=>await grid.locator('tbody tr[data-grid-row]').count()===3);await paint();
   assert.equal(await grid.locator('[data-cell][tabindex="0"]').count(),1,'A same-scope row shrink preserves exactly one valid roving data cell');assert.equal(await grid.locator('[data-cell][tabindex="0"]').getAttribute('data-cell'),'2:4');await cell(2,4).focus();await key('ArrowUp',1,4);
   assert.equal(calls.filter(call=>call.method==='POST').length,0);
   const pageRequests=calls.filter(call=>call.route==='/api/documents/purchase-orders').map(call=>({page:call.page,branchId:call.branchId}));
   await start(1440,'purchase-orders',{orderPages:[Array.from({length:50},(_,index)=>orderRow(index+1))]});
   // start() closes the prior page; all locators here must belong to this one.
   const virtualGrid=page.getByRole('grid',{name:'Đặt mua hàng',exact:true}),virtualPanel=page.locator('.document-panel');await virtualGrid.locator('[data-cell="0:0"]').waitFor();await paint();
   assert.equal(await page.locator('.document-panel .desktop-grid-viewport').getAttribute('data-virtualized'),'true');assert.ok(await virtualGrid.locator('tbody tr[data-grid-row]').count()<50,'Desktop keeps bounded row virtualization');
   const virtualRowGeometry=[];
   async function rowHeight(compact,estimate){
    const root=page.locator('.document-panel .erp-grid');await eventually(async()=>await root.getAttribute('data-compact')===String(compact));await paint();
    const geometry=await root.evaluate(el=>({estimate:parseFloat(el.querySelector('.desktop-grid-viewport').style.getPropertyValue('--grid-row-height')),rows:[...el.querySelectorAll('tbody tr[data-grid-row]')].map(row=>({id:row.getAttribute('data-grid-row'),height:row.getBoundingClientRect().height})),spacers:[...el.querySelectorAll('tbody tr.grid-spacer > td')].map(cell=>parseFloat(cell.style.height)||0),bodyHeight:el.querySelector('tbody').getBoundingClientRect().height,headerHeight:el.querySelector('thead').getBoundingClientRect().height,scrollHeight:el.querySelector('.desktop-grid-viewport').scrollHeight}));
    assert.equal(geometry.estimate,estimate);assert.ok(geometry.rows.length>0);for(const row of geometry.rows)assert.equal(row.height,estimate,'Actual virtualized row height must exactly match its estimate: '+JSON.stringify({compact,...row}));assert.equal(geometry.spacers.reduce((sum,height)=>sum+height,0)+geometry.rows.length*estimate,50*estimate,'Density changes invalidate cached virtual spacer estimates');assert.equal(geometry.bodyHeight,50*estimate,'Rendered data rows and spacers cover exactly the virtual body');assert.equal(geometry.scrollHeight,geometry.headerHeight+50*estimate,'Scroll extent follows the current density, not cached prior heights');virtualRowGeometry.push({compact,...geometry});
   }
   await rowHeight(false,65);await virtualPanel.getByRole('button',{name:'Tùy chỉnh bảng',exact:true}).click();await page.getByRole('dialog',{name:'Tùy chỉnh bảng',exact:true}).getByLabel('Bảng dữ liệu gọn',{exact:true}).check();await page.keyboard.press('Escape');await rowHeight(true,45);
   await virtualGrid.locator('[data-cell="0:0"]').focus();await page.keyboard.press('Control+End');await eventually(()=>virtualGrid.locator('[data-cell="49:4"]').evaluate(el=>el===document.activeElement));assert.equal(await virtualGrid.locator('[data-grid-row="QA-ORDER-050"]').count(),1,'Keyboard reaches the final virtualized row');
   for(const mobileWidth of [320,390]){await page.setViewportSize({width:mobileWidth,height:900});await eventually(async()=>await virtualGrid.locator('tbody tr[data-grid-row]').count()===50);assert.equal(await virtualGrid.locator('[data-grid-row="QA-ORDER-050"]').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'All fifty mobile rows remain page-contained');}
   sharedGridEvidence.push({kind:'orders-keyboard-selection',keyboardNavigation:true,selectionCounts:[3,12,3],pageScopeReset:true,detailActivations:2,serverPages:pageRequests,sameScopeRowShrink:{from:12,to:3,roving:'2:4'},virtualizedKeyboardLastRow:49,virtualRowGeometry,mobileRows:50,writeRequests:0});
  });
  await run('I42 Orders resize, pin, reorder, hide and session-only saved views',async()=>{
   await start(1440,'purchase-orders');const panel=page.locator('.document-panel'),grid=page.getByRole('grid',{name:'Đặt mua hàng',exact:true});
   await grid.locator('[data-cell="0:0"]').waitFor();
   const headers=()=>grid.getByRole('columnheader').allTextContents();
   const header=label=>grid.getByRole('columnheader').filter({hasText:label});
   const widthOf=label=>header(label).evaluate(el=>el.getBoundingClientRect().width);
   const before=await widthOf('Khóa chứng từ'),resizer=grid.getByRole('separator',{name:'Độ rộng Khóa chứng từ',exact:true});
   await resizer.focus();await page.keyboard.press('ArrowRight');await paint();assert.ok(Math.abs(await widthOf('Khóa chứng từ')-before-16)<=1);
   await resizer.scrollIntoViewIfNeeded();const box=await resizer.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+32,box.y+box.height/2,{steps:4});await page.mouse.up();await paint();assert.ok(Math.abs(await widthOf('Khóa chứng từ')-before-48)<=1,'Pointer resizing changes the real column width');
   const settings=page.getByRole('dialog',{name:'Tùy chỉnh bảng',exact:true}),show=()=>panel.getByRole('button',{name:'Tùy chỉnh bảng',exact:true}).click();
   await grid.locator('[data-cell="0:4"]').focus();await show();await settings.waitFor();assert.equal(await settings.getByRole('checkbox',{name:'Hiển thị Mã chứng từ',exact:true}).isDisabled(),true,'Required document identity cannot be hidden');
   await settings.getByRole('checkbox',{name:'Hiển thị Khóa chứng từ',exact:true}).click();
   await settings.getByRole('button',{name:'Cố định Chi nhánh',exact:true}).click();assert.equal(await settings.getByRole('button',{name:'Cố định Chi nhánh',exact:true}).getAttribute('aria-pressed'),'true');
   await settings.getByRole('button',{name:'Đưa Trạng thái lên',exact:true}).click();await settings.getByRole('button',{name:'Đưa Trạng thái lên',exact:true}).click();
   await settings.getByRole('spinbutton',{name:'Độ rộng Ngày chứng từ',exact:true}).fill('224');
   await settings.getByRole('textbox',{name:'Tên chế độ xem',exact:true}).fill('QA SESSION VIEW');await settings.getByRole('button',{name:'Lưu bố cục',exact:true}).click();
   assert.equal(await settings.getByRole('button',{name:'QA SESSION VIEW',exact:true}).count(),1);await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});await paint();
   const roving=grid.locator('[data-cell][tabindex="0"]');assert.equal(await roving.count(),1,'Hiding the active last data column retains one valid roving cell');assert.equal(await roving.getAttribute('data-cell'),'0:3');await roving.focus();await page.keyboard.press('ArrowLeft');await eventually(()=>grid.locator('[data-cell="0:2"]').evaluate(el=>el===document.activeElement));assert.equal(await grid.locator('[data-cell][tabindex="0"]').count(),1);
   const savedHeaders=await headers();assert.ok(savedHeaders.indexOf('Chi nhánh')<savedHeaders.indexOf('Trạng thái'));assert.ok(savedHeaders.indexOf('Trạng thái')<savedHeaders.indexOf('Ngày chứng từ'),'Column order applies independently of pinning');assert.equal(savedHeaders.includes('Khóa chứng từ'),false);
   assert.equal(await header('Chi nhánh').evaluate(el=>getComputedStyle(el).position),'sticky');assert.ok(Math.abs(await widthOf('Ngày chứng từ')-224)<=1);
   const originalMobileColumns=['Mã chứng từ','Ngày chứng từ','Chi nhánh','Trạng thái','Khóa chứng từ'];
   const orderAction=panel.getByRole('button',{name:'Mở chứng từ QA-ORDER-001',exact:true});await orderAction.evaluate(el=>window.i42LayoutOpen=el);
   for(const mobileWidth of [320,390]){
    await page.setViewportSize({width:mobileWidth,height:900});await eventually(async()=>await grid.locator('[data-grid-row="QA-ORDER-001"] td[data-label]').count()===5);await paint();
    const columns=await grid.locator('[data-grid-row="QA-ORDER-001"] td[data-label]').evaluateAll(elements=>elements.map(el=>({label:el.getAttribute('data-label'),visible:el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0,text:el.textContent})));
    assert.deepEqual(columns.map(column=>column.label),originalMobileColumns,'Mobile restores every original column in source order despite desktop hide/reorder/pin settings');assert.ok(columns.every(column=>column.visible));assert.match(columns.at(-1).text,/Không khóa/);
    assert.equal(await grid.locator('.column-resizer[tabindex]:not([tabindex="-1"])').count(),0);assert.equal(await orderAction.evaluate(el=>el===window.i42LayoutOpen),true,'Layout changes retain the same explicit Open action');
   }
   await page.setViewportSize({width:1440,height:900});await eventually(async()=>await grid.locator('[data-grid-row="QA-ORDER-001"] td[data-label]').count()===4);await paint();assert.deepEqual(await headers(),savedHeaders,'Returning to desktop restores the saved desktop projection');
   await show();await settings.getByRole('button',{name:'Mặc định',exact:true}).click();await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});assert.ok((await headers()).includes('Khóa chứng từ'));assert.ok(Math.abs(await widthOf('Ngày chứng từ')-170)<=1);
   await show();await settings.getByRole('button',{name:'QA SESSION VIEW',exact:true}).click();await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});assert.deepEqual(await headers(),savedHeaders);assert.ok(Math.abs(await widthOf('Ngày chứng từ')-224)<=1);
   // A saved layout is held only by this mounted grid. It must survive a data
   // refresh, but must never be written into local/session storage.
   const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/documents/purchase-orders');await panel.getByRole('button',{name:'Làm mới',exact:true}).click();await refreshed;await eventually(()=>panel.getByRole('button',{name:'Làm mới',exact:true}).isEnabled());await paint();assert.deepEqual(await headers(),savedHeaders);
   await show();await settings.getByRole('button',{name:'Xóa chế độ xem QA SESSION VIEW',exact:true}).click();assert.equal(await settings.getByRole('button',{name:'QA SESSION VIEW',exact:true}).count(),0);
   await settings.getByRole('textbox',{name:'Tên chế độ xem',exact:true}).fill('QA RELOAD VIEW');await settings.getByRole('button',{name:'Lưu bố cục',exact:true}).click();
   await settings.getByRole('spinbutton',{name:'Độ rộng Ngày chứng từ',exact:true}).fill('300');await settings.getByRole('button',{name:'Khôi phục bố cục mặc định',exact:true}).click();assert.equal(await settings.getByRole('spinbutton',{name:'Độ rộng Ngày chứng từ',exact:true}).inputValue(),'170');
   const stored=await page.evaluate(()=>[localStorage,sessionStorage].flatMap(storage=>Array.from({length:storage.length},(_,index)=>({key:storage.key(index),value:storage.getItem(storage.key(index))}))));assert.equal(stored.some(item=>/QA SESSION VIEW|QA RELOAD VIEW/.test(item.value??'')),false,'Saved views are never written to durable browser storage');
   await page.reload();await panel.getByRole('button',{name:'Tùy chỉnh bảng',exact:true}).click();await settings.waitFor();assert.equal(await settings.getByRole('button',{name:'QA RELOAD VIEW',exact:true}).count(),0,'Reload starts with no saved views from the prior mounted session');assert.equal(await settings.getByRole('spinbutton',{name:'Độ rộng Ngày chứng từ',exact:true}).inputValue(),'170');await page.keyboard.press('Escape');
   assert.equal(calls.filter(call=>call.method==='POST').length,0);sharedGridEvidence.push({kind:'orders-layout',keyboardResizeDelta:16,pointerResizeDelta:32,pinned:'Chi nhánh',hidden:'Khóa chứng từ',resizedWidth:224,savedHeaders,originalMobileColumns,hiddenActiveColumnRoving:'0:3',restored:true,deleted:true,reloadClearsViews:true,writeRequests:0});
  });
  await run('I42 component contract only: native ServerQueryControls preserves exact typed query intent',async()=>{
   await start(390,'purchase-orders',{},'&query-component=1');
   const fixture=page.getByTestId('i42-query-fixture'),dialog=page.getByRole('dialog',{name:'Lọc và sắp xếp dữ liệu',exact:true});
   await fixture.getByRole('heading',{name:'ServerQueryControls component contract',exact:true}).waitFor();
   const openQuery=()=>fixture.getByRole('button',{name:/^Lọc & sắp xếp/}).click();
   const control=name=>dialog.getByLabel(name,{exact:true}),apply=()=>dialog.getByRole('button',{name:'Áp dụng truy vấn',exact:true});
   const applied=()=>page.evaluate(()=>window.i42QueryApplied);
   await openQuery();await dialog.getByRole('button',{name:'Thêm điều kiện',exact:true}).click();await control('Giá trị 1').selectOption('draft');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   assert.deepEqual(await applied(),[],'Cancelling an unsubmitted draft never invokes onApply');await openQuery();assert.equal(await dialog.locator('.query-term').count(),0,'Reopening discards the cancelled draft');
   await dialog.getByRole('button',{name:'Thêm điều kiện',exact:true}).click();assert.equal(await apply().isDisabled(),true,'An empty enum term cannot be applied');
   await control('Trường lọc 1').selectOption('date');assert.equal(await control('Giá trị 1').getAttribute('type'),'date');assert.deepEqual(await control('Điều kiện 1').locator('option').evaluateAll(elements=>elements.map(el=>el.value)),['gte','lte']);
   await control('Trường lọc 1').selectOption('status');assert.equal(await control('Giá trị 1').evaluate(el=>el.tagName),'SELECT');assert.equal(await control('Giá trị 1').inputValue(),'');assert.deepEqual(await control('Điều kiện 1').locator('option').evaluateAll(elements=>elements.map(el=>el.value)),['eq']);await control('Giá trị 1').selectOption('sent');
   await dialog.getByRole('button',{name:'Thêm điều kiện',exact:true}).click();await control('Trường lọc 2').selectOption('date');await control('Điều kiện 2').selectOption('lte');await control('Giá trị 2').fill('2026-10-01');
   await dialog.getByRole('button',{name:'Thêm điều kiện',exact:true}).click();await control('Trường lọc 3').selectOption('amount');assert.equal(await control('Giá trị 3').getAttribute('inputmode'),'decimal');await control('Điều kiện 3').selectOption('eq');await control('Giá trị 3').fill('1e3');assert.equal(await apply().isDisabled(),true,'Decimal query values cannot silently use exponent notation');
   const decimal='12345678901234567890.0001';await control('Điều kiện 3').selectOption('gte');await control('Giá trị 3').fill(decimal);assert.equal(await control('Giá trị 3').inputValue(),decimal);
   await control('Trường sắp xếp').selectOption('date');await control('Chiều sắp xếp').selectOption('desc');await control('Nhóm dữ liệu').selectOption('branch');
   for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await paint();
    assert.ok(await dialog.locator('select').count()>=8,'Term, operator, enum, sort and group controls all stay native');
    const geometry=await dialog.evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight};});assert.ok(geometry.left>=0&&geometry.right<=geometry.width&&geometry.top>=0&&geometry.bottom<=geometry.height,'Query component fits each viewport: '+JSON.stringify(geometry));
    if(width<768)assert.ok((await dialog.locator('input,select').evaluateAll(elements=>elements.map(el=>parseFloat(getComputedStyle(el).fontSize)))).every(font=>font>=16));
   }
   const expected={filters:[{fieldId:'status',operator:'eq',value:'sent'},{fieldId:'date',operator:'lte',value:'2026-10-01'},{fieldId:'amount',operator:'gte',value:decimal}],sort:[{fieldId:'date',direction:'desc'}],groupId:'branch'};
   assert.equal(await apply().isEnabled(),true);await apply().click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await applied(),[expected],'onApply receives exact opaque IDs, operators, date and decimal strings');
   await openQuery();assert.equal(await control('Giá trị 3').inputValue(),decimal);await control('Giá trị 3').fill('7');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await openQuery();assert.equal(await control('Giá trị 3').inputValue(),decimal,'Cancelled edits never mutate the last applied query');assert.deepEqual(await applied(),[expected]);
   await dialog.getByRole('button',{name:'Xóa điều kiện',exact:true}).click();assert.equal(await dialog.locator('.query-term').count(),0);assert.equal(await control('Trường sắp xếp').inputValue(),'none');assert.equal(await control('Nhóm dữ liệu').inputValue(),'none');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await openQuery();assert.equal(await dialog.locator('.query-term').count(),3,'Cancelling Clear restores the applied terms');assert.equal(await control('Nhóm dữ liệu').inputValue(),'branch');
   await dialog.getByRole('button',{name:'Xóa điều kiện',exact:true}).click();await apply().click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await applied(),[expected,{filters:[],sort:[]}]);
   assert.equal(calls.length,0,'This generic component fixture never mounts Workspace or dispatches an ERP API query');
   sharedGridEvidence.push({kind:'component-contract-only-query-controls',workspaceWiring:false,backendRequests:0,applied:await applied(),cancelledDraftPreserved:true,clearCancelReopen:true,viewportWidths:[320,390,1440]});
  });
  await run('I42 component contract only: virtual columns retain logical accessibility and updated geometry',async()=>{
   await start(1440,'purchase-orders',{},'&wide-grid-component=1');
   const fixture=page.getByTestId('i42-wide-grid-fixture'),grid=fixture.getByRole('grid',{name:'Wide column component contract',exact:true}),viewport=fixture.locator('.desktop-grid-viewport');
   await fixture.getByRole('heading',{name:'Wide ErpGrid component contract',exact:true}).waitFor();await grid.locator('[data-cell="0:0"]').waitFor();await paint();const column=label=>grid.getByRole('columnheader').filter({hasText:label});
   const initial=['Identity',...Array.from({length:16},(_,index)=>'Field '+String(index+1).padStart(2,'0'))],widths=Object.fromEntries(initial.map(label=>[label,label==='Identity'?200:160])),observations=[];
   async function verifyColumns(order,pinned,stage){
    await paint();const data=await grid.evaluate(el=>({
     count:Number(el.getAttribute('aria-colcount')),width:el.getBoundingClientRect().width,
     headers:[...el.querySelectorAll('thead [role=columnheader]')].map(header=>({label:header.textContent.trim(),index:Number(header.getAttribute('aria-colindex')),width:header.getBoundingClientRect().width,offset:header.getBoundingClientRect().left-el.getBoundingClientRect().left})),
     rows:[...el.querySelectorAll('tbody tr[data-grid-row]')].map(row=>({id:row.getAttribute('data-grid-row'),cells:[...row.querySelectorAll('[role=gridcell]')].map(cell=>({label:cell.getAttribute('data-label'),action:cell.classList.contains('request-list-open'),index:Number(cell.getAttribute('aria-colindex'))}))}))
    }));
    assert.equal(data.count,order.length+2,'Selection, logical data columns and Open action all count toward aria-colcount');
    const expectedWidth=44+156+order.reduce((sum,label)=>sum+widths[label],0);assert.equal(data.width,expectedWidth);assert.equal(await viewport.evaluate(el=>el.scrollWidth),expectedWidth,'Horizontal scroll extent uses the current widths and visible columns');
    const actions=await viewport.evaluate(el=>{
     const right=el.getBoundingClientRect().left+el.clientLeft+el.clientWidth;
     return [...el.querySelectorAll('.request-list-action-heading,.request-list-open')].map(cell=>({right:cell.getBoundingClientRect().right,position:getComputedStyle(cell).position,last:cell===cell.parentElement.lastElementChild})).map(cell=>({...cell,viewportRight:right}));
    });
    assert.equal(actions.length,3,'One fixed header and one action cell per row');
    for(const cell of actions){assert.equal(cell.position,'sticky');assert.equal(cell.last,true,'Filler cannot follow the action column');assert.ok(Math.abs(cell.right-cell.viewportRight)<=1,'Actions remain at the right edge at both ends of horizontal scrolling: '+JSON.stringify(cell));}
    assert.equal(data.headers[0].index,1);assert.equal(data.headers.at(-1).index,order.length+2);
    const dataHeaders=data.headers.filter(header=>order.includes(header.label));assert.ok(dataHeaders.length>0&&dataHeaders.length<order.length,'The fixture actually virtualizes its greater-than-twelve unpinned columns');
    for(const header of dataHeaders){
     const logical=order.indexOf(header.label);assert.equal(header.index,logical+2,'Rendered header aria-colindex uses its logical position');assert.equal(header.width,widths[header.label]);
     if(!pinned.includes(header.label))assert.ok(Math.abs(header.offset-(44+order.slice(0,logical).reduce((sum,label)=>sum+widths[label],0)))<=.5,'Virtual padding follows current width/order: '+JSON.stringify({stage,header,order}));
    }
    for(const row of data.rows){assert.equal(row.cells[0].index,1);assert.equal(row.cells.at(-1).action,true);assert.equal(row.cells.at(-1).index,order.length+2);for(const cell of row.cells.filter(cell=>cell.label))assert.equal(cell.index,order.indexOf(cell.label)+2,'Data-cell indexes match their logical column after virtual scrolling');assert.equal(await grid.getByRole('button',{name:'Open '+row.id,exact:true}).count(),1);}
    assert.deepEqual(data.rows.map(row=>row.cells.map(cell=>cell.index)),data.rows.map(()=>data.headers.map(header=>header.index)),'Each row and its rendered headers expose identical logical positions');observations.push({stage,...data});
   }
   await column('Field 01').waitFor();await verifyColumns(initial,['Identity'],'initial');assert.equal(await column('Field 16').count(),0);
   await viewport.evaluate(el=>{el.scrollLeft=el.scrollWidth;});await column('Field 16').waitFor();await verifyColumns(initial,['Identity'],'scrolled-end');
   await fixture.getByRole('button',{name:'Tùy chỉnh bảng',exact:true}).click();const settings=page.getByRole('dialog',{name:'Tùy chỉnh bảng',exact:true});await settings.waitFor();
   await settings.getByRole('button',{name:'Cố định Field 08',exact:true}).click();await settings.getByRole('checkbox',{name:'Hiển thị Field 04',exact:true}).click();await settings.getByRole('spinbutton',{name:'Độ rộng Field 01',exact:true}).fill('240');widths['Field 01']=240;
   await settings.getByRole('button',{name:'Đưa Field 01 xuống',exact:true}).click();await settings.getByRole('button',{name:'Đưa Field 01 xuống',exact:true}).click();await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});
   const changed=['Identity','Field 08','Field 02','Field 03','Field 01',...initial.slice(5).filter(label=>label!=='Field 08')];
   await viewport.evaluate(el=>{el.scrollLeft=0;});await column('Field 01').waitFor();await verifyColumns(changed,['Identity','Field 08'],'resized-reordered-start');assert.equal(await column('Field 04').count(),0);
   await viewport.evaluate(el=>{el.scrollLeft=el.scrollWidth;});await column('Field 16').waitFor();await verifyColumns(changed,['Identity','Field 08'],'resized-reordered-end');
   assert.deepEqual(await page.evaluate(()=>window.i42WideOpens),[]);assert.equal(calls.length,0,'The wide virtual-column fixture never claims Workspace or backend acceptance');
   sharedGridEvidence.push({kind:'component-contract-only-wide-grid',workspaceWiring:false,backendRequests:0,observations});
  });
  for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${screen} loading, empty and failed list`,async()=>{
    await start(390,screen,{holdList:true});await eventually(()=>model.waiters.length>0);await host(screen).getByRole('status').first().waitFor();await capture(`${screen}-loading-390`);release();await open(screen).waitFor();
    await start(390,screen,{empty:true});await host(screen).getByText(/Không có|Chưa có/).first().waitFor();await layout(390,screen);await capture(`${screen}-empty-390`);
    await start(320,screen,{status:503});await host(screen).getByText(/Chưa tải|Không thể|khả dụng/).first().waitFor();await layout(320,screen);await capture(`${screen}-error-320`);
    await start(390,screen,{status:403});await eventually(()=>model.deniedLists>0);
    if(screen==='purchase-requests'){
     await eventually(()=>model.workspaceReads>=2);
     await page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true}).waitFor();
     assert.equal(await host(screen).getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);
     assert.equal(await page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).count(),0);
     await paint();assert.equal(model.workspaceReads,2,'A denied read permits one bounded parent recheck');assert.equal(model.deniedLists,1);
     assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
    }else await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();
    await capture(`${screen}-denied-390`);assert.equal(await open(screen).count(),0);
   });
  }
  await run('mobile editable exact values and unresolved Save keep custody',async()=>{
   await start(390,'inbound-requests',{writable:true,unknown:true});
   const control=await page.evaluate(async()=>{const results=[];for(const kind of ['closed','bff']){try{const response=await fetch('/i30/network-control/'+kind,{method:'POST',body:'SYNTHETIC TRANSPORT CONTROL'});results.push({kind,status:response.status});}catch{results.push({kind,status:null});}}return results;});
   const controlDispatches=await page.evaluate(()=>window.i30ControlDispatches);for(const kind of ['closed','bff'])assert.equal(controlDispatches.filter(event=>event.kind===kind).length,1);assert.equal(control[0].status,null);assert.ok(model.control.closed.length>=1);assert.equal(new Set(model.control.closed).size,1);assert.equal(model.control.bff.length,1);assert.equal(control[1].status,503);
   await open('inbound-requests').click();const order=page.getByLabel('Số đơn',{exact:true});await order.waitFor();await order.fill('SYNTHETIC EDIT');await order.focus();await layout(390,'inbound-requests');
   assert.equal(await page.getByLabel('Số lượng bộ theo chứng từ',{exact:true}).inputValue(),'999999999999999999');
   await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');assert.equal(await page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).isEnabled(),true);
   assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);assert.equal(model.effects,1);assert.equal((await page.evaluate(()=>window.i30SaveDispatches)).length,1);await layout(390,'inbound-requests');await capture('inbound-requests-unresolved-390');
   await page.getByRole('button',{name:'Quay lại danh sách',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);await capture('inbound-requests-custody-390');assert.equal((await page.evaluate(()=>window.i30Notices)).length,0,'Unknown result is never a success or failure toast');
   await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='editing');
   assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC EDIT');assert.equal(model.effects,1);assert.equal(model.writes.length,1);assert.equal(model.reconciles.length,1);assert.equal(model.reconciles[0],model.writes[0].bodySha256);
   const clientBodies=await page.evaluate(()=>window.i30SaveDispatches);assert.equal(clientBodies.length,1);assert.equal(sha(clientBodies[0]),model.writes[0].bodySha256);
   transportEvidence.push({control:{responses:control,clientCalls:controlDispatches.map(event=>({kind:event.kind,bodySha256:sha(event.body)})),closedServerRequests:model.control.closed.length,closedBodyHashes:model.control.closed,bffServerRequests:model.control.bff.length},applicationSaveDispatches:clientBodies.length,serverSaveRequests:model.writes.length,effects:model.effects,originalBodySha256:model.writes[0].bodySha256,reconcileBodySha256:model.reconciles[0]});await capture('inbound-requests-reconciled-390');await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await paint();assert.equal((await page.evaluate(()=>window.i30Notices)).length,1);assert.equal(model.effects,1);assert.equal(model.writes.length,1);
  });
  await run('notification ledger deduplicates receipts and fences scopes without changing outcomes',async()=>{
   const emitted=[],dismissed=[];const sink={success:(message)=>{emitted.push(['success',message]);return emitted.length;},error:(message)=>{emitted.push(['error',message]);return emitted.length;},warning:(message)=>{emitted.push(['warning',message]);return emitted.length;},dismiss:id=>dismissed.push(id)};
   const notices=createRequestNotifications(sink);notices.configure('A',true);for(const receipt of [{operationId:'receipt-1',receiptId:'first'},{operationId:'receipt-1',receiptId:'different'}])notices.notify('A',receipt.operationId,'saved');assert.equal(emitted.length,1);
   notices.configure('A',false);assert.deepEqual(dismissed,[1]);notices.notify('A','receipt-2','saved');assert.equal(emitted.length,1);
   notices.configure('A',true);notices.notify('A','receipt-1','saved');assert.equal(emitted.length,1);notices.notify('A','receipt-2','submitted');assert.equal(emitted.length,2);
   notices.configure('B',true);notices.notify('A','receipt-3','saved');assert.equal(emitted.length,2);notices.retire();notices.notify('B','receipt-4','saved');assert.equal(emitted.length,2);
   // Output receipt identity is not the operation identity: independent operations
   // may share that output, while a replay may return different output metadata.
   const independent=[],byIntent=createRequestNotifications({...sink,success:message=>{independent.push(message);return 'operation-'+independent.length;}});byIntent.configure('A',true);
   for(const receipt of [{intentId:'original-A',receiptId:'shared'},{intentId:'original-B',receiptId:'shared'}])byIntent.notify('A',receipt.intentId,'saved');assert.equal(independent.length,2);
   byIntent.notify('A',{intentId:'original-A',receiptId:'changed'}.intentId,'saved');assert.equal(independent.length,2);byIntent.retire();
   const terminalMessages=[],terminal=createRequestNotifications({...sink,error:message=>{terminalMessages.push(['error',message]);return 'rejected';},warning:message=>{terminalMessages.push(['warning',message]);return 'conflict';}});terminal.configure('A',true);terminal.notify('A','definitive-rejection','rejected');terminal.notify('A','definitive-conflict','conflict');assert.deepEqual(terminalMessages,[['error','Chưa thể hoàn tất thao tác. Kiểm tra thông tin trên phiếu.'],['warning','Phiếu đã thay đổi trên ERP. Kiểm tra trước khi thao tác lại.']]);terminal.retire();
   const broken=createRequestNotifications({...sink,success:()=>{throw Error('synthetic notification failure');}});broken.configure('A',true);assert.doesNotThrow(()=>broken.notify('A','receipt','saved'));
  });
  const notices=()=>page.evaluate(()=>structuredClone(window.i30Notices));
  const toastText=text=>page.locator('[data-sonner-toast]').filter({hasText:text});
  const inboundReady=()=>page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='editing'&&!document.getElementById('inbound-header-orderNumber')?.matches(':disabled'));
  const saveInbound=async()=>{await open('inbound-requests').click();await inboundReady();await page.getByLabel('Số đơn',{exact:true}).fill('SYNTHETIC TOAST EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();};
  await run('purchase Save and Submit notify once from validated receipts',async()=>{
   await start(390,'purchase-requests',{writable:true});await open('purchase-requests').click();await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).fill('SYNTHETIC TOAST EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();
   await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await toastText('ERP đã xác nhận gửi đề nghị mua hàng.').waitFor();await backgroundActivate(host('purchase-requests').getByRole('button',{name:'Làm mới',exact:true}));await paint();
   assert.deepEqual((await notices()).map(v=>v.type),['success','success']);assert.equal(calls.filter(v=>v.route==='/api/purchase-requests/save').length,1);assert.equal(calls.filter(v=>v.route==='/api/purchase-requests/submit').length,1);await capture('purchase-request-toast-390');
  });
  await run('inbound Save and Send notify once and survive readback without duplicates',async()=>{
   await start(390,'inbound-requests',{writable:true});await saveInbound();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();await inboundReady();await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Gửi yêu cầu nhập kho',exact:true}).click();await toastText('ERP đã xác nhận gửi yêu cầu nhập kho.').waitFor();await page.getByRole('button',{name:'Đọc lại ERP',exact:true}).click();await paint();
   assert.deepEqual((await notices()).map(v=>v.type),['success','success']);assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/save').length,1);assert.equal(calls.filter(v=>v.route==='/api/inbound-requests/draft/send-to-warehouse').length,1);await capture('inbound-request-toast-390');
  });
  await run('hosted no-receipt rejection and conflict remain unknown without false terminal notices',async()=>{
   for(const kind of ['rejected','conflict']){
    await start(390,'inbound-requests',{writable:true,[kind]:true});await saveInbound();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');const reconcile=page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true});assert.equal(await reconcile.isEnabled(),true);
    assert.deepEqual(await notices(),[]);assert.equal(model.effects,0);assert.equal(model.writes.length,1);assert.equal((await page.evaluate(()=>window.i30SaveDispatches)).length,1);await reconcile.click();await eventually(()=>model.reconciles.length===1);await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');assert.equal(await reconcile.isEnabled(),true);
    assert.equal(model.reconciles.length,1);assert.equal(model.reconciles[0],model.writes[0].bodySha256);assert.equal(model.effects,0);assert.equal(model.writes.length,1);assert.deepEqual(await notices(),[]);await capture(`inbound-no-receipt-${kind}-390`);
   }
  });
  await run('component contract only: trusted definitive outcomes render real Sonner errors and warnings',async()=>{
   for(const outcome of ['Rejected','Conflict']){
    await start(390,'inbound-requests',{},'&component-outcome='+outcome);await page.getByRole('heading',{name:'Kiểm thử thành phần với adapter tổng hợp',exact:true}).waitFor();await inboundReady();await page.getByLabel('Số đơn',{exact:true}).fill('SYNTHETIC DEFINITIVE ADAPTER EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    const text=outcome==='Rejected'?'Chưa thể hoàn tất thao tác. Kiểm tra thông tin trên phiếu.':'Phiếu đã thay đổi trên ERP. Kiểm tra trước khi thao tác lại.';await toastText(text).waitFor();assert.deepEqual((await notices()).map(notice=>notice.type),[outcome==='Rejected'?'error':'warning']);assert.equal(await page.getByTestId('inbound-editor').getAttribute('data-phase'),outcome==='Rejected'?'failed':'conflict');
    const commands=await page.evaluate(()=>window.i30ComponentCalls);assert.equal(commands.length,1);assert.equal(commands[0].frozen,true);assert.equal(JSON.parse(commands[0].body).header.orderNumber,'SYNTHETIC DEFINITIVE ADAPTER EDIT');assert.equal(calls.length,0,'This labelled component contract fixture makes no HTTP/API claims or requests');
    await page.getByRole('button',{name:'Rời kiểm thử thành phần',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.i30ComponentLeft),false);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC DEFINITIVE ADAPTER EDIT');await capture(`component-terminal-${outcome.toLowerCase()}-toast-390`,{viewport:true});
   }
  });
  await run('malformed purchase and inbound acknowledgments never announce success',async()=>{
   for(const screen of ['purchase-requests','inbound-requests']){
    await start(390,screen,{writable:true,malformed:true});
    if(screen==='inbound-requests'){await saveInbound();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');}
    else{await open(screen).click();await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).fill('SYNTHETIC MALFORMED ACK');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();}
    await paint();assert.deepEqual(await notices(),[]);assert.equal(model.commandResponses,1);
   }
  });
  await run('retired command acknowledgment cannot produce a late success notification',async()=>{
   await start(390,'inbound-requests',{writable:true,holdCommands:true});await saveInbound();await eventually(()=>model.commandWaiters.length===1);model.workspaceStatus=401;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByTestId('inbound-editor').waitFor({state:'detached'});release();await eventually(()=>model.commandResponses===1);await paint();assert.deepEqual(await notices(),[]);
  });
  await run('workspace outage dismisses scoped notices and polls stay quiet',async()=>{
   await start(390,'inbound-requests',{writable:true});await saveInbound();await toastText('ERP đã xác nhận lưu thay đổi.').waitFor();await inboundReady();model.workspaceStatus=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true}).waitFor();await page.getByLabel('Số đơn',{exact:true}).waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').waitFor({state:'detached'});assert.equal((await notices()).length,1);
   model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await inboundReady();await paint();assert.equal((await notices()).length,1);
  });
  await run('disclosure exposes every one of 101 and 500 source rows with exact values',async()=>{
   for(const [width,count] of [[320,101],[390,500]]){
    const document=structuredClone(purchase);document.lines=Array.from({length:count},(_,index)=>({...structuredClone(purchase.lines[0]),lineId:'QA-LINE-'+String(index+1).padStart(3,'0'),values:{...structuredClone(purchase.lines[0].values),itemId:purchase.lines[0].values.itemId+'-'+String(index+1).padStart(3,'0')}}));
    await start(width,'purchase-requests',{purchase:document});await open('purchase-requests').click();const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await region.waitFor();
    assert.equal(await region.locator('details').evaluate(el=>el.open),false);assert.equal(await region.locator('table').isVisible(),false);assert.equal(await region.locator('tbody tr').count(),count,'Disclosure does not drop hidden rows');
    await expandFullReadback();const table=region.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});assert.equal(await table.getByRole('columnheader').count(),8);assert.equal(await table.locator('tbody tr').count(),count);assert.equal(await table.getByRole('cell').count(),8*count);
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(),['STT','Mặt hàng','Ngân sách','Thời gian yêu cầu','Số lượng','Đơn giá','Thành tiền','Model']);
    await exactItemIdentityGroups(table.locator('tbody tr > td:nth-child(2) > dl[aria-label="Thông tin mặt hàng"]'),document.lines.map(line=>line.values));
    assert.deepEqual(await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map((cell,index)=>index===1?cell.querySelector(':scope > dl[aria-label="Thông tin mặt hàng"] > div > dd').textContent:cell.lastElementChild.textContent))),purchaseLineValues(document),'All eight cells, including the exact source ItemID, remain exact and ordered');
    await retainedLineIdentity(table.locator('tbody tr'),document.lines);await hiddenLineIdentities(region,document.lines);
    assert.match(await region.innerText(),/2026-10-01T14:22:11.003/);assert.match(await region.innerText(),/NULL/);const last=table.locator('tbody tr').last();assert.equal(await last.getByRole('cell').first().locator('span').last().textContent(),String(count));assert.match(await last.innerText(),/999999999999999999/);assert.match(await last.innerText(),/""/);
    await layout(width,'purchase-requests');await last.scrollIntoViewIfNeeded();await capture(`purchase-full-${count}-last-row-${width}`,{viewport:true,keepFocus:true});assert.equal(calls.filter(v=>v.method==='POST').length,0);
   }
  });
  await run('dark request surfaces retain keyboard focus, native disclosure and mobile containment',async()=>{
   for(const width of [390,1440])for(const screen of ['purchase-requests','inbound-requests']){
    await start(width,screen);await open(screen).waitFor();await page.getByRole('button',{name:'Chuyển giao diện tối',exact:true}).click();await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    const filter=host(screen).locator('input').first();await page.keyboard.press('Tab');await filter.focus();assert.equal(await filter.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')),true);const focus=await filter.evaluate(el=>{const style=getComputedStyle(el);return {outline:style.outlineStyle,width:parseFloat(style.outlineWidth),shadow:style.boxShadow};});assert.ok(focus.outline!=='none'&&focus.width>=2,'Keyboard focus must have the actual 2px outline, not merely an unfocused default shadow');await layout(width,screen);await filter.scrollIntoViewIfNeeded();await capture(`${screen}-dark-focus-${width}`,{viewport:true,keepFocus:true});
    await open(screen).click();if(screen==='purchase-requests'){const region=page.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});const summary=region.locator('summary');await summary.waitFor();await summary.focus();await page.keyboard.press('Enter');assert.equal(await region.locator('details').evaluate(el=>el.open),true);await page.keyboard.press('Space');assert.equal(await region.locator('details').evaluate(el=>el.open),false);}else await page.getByLabel('Số đơn',{exact:true}).waitFor();await layout(width,screen);await capture(`${screen}-dark-readonly-${width}`);assert.equal(calls.filter(v=>v.method==='POST').length,0);
   }
  });
  const fullLists=()=>({purchaseDocuments:Array.from({length:20},(_,index)=>({...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-'+String(index+1).padStart(3,'0')})),inboundDocuments:Array.from({length:50},(_,index)=>({...structuredClone(inbound),documentId:'QA-INBOUND-'+String(index+1).padStart(3,'0')}))});
  const focusRegion=screen=>page.getByRole('region',{name:screen==='purchase-requests'?/^Phiếu mua hàng hiện có/:/^Phiếu nhập hàng đã chọn/});
  const detailFocusCounts=screen=>page.evaluate(label=>{const calls=window.requestDetailFocusCalls.filter(call=>call.label===label);return {frame:calls.filter(call=>call.kind==='frame').length,region:calls.filter(call=>call.kind==='region').length};},screen==='purchase-requests'?'Phiếu mua hàng hiện có':'Phiếu nhập hàng đã chọn');
  const unchangedDetailFocus=async(screen,before,message)=>assert.deepEqual(await detailFocusCounts(screen),before,message??'Read completion cannot add frame or obsolete-region focus');
  const oneExplicitDetailFocus=async(screen,before,documentId)=>{
   await eventually(async()=> (await detailFocusCounts(screen)).frame>before.frame);await focusedDetail(screen);assert.deepEqual(await detailFocusCounts(screen),{frame:before.frame+1,region:before.region},'Same-document Open calls its bounded frame once and never the obsolete region');
   const focusedDocument=await page.evaluate(label=>window.requestDetailFocusCalls.filter(call=>call.label===label&&call.kind==='frame').at(-1)?.documentNumber,screen==='purchase-requests'?'Phiếu mua hàng hiện có':'Phiếu nhập hàng đã chọn');
   assert.equal(focusedDocument,documentId,'The one admitted native focus belongs to the explicitly opened document');assert.equal(await detailDialog(screen).locator('.record-document-number').textContent(),documentId);
  };
  const openRow=(screen,index)=>screen==='purchase-requests'?page.getByRole('button',{name:'Mở đề nghị QA-PURCHASE-'+String(index).padStart(3,'0'),exact:true}):page.getByRole('button',{name:new RegExp('^Mở phiếu QA-INBOUND-'+String(index).padStart(3,'0')+' ')});
  const closeSelection=screen=>page.getByRole('button',{name:screen==='purchase-requests'?'Đóng đề nghị':'Quay lại danh sách',exact:true});
  async function focusedVisible(locator){await eventually(()=>locator.evaluate(element=>document.activeElement===element));await paint();const metrics=await locator.evaluate(element=>({top:element.getBoundingClientRect().top,header:document.querySelector('.topbar')?.getBoundingClientRect().bottom??0,height:innerHeight,tag:element.tagName}));assert.ok(metrics.top>=metrics.header-1&&metrics.top<metrics.height-90,JSON.stringify(metrics));assert.ok(!['INPUT','TEXTAREA','SELECT'].includes(metrics.tag));}
  await run('full20/50-row lists move explicit pointer and keyboard Open to detail and Close to origin',async()=>{
for(const width of [320,390,1440])for(const screen of ['purchase-requests','inbound-requests']){
    await start(width,screen,fullLists());await openRow(screen,1).waitFor();assert.equal(await host(screen).getByRole('button',{name:screen==='purchase-requests'?/^Mở đề nghị QA-PURCHASE-/:/^Mở phiếu QA-INBOUND-/}).count(),screen==='purchase-requests'?20:50);
    const filter=host(screen).locator('input').first();await filter.fill('UNAPPLIED FILTER DRAFT');
    await openRow(screen,1).click();await focusedDetail(screen);await capture(`${screen}-full-list-open-${width}`,{viewport:true,keepFocus:true});await layout(width,screen);await closeSelection(screen).click();await focusedVisible(openRow(screen,1));assert.equal(await filter.inputValue(),'UNAPPLIED FILTER DRAFT');
    const middle=screen==='purchase-requests'?11:26;await openRow(screen,middle).focus();await page.keyboard.press('Enter');await focusedDetail(screen);await capture(`${screen}-full-list-keyboard-open-${width}`,{viewport:true,keepFocus:true});if(screen==='purchase-requests')await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();const repeatFocus=await detailFocusCounts(screen);await backgroundActivate(openRow(screen,middle));await oneExplicitDetailFocus(screen,repeatFocus,(screen==='purchase-requests'?'QA-PURCHASE-':'QA-INBOUND-')+String(middle).padStart(3,'0'));await closeSelection(screen).focus();await page.keyboard.press('Enter');await focusedVisible(openRow(screen,middle));await capture(`${screen}-full-list-close-${width}`,{viewport:true,keepFocus:true});assert.equal(await filter.inputValue(),'UNAPPLIED FILTER DRAFT');assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('late or failed explicit reads never steal later modal-control or refresh focus',async()=>{
   for(const screen of ['purchase-requests','inbound-requests']){
    await start(390,screen,{...fullLists(),holdDetail:true});await openRow(screen,1).click();await eventually(()=>model.detailWaiters.length>0);const laterControl=detailDialog(screen).getByTitle('Đóng hộp thoại',{exact:true});await laterControl.focus();release();await focusRegion(screen).waitFor();if(screen==='purchase-requests')await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();assert.equal(await laterControl.evaluate(element=>document.activeElement===element),true,'A late detail read cannot steal a newer modal-control focus');await capture(`${screen}-cancelled-focus-390`,{viewport:true,keepFocus:true});
    await start(390,screen,{...fullLists(),holdDetail:true});await openRow(screen,1).click();await eventually(()=>model.detailWaiters.length>0);assert.equal(await page.evaluate(()=>document.hidden),false);await page.evaluate(()=>window.dispatchEvent(new FocusEvent('blur')));const blurredFocus=await detailFocusCounts(screen);release();if(screen==='purchase-requests')await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();await unchangedDetailFocus(screen,blurredFocus,'A window-blur signal retires focus even while the document remains visible');
    await start(390,screen,{...fullLists(),detailStatus:503});await openRow(screen,1).click();const retry=detailDialog(screen).getByRole('button',{name:screen==='purchase-requests'?'Xác minh lại phiếu':'Xác minh lại quyền nhập hàng',exact:true});if(screen==='purchase-requests')await detailDialog(screen).getByRole('alert').waitFor();else await detailDialog(screen).getByText('Chưa xác minh được quyền nhập hàng. Ý định đang giữ không bị bỏ; thử xác minh lại trong đúng phiên.',{exact:true}).waitFor();const retryControl=detailDialog(screen).getByTitle('Đóng hộp thoại',{exact:true});await retryControl.focus();const retryFocus=await detailFocusCounts(screen);model.detailStatus=200;await retry.evaluate(button=>button.click());if(screen==='purchase-requests')await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();else await page.getByLabel('Số đơn',{exact:true}).waitFor();await paint();await unchangedDetailFocus(screen,retryFocus,'Failed-read retry cannot steal later modal-control focus');assert.equal(await retryControl.evaluate(element=>element===document.activeElement),true);await closeSelection(screen).click();await openRow(screen,1).click();await focusedDetail(screen);assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('support details never expose arbitrary errors or references',async()=>{
   await page.goto(origin+'/?diagnostics=1');await page.getByText('Thông tin hỗ trợ',{exact:true}).click();const text=await page.locator('body').innerText();assert.match(text,/503/);assert.match(text,/unknown_code/);assert.doesNotMatch(text,/PRIVATE_SQL_SENTINEL|PRIVATE_COOKIE_SENTINEL/);
  });
  const projectionRoute='/api/documents/inbound-requests/detail';
  const readonlyPanel=()=>page.getByTestId('inbound-request-readonly');
  const projectionCalls=()=>calls.filter(call=>call.route===projectionRoute);
  const draftCalls=()=>page.evaluate(()=>window.i33ReadDispatches.filter(event=>event.path==='/api/erp/api/inbound-requests/draft'));
  async function settledReads(){await page.waitForFunction(()=>window.i33ReadDispatches.length>0&&window.i33ReadDispatches.every(event=>event.settled));await paint();}
  async function readonlyReady(number){await page.waitForFunction(number=>{const panel=document.querySelector('[data-testid=inbound-request-readonly]');return panel?.getAttribute('data-phase')==='ready'&&(number===undefined||panel.querySelector('article h4')?.textContent==='Dòng '+((number-1)*50+1));},number);}
  async function noReadonlyValues(){assert.equal(await page.getByText(readonlyLines[0].itemId,{exact:true}).count(),0);assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0);assert.equal(await page.getByLabel('Số đơn',{exact:true}).count(),0);assert.equal(calls.filter(call=>call.method==='POST').length,0);}
  function releaseDraft(){model.holdDetail=false;model.detailWaiters.splice(0).forEach(resolve=>resolve());}
  function releaseProjection(){model.holdProjection=false;model.projectionWaiters.splice(0).forEach(resolve=>resolve());}
  let diagnosticSnapshots=0;
  async function recordReadonlyClockSnapshot(group,observation,stage,scenario,baseline){
   if(diagnosticSnapshots++>=64)return;
   const count=route=>calls.filter(call=>call.route===route).length;
   const server={requests:{workspace:count('/api/workspace'),list:count('/api/documents/inbound-requests'),draft:count('/api/inbound-requests/draft'),projection:projectionCalls().length},responseAttempts:{workspace:model.workspaceResponses,list:model.listResponses,draft:model.draftResponses,projection:model.projectionResponses},workspacePending:model.workspacePending,authorityObservationCount:model.workspaceVersions.length,authorityVersions:model.workspaceVersions.slice(-32)};
   try{
    const client=await page.evaluate(()=>{
     const fixedPhase=(element,allowed)=>{const phase=element?.getAttribute('data-phase');return phase===undefined||phase===null?'absent':allowed.includes(phase)?phase:'other';};
     const host=document.querySelector('[data-testid=inbound-request-host]'),panel=document.querySelector('[data-testid=inbound-request-readonly]'),editor=document.querySelector('[data-testid=inbound-editor]');
     const summarize=(events,counts)=>({total:counts?.total??events.length,retained:events.length,settled:counts?.settled??events.filter(event=>event.settled).length,pending:counts?.pending??events.filter(event=>!event.settled).length,recent:events.slice(-32).map(event=>({kind:event.path==='/api/erp/api/inbound-requests/draft'?'draft':event.path==='/api/erp/api/documents/inbound-requests/detail'?'projection':'workspace',settled:event.settled===true,hasCommandScope:event.hasCommandScope===true,fetchState:['pending','fulfilled','rejected'].includes(event.fetchState)?event.fetchState:'unobserved',httpStatus:Number.isInteger(event.httpStatus)?event.httpStatus:null,startedClockDelta:Number.isFinite(event.startedAt)?event.startedAt-window.i33ClockOrigin:null,settledClockDelta:Number.isFinite(event.settledAt)?event.settledAt-window.i33ClockOrigin:null}))});
     return {clock:window.i33ClockDiagnostics?.snapshot()??null,fetch:{workspace:summarize(window.i33WorkspaceDispatches??[],window.i33WorkspaceDispatchState),reads:summarize(window.i33ReadDispatches??[])},ui:{hostPresent:!!host,hostPhase:!host?'absent':host.getAttribute('data-readback-pending')==='true'?'readback-pending':host.querySelector('button[aria-label^="Mở phiếu "][aria-pressed=true]')?'visible-selected-row':'no-visible-selected-row',readbackPending:host?.getAttribute('data-readback-pending')==='true',panelPhase:fixedPhase(panel,['pending','ready','failed']),editorPhase:fixedPhase(editor,['empty','loading','editing','checking','pending','unknown','reconciling','failed','conflict','confirmed','readFailed']),selectedRowCount:host?.querySelectorAll('button[aria-label^="Mở phiếu "][aria-pressed=true]').length??0,listRowCount:host?.querySelectorAll('button[aria-label^="Mở phiếu "]').length??0,detailFocused:document.activeElement?.matches('.request-detail-dialog[role="dialog"],[role="region"][aria-label="Phiếu nhập hàng đã chọn"]')??false,detailFocusCalls:window.requestDetailFocusCalls}};
    });
    readonlyEvidence.push({kind:'clock-observation-diagnostic',group,observation,stage,...(scenario?{scenario}:{}),...(baseline?{baseline:{workspaceCount:baseline.count,authorityObservationCount:baseline.history.length,authorityHistory:baseline.history.slice(-32)}}:{}),server,client});
   }catch{readonlyEvidence.push({kind:'clock-observation-diagnostic',group,observation,stage,...(scenario?{scenario}:{}),...(baseline?{baseline:{workspaceCount:baseline.count,authorityObservationCount:baseline.history.length,authorityHistory:baseline.history.slice(-32)}}:{}),server,clientUnavailable:true});}
  }
  async function settledWorkspaceBaseline(){
   const ready=()=>window.i33WorkspaceDispatchState.pending===0&&window.i33ReadDispatches.every(event=>event.settled)
    &&document.querySelector('[data-testid=inbound-request-readonly]')?.getAttribute('data-phase')==='ready';
   await eventually(async()=>{if(!await page.evaluate(ready))return false;await paint();return page.evaluate(ready);});
   return {count:model.workspaceReads,history:[...model.workspaceVersions]};
  }
  async function roundedKeyboardFocus(locator){
   assert.equal(await locator.evaluate(element=>element===document.activeElement&&element.matches(':focus-visible')),true);
   const style=await locator.evaluate(element=>{const value=getComputedStyle(element);return {outline:value.outlineStyle,width:parseFloat(value.outlineWidth),radius:parseFloat(value.borderTopLeftRadius)};});
   assert.ok(style.outline!=='none'&&style.width>=2,'Actual keyboard focus outline is at least 2px: '+JSON.stringify(style));
   assert.ok(style.radius>=8,'Actual keyboard focus target has rounded corners: '+JSON.stringify(style));
  }
  async function exactReadonlyPage(number){
   await readonlyReady(number);const panel=readonlyPanel(),expected=readonlyProjection(model.inbound.documentId,number);
   assert.equal(await panel.getAttribute('aria-label'),'Phiếu nhập hàng chỉ đọc');
   assert.equal(await panel.locator('time').getAttribute('datetime'),expected.document.documentDate);assert.equal(await panel.locator('time').innerText(),'01/10/2026');
   const dialog=page.getByRole('dialog',{name:'Phiếu nhập hàng đã chọn '+expected.document.documentId,exact:true});assert.equal(await dialog.count(),1);
   const header=dialog.locator(':scope > header.request-detail-header');assert.equal(await header.count(),1);
   const identity=header.locator('.record-dialog-identity > h2 > .record-document-number');assert.equal(await identity.count(),1);assert.equal(await identity.textContent(),expected.document.documentId);assert.equal(await identity.isVisible(),true);
   const status=header.locator('.record-dialog-status .request-status');assert.equal(await status.count(),1);assert.equal(await status.innerText(),'Chưa có trạng thái');assert.equal(await status.isVisible(),true);
   const general=panel.getByRole('region',{name:'Thông tin chung',exact:true});assert.equal(await general.count(),1);
   assert.deepEqual(await general.locator(':scope > dl > div > dt').allTextContents(),['Ngày chứng từ','Chi nhánh','Khóa chứng từ']);
   assert.deepEqual(await general.locator(':scope > dl > div > dd').allTextContents(),['01/10/2026',expected.document.branchId,'NULL']);
   await exactReadonlyLines(panel,expected);
   assert.equal(await panel.locator('input,textarea,select,form,[contenteditable=true]').count(),0,'The projection has no editable form or keyboard input');
   assert.equal(await panel.getByRole('button',{name:'Dòng trước',exact:true}).isEnabled(),number>1);assert.equal(await panel.getByRole('button',{name:'Dòng tiếp',exact:true}).isEnabled(),expected.hasMore);
   assert.equal(calls.filter(call=>call.method==='POST').length,0);
  }
  await run('I33 typed closed Unavailable opens independent scoped exact read-only pages at 320,390,1440',async()=>{
   for(const width of [320,390,1440])for(const nullScope of [false,true]){
    const shape=nullScope?'null-scope':'scoped',documents=fullLists(),document={...structuredClone(inbound),documentId:'I'.repeat(50)};documents.inboundDocuments[0]=document;
    let positiveBaseline=null;
    try{
    await start(width,'inbound-requests',{...documents,inbound:document,advanceAuthority:true,observeWorkspace:true,draftEnvelope:unavailableDraft(nullScope),holdDetail:true,holdProjection:true});
    await open('inbound-requests').waitFor();assert.equal(await host('inbound-requests').getByRole('button',{name:/^Mở phiếu /}).count(),50);
    const filter=host('inbound-requests').locator('input').first();await filter.fill('UNAPPLIED READONLY FILTER');
    await open('inbound-requests').click();await eventually(()=>model.detailWaiters.length===1);await paint();assert.equal(projectionCalls().length,0,'READ projection waits for the typed command-service outcome');
    const initialFocus=await detailFocusCounts('inbound-requests');assert.deepEqual(initialFocus,{frame:1,region:0},'Opening owns the modal once before either read completes');assert.equal(await readonlyPanel().count(),0);
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await paint();assert.equal(await readonlyPanel().getAttribute('data-phase'),'pending');
    await unchangedDetailFocus('inbound-requests',initialFocus,'Command Unavailable alone never adds deferred Open focus');
    assert.equal(await page.evaluate(()=>document.activeElement?.matches('input,textarea,select,[contenteditable=true]')),false);assert.equal(await page.getByText(readonlyLines[0].itemId,{exact:true}).count(),0);
    releaseProjection();await exactReadonlyPage(1);await focusedDetail('inbound-requests');await layout(width,'inbound-requests');await capture(`inbound-readonly-${shape}-open-${width}`,{viewport:true,keepFocus:true});
    const first=readonlyPanel().locator('article').first();await first.scrollIntoViewIfNeeded();assert.equal(await first.locator('dd').evaluateAll(elements=>elements.every(element=>{const range=document.createRange();range.selectNodeContents(element);return [...range.getClientRects()].every(rect=>rect.left>=0&&rect.right<=innerWidth)&&element.scrollWidth<=Math.ceil(element.clientWidth);})),true,'READ row ordinals, long item IDs and exact decimals remain fully contained');await capture(`inbound-readonly-${shape}-long-values-${width}`,{viewport:true,keepFocus:true});
    await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).click();await exactReadonlyPage(2);await layout(width,'inbound-requests');await readonlyPanel().locator('article').first().scrollIntoViewIfNeeded();await capture(`inbound-readonly-${shape}-page2-${width}`,{viewport:true,keepFocus:true});
    assert.equal(await readonlyPanel().getByText(readonlyLines[0].itemId,{exact:true}).count(),0,'Paging does not retain previous-page values');
    assert.equal((await draftCalls()).length,1,'Paging cannot bootstrap draft rights or retry a draft command');
    // A healthy VISIBLE refresh advances observation authority, but retains
    // the independently READ-authorized panel/list and their exact DOM nodes.
    // Hold all three reads so a remount, collapse or scroll jump is observable.
    const healthyControl=detailDialog('inbound-requests').getByTitle('Đóng hộp thoại',{exact:true});await healthyControl.focus();const healthyFocus=await detailFocusCounts('inbound-requests');
    const continuity=await page.evaluateHandle(()=>{
     const panel=document.querySelector('[data-testid=inbound-request-readonly]'),buttons=[...panel.querySelectorAll('nav button')],rows=[...document.querySelectorAll('[data-testid=inbound-request-host] button[aria-label^="Mở phiếu "]')];
     return {panel,buttons,rows,scrollY,scrollX,detailScroll:panel.closest('.request-detail-body').scrollTop,articleTop:panel.querySelector('article').getBoundingClientRect().top};
    });
    async function stableHealthyRead(fenced){
     await paint();const state=await page.evaluate(previous=>{
      const panel=document.querySelector('[data-testid=inbound-request-readonly]'),buttons=[...panel.querySelectorAll('nav button')],rows=[...document.querySelectorAll('[data-testid=inbound-request-host] button[aria-label^="Mở phiếu "]')];
      return {samePanel:panel===previous.panel,sameButtons:buttons.length===previous.buttons.length&&buttons.every((button,index)=>button===previous.buttons[index]),sameRows:rows.length===previous.rows.length&&rows.every((row,index)=>row===previous.rows[index]),rowCount:rows.length,detailScrollDelta:Math.abs(panel.closest('.request-detail-body').scrollTop-previous.detailScroll),scrollDelta:Math.abs(scrollY-previous.scrollY),horizontalDelta:Math.abs(scrollX-previous.scrollX),articleDelta:Math.abs(panel.querySelector('article').getBoundingClientRect().top-previous.articleTop)};
     },continuity);
     assert.equal(state.samePanel,true,'Healthy same-READ-scope observation keeps the exact panel node');assert.equal(state.sameButtons,true,'Healthy refresh keeps both page2 paging button nodes');assert.equal(state.sameRows,true,'Healthy refresh keeps every existing list-row node');assert.equal(state.rowCount,50);
     assert.ok(state.detailScrollDelta<=1&&state.scrollDelta<=1&&state.horizontalDelta<=1&&state.articleDelta<=1,'Healthy refresh cannot jump the page or move its visible content: '+JSON.stringify(state));
     await exactReadonlyLines(readonlyPanel(),readonlyProjection(document.documentId,2));
     assert.equal(await readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).isEnabled(),!fenced);assert.equal(await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).isEnabled(),false);
     assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');await unchangedDetailFocus('inbound-requests',healthyFocus);assert.equal(await healthyControl.evaluate(element=>element===document.activeElement),true);assert.equal(calls.filter(call=>call.method==='POST').length,0);
    }
    const healthyBaseline=await settledWorkspaceBaseline();positiveBaseline=healthyBaseline;
    model.holdList=true;model.holdDetail=true;model.holdProjection=true;const visibleWorkspaceReads=model.workspaceReads;
    await recordReadonlyClockSnapshot('positive-healthy','before-deliberate-focus','before',{width,shape},healthyBaseline);
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});
    await eventually(()=>model.workspaceReads>visibleWorkspaceReads);await eventually(()=>model.detailWaiters.length===1&&model.waiters.length===1);await recordReadonlyClockSnapshot('positive-healthy','held-workspace-list-draft','after',{width,shape},healthyBaseline);await stableHealthyRead(true);assert.equal(projectionCalls().length,2,'Healthy refresh waits for current draft eligibility without removing prior READ data');
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await stableHealthyRead(true);assert.deepEqual(projectionCalls().at(-1),{route:projectionRoute,method:'GET',documentId:document.documentId,page:'2',pageSize:'50',search:null,branchId:null});
    const listResponses=model.listResponses;model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());await eventually(()=>model.listResponses>listResponses);await stableHealthyRead(true);
    releaseProjection();await eventually(()=>model.projectionResponses===3);await settledReads();await eventually(()=>readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).isEnabled());await exactReadonlyPage(2);await stableHealthyRead(false);await recordReadonlyClockSnapshot('positive-healthy','fresh-projection','after',{width,shape},healthyBaseline);assert.deepEqual({count:model.workspaceReads,history:model.workspaceVersions},{count:healthyBaseline.count+1,history:[...healthyBaseline.history,healthyBaseline.count+1]});await continuity.dispose();
    await capture('inbound-readonly-'+shape+'-page2-healthy-refresh-'+width,{viewport:true,keepFocus:true});
    // Reuse the Workspace observation harness: a hidden/visible cycle suspends
    // authority, then verifies the SAME scope. A remembered page is only UI
    // intent; both draft eligibility and a fresh scoped page2 GET remain due.
    const hiddenBaseline=await settledWorkspaceBaseline();positiveBaseline=hiddenBaseline;
    model.holdDetail=true;model.holdProjection=true;const workspaceReads=model.workspaceReads;
    await recordReadonlyClockSnapshot('positive-hidden','before-visibility-cycle','before',{width,shape},hiddenBaseline);
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.i33Visibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.i33Visibility});document.dispatchEvent(new Event('visibilitychange'));});
    await readonlyPanel().waitFor({state:'hidden'});await paint();assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).isVisible(),false,'Page2 values are masked while Workspace authority is unverified');assert.equal(projectionCalls().length,3);
    await page.evaluate(()=>{window.i33Visibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
    await eventually(()=>model.workspaceReads>workspaceReads);await eventually(()=>model.detailWaiters.length===1);await open('inbound-requests').waitFor();await paint();const resumedFocus=await detailFocusCounts('inbound-requests');
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(await readonlyPanel().count(),0);assert.equal(projectionCalls().length,3,'Same-scope refresh still waits for current typed Unavailable');
    assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0);await unchangedDetailFocus('inbound-requests',resumedFocus);
    releaseDraft();await eventually(()=>model.projectionWaiters.length===1);await paint();assert.equal(await readonlyPanel().getAttribute('data-phase'),'pending');
    assert.deepEqual(projectionCalls().at(-1),{route:projectionRoute,method:'GET',documentId:document.documentId,page:'2',pageSize:'50',search:null,branchId:null});assert.equal(await page.getByText(readonlyLines[50].itemId,{exact:true}).count(),0,'Remembered page2 cannot expose cached values before the current READ response');
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');await unchangedDetailFocus('inbound-requests',resumedFocus);
    releaseProjection();await exactReadonlyPage(2);await paint();await unchangedDetailFocus('inbound-requests',resumedFocus,'Workspace revalidation cannot add deferred frame focus on the restored page');
    assert.equal(await open('inbound-requests').getAttribute('aria-pressed'),'true');assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(calls.filter(call=>call.method==='POST').length,0);await recordReadonlyClockSnapshot('positive-hidden','fresh-projection','after',{width,shape},hiddenBaseline);assert.deepEqual({count:model.workspaceReads,history:model.workspaceVersions},{count:hiddenBaseline.count+1,history:[...hiddenBaseline.history,hiddenBaseline.count+1]},'Both healthy and temporarily unverified observations advance authority while retaining READ markers');
    await readonlyPanel().locator('article').first().scrollIntoViewIfNeeded();await capture('inbound-readonly-'+shape+'-page2-revalidated-'+width,{viewport:true,keepFocus:true});
    await readonlyPanel().getByRole('button',{name:'Dòng trước',exact:true}).click();await exactReadonlyPage(1);
    assert.deepEqual(projectionCalls().map(call=>[call.method,call.documentId,call.page,call.pageSize]),[1,2,2,2,1].map(number=>['GET',document.documentId,String(number),'50']));assert.equal((await draftCalls()).length,3,'Only the explicit Workspace observation cycle revalidates draft eligibility');
    // The temporary authority gap correctly retires the old focus origin.
    // Re-activating the retained Open handler establishes today's origin without
    // another GET; the modal backdrop still prevents actual pointer access.
    const repeatedReadonlyFocus=await detailFocusCounts('inbound-requests');await backgroundActivate(open('inbound-requests'));await oneExplicitDetailFocus('inbound-requests',repeatedReadonlyFocus,document.documentId);assert.equal(projectionCalls().length,5);
    await closeSelection('inbound-requests').click();await focusedVisible(open('inbound-requests'));assert.equal(await readonlyPanel().count(),0);assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');
    await openRow('inbound-requests',26).focus();await page.keyboard.press('Enter');await readonlyReady();await focusedDetail('inbound-requests');await detailDialog('inbound-requests').getByTitle('Đóng hộp thoại',{exact:true}).focus();await roundedKeyboardFocus(detailDialog('inbound-requests').getByTitle('Đóng hộp thoại',{exact:true}));assert.equal(await detailDialog('inbound-requests').locator('.record-document-number').innerText(),'QA-INBOUND-026');
    await closeSelection('inbound-requests').focus();await page.keyboard.press('Enter');await focusedVisible(openRow('inbound-requests',26));await roundedKeyboardFocus(openRow('inbound-requests',26));assert.equal(await filter.inputValue(),'UNAPPLIED READONLY FILTER');assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(await notices(),[]);
    readonlyEvidence.push({kind:'scoped-readonly-success',width,shape,closedAccessVerified:true,revalidatedPage:2,healthyDomContinuityVerified:true,advancingAuthorityVersions:[...model.workspaceVersions],draftDispatches:(await draftCalls()).length,projectionRequests:projectionCalls(),writeRequests:0});
    }catch(error){await recordReadonlyClockSnapshot('positive-healthy','positive-combination','failure',{width,shape},positiveBaseline);throw error;}
   }
  });
  await run('I33 draft denial, transport failure and non-Unavailable outcomes never authorize fallback',async()=>{
   const variants=[...[401,403,404,409].map(status=>({name:'draft-http-'+status,patch:{detailStatus:status}})),
    {name:'draft-network',patch:{draftNetwork:true}},{name:'draft-malformed-json',patch:{draftMalformed:true}},
    ...['Denied','NotFound','Conflict','Rejected','InvalidInput','OutcomeUnknown'].map(outcome=>({name:'draft-'+outcome,patch:{draftEnvelope:{...unavailableDraft(false),data:{outcome,document:null}}}})),
    {name:'missing-edit-Denied-available-true',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true},data:{outcome:'Denied',document:null}}}},
    {name:'inconsistent-Unavailable-available-true',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true}}}},
    {name:'available-false-alone',patch:{draftEnvelope:{...unavailableDraft(true),data:{outcome:'NumberingUnavailable',document:null}}}},
    {name:'Unavailable-with-document',patch:{draftEnvelope:{...unavailableDraft(false),data:{outcome:'Unavailable',document:structuredClone(inbound)}}}},
    {name:'service-Unavailable-with-current-read-right',patch:{draftEnvelope:{...unavailableDraft(false),access:{...unavailableDraft(false).access,available:true,canRead:true}}}}];
   for(const {name,patch} of variants){
    const expectedReads=name==='service-Unavailable-with-current-read-right'?2:1;
    await start(390,'inbound-requests',patch);await open('inbound-requests').click();await page.waitForFunction(expected=>window.i33ReadDispatches.filter(event=>event.path==='/api/erp/api/inbound-requests/draft').length>=expected,expectedReads);await settledReads();
    assert.equal(await readonlyPanel().count(),0,name);assert.equal(projectionCalls().length,0,name+' must not issue detail GET');await noReadonlyValues();
    // Current canRead/available legitimately binds I18 after bootstrap. Its one
    // scoped full read rejects Unavailable; it is not a replacement retry.
    assert.equal((await draftCalls()).length,expectedReads,name+' has exactly the source-required read phases');assert.deepEqual((await draftCalls()).map(event=>event.hasCommandScope),expectedReads===2?[false,true]:[false],name+' distinguishes bootstrap from the bound full read');await page.waitForTimeout(100);await settledReads();assert.equal((await draftCalls()).length,expectedReads,name+' stays quiet after settled reads');if(patch.draftNetwork)assert.equal(model.draftNetworkFailures,1);
    assert.deepEqual(await detailFocusCounts('inbound-requests'),{frame:1,region:0},name+' permits only immediate modal focus, never deferred read focus');
    readonlyEvidence.push({kind:'draft-fail-closed',scenario:name,draftDispatches:(await draftCalls()).length,projectionRequests:0,writeRequests:0});
   }
  });
  await run('I33 independent READ denials and invalid scopes hide values and late reads cannot steal focus',async()=>{
   const variants=[...[401,403,404,409].map(status=>({name:'projection-http-'+status,patch:{projectionStatus:status}})),
    ...['malformed','wrong-document','wrong-branch','wrong-page','wrong-page-size','wrong-read-scope','wrong-session-scope','missing-read-scope'].map(kind=>({name:'projection-'+kind,patch:{projectionKind:kind}}))];
   for(const {name,patch} of variants){
    const wrongPageSize=patch.projectionKind==='wrong-page-size';
    await start(390,'inbound-requests',{draftEnvelope:unavailableDraft(false),...patch});await open('inbound-requests').click();
    if(wrongPageSize){await exactReadonlyPage(1);await readonlyPanel().getByRole('button',{name:'Dòng tiếp',exact:true}).click();}
    await eventually(()=>model.projectionResponses===(wrongPageSize?2:1));await settledReads();
    if(wrongPageSize){
     assert.equal(readonlyProjection(inbound.documentId,2).inboundRequestLines.length,1,'The invalid pageSize fixture is below25 rows, so row-count overflow cannot explain rejection');
     assert.equal(projectionCalls().at(-1).page,'2');assert.equal(projectionCalls().at(-1).pageSize,'50');assert.equal(await readonlyPanel().getAttribute('data-phase'),'failed','A response pageSize25 cannot satisfy the requested page2/pageSize50 identity');
    }
    await noReadonlyValues();assert.equal(projectionCalls().length,wrongPageSize?2:1,name+' has no automatic retry');assert.equal(await readonlyPanel().locator('article').count(),0,name+' never renders projection rows');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Phiếu nhập hàng đã chọn"]')].some(element=>document.activeElement===element)),false,name+' cannot complete pending Open focus');
    readonlyEvidence.push({kind:'projection-fail-closed',scenario:name,projectionRequests:projectionCalls(),writeRequests:0});
   }
   // Use the real Workspace 60-second polling interval. The clock advances
   // scheduling only; production readers and every HTTP boundary stay mounted.
   // Each workspace response advances authorityVersion while its session/read
   // scope markers remain identical, so constant-version fixtures cannot hide
   // a 403 -> parent reload -> projection retry feedback loop.
   await start(390,'inbound-requests',{installClock:true,advanceAuthority:true,draftEnvelope:unavailableDraft(false),projectionStatus:403});
   await open('inbound-requests').click();const deniedCounts=[];
   async function boundedDeniedObservation(label,expected){
    await recordReadonlyClockSnapshot('projection-403',label,'before');
    try{
    await eventually(()=>model.projectionResponses>=expected);await settledReads();
    await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();
    await noReadonlyValues();const counts=()=>({workspace:model.workspaceReads,draft:calls.filter(call=>call.route==='/api/inbound-requests/draft').length,projection:projectionCalls().length});
    assert.deepEqual(counts(),{workspace:expected,draft:expected,projection:expected},label+' permits one projection attempt per deliberate observation');
    assert.equal((await draftCalls()).length,expected);assert.equal(await readonlyPanel().count(),0);
    await advanceScenarioClock(1000,0);await settledReads();assert.deepEqual(counts(),{workspace:expected,draft:expected,projection:expected},label+' cannot trigger an autonomous 403 retry cycle');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Phiếu nhập hàng đã chọn"]')].some(element=>document.activeElement===element)),false);
    deniedCounts.push({observation:label,...counts()});
    await recordReadonlyClockSnapshot('projection-403',label,'after');
    }catch(error){await recordReadonlyClockSnapshot('projection-403',label,'failure');throw error;}
   }
   await boundedDeniedObservation('initial-selection',1);
   await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});
   await boundedDeniedObservation('synthetic-window-focus',2);
   await advanceScenarioClock(60001,1);await boundedDeniedObservation('actual-60-second-poll',3);
   await page.evaluate(()=>{window.i33Visibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.i33Visibility});window.dispatchEvent(new FocusEvent('blur'));document.dispatchEvent(new Event('visibilitychange'));});await paint();
   await page.evaluate(()=>{window.i33Visibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
   await boundedDeniedObservation('synthetic-visibility-focus',4);
   await advanceScenarioClock(60001,1);await boundedDeniedObservation('next-60-second-poll',5);
   assert.deepEqual(model.workspaceVersions,[1,2,3,4,5]);assert.equal(calls.filter(call=>call.method==='POST').length,0);
   readonlyEvidence.push({kind:'persistent-read-403-bounded',sameReadMarkers:true,advancingAuthorityVersions:[...model.workspaceVersions],observations:deniedCounts,writeRequests:0});
   // Exercise the actual Workspace-bound LIST reader, not a list test seam.
   // Valid-looking scope markers from another authority must not expose even
   // the synthetic50-row summary or permit selection/projection bootstrap.
   for(const [name,listResponseHeaders] of [
    ['wrong-list-read-scope',{...readHeaders,'X-Medcom-Read-Scope':'c'.repeat(64)}],
    ['wrong-list-session-scope',{...readHeaders,'X-Medcom-Session-Scope':'c'.repeat(64)}],
    ['wrong-list-both-scopes',{'X-Medcom-Session-Scope':'c'.repeat(64),'X-Medcom-Read-Scope':'d'.repeat(64)}],
   ]){
    assert.ok(Object.values(listResponseHeaders).every(value=>/^[a-f0-9]{64}$/.test(value)),'Scope-denial fixtures use valid marker syntax');assert.notDeepEqual(listResponseHeaders,readHeaders);
    await start(390,'inbound-requests',{...fullLists(),installClock:true,advanceAuthority:true,holdList:true,listResponseHeaders,draftEnvelope:unavailableDraft(false)});
    const observations=[];
    const workspaceDispatchState=()=>page.evaluate(()=>({...window.i33WorkspaceDispatchState}));
    async function settledListWorkspace(expected){
     await page.waitForFunction(()=>window.i33WorkspaceDispatchState.total>0&&window.i33WorkspaceDispatchState.pending===0);await eventually(()=>model.workspacePending===0);await paint();
     assert.deepEqual(await workspaceDispatchState(),{total:expected,settled:expected,pending:0},name+' has exactly the intended current-page body-complete Workspace dispatches');
     assert.equal(await page.evaluate(()=>window.i33WorkspaceDispatches.every(event=>event.settled&&event.fetchState==='fulfilled'&&event.httpStatus===200)),true);
     assert.equal(model.workspaceResponses,model.workspaceReads);assert.equal(model.workspacePending,0);
    }
    // Establish the causal boundary before the invalid LIST can reach the UI.
    // The shared HTTP server may have earlier wire traffic that is not a fetch
    // from this page. Preserve that history, but never absorb additions after
    // this single baseline or attribute them to the denied-list response.
    let workspaceBaseline;
    try{
     await eventually(()=>model.waiters.length===1);await settledListWorkspace(1);
     assert.equal(model.listResponses,0);assert.equal(calls.filter(call=>call.route==='/api/documents/inbound-requests').length,1);
     assert.equal(calls.filter(call=>call.route==='/api/inbound-requests/draft').length,0);assert.equal(projectionCalls().length,0);await noReadonlyValues();
     workspaceBaseline={count:model.workspaceReads,history:[...model.workspaceVersions]};
     assert.deepEqual(workspaceBaseline.history,Array.from({length:workspaceBaseline.count},(_,index)=>index+1));
     readonlyEvidence.push({kind:'list-scope-pre-denial-baseline',scenario:name,serverWorkspace:workspaceBaseline.count,serverAuthorityVersions:[...workspaceBaseline.history],currentPageWorkspace:await workspaceDispatchState(),heldListRequests:1,listResponses:0});
     await recordReadonlyClockSnapshot(name,'held-initial-list','before',undefined,workspaceBaseline);
    }catch(error){await recordReadonlyClockSnapshot(name,'held-initial-list','failure',undefined,workspaceBaseline);throw error;}
    model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());
    async function boundedListScopeDenial(label,expected){
     await recordReadonlyClockSnapshot(name,label,'before',undefined,workspaceBaseline);
     try{
     await eventually(()=>model.listResponses>=expected);await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();await paint();await settledListWorkspace(expected);
     const counts=()=>({workspace:model.workspaceReads,list:calls.filter(call=>call.route==='/api/documents/inbound-requests').length,draft:calls.filter(call=>call.route==='/api/inbound-requests/draft').length,projection:projectionCalls().length});
     const expectedCounts={workspace:workspaceBaseline.count+expected-1,list:expected,draft:0,projection:0};
     const expectedHistory=[...workspaceBaseline.history,...Array.from({length:expected-1},(_,index)=>workspaceBaseline.count+index+1)];
     assert.deepEqual(counts(),expectedCounts,name+' '+label+' permits one scoped list attempt per deliberate observation and no Workspace addition from denial');assert.equal(model.listResponses,expected);
     assert.deepEqual(model.workspaceVersions,expectedHistory,name+' preserves the pre-denial history and adds exactly one authority observation per deliberate revalidation');
     assert.equal(await host('inbound-requests').getByRole('button',{name:/^Mở phiếu /}).count(),0,'An invalid list scope cannot expose source rows');assert.equal(await focusRegion('inbound-requests').count(),0,'An invalid list scope cannot create a visible selection');assert.equal(await readonlyPanel().count(),0);assert.equal((await draftCalls()).length,0);await noReadonlyValues();
     await advanceScenarioClock(1000,0);await paint();await settledListWorkspace(expected);assert.deepEqual(counts(),expectedCounts,name+' cannot create a 409-to-parent-reload feedback loop');assert.deepEqual(model.workspaceVersions,expectedHistory);assert.equal(calls.filter(call=>call.method==='POST').length,0);
     observations.push({observation:label,...counts(),currentPageWorkspace:await workspaceDispatchState()});
     await recordReadonlyClockSnapshot(name,label,'after',undefined,workspaceBaseline);
     }catch(error){await recordReadonlyClockSnapshot(name,label,'failure',undefined,workspaceBaseline);throw error;}
    }
    await boundedListScopeDenial('initial-list',1);
    await page.evaluate(()=>{window.dispatchEvent(new FocusEvent('blur'));window.dispatchEvent(new Event('focus'));});await boundedListScopeDenial('synthetic-window-focus',2);
    await advanceScenarioClock(60001,1);await boundedListScopeDenial('actual-60-second-poll',3);
    assert.deepEqual(model.workspaceVersions,[...workspaceBaseline.history,workspaceBaseline.count+1,workspaceBaseline.count+2]);
    readonlyEvidence.push({kind:'list-scope-fail-closed',scenario:name,preDenialWorkspace:workspaceBaseline.count,advancingAuthorityVersions:[...model.workspaceVersions],observations,writeRequests:0});
   }
   for(const laterAction of ['modal-control','window-blur','close','read-capability-loss']){
    await start(390,'inbound-requests',{...fullLists(),draftEnvelope:unavailableDraft(true),holdProjection:true});await openRow('inbound-requests',1).click();await eventually(()=>model.projectionWaiters.length===1);
    const laterControl=detailDialog('inbound-requests').getByTitle('Đóng hộp thoại',{exact:true});
    if(laterAction==='modal-control')await laterControl.focus();
    else if(laterAction==='window-blur'){assert.equal(await page.evaluate(()=>document.hidden),false);await page.evaluate(()=>window.dispatchEvent(new FocusEvent('blur')));}
    else if(laterAction==='close'){await closeSelection('inbound-requests').click();await focusedVisible(openRow('inbound-requests',1));}
    else{const before=model.workspaceReads;model.workspaceCapabilities=['purchase-requests.read','purchase-orders.read'];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await eventually(()=>model.workspaceReads>before);await readonlyPanel().waitFor({state:'detached'});}
    const lateFocus=await detailFocusCounts('inbound-requests');releaseProjection();await eventually(()=>model.projectionResponses===1);await settledReads();await unchangedDetailFocus('inbound-requests',lateFocus,'Late projection cannot revive a cancelled frame-focus ticket');
    if(laterAction==='close'||laterAction==='read-capability-loss'){assert.equal(await readonlyPanel().count(),0);await noReadonlyValues();if(laterAction==='close')await focusedVisible(openRow('inbound-requests',1));}
    else{await readonlyReady();await unchangedDetailFocus('inbound-requests',lateFocus,'Late projection cannot revive a cancelled focus ticket');if(laterAction==='modal-control')assert.equal(await laterControl.evaluate(element=>document.activeElement===element),true,'Late projection preserves the later modal-control focus');await capture(`inbound-readonly-late-${laterAction}-390`,{viewport:true,keepFocus:true});}
    assert.equal(projectionCalls().length,1);assert.equal(calls.filter(call=>call.method==='POST').length,0);
   }
  });
  await run('I33 unavailable command reads never replace unknown or confirmed-readback custody',async()=>{
   for(const mode of ['unknown','confirmed-readback'])for(const nullScope of [false,true]){
    await start(390,'inbound-requests',{...fullLists(),writable:true,unknown:mode==='unknown',afterWriteDraftEnvelope:unavailableDraft(nullScope)});await saveInbound();
    await eventually(()=>model.commandResponses===1);if(mode==='unknown')await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='unknown');else await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending')==='true');
    const unavailableReads=model.draftResponses;await detailDialog('inbound-requests').getByRole('button',{name:'Xác minh lại quyền nhập hàng',exact:true}).click();await eventually(()=>model.draftResponses>unavailableReads);await settledReads();const bodies=await page.evaluate(()=>window.i30SaveDispatches);assert.equal(bodies.length,1);const originalBody=bodies[0],bodySha256=sha(originalBody);
    assert.equal(model.writes.length,1);assert.equal(model.writes[0].bodySha256,bodySha256);assert.equal(model.originals.get(model.writes[0].operationId),originalBody);assert.equal(model.effects,1);assert.equal(projectionCalls().length,0,'Custody blocks even an otherwise eligible independent projection');assert.equal(await readonlyPanel().count(),0);
    const attempts=[()=>closeSelection('inbound-requests').click(),()=>backgroundActivate(openRow('inbound-requests',26)),()=>page.locator('.request-list-toolbar').evaluate(form=>form.requestSubmit()),()=>backgroundActivate(page.getByRole('navigation',{name:'Điều hướng nhanh trên điện thoại',exact:true}).getByRole('button',{name:'Không gian làm việc',exact:true}))];
    for(const attempt of attempts){await attempt();await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);assert.equal(new URL(page.url()).searchParams.get('screen'),'inbound-requests');assert.equal(await host('inbound-requests').locator('button[aria-label^="Mở phiếu QA-INBOUND-001 "]').getAttribute('aria-pressed'),'true');assert.equal(await host('inbound-requests').locator('button[aria-label^="Mở phiếu QA-INBOUND-026 "]').getAttribute('aria-pressed'),'false');assert.equal(projectionCalls().length,0);await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'detached'});}
    assert.deepEqual(await page.evaluate(()=>window.i30SaveDispatches),[originalBody]);assert.equal(model.effects,1);assert.equal(model.writes.length,1);await capture(`inbound-readonly-custody-${mode}-${nullScope?'null-scope':'scoped'}-390`,{viewport:true,keepFocus:true});
    // Recover only through current full-draft rights and the original receipt.
    // The paginated READ projection can never discharge either custody gate.
    model.draftEnvelope=null;model.inboundDocuments[0]=structuredClone(model.inbound);await detailDialog('inbound-requests').getByRole('button',{name:'Xác minh lại quyền nhập hàng',exact:true}).click();
    if(mode==='unknown'){const reconcile=page.getByTestId('inbound-editor').getByRole('button',{name:'Kiểm tra yêu cầu gốc',exact:true});await eventually(()=>reconcile.isEnabled());await reconcile.click();}
    await inboundReady();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending')==='false');
    assert.equal(await page.getByLabel('Số đơn',{exact:true}).inputValue(),'SYNTHETIC TOAST EDIT');assert.equal(model.effects,1);assert.equal(model.writes.length,1);assert.deepEqual(await page.evaluate(()=>window.i30SaveDispatches),[originalBody]);assert.deepEqual(model.reconciles,mode==='unknown'?[bodySha256]:[]);assert.equal(projectionCalls().length,0);
    readonlyEvidence.push({kind:'custody-kept',mode,shape:nullScope?'null-scope':'scoped',originalBodySha256:bodySha256,saveDispatches:1,serverSaveRequests:1,effects:1,reconcileBodyHashes:[...model.reconciles],projectionRequests:0});
    await closeSelection('inbound-requests').click();await focusedVisible(openRow('inbound-requests',1));
   }
  });
  t.signal.throwIfAborted();assert.deepEqual(errors,[]);assert.equal(results.length,expectedCases,'Every required presentation case must finish');completed=true;
 }catch(error){fatal=String(error);throw error;}finally{
  let teardownError;try{await cleanup();}catch(error){teardownError=error;errors.push(String(error));}
  t.signal.removeEventListener('abort',abortCleanup);
  const evidence={node:process.version,css:{sourceSha256:sha(cssSource),compiledSha256:sha(css),bytes:Buffer.byteLength(css),modules:cssModules},viewportWidths:[320,360,390,1440],hierarchy:'Actual Workspace and production request components',backend:'Synthetic HTTP host plus separately labelled trusted-adapter component contract; no ERP/SQL acceptance',status:completed&&!t.signal.aborted&&!fatal&&!failures.length&&!errors.length&&results.length===expectedCases?'passed':'failed',expectedCases,completedCases:results.length,fatal,results,failures,captures,transportEvidence,readonlyEvidence,commandGeometryEvidence,sharedGridEvidence,stickyToolbarEvidence,portalPresentationEvidence,errors};
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify(evidence,null,2));
  if(teardownError)throw teardownError;
 }
});
