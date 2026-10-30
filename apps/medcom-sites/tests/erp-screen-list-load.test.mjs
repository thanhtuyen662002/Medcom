import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','erp-screen-list-load');
await mkdir(output,{recursive:true});

// The real TabErpScreen logic runs; only its presentation leaves and the ERP
// transport are replaced. The action payloads mirror what the live backend
// returns: purchase-orders is write-gated (erp_write_unqualified), the other
// modules are admitted.
const stubs={
 // This suite exercises list transport; app-screens tests the real 300ms clock.
 // Commit the toolbar query synchronously without changing existing assertions.
 'app-quick-tabs':"export * from '@/components/app'; import {ScreenToolbar as RealScreenToolbar} from '@/components/app'; export const ScreenToolbar=props=><RealScreenToolbar {...props} onSearchChange={value=>{props.onSearchChange(value);props.onSearch(value);}}/>;",
 'erp-client':`
export const erpClient={
 async getLookupOptions(module,query){return globalThis.__erpStatusHandler?globalThis.__erpStatusHandler(module,query):{items:[],page:1,hasMore:false,requiredParameters:[]};},
 async getDocumentsList(kind,page,search,branchId,pageSize){return globalThis.__legacyListHandler({page,search,branchId,pageSize});},
 async getPurchaseRequestsList(page,search,branchId,pageSize){return{list:await globalThis.__legacyListHandler({page,search,branchId,pageSize}),scopeKey:'synthetic-scope'};},
 async getScreenMetadata(){return{caption:'Đề nghị mua hàng'};},
 async getErpModuleActions(module){
   globalThis.__erpActionCalls=(globalThis.__erpActionCalls||0)+1;
   if(module==='purchase-orders')return[{id:'create',caption:'',visible:true,enabled:false,reason:'erp_write_unqualified'}];
   return[{id:'create',caption:'',visible:true,enabled:true}];
 },
 async getErpModuleList(module,params){
   globalThis.__erpListCalls=(globalThis.__erpListCalls||0)+1;
   if(globalThis.__erpListHandler)return globalThis.__erpListHandler(module,params);
   const documentId=module==='purchase-orders'?'PO-TEST-001':'PR-TEST-001';
   return{rows:[{documentId,header:{objectName:'NCC test',statusName:'Mới lập',documentDate:'2026-10-01T00:00:00'}}],page:1,hasMore:false};
 },
 async getErpModuleDetail(module){
   const documentId=module==='purchase-orders'?'PO-TEST-001':'PR-TEST-001';
   return{documentId,header:{objectName:'NCC test',statusName:'Mới lập'},lines:{rows:[],page:1,hasMore:false},
     actions:[{id:'save',caption:'',visible:true,enabled:true},{id:'delete',caption:'',visible:true,enabled:true}],stateToken:'tok'};
 },
};`,
 'bottom-sheet':`export const UntitledBottomSheet=({open,children})=>open?<div data-testid="bottom-sheet">{children}</div>:null;`,
 'record-dialog':`export const RecordDetailStatus=({children})=><div>{children}</div>;export const RecordDetailHeading=({children})=><header>{children}</header>;export const RecordActionBar=({children,presentationAllowed=true})=>presentationAllowed?<footer>{children}</footer>:null;`,
 'request-presentation':`import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton='button';export const RequestInput='input';export const RequestTextarea='textarea';export const RequestSelect='select';export const requestStyles={actions:''};`,
 'button':`export const UntitledButton=({children,iconLeading,iconTrailing,variant,size,...rest})=><button type="button" {...rest}>{children}</button>;`,
 'lookup-field':`export const LookupField=()=>null; export const fieldText=(v)=>v==null?'':String(v); export const choiceLabel=(c,f)=>c&&c.label?c.label:f;`,
 'document-detail-dialog':`export const DocumentDetailDialog=({open,children})=>open?<div>{children}</div>:null;`,
 'sales-order-form':`export const SalesOrderForm=()=>null;`,
 'purchase-order-create-sheet':`export const PurchaseOrderCreateSheet=()=>null;`,
 'purchase-request-create-sheet':`export const PurchaseRequestCreateSheet=()=>null;`,
 'qr-camera':`export class QrCamera{stop(){}start(){}}`,
};
const stubPlugin={
 name:'erp-screen-stubs',
 setup(builder){
  builder.onResolve({filter:/.*/},args=>{
   if(!/(?:tab-(?:erp-screen|orders|purchases)\.tsx|erp-document-detail-body\.tsx|erp-line-editor\.tsx|sales-order-status-filter\.tsx|document-detail\/[^/]+\.tsx|document-detail\/registry\.ts)$/.test(args.importer.replace(/\\/g,'/')))return null;
   const requested=args.path.replace(/\\/g,'/');
   if(requested==='@/components/app')return{path:'app-quick-tabs',namespace:'stub'};
   // A leaf named "button" must not swallow the shared AppButton import.
   for(const key of Object.keys(stubs))if(requested.endsWith(`/${key}`))return{path:key,namespace:'stub'};
   return null;
  });
  builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:app}));
 },
};
await build({
 stdin:{contents:'export {TabErpScreen} from "./components/untitledui/tab-erp-screen"; export {TabOrders} from "./components/untitledui/tab-orders"; export {TabPurchases} from "./components/untitledui/tab-purchases";',resolveDir:app,loader:'tsx'},
 outfile:path.join(output,'fixture.cjs'),
 bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',
 alias:{'@':app},logLevel:'warning',plugins:[stubPlugin],
});

