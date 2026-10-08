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

// Real Documents, list-control hook, React Query and scope-validating API client.
// Only visual leaf components are replaced; this is not a native-browser test.
await build({stdin:{contents:`export {Documents} from './components/erp/documents';export {ListViewProvider} from './components/erp/list-view-state';`,resolveDir:process.cwd(),loader:'tsx'},outfile:'.test-runtime/i50/documents.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning',plugins:[{name:'document-visual-leaves',setup(build){
 build.onResolve({filter:/^\.\/(grid|feedback|request-list-shell|request-presentation)$/},args=>args.importer.endsWith('/documents.tsx')?{path:args.path,namespace:'document-visual-leaves'}:undefined);
 build.onLoad({filter:/.*/,namespace:'document-visual-leaves'},()=>({contents:`import React from 'react';const leaf=name=>props=>React.createElement(name,props,props.children);export const ErpGrid=leaf('test-grid'),Freshness=leaf('test-freshness'),RequestListComposition=leaf('test-composition'),RequestListPanel=leaf('test-panel'),RequestListContent=leaf('test-content'),RequestListHeader=leaf('test-header'),RequestListToolbar=leaf('test-toolbar'),RequestSearch=leaf('test-search'),RequestBranch=leaf('test-branch'),RequestPagination=leaf('test-pagination'),RequestButton=leaf('test-button'),RequestEmpty=leaf('test-empty'),RequestError=leaf('test-error'),RequestLoading=leaf('test-loading'),RequestStatus=leaf('test-status'),RequestDocumentIdentity=leaf('test-identity');`,loader:'js',resolveDir:process.cwd()}));
}}]});
const {Documents,ListViewProvider:DocumentListViewProvider}=require('../.test-runtime/i50/documents.cjs');
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const scopeA={sessionScope:'a'.repeat(64),readScope:'b'.repeat(64)};
const documentWorkspace=(scope=scopeA)=>({...scope,session:{capabilities:['purchase-orders.read','inbound-requests.read']},branchIds:['BR-A','BR-B'],navigation:[{id:'purchase-orders'},{id:'inbound-requests'}]});
const documentRow={documentId:'SYNTHETIC-DOC',documentDate:'2026-10-06',branchId:'BR-A',statusId:1,isLocked:false};
async function documentsHost(){
 const saved={window:globalThis.window,fetch:globalThis.fetch};
 globalThis.window={scrollY:0,addEventListener(){},removeEventListener(){},scrollTo(){}};
 const store=createListViewStore();store.admit('A');
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 let renderer,detail,hold=false,status=200,rows=[documentRow],props={kind:'purchase-orders',workspace:documentWorkspace(),verified:true,generation:1,compact:false,setCompact(){},onLogin(){}};
 const calls=[],pending=[],denials=[];
 globalThis.fetch=async(url,init)=>{
  const query=new URL(url,'http://synthetic.test').searchParams,scope=props.workspace;
  calls.push({url,signal:init.signal});
  const response=Response.json(status===200?{rows,page:Number(query.get('page')),pageSize:50,hasMore:true}:{code:'synthetic_failure'},{status,headers:{'X-Medcom-Session-Scope':scope.sessionScope,'X-Medcom-Read-Scope':scope.readScope}});
  if(hold)await new Promise(resolve=>pending.push(resolve));return response;
 };
 function DetailCustody({selected,read,close}){const [page,setPage]=React.useState(1);detail={selected,read,close,page,setPage};return React.createElement('test-detail',{active:read.active},read.active?selected.documentId:null);}
 const render=()=>React.createElement(QueryClientProvider,{client},React.createElement(DocumentListViewProvider,{store},React.createElement(Documents,{...props,onDenied:error=>denials.push(error),renderDetail:(selected,close,read)=>React.createElement(DetailCustody,{key:read.documentId,selected,close,read})})));
 const settle=async(check)=>{for(let attempt=0;attempt<50;attempt++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});if(check())return;}assert.fail('document query did not settle');};
 const grid=()=>renderer.root.findByType('test-grid').props;
 await act(async()=>{renderer=create(render());});await settle(()=>grid().rows.length===1);
 return {get detail(){return detail;},get props(){return props;},calls,denials,grid,
  control:type=>renderer.root.findByType(type).props,
  update:async patch=>{props={...props,...patch};await act(async()=>renderer.update(render()));},
  select:async()=>{await act(async()=>grid().onOpen(grid().rows[0]));await act(async()=>detail.setPage(2));assert.equal(detail.read.documentId,documentRow.documentId);},
  hold:()=>{hold=true;},release:async()=>{hold=false;await act(async()=>pending.splice(0).forEach(resolve=>resolve()));},releaseAt:async index=>{await act(async()=>pending.splice(index,1).forEach(resolve=>resolve()));},
  status:value=>{status=value;},rows:value=>{rows=value;},settle,
  close:async()=>{await act(async()=>renderer.unmount());client.clear();pending.splice(0).forEach(resolve=>resolve());Object.assign(globalThis,saved);}
 };
}
test('actual Documents keeps mounted selection custody through null workspace but waits for fresh same-scope rows',async()=>{
 const f=await documentsHost();try{
  await f.select();const obsoleteOpen=f.grid().onOpen;
  await f.update({workspace:null,verified:false});
  assert.equal(f.detail.read.documentId,documentRow.documentId);assert.equal(f.detail.page,2);assert.equal(f.detail.selected,null);assert.equal(f.detail.read.active,false);assert.equal(f.detail.read.scope,null);assert.deepEqual(f.grid().rows,[]);
  await act(async()=>obsoleteOpen({...documentRow,documentId:'OBSOLETE-ROW'}));assert.equal(f.detail.read.documentId,documentRow.documentId);assert.equal(f.detail.read.active,false,'old row handler cannot restore authority');
  const before=f.calls.length;f.hold();await f.update({workspace:documentWorkspace(),verified:true,generation:2});
  assert.equal(f.calls.length,before+1);assert.equal(f.detail.read.documentId,documentRow.documentId);assert.equal(f.detail.page,2);assert.equal(f.detail.read.active,false);assert.deepEqual(f.grid().rows,[]);
  await f.release();await f.settle(()=>f.detail.read.active);
  assert.equal(f.detail.selected.documentId,documentRow.documentId);assert.equal(f.detail.page,2);
  await f.update({verified:false});assert.equal(f.detail.read.active,false);assert.equal(f.detail.page,2);
 }finally{await f.close();}
});
for(const boundary of ['session','read','search','branch','page','kind','401','403','removed'])test(`actual Documents retires selection on ${boundary} after temporary loss`,async()=>{
 const f=await documentsHost();try{
  await f.select();await f.update({workspace:null,verified:false});
  if(boundary==='session'||boundary==='read')await f.update({workspace:documentWorkspace({...scopeA,[boundary==='session'?'sessionScope':'readScope']:'c'.repeat(64)}),generation:2,verified:true});
  else if(boundary==='search'){await act(async()=>f.control('test-search').onChange('NEW'));await act(async()=>f.control('test-toolbar').onSubmit({preventDefault(){}}));}
  else if(boundary==='branch')await act(async()=>f.control('test-branch').onChange('BR-B'));
  else if(boundary==='page')await act(async()=>f.control('test-pagination').onNext());
  else if(boundary==='kind')await f.update({kind:'inbound-requests'});
  else {if(boundary==='removed')f.rows([]);else f.status(Number(boundary));await f.update({workspace:documentWorkspace(),generation:2,verified:true});await f.settle(()=>boundary==='removed'?f.grid().rows.length===0&&f.detail.read.documentId===null:f.denials.length>0);}
  assert.equal(f.detail.read.documentId,null);assert.equal(f.detail.read.active,false);assert.equal(f.detail.page,1);
  f.status(200);f.rows([documentRow]);await f.update({workspace:documentWorkspace(),generation:3,verified:true});await f.settle(()=>f.grid().rows.length===1);
  assert.equal(f.detail.read.documentId,null,'retired selection cannot reopen on recovery');
 }finally{await f.close();}
});

