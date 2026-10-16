import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','erp-sales-order-create');
await mkdir(output,{recursive:true});

// Backend contract (dbo.SY_FrmDrdwTbl): header.ContractID has ParaArr=ObjectID
// and LinkColumn=ObjectID;ObjectName, header.ObjectID has ParaArr=ContractID.
const clientStub=`
export const erpClient={
 async getScreenMetadata(){return{caption:'Quản lý đơn hàng'};},
 async getErpModuleActions(){return[{id:'create',caption:'',visible:true,enabled:true}];},
 async getErpModuleList(){return{rows:[],page:1,hasMore:false};},
 async getErpModuleDetail(){return null;},
 async getLookupOptions(module,query){
   (globalThis.__lookupQueries??=[]).push({module,...query});
   return{items:[],page:1,pageSize:20,hasMore:false,requiredParameters:[]};
 },
};
`;

// The linked Customer↔Contract behaviour lives in TabErpScreen, so the lookup is
// replaced by a stub that renders its props and exposes onSelect for the test.
const lookupStub=`
export const fieldText=(v)=>v==null?'':String(v);
export const choiceLabel=(c,f)=>c&&c.label?c.label:f;
export const LookupField=({label,value,choice,context,onSelect})=>(
  <span
    data-lookup={label}
    data-value={value||''}
    data-choice={(choice&&choice.label)||''}
    data-context={JSON.stringify(context||null)}
    onPick={onSelect}
  />
);
`;

const stubs={
  'erp-client':clientStub,
  'lookup-field':lookupStub,
  'bottom-sheet':`export const UntitledBottomSheet=({open,children})=>open?<div data-sheet="1">{children}</div>:null;`,
  'button':`export const UntitledButton=({children,iconLeading,iconTrailing,variant,size,...rest})=>(<button type="button" {...rest}>{children}</button>);`,
  'sales-order-form':`export const SalesOrderForm=()=>null;`,
  'purchase-order-create-sheet':`export const PurchaseOrderCreateSheet=()=>null;`,
  'purchase-request-create-sheet':`export const PurchaseRequestCreateSheet=()=>null;`,
  'qr-camera':`export class QrCamera{stop(){}start(){}}`,
};

const stubPlugin=(importerPattern,map)=>({
  name:'erp-stubs',
  setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(!importerPattern.test(args.importer.replace(/\\/g,'/')))return null;
      const requested=args.path.replace(/\\/g,'/');
      for(const key of Object.keys(map))if(requested.endsWith(key))return{path:key,namespace:'stub'};
      return null;
    });
    builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:map[args.path],loader:'tsx',resolveDir:app}));
  },
});

const buildFixture=(entry,outfile,plugin)=>build({
  stdin:{contents:entry,resolveDir:app,loader:'tsx'},
  outfile:path.join(output,outfile),
  bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',
  alias:{'@':app},logLevel:'warning',plugins:[plugin],
});

await buildFixture('export {TabErpScreen} from "./components/untitledui/tab-erp-screen";','fixture.cjs',
  stubPlugin(/tab-erp-screen\.tsx$/,stubs));
// Second fixture: the real LookupField with only its transport stubbed, so the
// request payload (context) can be asserted.
await buildFixture('export {LookupField} from "./components/untitledui/lookup-field";','lookup-field.cjs',
  stubPlugin(/lookup-field\.tsx$/,{'erp-client':clientStub}));

const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {TabErpScreen}=require(path.join(output,'fixture.cjs'));
const {LookupField}=require(path.join(output,'lookup-field.cjs'));

const flush=async(rounds=8)=>{for(let i=0;i<rounds;i++)await act(async()=>{});};
const settle=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});await flush();};
const lookupOf=(renderer,label)=>renderer.root
  .findAll(node=>node.props&&node.props['data-lookup']!==undefined)
  .find(node=>node.props['data-lookup']===label);