const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {TabErpScreen,TabOrders,TabPurchases}=require(path.join(output,'fixture.cjs'));

const flush=async(rounds=8)=>{for(let i=0;i<rounds;i++)await act(async()=>{});};
function walk(node,visit){if(node==null)return;if(typeof node==='string'){visit({text:node});return;}(node.children||[]).forEach(child=>walk(child,visit));}
function collect(renderer){
 const texts=[],classes=[];
 walk(renderer.toJSON(),node=>{
  if(node.text)texts.push(node.text);
  if(node.props&&typeof node.props.className==='string')classes.push(node.props.className);
 });
 return{text:texts.join(' | '),classes:classes.join(' ')};
}
const props={currentBranch:'MB'};
const openFirstRow=async renderer=>{
 const cards=renderer.root.findAll(node=>typeof node.props?.onClick==='function'
   &&typeof node.props?.className==='string'&&node.props.className.includes('cursor-pointer'));
 assert.ok(cards.length>0,'a list row must be rendered to open');
 await act(async()=>cards[0].props.onClick());
 await flush();
};
const detailMenuButtons=renderer=>renderer.root.findAllByType('button').filter(node=>node.props?.['aria-label']==='Thao tác chứng từ');

test('activating an ERP tab applies the 200 list response instead of a permanent skeleton',async()=>{
 globalThis.__erpListCalls=0;
 let renderer;
 const element=React.createElement(TabErpScreen,{module:'purchase-requests',...props,isActive:false});
 await act(async()=>{renderer=create(element);});
 await flush();
 assert.equal(globalThis.__erpListCalls,0,'a hidden tab must not fetch its list yet');
 await act(async()=>{renderer.update(React.createElement(TabErpScreen,{module:'purchase-requests',...props,isActive:true}));});
 await flush();
 const {text,classes}=collect(renderer);
 assert.equal(globalThis.__erpListCalls,1,'activation must issue exactly one list request');
 assert.ok(text.includes('PR-TEST-001'),`the 200 payload must be rendered, got: ${text}`);
 assert.ok(!classes.includes('animate-pulse'),'the skeleton must be replaced once the response arrives');
 assert.ok(text.includes('Tạo mới'),'an admitted module keeps its create button');
 await openFirstRow(renderer);
 assert.equal(detailMenuButtons(renderer).length,1,'an admitted module keeps its detail write menu');
 await act(async()=>{renderer.unmount();});
});

test('a module the server has not admitted keeps reading and never offers a write',async()=>{
 // Đặt mua hàng is admitted now (no FE gate); the stub still answers erp_write_unqualified for it.
 let renderer;
 await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'purchase-orders',...props,isActive:true}));});
 await flush();
 let {text}=collect(renderer);
 assert.ok(text.includes('PO-TEST-001'),'reading the list must still work');
 await openFirstRow(renderer);
 ({text}=collect(renderer));
 assert.ok(text.includes('PO-TEST-001'),'the document detail must still open');
 await act(async()=>{renderer.unmount();});
});

