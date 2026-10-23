import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(app,'.test-runtime/sales-flow');
await mkdir(output,{recursive:true});
const leaves={
 'erp-client':`export const erpClient={getErpModuleDetail:(...args)=>globalThis.qaSales.read(...args),saveDocument:(module,intent)=>globalThis.qaSales.send(module,'save',intent),deleteDocument:(module,intent)=>globalThis.qaSales.send(module,'delete',intent),executeWorkflowAction:(...args)=>globalThis.qaSales.send(...args),lookupCommand:(...args)=>globalThis.qaSales.lookup(...args)};`,
 'lookup-field':`export function LookupField(props){return <div data-lookup={props.label} onPick={props.onSelect}/>;}`,
 'bottom-sheet':`export const UntitledBottomSheet=({open,children})=>open?<div>{children}</div>:null;`,
 'record-dialog':`export const RecordActionBar=({children})=><div>{children}</div>;export const RecordDetailHeading=({children})=><div>{children}</div>;export const RecordDetailStatus=({children})=><div>{children}</div>;`,
 'request-presentation':`import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton=({children,variant,...props})=><button {...props}>{children}</button>;export const RequestInput=props=><input {...props}/>;export const RequestTextarea=props=><textarea {...props}/>;export const requestDate=value=>value;export const requestStyles={actions:'actions'};`,
 'sales-order-attachment-list':`export const SalesOrderAttachmentList=()=>null;`,
 'document-detail-tabs':`export const DocumentDetailTabs=props=><div data-details={true} {...props}/>;`,
 'sales-order-action-dialog':`export const SalesOrderActionDialog=props=><div data-action={props.operation} message={props.message} onConfirm={props.onConfirm}/>;`,
 'sales-order-line-editor':`export const SalesOrderLineEditor=props=><div data-editor={true} {...props}/>;`,
};
await build({stdin:{contents:'export * from "./lib/erp/sales-order-workflow";export * from "./lib/erp/sales-order-edit-lines";export {SalesOrderForm} from "./components/erp/sales-order-form";',loader:'tsx',resolveDir:app},outfile:path.join(output,'fixture.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning',plugins:[{name:'sales-leaves',setup(builder){builder.onResolve({filter:/.*/},args=>{if(!/(?:sales-order-form\.tsx|use-sales-order-detail\.ts|document-detail\/[^/]+\.tsx)$/.test(args.importer.replaceAll('\\','/')))return;for(const key of Object.keys(leaves))if(args.path.endsWith(key))return{path:key,namespace:'qa'};});builder.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:leaves[args.path],loader:'tsx',resolveDir:app}));}}]});
const require=createRequire(import.meta.url),{SalesCommandSession,salesLineChanges,editableSalesLines,SalesOrderForm}=require(path.join(output,'fixture.cjs'));
const intent={idempotencyKey:'QA-KEY',branchId:'QA',documentId:'QA-DOC',expectedStateToken:'a'.repeat(64),payload:{notes:'QA'}};
const receipt=(module,operation,request)=>({module,operation,idempotencyKey:request.idempotencyKey,documentId:request.documentId,stateToken:'b'.repeat(64),auditId:'QA-AUDIT',deleted:operation==='delete',allocatedLines:[]});

