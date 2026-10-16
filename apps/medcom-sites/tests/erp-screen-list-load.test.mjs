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
 'erp-client':`
export const erpClient={
 async getScreenMetadata(){return{caption:'Đề nghị mua hàng'};},
 async getErpModuleActions(module){
   globalThis.__erpActionCalls=(globalThis.__erpActionCalls||0)+1;
   if(module==='purchase-orders')return[{id:'create',caption:'',visible:true,enabled:false,reason:'erp_write_unqualified'}];
   return[{id:'create',caption:'',visible:true,enabled:true}];
 },
 async getErpModuleList(module){
   globalThis.__erpListCalls=(globalThis.__erpListCalls||0)+1;
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
 'button':`export const UntitledButton=({children,iconLeading,iconTrailing,variant,size,...rest})=><button type="button" {...rest}>{children}</button>;`,
 'lookup-field':`export const LookupField=()=>null; export const fieldText=(v)=>v==null?'':String(v); export const choiceLabel=(c,f)=>c&&c.label?c.label:f;`,
 'sales-order-form':`export const SalesOrderForm=()=>null;`,
 'purchase-order-create-sheet':`export const PurchaseOrderCreateSheet=()=>null;`,
 'purchase-request-create-sheet':`export const PurchaseRequestCreateSheet=()=>null;`,
 'qr-camera':`export class QrCamera{stop(){}start(){}}`,
};
const stubPlugin={
 name:'erp-screen-stubs',
 setup(builder){
  builder.onResolve({filter:/.*/},args=>{
   if(!/tab-erp-screen\.tsx$/.test(args.importer.replace(/\\/g,'/')))return null;
   const requested=args.path.replace(/\\/g,'/');
   for(const key of Object.keys(stubs))if(requested.endsWith(key))return{path:key,namespace:'stub'};
   return null;
  });
  builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:app}));
 },
};
await build({
 stdin:{contents:'export {TabErpScreen} from "./components/untitledui/tab-erp-screen";',resolveDir:app,loader:'tsx'},
 outfile:path.join(output,'fixture.cjs'),
 bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',
 alias:{'@':app},logLevel:'warning',plugins:[stubPlugin],
});

const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {TabErpScreen}=require(path.join(output,'fixture.cjs'));

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
const detailMenuButtons=renderer=>renderer.root.findAll(node=>node.props?.['aria-label']==='Thao tác chứng từ');

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

test('write-gated purchase-orders hides create button, warning and detail mutations',async()=>{
 let renderer;
 await act(async()=>{renderer=create(React.createElement(TabErpScreen,{module:'purchase-orders',...props,isActive:true}));});
 await flush();
 let {text}=collect(renderer);
 assert.ok(text.includes('PO-TEST-001'),'reading the list must still work');
 assert.ok(!text.includes('Tạo mới'),'the create button must be hidden while writes are gated');
 assert.ok(!text.includes('Chưa thể tạo mới'),'the blocked reason must not be shown');
 assert.equal(detailMenuButtons(renderer).length,0,'no detail mutation entry before a document is opened');
 await openFirstRow(renderer);
 ({text}=collect(renderer));
 assert.ok(text.includes('PO-TEST-001'),'the document detail must still open');
 assert.equal(detailMenuButtons(renderer).length,0,'save/delete must be hidden for a write-gated module');
 assert.ok(!text.includes('Chưa thể tạo mới'),'the blocked reason must stay hidden in the detail sheet');
 await act(async()=>{renderer.unmount();});
});