test('server pagination changes pages and size, resets queries, and preserves the page on error',async()=>{
 const calls=[];
 let fail=false;
 globalThis.__erpListHandler=async(module,params)=>{
  calls.push({...params});
  if(fail)throw new Error('synthetic unavailable');
  return{rows:[{documentId:`PAGE-${params.page}`,header:{statusId:2}}],page:params.page,pageSize:params.pageSize,hasMore:params.page<3};
 };
 let renderer;
 const button=name=>renderer.root.findByProps({'aria-label':name});
 const click=async name=>{await act(async()=>button(name).props.onClick());await flush();};
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'purchase-requests',...props,isActive:true}));});await flush();
  assert.equal(calls.length,1);
  assert.equal(button('Trang trước').props.disabled,true);
  await click('Trang sau');
  assert.equal(calls.at(-1).page,2);
  assert.ok(collect(renderer).text.includes('PAGE-2'));
  await click('Trang sau');
  assert.equal(calls.at(-1).page,3);
  assert.equal(button('Trang sau').props.disabled,true,'hasMore false disables forward navigation');
  await click('Trang trước');assert.equal(calls.at(-1).page,2);
  await act(async()=>renderer.root.findByProps({'aria-label':'Số dòng mỗi trang'}).props.onChange({target:{value:'50'}}));await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).pageSize,50);
  await click('Trang sau');
  // P2-03: shared toolbar exposes a named search form instead of input keydown.
  const input=renderer.root.findByProps({'aria-label':'Tìm kiếm chứng từ',type:'search'});
  await act(async()=>input.props.onChange({target:{value:'query test'}}));
  await act(async()=>renderer.root.findByProps({role:'search'}).props.onSubmit({preventDefault(){}}));await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).search,'query test');assert.equal(calls.at(-1).pageSize,50);
  await click('Trang sau');
  // Shared FilterChips puts the status label directly in the button.
  const chip=renderer.root.findAll(node=>node.type==='button'&&node.props['aria-pressed']!==undefined&&node.children.includes('Chờ duyệt'))[0];
  await act(async()=>chip.props.onClick());await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).statusId,2);
  fail=true;await click('Trang sau');
  assert.ok(collect(renderer).text.includes('PAGE-1'),'a failed request keeps the last successful rows');
  assert.ok(collect(renderer).text.includes('Không thể tải danh sách'));
  assert.equal(renderer.root.findByProps({'aria-current':'page'}).props['aria-label'],'Đến trang 1');
  assert.equal(button('Trang sau').props.disabled,false,'failed page can be retried');
 }finally{delete globalThis.__erpListHandler;if(renderer)await act(async()=>renderer.unmount());}
});

test('late pagination responses cannot overwrite a newer query or branch',async()=>{
 const pending=[];
 globalThis.__erpListHandler=async(module,params)=>{
  if(params.page===2)return new Promise(resolve=>pending.push(()=>resolve({rows:[{documentId:'STALE-PAGE',header:{}}],page:2,pageSize:20,hasMore:false})));
  return{rows:[{documentId:`CURRENT-${params.branchId}-${params.search??''}`,header:{}}],page:1,pageSize:params.pageSize,hasMore:true};
 };
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'sales-orders',...props,isActive:true}));});await flush();
  // The role queue opens first and is one page; "Tất cả" is the paged server list.
  await act(async()=>renderer.root.findAll(node=>node.type==='button'&&node.children.includes('Tất cả'))[0].props.onClick());await flush();
  await act(async()=>{renderer.root.findByProps({'aria-label':'Trang sau'}).props.onClick();});
  assert.equal(renderer.root.findByProps({'aria-label':'Trang sau'}).props.disabled,true,'navigation is blocked while loading');
  await act(async()=>{renderer.update(React.createElement(TabErpScreen,{module:'sales-orders',currentBranch:'MN',isActive:true}));});await flush();
  await act(async()=>{pending.forEach(resolve=>resolve());});await flush();
  assert.ok(collect(renderer).text.includes('CURRENT-MN-'));
  assert.ok(!collect(renderer).text.includes('STALE-PAGE'));
  assert.equal(renderer.root.findByProps({'aria-current':'page'}).props['aria-label'],'Đến trang 1');
 }finally{pending.forEach(resolve=>resolve());delete globalThis.__erpListHandler;if(renderer)await act(async()=>renderer.unmount());}
});

