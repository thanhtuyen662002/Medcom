import {test} from 'node:test';
import assert from 'node:assert/strict';
import {erpPermissionsSchema} from '../.test-runtime/erp-tests/erp-screen-contracts.js';

const screen=(module,canView,actions=[])=>({module,caption:`Màn ${module}`,canView,crud:{canRead:canView,canCreate:false,canUpdate:false,canDelete:false},actions});
const payload={branchId:'MB',screens:[
 screen('purchase-approvals',true,[{id:'approve',caption:'Duyệt',visible:true,requiresSavedDocument:true,route:'/api/erp/purchase-approvals/actions/approve'},{id:'reject',caption:'Không duyệt',visible:false,requiresSavedDocument:true,route:null}]),
 screen('sales-orders',false,[]),
]};

test('permissions payload carries view, crud and per-action visibility',()=>{
 const parsed=erpPermissionsSchema.safeParse(payload);
 assert.equal(parsed.success,true);
 const approvals=parsed.data.screens.find(s=>s.module==='purchase-approvals');
 assert.equal(approvals.canView,true);
 assert.equal(approvals.actions.find(a=>a.id==='approve').route,'/api/erp/purchase-approvals/actions/approve');
 assert.equal(approvals.actions.find(a=>a.id==='reject').visible,false);
 assert.equal(approvals.actions.find(a=>a.id==='reject').route,null);
});

test('permissions payload rejects enabled flags and unknown members',()=>{
 const withEnabled={...payload,screens:payload.screens.map(s=>({...s,actions:s.actions.map(a=>({...a,enabled:true}))}))};
 assert.equal(erpPermissionsSchema.safeParse(withEnabled).success,false);
 assert.equal(erpPermissionsSchema.safeParse({branchId:'MB',screens:[{...screen('x',true),extra:1}]}).success,false);
 assert.equal(erpPermissionsSchema.safeParse({branchId:'MB',screens:'nope'}).success,false);
});
