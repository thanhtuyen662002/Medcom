import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isErpTabAllowed,navIdsFromWorkspace,NAV_GATED_ERP_TABS} from '../.test-runtime/erp-tests/tab-permissions.js';

test('gated tabs follow server navigation only',()=>{
 assert.equal(isErpTabAllowed('purchase-approvals',['purchase-orders','purchase-approvals']),true);
 assert.equal(isErpTabAllowed('purchase-approvals',['purchase-orders']),false);
 assert.equal(isErpTabAllowed('purchase-approvals',[]),false);
});

test('unknown navigation keeps every tab visible (backend still enforces)',()=>{
 for(const tab of [...NAV_GATED_ERP_TABS,'sales-order-pm','home'])assert.equal(isErpTabAllowed(tab,null),true);
});

test('ungated modules stay visible regardless of navigation',()=>{
 assert.equal(isErpTabAllowed('sales-order-pm',['purchase-orders']),true);
 assert.equal(isErpTabAllowed('sales-order-pm',[]),true);
});

test('workspace navigation maps to plain id list',()=>{
 assert.deepEqual(navIdsFromWorkspace([{id:'purchase-approvals',label:'x',href:'/'}]),['purchase-approvals']);
 assert.equal(navIdsFromWorkspace(null),null);
 assert.equal(navIdsFromWorkspace(undefined),null);
});