test('uncertain commands retain immutable intent; lookup and explicit retry use the same key',async()=>{
 const calls=[],observations=[];let unavailable=true;
 const session=new SalesCommandSession('sales-order-pm',{send:async(operation,request)=>{calls.push({operation,request});if(unavailable)throw Error('network');return{outcome:'Replayed',receipt:receipt('sales-order-pm',operation,request)};},lookup:async(operation,request)=>{observations.push({operation,request});return{outcome:'Absent'};}});
 const request=structuredClone(intent);assert.equal((await session.submit('send-sa',request)).outcome,'OutcomeUnknown');
 request.payload.notes='CHANGED';assert.equal(session.pending.intent.payload.notes,'QA');
 await assert.rejects(()=>session.submit('send-sa',intent),/sales_command_pending/);
 assert.equal((await session.recover()).outcome,'OutcomeUnknown');assert.ok(session.pending);
 unavailable=false;assert.equal((await session.retry()).outcome,'Replayed');assert.equal(session.pending,null);
 assert.deepEqual(calls[0],calls[1]);assert.deepEqual(observations[0],calls[0]);
});
test('wrong receipt or operation cannot clear custody or execute another role action',async()=>{
 const session=new SalesCommandSession('sales-order-pm',{send:async(operation,request)=>({outcome:'Committed',receipt:receipt('sales-orders',operation,request)}),lookup:async()=>({outcome:'Unknown'})});
 await assert.rejects(()=>session.submit('send-accounting',intent),/not_allowed/);
 assert.equal((await session.submit('send-sa',intent)).code,'receipt_mismatch');assert.ok(session.pending);
 const scoped=new SalesCommandSession('sales-order-pm',{send:async()=>{throw Error('must not send');},lookup:async()=>({outcome:'Unknown'})},{branchId:'QA',documentId:'QA-DOC'});
 await assert.rejects(()=>scoped.submit('send-sa',{...intent,branchId:'OTHER'}),/sales_scope_changed/);assert.equal(scoped.pending,null);
});
test('committed lookup releases exactly the pending command',async()=>{
 const session=new SalesCommandSession('sales-order-sa',{send:async()=>({outcome:'Unavailable'}),lookup:async(operation,request)=>({outcome:'Committed',receipt:receipt('sales-order-sa',operation,request)})});
 await session.submit('send-tech',intent);assert.equal((await session.recover()).outcome,'Replayed');assert.equal(session.pending,null);
});
test('QR retry preserves the barcode and scan-delete receipt does not delete the document',async()=>{
 const writes=[];let fail=true;
 const session=new SalesCommandSession('sales-qr',{send:async(operation,request)=>{writes.push(structuredClone(request));if(fail)return{outcome:'Unavailable'};return{outcome:'Committed',receipt:receipt('sales-qr',operation,request)};},lookup:async()=>({outcome:'Unknown'})});
 const request={...intent,barcode:'QA-QR'};
 await session.submit('scan-delete',request);request.barcode='CHANGED';
 fail=false;const result=await session.retry();assert.equal(result.outcome,'Committed');assert.equal(result.receipt.deleted,false);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].barcode,'QA-QR');
});
const line={lineId:'QA-LINE',fields:{itemId:'QA-ITEM',itemName:'Hàng kiểm thử',quantity:'2',unitPrice:'10',vATPercent:'5',vATQuantity:'2'}};
test('line edit emits writable differences, add/remove and stable row identity',()=>{
 const [edited]=editableSalesLines([line]);assert.deepEqual(salesLineChanges([line],[edited]),[]);
 edited.quantity='3';const changes=salesLineChanges([line],[edited]);assert.equal(changes[0].lineId,'QA-LINE');assert.equal(changes[0].values.quantity,'3');assert.equal('itemName' in changes[0].values,false);assert.equal('amount' in changes[0].values,false);
 assert.deepEqual(salesLineChanges([line],[]),[{kind:'Remove',lineId:'QA-LINE'}]);
 const added={...edited,key:'QA-NEW',savedLineId:undefined};assert.equal(salesLineChanges([],[added])[0].kind,'Add');
 assert.throws(()=>salesLineChanges([line],[edited,edited]),/identity/);
});