test('actual Documents ignores a canceled denial after newer recovery, then handles a new current denial',async()=>{
 const f=await documentsHost();try{
  await f.select();f.hold();f.status(403);await f.update({generation:2});
  const old=f.calls.at(-1);f.status(200);await f.update({generation:3});assert.equal(old.signal.aborted,true);
  await f.releaseAt(1);await f.settle(()=>f.detail.read.active);assert.equal(f.detail.read.documentId,documentRow.documentId);
  await f.releaseAt(0);await f.settle(()=>f.detail.read.active);assert.equal(f.denials.length,0,'late canceled denial does not reach Workspace');assert.equal(f.detail.page,2);
  f.status(403);await f.update({generation:4});await f.release();await f.settle(()=>f.denials.length===1);
  assert.equal(f.denials[0].status,403);assert.equal(f.detail.read.documentId,null);assert.equal(f.detail.read.active,false);
 }finally{await f.close();}
});

// Real Workspace, Documents, list store/hook, authentication gate, API and React
// Query. Visual leaves, navigation-guard UI and browser event surfaces are doubles;
// this verifies root denial transitions, not native focus/layout/browser behavior.
const denialLeafNames='Button Badge Sidebar SidebarProvider SidebarHeader SidebarContent SidebarGroup SidebarGroupLabel SidebarMenu SidebarMenuItem SidebarMenuButton SidebarFooter SidebarInset SidebarTrigger Dialog DialogContent DialogHeader DialogTitle DialogDescription Command CommandInput CommandList CommandEmpty CommandGroup CommandItem DropdownMenu DropdownMenuTrigger DropdownMenuContent DropdownMenuItem DropdownMenuLabel DropdownMenuSeparator Table TableHeader TableHead TableBody TableRow TableCell Switch Toaster InboundRequestScreen PurchaseRequestScreen ConfiguredDocumentSheet ReportWorkspace RoleNavigationEditor ScreenHeader RequestHelp RecordDialog RequestEmpty ListLoading Connectivity SessionWarning ErrorPanel WorkspaceLogin ErpGrid Freshness RequestListComposition RequestListPanel RequestListContent RequestListHeader RequestListToolbar RequestSearch RequestBranch RequestPagination RequestButton RequestError RequestLoading RequestStatus RequestDocumentIdentity'.split(' ');
const denialLeafSource=`import React from 'react';const leaf=name=>props=>React.createElement(name,props,props.children);${denialLeafNames.map(name=>`export const ${name}=leaf('${name}');`).join('')}export const toast={dismiss(){},error(){},success(){}};export const useSidebar=()=>({isMobile:false,setOpenMobile(){}});`;
await build({stdin:{contents:`export {default as Workspace} from './components/erp/workspace';`,resolveDir:process.cwd(),loader:'tsx'},outfile:'.test-runtime/i50/workspace-denial.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning',plugins:[{name:'denial-root-visual-leaves',setup(build){
 build.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'denial-css'}));
 build.onLoad({filter:/.*/,namespace:'denial-css'},()=>({contents:'export default {};',loader:'js'}));
 build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'denial-image'}));
 build.onLoad({filter:/.*/,namespace:'denial-image'},()=>({contents:`import React from 'react';export default props=>React.createElement('img',props);`,resolveDir:process.cwd(),loader:'js'}));
 build.onResolve({filter:/^sonner$|(?:^@\/components\/ui\/)|^(?:\.\/)(?:request-presentation|list-loading|screen-shell|request-help|record-dialog|inbound-request-screen|purchase-request-screen|configured-screen|reports|role-navigation-editor|feedback|grid|request-list-shell|workspace-login)$/},()=>({path:'leaves',namespace:'denial-leaves'}));
 build.onLoad({filter:/.*/,namespace:'denial-leaves'},()=>({contents:denialLeafSource,resolveDir:process.cwd(),loader:'js'}));
 build.onResolve({filter:/^\.\/navigation-guard$/},()=>({path:'guard',namespace:'denial-guard'}));
 build.onLoad({filter:/.*/,namespace:'denial-guard'},()=>({contents:`import React from 'react';const noop=()=>{},falseValue=()=>false,register=()=>noop,request=fn=>fn();const guard={request,isBlocked:falseValue,cancelPending:noop,hasPending:falseValue,onPendingCancelled:register};export const NavigationGuardProvider=props=>React.createElement('nav-provider',null,props.children);export const useNavigationGuard=()=>guard;`,resolveDir:process.cwd(),loader:'js'}));
}}]});
const {Workspace:DenialWorkspace}=require('../.test-runtime/i50/workspace-denial.cjs');
function denialEventBus(){const listeners=new Map();return{addEventListener(type,fn){const items=listeners.get(type)??[];items.push(fn);listeners.set(type,items);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)??[]).filter(item=>item!==fn));},emit(type){for(const fn of [...listeners.get(type)??[]])fn({});}};}
async function rootDenialHost(){
 const names=['HTMLElement','window','location','history','localStorage','document','requestAnimationFrame','cancelAnimationFrame','fetch'];
 const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const location=new URL('https://synthetic.test/?screen=purchase-orders');
 Object.assign(globalThis,{HTMLElement:class {},window:{...denialEventBus(),location,scrollY:0,scrollTo(){}},location,history:{state:null,scrollRestoration:'auto',replaceState(state){this.state=state;},pushState(){},go(){}},localStorage:{getItem(){return null;},setItem(){}},document:{...denialEventBus(),visibilityState:'visible',activeElement:null,documentElement:{classList:{toggle(){}},dataset:{}}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 let renderer,failure=null,holdList=false;const workspaceWaiters=[],listWaiters=[],calls=[];
 const workspace={session:{displayName:'SYNTHETIC',tenantId:'T',companyId:'C',companyName:'Synthetic',authorityVersion:1,idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString(),capabilities:['purchase-orders.read']},branchIds:['BR-A'],navigation:[{id:'purchase-orders',label:'Orders',href:'/?screen=purchase-orders'}]};
 globalThis.fetch=async(url,init)=>{
  const route=String(url);calls.push(route);
  if(route.includes('health'))return Response.json({status:'not_ready',checks:[]},{status:503});
  if(route.endsWith('/workspace')){if(workspaceWaiters.length>8)throw Error('excessive denial rechecks');if(failure)await new Promise(resolve=>workspaceWaiters.push(resolve));return Response.json(workspace,{headers:{'X-Medcom-Session-Scope':'a'.repeat(64),'X-Medcom-Read-Scope':'b'.repeat(64)}});}
  const page=Number(new URL(route,'https://synthetic.test').searchParams.get('page'));
  const response=Response.json(failure===403?{code:'synthetic_failure'}:{rows:[{documentId:'SYNTHETIC-DOC',documentDate:'2026-10-06',branchId:'BR-A',statusId:1,isLocked:false}],page,pageSize:50,hasMore:true},{status:failure===403?403:200,headers:{'X-Medcom-Session-Scope':(failure==='scope'?'f':'a').repeat(64),'X-Medcom-Read-Scope':'b'.repeat(64)}});
  // Deliberately deliver even after cancellation, like the native late-reply case.
  if(holdList)await new Promise(resolve=>listWaiters.push({resolve,signal:init.signal}));return response;
 };
 const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 const settle=async check=>{for(let attempt=0;attempt<50;attempt++){await tick();if(check())return;}assert.fail('workspace denial transition did not settle');};
 const control=type=>renderer.root.findByType(type).props;
 const recheckCount=()=>calls.filter(route=>route.endsWith('/workspace')).length;
 const refresh=()=>act(async()=>{renderer.root.findAllByType('RequestButton').find(node=>node.props.children?.some?.(child=>child==='Làm mới')).props.onClick();});
 const search=value=>act(async()=>control('RequestSearch').onChange(value));
 await act(async()=>{renderer=create(React.createElement(DenialWorkspace));});await settle(()=>control('ErpGrid').rows.length===1);
 return {control,recheckCount,refresh,search,tick,settle,listWaiters,
  failure:value=>{failure=value;},holdList:value=>{holdList=value;},
  apply:()=>act(async()=>control('RequestListToolbar').onSubmit({preventDefault(){}})),
  visibility:value=>act(async()=>{document.visibilityState=value;document.emit('visibilitychange');}),
  releaseList:()=>act(async()=>listWaiters.splice(0).forEach(item=>item.resolve())),
  recover:async()=>{failure=null;await act(async()=>workspaceWaiters.splice(0).forEach(resolve=>resolve()));await act(async()=>window.emit('focus'));await settle(()=>control('ErpGrid').rows.length===1);},
  close:async()=>{failure=null;holdList=false;await act(async()=>renderer.unmount());workspaceWaiters.splice(0).forEach(resolve=>resolve());listWaiters.splice(0).forEach(item=>item.resolve());for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 };
}
for(const failure of [403,'scope'])for(const retained of [false,true])test(`actual Workspace ${failure} denial retires ${retained?'retained':'default'} controls once, fences stale replies and handles a later current denial`,async()=>{
 const f=await rootDenialHost();try{
  if(retained){await f.search('APPLIED');await f.apply();await f.settle(()=>f.control('ErpGrid').rows.length===1);await f.search('UNSUBMITTED DRAFT');}
  const before=f.recheckCount();f.failure(failure);await f.refresh();await f.settle(()=>f.recheckCount()>before);
  assert.equal(f.recheckCount(),before+1);assert.equal(f.control('RequestSearch').value,'');assert.equal(f.control('RequestPagination').page,1);assert.deepEqual(f.control('ErpGrid').rows,[]);
  // Default controls reuse the same failed cache key after the first remount.
  // Its repeated effect must not retire/remount/recheck again while suspended.
  for(let i=0;i<3;i++)await f.tick();assert.equal(f.recheckCount(),before+1);assert.equal(f.control('RequestSearch').value,'');
  await f.recover();assert.equal(f.control('RequestSearch').value,'');
  await f.search('NEW AFTER RECOVERY');
  f.failure(failure);f.holdList(true);await f.refresh();await f.settle(()=>f.listWaiters.length===1);
  await f.visibility('hidden');f.failure(null);f.holdList(false);await f.visibility('visible');await f.settle(()=>f.control('ErpGrid').rows.length===1);
  assert.equal(f.listWaiters[0].signal.aborted,true);const recovered=f.recheckCount();
  await f.releaseList();for(let i=0;i<3;i++)await f.tick();
  assert.equal(f.recheckCount(),recovered);assert.equal(f.control('RequestSearch').value,'NEW AFTER RECOVERY');assert.equal(f.control('ErpGrid').rows.length,1);
  f.failure(failure);await f.refresh();await f.settle(()=>f.recheckCount()>recovered);
  assert.equal(f.recheckCount(),recovered+1);assert.equal(f.control('RequestSearch').value,'');assert.deepEqual(f.control('ErpGrid').rows,[]);
 }finally{await f.close();}
});
