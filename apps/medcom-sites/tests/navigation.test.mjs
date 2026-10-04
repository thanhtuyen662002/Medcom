import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizedScreenIds,mobileQuickScreenIds,AuthorityFence} from '../.sites-runtime/erp-tests/navigation.js';

const workspace=(capabilities,navigation)=>({session:{displayName:'Synthetic role',tenantId:'test',companyId:'test',companyName:'Test',authorityVersion:1,idleExpiresAt:'2099-01-01T00:00:00Z',absoluteExpiresAt:'2099-01-02T00:00:00Z',capabilities},navigation:navigation.map(id=>({id,label:id,href:'/workspace/'})),branchIds:[]});

test('two authority sets expose different mobile shortcuts',()=>{
 assert.deepEqual(mobileQuickScreenIds(workspace(['purchase-orders.read'],['purchase-orders'])),['purchase-orders']);
 assert.deepEqual(mobileQuickScreenIds(workspace(['inbound-requests.read'],['inbound-requests'])),['inbound-requests']);
});
test('capability alone does not invent an authorized menu entry',()=>{
 assert.deepEqual(mobileQuickScreenIds(workspace(['purchase-orders.read'],[])),[]);
 assert.deepEqual(mobileQuickScreenIds(workspace([],['purchase-orders'])),[]);
});
test('authoritative revocation removes previously available shortcuts',()=>{
 const w=workspace(['purchase-orders.read','inbound-requests.read'],['purchase-orders','inbound-requests']);
 assert.equal(mobileQuickScreenIds(w).length,2);
 w.session.capabilities=['inbound-requests.read'];
 assert.deepEqual(mobileQuickScreenIds(w),['inbound-requests']);
 w.navigation=[];
 assert.deepEqual(mobileQuickScreenIds(w),[]);
});
test('unknown and source-disabled targets cannot appear in the drawer',()=>{
 assert.deepEqual(authorizedScreenIds(workspace([],['sales','evil','javascript:alert(1)'])),['home','settings']);
});
test('returned hrefs are never turned into navigation or external URLs',()=>{
 const w=workspace(['purchase-orders.read'],['purchase-orders','purchase-orders']);
 w.navigation[0].href='https://evil.example/';
 assert.deepEqual(authorizedScreenIds(w),['home','purchase-orders','settings']);
});
test('anonymous or admin-looking capability does not grant business shortcuts',()=>{
 assert.deepEqual(authorizedScreenIds(null),['home','settings']);
 assert.deepEqual(mobileQuickScreenIds(workspace(['WEB-MOBILE-ROLE-NAV'],['purchase-orders'])),[]);
});
test('late authority response cannot restore a logged-out workspace',()=>{
 const fence=new AuthorityFence();const request=fence.begin();
 fence.invalidate();assert.equal(fence.isCurrent(request),false);
});
test('newer authority request fences an older navigation response',()=>{
 const fence=new AuthorityFence();const old=fence.begin();const current=fence.begin();
 assert.equal(fence.isCurrent(old),false);assert.equal(fence.isCurrent(current),true);
});
