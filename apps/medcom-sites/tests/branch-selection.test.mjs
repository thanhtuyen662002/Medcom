import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBranchSelection, branchSelectionKey} from '../lib/erp/branch-selection.ts';

const all = {mode:'all',assignedBranchId:null,filterLocked:false};
const assigned = id => ({mode:'assigned',assignedBranchId:id,filterLocked:true});
const workspace = (branchSelection=all,branchIds=['QA-A','QA-B']) => ({branchSelection,branchIds});

test('explicit native metadata, opaque assigned literal and supplemental grants remain separate',()=>{
  const branches=Object.freeze(['QA-A;QA-B|QA-C,QA-D','SUPPLEMENTAL']);
  const input=Object.freeze(workspace(Object.freeze(assigned(branches[0])),branches));
  const before=JSON.stringify(input),state=readBranchSelection(input);
  assert.equal(state.status,'available');assert.deepEqual(state.selection,assigned(branches[0]));
  assert.equal(state.selection.filterLocked,true);assert.equal(JSON.stringify(input),before);
  assert.equal(input.branchIds,branches);assert.equal(input.branchIds.length,2);
  assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(state.selection));
  assert.deepEqual(readBranchSelection(workspace()),{status:'available',selection:all});
});

test('backward/missing/null/empty derived data is unavailable, never all',()=>{
  for(const input of [undefined,null,[],{}, {branchIds:['QA-A']},
    workspace(null),workspace(all,[]),workspace(all,null),{branchSelection:all,branchIds:undefined},
    {branchSelection:all}, {branchSelection:all,branchIds:'QA-A'},
    workspace(assigned('QA-A'),[]),workspace(assigned('QA-A'),['QA-B'])]){
    assert.deepEqual(readBranchSelection(input),{status:'unavailable'});
    assert.equal(branchSelectionKey(input),'["unavailable"]');
  }
  assert.deepEqual(readBranchSelection({branchIds:['QA-A'],branchSelection:undefined}),{status:'unavailable'});
});

test('malformed selection and branch arrays fail closed without repairing literal values',()=>{
  for(const selection of [{},[], 'all', {...all,mode:'ALL'}, {...all,assignedBranchId:''},
    {...all,filterLocked:true}, {...all,filterLocked:'false'},
    {mode:'all',filterLocked:false}, {...assigned('QA-A'),filterLocked:false},
    assigned(null),assigned(''),assigned(' '),assigned(' QA-A'),assigned('QA-A '),
    assigned('QA\nA'),assigned('QA\0A'),assigned('X'.repeat(51)),assigned('\ud800'),assigned('qa-a')])
    assert.equal(readBranchSelection(workspace(selection)).status,'unavailable',JSON.stringify(selection));
  for(const invalid of [null,3,'',' ',' QA-A','QA-A ','QA\tA','X'.repeat(51),'\ud800'])
    assert.equal(readBranchSelection(workspace(all,['QA-A',invalid])).status,'unavailable');
  assert.equal(readBranchSelection(workspace(all,Array(201).fill('QA-A'))).status,'unavailable');
  assert.equal(readBranchSelection(workspace(all,Array(1))).status,'unavailable');
  assert.equal(readBranchSelection(workspace(all,Array(200).fill('QA-A'))).status,'available');
});

test('all→assigned with equal grants, native assignment and unavailable transitions invalidate semantics',()=>{
  const inputs=[workspace(),workspace(assigned('QA-A')),workspace(assigned('QA-B')),workspace(null)];
  const keys=inputs.map(branchSelectionKey);assert.equal(new Set(keys).size,4);
  assert.equal(branchSelectionKey(workspace(assigned('QA-A'),['QA-B','QA-A','QA-A'])),keys[1]);
  assert.equal(branchSelectionKey(workspace()),keys[0]);
  assert.equal(branchSelectionKey({branchIds:['QA-A','QA-B']}),keys[3]);
  assert.equal(branchSelectionKey(workspace(assigned('QA-A;QA-B'),['QA-A','QA-B'])),keys[3]);
  const input=workspace(assigned('QA-A')),snapshot=readBranchSelection(input);
  input.branchSelection.mode='all';input.branchSelection.assignedBranchId=null;input.branchSelection.filterLocked=false;
  assert.deepEqual(snapshot.selection,assigned('QA-A'));assert.equal(branchSelectionKey(input),keys[0]);
});