const React=require('react'),{create,act}=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={addEventListener(){},removeEventListener(){}};
const flush=async()=>{for(let i=0;i<6;i++)await act(async()=>{});};
const apiActions=ids=>ids.map(id=>({id,caption:id,visible:true,enabled:true,requiresSavedDocument:true}));
const detail=(actions)=>({documentId:'QA-DOC',branchId:'QA',header:{documentDate:'2026-10-18T00:00:00',objectId:'QA-CUSTOMER',objectName:'Đối tượng kiểm thử',employeeId:'QA-EMPLOYEE',currencyId:'VND',statusId:12,statusName:'Trạng thái kiểm thử',isLocked:false},lines:{rows:[line],page:1,pageSize:50,hasMore:false},history:{rows:[],page:1,pageSize:50,hasMore:false},actions:apiActions(actions),stateToken:'a'.repeat(64)});
for(const [module,operations]of [['sales-order-pm',['send-sa','reject']],['sales-order-sa',['send-accounting','send-tech','reject','return-step']]])test(module+' uses its own API and never offers Sales editing',async()=>{
 const writes=[];globalThis.qaSales={read:async()=>detail(operations),send:async(m,op,request)=>{writes.push({m,op,request});return{outcome:'Committed',receipt:receipt(m,op,request)};}};
 let renderer;try{
  await act(async()=>{renderer=create(React.createElement(SalesOrderForm,{module,branchId:'QA',documentId:'QA-DOC',onChanged(){},onClose(){}}));});await flush();
  assert.equal(renderer.root.findAll(node=>node.type==='button'&&node.children.includes('Sửa')).length,0);
  const button=renderer.root.findAll(node=>node.type==='button'&&node.props.onClick&&node.children.some(child=>child=== (module==='sales-order-pm'?'Gửi SA':'Gửi Kế toán')))[0];
  await act(async()=>button.props.onClick());
  const dialog=renderer.root.findByProps({'data-action':operations[0]});await act(async()=>dialog.props.onConfirm({notes:'QA-NOTES'}));await flush();
  assert.equal(writes.length,1);assert.equal(writes[0].m,module);assert.equal(writes[0].op,operations[0]);assert.deepEqual(writes[0].request.payload,{notes:'QA-NOTES'});assert.equal(writes[0].request.expectedStateToken,'a'.repeat(64));
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.qaSales;}
});
test('Sales save uses line diff and blocks close while the command result is unknown',async()=>{
 const writes=[];let guard;globalThis.qaSales={read:async()=>detail(['save','send-pm']),send:async(module,operation,request)=>{writes.push(request);return{outcome:'OutcomeUnknown'};},lookup:async(module,request)=>({outcome:'Committed',receipt:receipt(module,request.operation,request.originalIntent)})};
 let renderer;try{
  await act(async()=>{renderer=create(React.createElement(SalesOrderForm,{branchId:'QA',documentId:'QA-DOC',onChanged(){},onClose(){},onCloseGuardChange:value=>{guard=value;}}));});await flush();
  const buttons=()=>renderer.root.findAll(node=>node.type==='button');
  await act(async()=>buttons().find(node=>node.children.includes('Sửa')).props.onClick());await flush();
  await act(async()=>renderer.root.findByProps({'data-editor':true}).props.onPatch('QA-LINE',{quantity:'4'}));
  await act(async()=>buttons().find(node=>node.children.includes('Lưu thay đổi')).props.onClick());await flush();
  assert.equal(writes[0].lineChanges[0].values.quantity,'4');assert.equal(writes[0].lineChanges[0].lineId,'QA-LINE');
  await act(async()=>assert.equal(guard(),false));
  await act(async()=>buttons().find(node=>node.children.includes('Kiểm tra kết quả')).props.onClick());await flush();assert.equal(guard(),true);
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.qaSales;}
});

test('editing reads all line pages and refuses to mix changed document versions',async()=>{
 const reads=[];globalThis.qaSales={read:async(module,request)=>{reads.push(request.page);const data=detail(['save']);if(request.page===1)data.lines.hasMore=true;else{data.stateToken='b'.repeat(64);data.lines.rows=[{...line,lineId:'QA-SECOND'}];data.lines.page=2;}return data;}};
 let renderer;try{
  await act(async()=>{renderer=create(React.createElement(SalesOrderForm,{branchId:'QA',documentId:'QA-DOC',onChanged(){},onClose(){}}));});await flush();
  await act(async()=>renderer.root.findAll(node=>node.type==='button').find(node=>node.children.includes('Sửa')).props.onClick());await flush();
  assert.deepEqual(reads,[1,2]);assert.equal(renderer.root.findAllByProps({'data-editor':true}).length,0);
  assert.ok(renderer.root.findAll(node=>node.type==='span'&&node.children.some(child=>typeof child==='string'&&child.includes('Chưa đọc đủ chi tiết'))).length);
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.qaSales;}
});

test('server-disabled role actions do not write and a rejected request keeps its confirmation open',async()=>{
 const writes=[];globalThis.qaSales={read:async()=>{const data=detail(['send-sa','reject']);data.actions[0].enabled=false;return data;},send:async(module,operation,request)=>{writes.push({operation,request});return{outcome:'InvalidInput'};}};
 let renderer;try{
  await act(async()=>{renderer=create(React.createElement(SalesOrderForm,{module:'sales-order-pm',branchId:'QA',documentId:'QA-DOC',onChanged(){},onClose(){}}));});await flush();
  const buttons=()=>renderer.root.findAll(node=>node.type==='button');
  const disabled=buttons().find(node=>node.children.includes('Gửi SA'));assert.equal(disabled.props.disabled,true);
  await act(async()=>disabled.props.onClick());await act(async()=>renderer.root.findByProps({'data-action':'send-sa'}).props.onConfirm({notes:'QA'}));assert.equal(writes.length,0);
  await act(async()=>buttons().find(node=>node.children.includes('Trả lại')).props.onClick());
  await act(async()=>renderer.root.findByProps({'data-action':'reject'}).props.onConfirm({notes:'QA-REASON'}));await flush();
  assert.equal(writes.length,1);assert.equal(writes[0].operation,'reject');assert.deepEqual(writes[0].request.payload,{notes:'QA-REASON'});
  assert.match(renderer.root.findByProps({'data-action':'reject'}).props.message,/Thông tin chưa hợp lệ/);
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.qaSales;}
});
