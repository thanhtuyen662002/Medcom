import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime/erp-sales-order-edit-lookup');
await mkdir(output,{recursive:true});
// Real edit form and LookupField; only API transport and unrelated presentation
// leaves are replaced. The test never starts a browser or contacts an ERP.
const stubs={
  'erp-client':`export const erpClient={
    async getErpModuleDetail(){return structuredClone(globalThis.qaEdit.detail);},
    async getLookupOptions(module,query){globalThis.qaEdit.calls.push({module,...structuredClone(query)});return globalThis.qaEdit.options(query);}
  };`,
  'bottom-sheet':`export const UntitledBottomSheet=()=>null;`,
  'record-dialog':`export const RecordActionBar=({children})=><div>{children}</div>;export const RecordDetailHeading=()=>null;export const RecordDetailStatus=()=>null;`,
  'request-presentation':`import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton=({children,variant,...props})=><button {...props}>{children}</button>;export const RequestInput=props=><input {...props}/>;export const RequestTextarea=props=><textarea {...props}/>;export const requestDate=value=>value;export const requestStyles={actions:''};`,
  'sales-order-attachment-list':`export const SalesOrderAttachmentList=()=>null;`,
  'document-detail-tabs':`export const DocumentDetailTabs=()=>null;`,
  'sales-order-action-dialog':`export const SalesOrderActionDialog=()=>null;`,
  'sales-order-line-editor':`export const SalesOrderLineEditor=()=>null;`,
};
await build({
  stdin:{contents:'export {SalesOrderForm} from "./components/erp/sales-order-form";export {LookupField} from "./components/untitledui/lookup-field";',loader:'tsx',resolveDir:app},
  outfile:path.join(output,'fixture.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning',
  plugins:[{name:'edit-lookup-transport',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(!/(?:sales-order-form\.tsx|lookup-field\.tsx|use-sales-order-detail\.ts|document-detail\/[^/]+\.tsx)$/.test(args.importer.replaceAll('\\','/')))return;
      for(const key of Object.keys(stubs))if(args.path.endsWith(key))return{path:key,namespace:'qa-edit'};
    });
    builder.onLoad({filter:/.*/,namespace:'qa-edit'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:app}));
  }}],
});
const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
const {SalesOrderForm,LookupField}=require(path.join(output,'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={addEventListener(){},removeEventListener(){}};
const textOf=node=>node.children.map(child=>typeof child==='string'?child:textOf(child)).join('');
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
const pageOf=items=>({items,page:1,pageSize:100,hasMore:false,requiredParameters:[]});

test('edit contract lookup requests on open, scopes the customer and refreshes an empty result on reopen',async()=>{
  const calls=[];
  globalThis.qaEdit={calls,options:async()=>pageOf([]),detail:{
    documentId:'QA-DOC',branchId:'QA',stateToken:'a'.repeat(64),
    header:{documentDate:'2026-10-18T00:00:00',objectId:'QA-CUSTOMER',objectName:'Khách hàng kiểm thử',employeeId:'QA-EMPLOYEE'},
    lines:{rows:[],page:1,pageSize:50,hasMore:false},history:{rows:[],page:1,pageSize:50,hasMore:false},
    actions:[{id:'save',visible:true,enabled:true}],
  }};
  let renderer;
  try{
    await act(async()=>{renderer=create(React.createElement(SalesOrderForm,{branchId:'QA',documentId:'QA-DOC',onClose(){},onChanged(){}}));});
    await settle();
    await act(async()=>renderer.root.findAllByType('button').find(button=>textOf(button)==='Sửa').props.onClick());
    await settle();
    assert.equal(calls.length,0,'entering edit mode must not preload and cache an empty contract response');
    const contract=()=>renderer.root.findAllByType(LookupField).find(field=>field.props.lookupId==='header.ContractID');
    const toggle=()=>contract().findAllByType('button')[0];
    await act(async()=>toggle().props.onClick());await settle();
    assert.equal(calls.length,1,'opening Hợp đồng must execute the options request');
    assert.deepEqual(calls[0],{module:'sales-orders',branchId:'QA',lookupId:'header.ContractID',page:1,pageSize:100,search:null,context:{ObjectID:'QA-CUSTOMER'}});
    assert.ok(contract().findAllByType('p').some(node=>textOf(node)==='Không có lựa chọn nào.'));
    await act(async()=>toggle().props.onClick());
    globalThis.qaEdit.options=async()=>pageOf([{id:'QA-CONTRACT',label:'Hợp đồng kiểm thử',fields:{ContractID:'QA-CONTRACT',ObjectID:'QA-CUSTOMER'}}]);
    await act(async()=>toggle().props.onClick());await settle();
    assert.equal(calls.length,2,'reopening must refetch rather than reuse the earlier empty response');
    assert.deepEqual(calls[1].context,{ObjectID:'QA-CUSTOMER'});
    await act(async()=>contract().findAllByType('button').find(button=>textOf(button).includes('Hợp đồng kiểm thử')).props.onClick());
    assert.equal(contract().props.value,'QA-CONTRACT','the selected API contract must update the edit draft');
  }finally{
    if(renderer)await act(async()=>renderer.unmount());
    delete globalThis.qaEdit;
  }
});