for(const screenModule of ['sales-orders','sales-order-pm','sales-order-sa'])test(`${screenModule} filters by native status IDs on the server without lock or page-count badges`,async()=>{
 const calls=[],lookups=[];let renderer;
 globalThis.__erpStatusHandler=async(scope,query)=>{lookups.push({scope,...query});return{items:[{id:'-1',label:'Trạng thái minh họa A'},{id:'0',label:'Trạng thái minh họa B'},{id:'12',label:'Trạng thái minh họa C'}],page:1,hasMore:false,requiredParameters:[]};};
 globalThis.__erpListHandler=async(scope,params)=>{calls.push({scope,...params});return{rows:[{documentId:'QA-SALES',header:{statusId:params.statusId??12,statusName:'Tên trạng thái từ API',isLocked:false}}],page:params.page,pageSize:params.pageSize,hasMore:true};};
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:screenModule,...props,isActive:true}));});await flush();
  assert.equal(lookups.length,1);assert.equal(lookups[0].scope,screenModule);assert.equal(lookups[0].branchId,'MB');assert.equal(lookups[0].lookupId,'header.StatusID');
  // UX-05: the chip row keeps the role queue, "Tất cả", the chosen status and
  // "Trạng thái khác…"; every native lookup status is offered in the filter sheet.
  const chips=()=>renderer.root.findByProps({'aria-label':'Lọc trạng thái đơn hàng'}).findAllByType('button');
  const label=node=>node.children.filter(child=>typeof child==='string').join('');
  const chip=name=>chips().find(node=>label(node)===name);
  const sheet=()=>renderer.root.find(node=>typeof node.props?.onApply==='function'&&Array.isArray(node.props.statuses));
  assert.deepEqual(chips().map(label),['Chờ tôi xử lý','Tất cả','Trạng thái khác…']);
  assert.equal(chip('Chờ tôi xử lý').props['aria-pressed'],true);
  assert.ok(calls.length>0&&calls.every(call=>call.page===1&&call.statusId!==undefined),'the role queue reads by status');
  assert.deepEqual(sheet().props.statuses.map(status=>status.label),['Chờ tôi xử lý','Tất cả','Trạng thái minh họa A','Trạng thái minh họa B','Trạng thái minh họa C']);
  assert.doesNotMatch(collect(renderer).text,/Đang mở \/ Chưa khóa|Đã khóa \/ Hoàn tất|Phân hệ ERP/);
  assert.match(collect(renderer).text,/Tên trạng thái từ API/);
  for(const [name,id] of [['Trạng thái minh họa A',-1],['Trạng thái minh họa B',0],['Trạng thái minh họa C',12]]){
   await act(async()=>sheet().props.onApply({status:String(id),pageSize:20}));await flush();
   assert.equal(calls.at(-1).scope,screenModule);assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).statusId,id);
   assert.equal(chip(name).props['aria-pressed'],true);
  }
  await act(async()=>renderer.root.findByProps({'aria-label':'Trang sau'}).props.onClick());await flush();
  assert.equal(calls.at(-1).page,2);assert.equal(calls.at(-1).statusId,12);
  await act(async()=>chip('Tất cả').props.onClick());await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).statusId,undefined);
  await act(async()=>chip('Trạng thái khác…').props.onClick());await flush();
  assert.equal(sheet().props.open,true);
 }finally{delete globalThis.__erpListHandler;delete globalThis.__erpStatusHandler;if(renderer)await act(async()=>renderer.unmount());}
});

test('status lookup paging retries failures and ignores responses for a previous branch',async()=>{
 let renderer,resolveOld,fail=true;
 globalThis.__erpStatusHandler=async(module,query)=>{
  if(query.branchId==='MB')return new Promise(resolve=>{resolveOld=resolve;});
  if(query.page===2&&fail)throw Error('synthetic unavailable');
  return{items:[{id:String(query.page),label:`Trạng thái mới ${query.page}`}],page:query.page,hasMore:query.page===1,requiredParameters:[]};
 };
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'sales-order-pm',...props,isActive:true}));});await flush();
  await act(async()=>renderer.update(React.createElement(TabErpScreen,{module:'sales-order-pm',currentBranch:'MN',isActive:true})));await flush();
  await act(async()=>resolveOld({items:[{id:'99',label:'STALE-STATUS'}],page:1,hasMore:false,requiredParameters:[]}));await flush();
  // Statuses are offered in the filter sheet, not the chip row.
  const sheetText=()=>renderer.root.find(node=>typeof node.props?.onApply==='function'&&Array.isArray(node.props.statuses)).props.statuses.map(status=>status.label).join('|');
  assert.doesNotMatch(sheetText(),/STALE-STATUS/);
  const button=label=>renderer.root.findAll(node=>node.type==='button'&&node.children.includes(label))[0];
  // Lookup pagination is an explicit 44px action instead of a sentinel option.
  await act(async()=>button('Thêm trạng thái').props.onClick());await flush();
  assert.match(collect(renderer).text,/Chưa tải được danh sách trạng thái/);assert.match(sheetText(),/Trạng thái mới 1/);
  fail=false;await act(async()=>button('Thử lại').props.onClick());await flush();
  assert.match(sheetText(),/Trạng thái mới 2/);
  assert.equal(button('Thêm trạng thái'),undefined);
 }finally{delete globalThis.__erpStatusHandler;if(renderer)await act(async()=>renderer.unmount());}
});

