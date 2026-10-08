import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
await mkdir('.test-runtime/i50',{recursive:true});
await build({entryPoints:['lib/erp/list-view-state.ts','components/erp/list-view-state.tsx'],outdir:'.test-runtime/i50',bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',outExtension:{'.js':'.cjs'},logLevel:'warning'});
const require=createRequire(import.meta.url),{createListViewStore,cleanListControls,emptyListControls}=require('../.test-runtime/i50/lib/erp/list-view-state.cjs');
const React=require('react'),{act,create}=require('react-test-renderer'),{ListViewProvider,useListControls}=require('../.test-runtime/i50/components/erp/list-view-state.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test('only three bounded control slots; projected copies reject rows/selections/proofs and non-finite offsets',()=>{
 const store=createListViewStore();store.admit('auth-A/read-A');const ticket=store.getEpoch();
 const polluted={...emptyListControls,draftSearch:'x'.repeat(1000),page:9000,top:Infinity,left:-1,windowTop:NaN,rows:[{secret:'sentinel'}],selectedId:'DOC',receipt:'ACK',modalOpen:true,proof:{}};
 assert.equal(store.save('purchase-orders',ticket,polluted),true);assert.equal(store.save('other',ticket,polluted),false);
 const result=store.read('purchase-orders');assert.deepEqual(Object.keys(result).sort(),Object.keys(emptyListControls).sort());assert.equal(result.draftSearch.length,100);assert.equal(result.page,1000);assert.equal(result.top,0);assert.equal(result.left,0);assert.equal(result.windowTop,0);
 result.page=9;assert.equal(store.read('purchase-orders').page,1000);assert.equal(cleanListControls({page:1.5}).page,1);
});
test('same observation and temporary loss keep inert controls; A→B→A and terminal retirement invalidate old saves',()=>{
 const store=createListViewStore();store.admit('A');const a=store.getEpoch();store.save('inbound-requests',a,{...emptyListControls,draftSearch:'draft',appliedSearch:'applied',page:4,top:180});
 store.admit('A');assert.equal(store.getEpoch(),a);assert.equal(store.read('inbound-requests').page,4);
 // Root deliberately does not admit/retire on null; the controls carry no data.
 assert.equal(store.read('inbound-requests').draftSearch,'draft');
 store.admit('B');assert.equal(store.save('inbound-requests',a,{...emptyListControls,page:9}),false);store.admit('A');assert.deepEqual(store.read('inbound-requests'),emptyListControls);
 const latest=store.getEpoch();store.retire();store.admit('A');assert.equal(store.save('purchase-orders',latest,{...emptyListControls,page:7}),false);
});
test('purchase fresh bootstrap validates binding and branch before returning any retained controls',()=>{
 const store=createListViewStore();store.admit('workspace');const epoch=store.getEpoch();store.qualifyPurchase(epoch,'purchase-A',['MB','MN']);store.save('purchase-requests',epoch,{...emptyListControls,draftSearch:'unapplied',appliedSearch:'applied',draftBranch:'MB',appliedBranch:'MB',page:8,top:50});
 assert.equal(store.qualifyPurchase(epoch,'purchase-A',['MB','MN']).page,8);
 const denied=store.qualifyPurchase(epoch,'purchase-A',['MN']);assert.equal(denied.appliedBranch,'');assert.equal(denied.draftBranch,'');assert.equal(denied.page,1);assert.equal(denied.top,0);assert.equal(denied.draftSearch,'unapplied');
 assert.deepEqual(store.qualifyPurchase(epoch,'purchase-B',['MB']),emptyListControls);assert.deepEqual(store.qualifyPurchase(epoch,'purchase-A',['MB']),emptyListControls);
 store.retire();assert.equal(store.qualifyPurchase(epoch,'purchase-A',['MB']),null);
});
async function hookHost(screen,store){
 const originalWindow=globalThis.window,originalRaf=globalThis.requestAnimationFrame,originalCaf=globalThis.cancelAnimationFrame;
 const listeners=new Map(),frames=new Map();let sequence=0,api,renderer;const calls=[];
 const element={scrollTop:0,scrollLeft:0,classList:{contains:name=>name==='desktop-grid-viewport'}};
 globalThis.window={scrollY:0,scrollTo:value=>calls.push(value),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 function Probe(){api=useListControls(screen);return null;}
 const mount=()=>act(async()=>{renderer=create(React.createElement(ListViewProvider,{store},React.createElement(Probe)));});
 const unmount=()=>act(async()=>{renderer.unmount();});
 await mount();
 return {get api(){return api;},element,calls,mount,unmount,frameCount:()=>frames.size,flush:()=>act(async()=>{for(const fn of [...frames.values()])fn();frames.clear();}),emit:async(name,event={})=>act(async()=>listeners.get(name)?.(event)),close:async()=>{await unmount();globalThis.window=originalWindow;globalThis.requestAnimationFrame=originalRaf;globalThis.cancelAnimationFrame=originalCaf;}};
}
test('real hook defers purchase restoration, preserves draft/applied separation through actual unmount and cancels newer input',async()=>{
 const store=createListViewStore();store.admit('A');const ticket=store.getEpoch();store.qualifyPurchase(ticket,'P',['MB']);store.save('purchase-requests',ticket,{...emptyListControls,draftSearch:'draft',appliedSearch:'applied',page:3,top:100});
 const f=await hookHost('purchase-requests',store);try{
  assert.deepEqual(f.api.value,emptyListControls);assert.equal(store.read('purchase-requests').appliedSearch,'applied','default mount does not overwrite retained controls');
  await act(async()=>f.api.qualifyPurchase('P',['MB']));assert.equal(f.api.value.page,3);assert.equal(f.api.value.draftSearch,'draft');
  await act(async()=>f.api.field('draftSearch')('new draft'));assert.equal(store.read('purchase-requests').appliedSearch,'applied');
  await f.unmount();await f.mount();assert.equal(f.api.value.appliedSearch,'');await act(async()=>f.api.field('draftSearch')('newest navigation'));await act(async()=>f.api.qualifyPurchase('P',['MB']));assert.equal(f.api.value.draftSearch,'newest navigation');assert.equal(f.api.value.appliedSearch,'');
 }finally{await f.close();}
});
test('real hook scroll restore cannot outlive a user scroll, new filter, epoch change or unmount; mask does not overwrite offsets',async()=>{
 const store=createListViewStore();store.admit('A');store.save('purchase-orders',store.getEpoch(),{...emptyListControls,top:140,left:80,windowTop:200});
 const f=await hookHost('purchase-orders',store);try{
  f.api.attachRoot({querySelector:()=>f.element});await act(async()=>f.api.restoreScroll(true));assert.equal(f.frameCount(),1);await f.emit('wheel');await f.flush();assert.equal(f.element.scrollTop,0);
  await f.unmount();await f.mount();f.api.attachRoot({querySelector:()=>f.element});await act(async()=>f.api.restoreScroll(true));await act(async()=>f.api.field('page')(2));await f.flush();assert.equal(f.element.scrollTop,0);
  await f.unmount();store.save('purchase-orders',store.getEpoch(),{...emptyListControls,top:120});await f.mount();f.api.attachRoot({querySelector:()=>f.element});await act(async()=>f.api.restoreScroll(true));await act(async()=>{store.admit('B');store.admit('A');});await f.flush();assert.equal(f.element.scrollTop,0);assert.deepEqual(f.api.value,emptyListControls);
  await act(async()=>f.api.field('top')(90));f.api.setActive(false);globalThis.window.scrollY=999;await f.emit('scroll');assert.equal(store.read('purchase-orders').top,90);assert.equal(store.read('purchase-orders').windowTop,0);
  await f.unmount();store.save('purchase-orders',store.getEpoch(),{...emptyListControls,top:70,left:30,windowTop:20});await f.mount();f.api.attachRoot({querySelector:()=>f.element});await act(async()=>f.api.restoreScroll(true));await f.flush();assert.equal(f.element.scrollTop,70);assert.equal(f.element.scrollLeft,30);assert.deepEqual(f.calls.at(-1),{top:20,behavior:'instant'});
 }finally{await f.close();}
});