test('create sheet maps the customer from a contract and scopes contracts to the customer',async()=>{
  let renderer;
  await act(async()=>{
    renderer=create(React.createElement(TabErpScreen,{module:'sales-orders',currentBranch:'MB',isActive:true}));
  });
  await flush();

  const createButton=renderer.root.findAllByType('button').find(b=>b.props.children==='Tạo mới');
  assert.ok(createButton,'the sales-order create button must render');
  await act(async()=>createButton.props.onClick());
  await flush();

  let contract=lookupOf(renderer,'Mã hợp đồng');
  let customer=lookupOf(renderer,'Khách hàng');
  assert.ok(contract&&customer,'both lookups must render in the create sheet');
  assert.equal(contract.props['data-context'],'{"ObjectID":null}','no customer yet → contract list unscoped');
  assert.equal(customer.props['data-context'],'{"ContractID":null}','no contract yet → customer list unscoped');

  // 1) Contract first → customer is mapped from the contract's linked columns.
  await act(async()=>contract.props.onPick({
    id:'HD01',label:'HD01',fields:{ContractID:'HD01',ObjectID:'KH01',ObjectName:'Cong ty A'},
  }));
  await flush();
  customer=lookupOf(renderer,'Khách hàng');
  assert.equal(customer.props['data-value'],'KH01','contract must map ObjectID into the customer field');
  assert.equal(customer.props['data-choice'],'KH01','the mapped customer must be displayable');
  assert.equal(customer.props['data-context'],'{"ContractID":"HD01"}','customer list scoped to the contract');
  contract=lookupOf(renderer,'Mã hợp đồng');
  assert.equal(contract.props['data-value'],'HD01');
  assert.equal(contract.props['data-context'],'{"ObjectID":"KH01"}','contract list now scoped to the mapped customer');

  // 2) Customer first/changed → contract list follows and stale contract is dropped.
  await act(async()=>customer.props.onPick({id:'KH02',label:'KH02',fields:{ObjectID:'KH02',ObjectName:'Cong ty B'}}));
  await flush();
  contract=lookupOf(renderer,'Mã hợp đồng');
  assert.equal(contract.props['data-value'],'','a contract of the previous customer must not survive');
  assert.equal(contract.props['data-choice'],'');
  assert.equal(contract.props['data-context'],'{"ObjectID":"KH02"}','contract list follows the new customer');
  customer=lookupOf(renderer,'Khách hàng');
  assert.equal(customer.props['data-value'],'KH02');
  assert.equal(customer.props['data-context'],'{"ContractID":null}');

  // 3) A contract row without ObjectID keeps the customer already chosen.
  await act(async()=>contract.props.onPick({id:'HD09',label:'HD09',fields:{ContractID:'HD09'}}));
  await flush();
  customer=lookupOf(renderer,'Khách hàng');
  assert.equal(customer.props['data-value'],'KH02','an unlinked contract must not overwrite the customer');
  assert.equal(lookupOf(renderer,'Mã hợp đồng').props['data-value'],'HD09');

  // 4) Clearing the contract keeps the customer.
  await act(async()=>lookupOf(renderer,'Mã hợp đồng').props.onPick(null));
  await flush();
  assert.equal(lookupOf(renderer,'Mã hợp đồng').props['data-value'],'');
  assert.equal(lookupOf(renderer,'Khách hàng').props['data-value'],'KH02');

  await act(async()=>renderer.unmount());
});

test('LookupField sends the linked context to the options API and refetches when it changes',async()=>{
  globalThis.__lookupQueries=[];
  const render=context=>React.createElement(LookupField,{
    label:'Mã hợp đồng',module:'sales-orders',lookupId:'header.ContractID',branchId:'MB',
    value:'',choice:null,onSelect(){},context,
  });
  let renderer;
  await act(async()=>{renderer=create(render({ObjectID:'KH01'}));});
  const toggle=renderer.root.findAllByType('button')[0];
  assert.ok(toggle,'the lookup trigger must render');
  await act(async()=>toggle.props.onClick());
  await settle();

  assert.equal(globalThis.__lookupQueries.length,1,'opening the dropdown must fetch options');
  assert.equal(globalThis.__lookupQueries[0].lookupId,'header.ContractID');
  assert.deepEqual(globalThis.__lookupQueries[0].context,{ObjectID:'KH01'});

  await act(async()=>renderer.update(render({ObjectID:'KH02'})));
  await settle();
  assert.equal(globalThis.__lookupQueries.length,2,'a linked parent change must refetch');
  assert.deepEqual(globalThis.__lookupQueries[1].context,{ObjectID:'KH02'});

  await act(async()=>renderer.update(render(undefined)));
  await settle();
  assert.equal(globalThis.__lookupQueries.length,3);
  assert.equal(globalThis.__lookupQueries[2].context,null,'no linked parent → null context, not a stray key');

  await act(async()=>renderer.unmount());
});