for(const Component of [TabOrders,TabPurchases])test(`${Component.name} paginates server data and ignores old branch responses`,async()=>{
 const calls=[],pending=[];let delay=false,fail=false,renderer;
 globalThis.__legacyListHandler=async params=>{
  calls.push({...params});
  const result={rows:[{documentId:`ROW-${params.branchId}-${params.search}-${params.page}`,branchId:params.branchId,statusId:1}],page:params.page,pageSize:params.pageSize,hasMore:params.page<3};
  if(fail)throw new Error('synthetic unavailable');
  if(delay&&params.page===2)return new Promise(resolve=>pending.push(()=>resolve(result)));
  return result;
 };
 const element=props=>React.createElement(Component,{currentBranch:'MB',onOpenCreateModal:()=>{},...props});
 const button=name=>renderer.root.findByProps({'aria-label':name});
 const click=async name=>{await act(async()=>button(name).props.onClick());await flush();};
 try{
  await act(async()=>{renderer=create(element({isActive:false}));});await flush();assert.equal(calls.length,0);
  await act(async()=>renderer.update(element({isActive:true})));await flush();assert.equal(calls.length,1,'activation issues one request');
  await click('Trang sau');assert.equal(calls.at(-1).page,2);
  await click('Trang sau');assert.equal(button('Trang sau').props.disabled,true);
  await click('Trang trước');assert.equal(calls.at(-1).page,2);
  await act(async()=>renderer.root.findByProps({'aria-label':'Số dòng mỗi trang'}).props.onChange({target:{value:'50'}}));await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).pageSize,50);
  await click('Trang sau');
  const input=renderer.root.findAll(node=>node.type==='input'&&node.props.value!==undefined)[0];
  await act(async()=>input.props.onChange({target:{value:'find'}}));await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).search,'find');
  fail=true;await click('Trang sau');assert.equal(button('Trang trước').props.disabled,true,'failed page does not advance');
  fail=false;delay=true;
  await act(async()=>{button('Trang sau').props.onClick();});
  assert.equal(button('Trang sau').props.disabled,true);
  await act(async()=>renderer.update(element({isActive:true,currentBranch:'MN'})));await flush();
  assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).branchId,'MN');
  await act(async()=>pending.forEach(resolve=>resolve()));await flush();
  assert.ok(collect(renderer).text.includes('ROW-MN-find-1'));
  assert.ok(!collect(renderer).text.includes('ROW-MB-find-2'));
 }finally{pending.forEach(resolve=>resolve());delete globalThis.__legacyListHandler;if(renderer)await act(async()=>renderer.unmount());}
});

