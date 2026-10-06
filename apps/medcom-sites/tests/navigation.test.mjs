import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizedScreenIds,mobileQuickScreenIds,workspaceStateScope,workspaceReadViewScope,AuthorityFence} from '../.test-runtime/erp-tests/navigation.js';

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

test('an unchanged effective scope survives higher observation version and idle refresh',()=>{
 const w=workspace(['purchase-orders.read','inbound-requests.read'],['purchase-orders','inbound-requests']);
 w.branchIds=['A','B'];
 const key=workspaceStateScope(w,4);
 const refreshed=structuredClone(w);refreshed.session.authorityVersion=99;refreshed.session.idleExpiresAt='2099-01-01T01:00:00Z';
 refreshed.session.capabilities.reverse();refreshed.branchIds.reverse();refreshed.navigation.reverse();
 assert.equal(workspaceStateScope(refreshed,4),key);
 refreshed.session.absoluteExpiresAt='2099-01-02T07:00:00+07:00';
 assert.equal(workspaceStateScope(refreshed,4),key);
});

test('identity, login, fixed session lifetime or effective authorization changes retire UI state',()=>{
 const w=workspace(['purchase-orders.read','inbound-requests.read'],['purchase-orders','inbound-requests']);w.branchIds=['A','B'];
 const key=workspaceStateScope(w,4);
 const mutations=[
  x=>x.session.displayName='Different observable identity',x=>x.session.tenantId='different-tenant',
  x=>x.session.companyId='different-company',x=>x.session.companyName='different-company-name',
  x=>x.session.absoluteExpiresAt='2099-01-03T00:00:00Z',x=>x.branchIds=['A'],
  x=>x.session.capabilities=['purchase-orders.read'],x=>x.navigation=x.navigation.slice(0,1),
 ];
 for(const change of mutations){const changed=structuredClone(w);change(changed);assert.notEqual(workspaceStateScope(changed,4),key);}
 assert.notEqual(workspaceStateScope(w,5),key);
 assert.notEqual(workspaceStateScope(null,4),key);
});


test('read view controls use exact session and canonical rights, never observation or expiry',()=>{
 const w=workspace(['purchase-orders.read','platform.status'],['purchase-orders']);
 Object.assign(w,{sessionScope:'a'.repeat(64),readScope:'b'.repeat(64),branchIds:['B','A']});
 const key=workspaceReadViewScope(w),same=structuredClone(w);
 same.session.authorityVersion++;same.session.idleExpiresAt='2099-02-01T00:00:00Z';same.session.absoluteExpiresAt='2099-03-01T00:00:00Z';
 same.session.displayName='Renamed';same.session.companyName='Renamed company';same.session.capabilities.reverse();same.branchIds=['A','B','A'];
 assert.equal(workspaceReadViewScope(same),key);
 for(const change of [x=>x.sessionScope='c'.repeat(64),x=>x.readScope='c'.repeat(64),x=>x.branchIds=['A'],x=>x.session.capabilities=[],x=>x.navigation=[]]){
  const next=structuredClone(w);change(next);assert.notEqual(workspaceReadViewScope(next),key);
 }
 assert.equal(workspaceReadViewScope(workspace([],[])),'unverified');
});