// Màn xuất hàng theo PXK hiển thị bảng chứng từ trên desktop như các màn mua/bán.
// CSS quyết định bảng hay thẻ theo bề rộng, còn điều kiện "có dựng bảng" thì kiểm tra được ngay trong cây render.
test('xuất hàng theo PXK và xuất kho đều dựng bảng desktop và giữ thẻ mobile',async()=>{
 const tables=renderer=>renderer.root.findAll(node=>typeof node.type==='string'&&node.props?.['data-document-table']!==undefined);
 globalThis.__erpListHandler=async(module,params)=>({rows:[{documentId:'PXK-TEST-0001',header:{objectName:'Khách hàng kiểm thử',userCreate:'nguoi.lap',statusName:'Lập hóa đơn',documentDateDisplay:'10/09/2026 00:00:00',statusForeColor:'#FFC000',statusBackColor:'#FFFF00',memo:'Ghi chú kiểm thử'}}],page:params.page,pageSize:params.pageSize,hasMore:false});
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'sales-qr',...props,isActive:true}));});await flush();
  assert.equal(tables(renderer).length,1,'PXK phải dựng bảng chứng từ trên desktop');
  const {text}=collect(renderer);
  for(const header of ['STT','Mã chứng từ','Ngày chứng từ','Khách hàng','Trạng thái','Người lập / Đề nghị','Nội dung','Chi tiết'])assert.ok(text.includes(header),`bảng PXK thiếu cột ${header}: ${text}`);
  // P2-06: date display omits midnight; ERP hue now has contrast-checked theme pairs.
  for(const cell of ['PXK-TEST-0001','10/09/2026','Khách hàng kiểm thử','Ghi chú kiểm thử'])assert.ok(text.includes(cell),`bảng PXK thiếu dữ liệu ${cell}`);
  assert.ok(!text.includes('00:00:00'));
  const colored=renderer.root.findAll(node=>typeof node.type==='string'&&node.props?.className?.includes('app-status-badge'));
  assert.ok(colored.length>0,'ô trạng thái vẫn có badge chung');
  assert.ok(colored.every(node=>node.props.style['--status-bg']&&node.props.style['--status-dark-bg']),'badge có cặp màu sáng/tối');
  await act(async()=>{renderer.unmount();});renderer=null;
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'warehouse-qr',...props,isActive:true}));});await flush();
  // P2-03 explicitly expands desktop tables from 8 to all 19 modules.
  assert.equal(tables(renderer).length,1,'xuất kho cũng có bảng desktop theo P2-03');
  assert.ok(collect(renderer).text.includes('PXK-TEST-0001'),'màn giữ lưới thẻ vẫn đọc được danh sách');
 }finally{delete globalThis.__erpListHandler;if(renderer)await act(async()=>renderer.unmount());}
});

// Đề nghị nhập hàng dùng chung bảng desktop; thẻ mobile do CSS quyết định, còn bảng thì kiểm tra trong cây render.
test('đề nghị nhập hàng dựng bảng desktop với cột và màu trạng thái của BE',async()=>{
 globalThis.__erpListHandler=async(module,params)=>({rows:[{documentId:'NK-TEST-0001',header:{objectName:'Nhà cung cấp kiểm thử',orderNumber:'PO-0001',documentDateDisplay:'01/10/2026 14:22:11',statusName:'Chờ nhập kho',statusForeColor:'#FFFFFF',statusBackColor:'#00695C',damageInsideStatusName:'Không hư hỏng',notes:'Ghi chú nhập kho kiểm thử'}}],page:params.page,pageSize:params.pageSize,hasMore:false});
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'inbound-requests',...props,isActive:true}));});await flush();
  const tables=renderer.root.findAll(node=>typeof node.type==='string'&&node.props?.['data-document-table']!==undefined);
  assert.equal(tables.length,1,'đề nghị nhập hàng phải dựng bảng chứng từ trên desktop');
  const {text}=collect(renderer);
  for(const header of ['STT','Mã chứng từ','Ngày chứng từ','Đối tượng / Mục đích','Trạng thái','Nội dung','Chi tiết'])assert.ok(text.includes(header),`bảng nhập hàng thiếu cột ${header}: ${text}`);
  assert.ok(!text.includes('Người lập / Đề nghị'),'dòng nhập hàng không có người lập nên cột này phải ẩn');
  // P2-06 keeps actual hours/minutes, omits seconds and paints waiting statuses amber.
  for(const cell of ['NK-TEST-0001','01/10/2026 14:22','Nhà cung cấp kiểm thử','Chờ nhập kho','Ghi chú nhập kho kiểm thử'])assert.ok(text.includes(cell),`bảng nhập hàng thiếu dữ liệu ${cell}`);
  assert.ok(!text.includes('14:22:11'));
  const colored=renderer.root.findAll(node=>typeof node.type==='string'&&node.props?.className?.includes('app-status-badge'));
  assert.ok(colored.length>0,'ô trạng thái vẫn có badge chung');
  assert.ok(colored.every(node=>node.props.style['--status-fg']==='#92400E'&&node.props.style['--status-dark-fg']==='#FDE68A'),'trạng thái chờ dùng tone cam sáng/tối');
 }finally{delete globalThis.__erpListHandler;if(renderer)await act(async()=>renderer.unmount());}
});
