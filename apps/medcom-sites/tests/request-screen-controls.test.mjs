import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
const output=path.join(app,'.test-runtime','request-screen-controls');await mkdir(output,{recursive:true});
// All screen, guard, editor, scanner, reference, API and adapter code is real.
// Only DOM presentation primitives are replaced. The register observer records
// calls from the real provider; it makes no admission/discard/state decisions.
const guardRegistration='if(value)blockers.current.set(key,value);else blockers.current.delete(key);';
const guardObservation='globalThis.__screenGuardObserve?.(key,value);';
function observeGuardRegistration(source){
 assert.equal(source.split(guardRegistration).length-1,1,'real guard must contain exactly one registration insertion point');
 assert.equal(source.split(guardObservation).length-1,0,'real guard must not already contain the test observer');
 return source.replace(guardRegistration,guardObservation+guardRegistration);
}
function navigationGuardObserver(resolveSourcePath=sourcePath=>sourcePath){
 let observedLoads=0;
 return{name:'actual-navigation-guard-observer',setup(builder){
  // esbuild supplies native absolute paths to onLoad, including Windows backslashes.
  builder.onLoad({filter:/[\\/]navigation-guard\.tsx$/},async args=>{
   assert.equal(++observedLoads,1,'real guard must be loaded exactly once for observation');
   const sourcePath=resolveSourcePath(args.path);
   return{contents:observeGuardRegistration(await readFile(sourcePath,'utf8')),loader:'tsx',resolveDir:path.dirname(sourcePath)};
  });
  builder.onEnd(result=>{if(!result.errors.length)assert.equal(observedLoads,1,'real guard must be loaded exactly once for observation');});
 }};
}
const primitive={button:'Button',input:'Input',textarea:'Textarea',badge:'Badge',skeleton:'Skeleton',checkbox:'Checkbox'};
await build({stdin:{contents:`export {PurchaseRequestScreen} from './components/erp/purchase-request-screen';export {InboundRequestScreen} from './components/erp/inbound-request-screen';export {MobileRequest} from './components/erp/mobile-request';export {MobileInboundRequest} from './components/erp/mobile-inbound-request';export {RequestQrSearch} from './components/erp/request-qr-search';export {QrScanner} from './components/erp/qr-scanner';export {PurchaseReferenceDetails} from './components/erp/purchase-reference-details';export {NavigationGuardProvider,useNavigationGuard} from './components/erp/navigation-guard';export {getDocuments} from './lib/erp/api';export {ListViewProvider} from './components/erp/list-view-state';export {createListViewStore} from './lib/erp/list-view-state';export {Documents} from './components/erp/documents';export {QueryClient,QueryClientProvider} from '@tanstack/react-query';`,resolveDir:app,loader:'tsx'},outfile:path.join(output,'fixture.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',alias:{'@':app},logLevel:'warning',plugins:[navigationGuardObserver(),{name:'DOM-primitives',setup(builder){
 builder.onResolve({filter:/components\/ui\/(button|input|textarea|badge|skeleton|checkbox|empty|table|dialog|alert-dialog)$/},args=>({path:args.path.split('/').at(-1),namespace:'dom'}));
 builder.onLoad({filter:/.*/,namespace:'dom'},args=>{
  let code;
  if(primitive[args.path]){const tag={button:'button',input:'input',textarea:'textarea',checkbox:'input'}[args.path]??'div';code=`export const ${primitive[args.path]}=({variant,...props})=><${tag} {...props}/>;`;}
  else if(args.path==='empty')code=['Empty','EmptyHeader','EmptyTitle','EmptyDescription'].map(name=>`export const ${name}=props=><div {...props}/>;`).join('');
  else if(args.path==='table')code=Object.entries({Table:'table',TableHeader:'thead',TableHead:'th',TableBody:'tbody',TableRow:'tr',TableCell:'td'}).map(([name,tag])=>`export const ${name}=props=><${tag} {...props}/>;`).join('');
  else if(args.path==='dialog')code=`const C=React.createContext(false);export function Dialog({open,children}){return <C.Provider value={open}>{children}</C.Provider>};export function DialogContent({children}){return React.useContext(C)?<section role="dialog" data-scanner-dialog>{children}</section>:null};export const DialogHeader=({children})=><div>{children}</div>;export const DialogTitle=({children})=><h2>{children}</h2>;export const DialogDescription=({children})=><p>{children}</p>;`;
  else code=`const C=React.createContext(null);export function AlertDialog({open,onOpenChange,children}){return <C.Provider value={{open,onOpenChange}}>{children}</C.Provider>};export function AlertDialogContent({children}){return React.useContext(C).open?<section role="alertdialog">{children}</section>:null};export const AlertDialogHeader=({children})=><div>{children}</div>;export const AlertDialogTitle=({children})=><h2>{children}</h2>;export const AlertDialogDescription=({children})=><p>{children}</p>;export const AlertDialogFooter=({children})=><div>{children}</div>;export function AlertDialogCancel({children}){const c=React.useContext(C);return <button type="button" onClick={()=>c.onOpenChange(false)}>{children}</button>};export const AlertDialogAction=props=><button type="button" {...props}/>;`;
  return{contents:`import React from 'react';${code}`,loader:'tsx',resolveDir:app};
 });
}}]});
test('guard observer inserts once into the actual provider and rejects missing, duplicate or already observed source',async()=>{
 const source=await readFile(path.join(app,'components/erp/navigation-guard.tsx'),'utf8'),observed=observeGuardRegistration(source);
 assert.equal(observed.split(guardObservation).length-1,1);
 assert.equal(observed.replace(guardObservation,''),source,'observation preserves all actual provider logic');
 assert.throws(()=>observeGuardRegistration(source.replace(guardRegistration,'')),/exactly one registration insertion point/);
 assert.throws(()=>observeGuardRegistration(source+'\n'+guardRegistration),/exactly one registration insertion point/);
 assert.throws(()=>observeGuardRegistration(observed),/must not already contain the test observer/);
});
const guardPathCases=[['POSIX','/workspace/components/erp/navigation-guard.tsx'],['Windows',String.raw`D:\a\Medcom\Medcom\apps\medcom-sites\components\erp\navigation-guard.tsx`]];
function buildGuardPathFixture(virtualPaths){
 const observedPaths=[];
 const result=build({stdin:{contents:virtualPaths.length?virtualPaths.map((_,index)=>`export * from 'actual-guard-${index}';`).join(''):'export const noGuard=true;',resolveDir:app},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',alias:{'@':app},logLevel:'silent',plugins:[{name:'actual-guard-path-regression',setup(builder){
  builder.onResolve({filter:/^actual-guard-\d+$/},args=>({path:virtualPaths[Number(args.path.split('-').at(-1))],namespace:'actual-guard-path-regression'}));
 }},navigationGuardObserver(sourcePath=>{
  assert.ok(virtualPaths.includes(sourcePath));observedPaths.push(sourcePath);
  // Only the path spelling is simulated. Always compile the real provider file.
  return path.join(app,'components/erp/navigation-guard.tsx');
 })]});
 return{result,observedPaths};
}
for(const [platform,sourcePath] of guardPathCases)test(`guard observer instruments the actual provider exactly once through esbuild ${platform} path dispatch`,async()=>{
 const {result,observedPaths}=buildGuardPathFixture([sourcePath]),built=await result;
 assert.deepEqual(observedPaths,[sourcePath]);
 assert.equal(built.outputFiles[0].text.split('__screenGuardObserve').length-1,1);
});
test('guard observer rejects a build that never loads the provider',async()=>{
 await assert.rejects(buildGuardPathFixture([]).result,/real guard must be loaded exactly once for observation/);
});
test('guard observer rejects a build that loads two provider copies',async()=>{
 await assert.rejects(buildGuardPathFixture(guardPathCases.map(([,sourcePath])=>sourcePath)).result,/real guard must be loaded exactly once for observation/);
});
const {PurchaseRequestScreen,InboundRequestScreen,MobileRequest,MobileInboundRequest,RequestQrSearch,QrScanner,PurchaseReferenceDetails,NavigationGuardProvider,useNavigationGuard,getDocuments,ListViewProvider,createListViewStore,Documents,QueryClient,QueryClientProvider}=require(path.join(output,'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const scope='a'.repeat(64),sessionScope='b'.repeat(64),readScope='c'.repeat(64);
const workspace=()=>({session:{displayName:'SYNTHETIC',tenantId:'T',companyId:'C',companyName:'SYNTHETIC',authorityVersion:1,absoluteExpiresAt:'2099-01-01T00:00:00Z',capabilities:['purchase-requests.read','inbound-requests.read']},branchIds:['BR-A'],sessionScope,readScope,navigation:[]});
const purchase=id=>({purchaseRequestId:id,branchId:'BR-A',statusId:1,isLocked:false,header:{purchaseDate:'2026-10-01T12:00:00.000',purposeId:7,personSuggest:'SYNTHETIC PERSON',department:'SYNTHETIC DEPARTMENT',purposeDescOrClient:null,price:'10.125',notes:'ORIGINAL',currencyId:'USD',objectId:'OBJ',rateExchange:9.125},lines:[{lineId:'LINE-1',values:{itemId:'ITEM',budget:null,timeRequired:null,quantity:'2',unitPrice:'3',totalPrice:'6',model:null}}]});
const inbound=id=>({documentId:id,statusId:0,stateEqualityToken:'A'.repeat(64),costRowCount:0,costEditingSupported:false,header:{documentDate:'2026-10-01T12:00:00.000',orderNumber:'SYNTHETIC',invoiceNo:'',departurePoint:'FROM',destinationPoint:'TO',orderTypeId:'TYPE',branchId:'BR-A',objectId:null,currencyId:'USD',rateExchange:'9.1250000000',notes:'ORIGINAL'},details:[{rowId:'ROW-1',clientLineId:null,itemId:'ITEM',lotNumberByDocument:'',setQuantityByDocument:'2',barrelQuantityByDocument:'0',expireDateByDocument:null,unitPrice:'3'}]});
const response=(data,status=200,extra={})=>Response.json(data,{status,headers:{'cache-control':'no-store','X-Medcom-Session-Scope':sessionScope,'X-Medcom-Read-Scope':readScope,...extra}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>typeof node==='string'?node:node?.children?.map(text).join('')??'';
const audit=[];
async function host(kind,options={}){
 const saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,observe:globalThis.__screenGuardObserve};
 const events=new EventTarget(),registrations=[],calls=[],denied=[],held=[];
 const doc={hidden:false,querySelector:()=>null,querySelectorAll:()=>[],body:{},activeElement:null,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 globalThis.document=doc;globalThis.window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
 globalThis.__screenGuardObserve=(key,value)=>registrations.push({key,value});
 const model={ids:['DOC-A','DOC-B'],lookupStatus:null,lookupHold:false,writeHold:false,writeMode:'unknown',readbackFailure:false,...options};
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url,'https://synthetic.invalid'),p=u.pathname,q=Object.fromEntries(u.searchParams),call={path:p,q,method:init.method??'GET',body:init.body,signal:init.signal};calls.push(call);
  if(p.endsWith('/auth/csrf'))return response({token:'synthetic-csrf'});
  if(p.endsWith('/purchase-requests/workspace'))return response({scopeKey:scope,data:{branchIds:['BR-A'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
  if(p.endsWith('/purchase-requests'))return response({scopeKey:scope,data:{rows:model.ids.map(id=>{const d=purchase(id);return{documentId:id,purchaseDate:d.header.purchaseDate,branchId:d.branchId,personSuggest:d.header.personSuggest,department:d.header.department,statusId:d.statusId,isLocked:d.isLocked};}),page:+q.page,pageSize:20,hasMore:false}});
  if(p.endsWith('/purchase-requests/detail'))return response({scopeKey:scope,data:{document:purchase(q.documentId),stateToken:'prs1.'+'d'.repeat(64),commandAccess:{canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'synthetic'}}});
  if(p.endsWith('/purchase-requests/lookup')){
   const status=model.lookupStatusByKind?.[q.kind]??model.lookupStatus;
   if(model.lookupHold)await new Promise(resolve=>held.push({kind:'lookup',resolve,call}));
   if(status)return response({code:'private-source-diagnostic'},status);
   return response({scopeKey:scope,data:{available:true,reason:null,items:q.kind==='purposes'?[{id:'7',label:null}]:[{id:'USD',label:'USD',currencyName:'SYNTHETIC CURRENCY',rateExchange:-2.5}],page:+q.page,hasMore:false}});
  }
  if(p.endsWith('/documents/inbound-requests'))return response({rows:model.ids.map(documentId=>({documentId,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false})),page:+q.page,pageSize:50,hasMore:false});
  if(p.endsWith('/inbound-requests/draft')){
   if(model.readbackFailure)return response({},503);
   return response({scopeKey:scope,access:{canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576},data:{outcome:'Observed',document:inbound(q.documentId)}});
  }
  if(init.method==='POST'){
   if(model.writeHold)await new Promise(resolve=>held.push({kind:'write',resolve,call}));
   if(kind==='purchase')return response({scopeKey:scope,data:{outcome:4,receipt:null}});
   if(model.writeMode==='receipt'){
    const command=JSON.parse(init.body);model.readbackFailure=true;
    return response({scopeKey:scope,data:{outcome:'Committed',receipt:{operationId:command.operationId,documentId:command.documentId,statusId:0,stateEqualityToken:'D'.repeat(64),auditId:'22222222-2222-4222-8222-222222222222',committedAtUtc:'2026-10-07T00:00:00Z'},code:null}});
   }
   return response({scopeKey:scope,data:{outcome:'OutcomeUnknown',receipt:null,code:null}});
  }
  assert.fail('Unexpected synthetic transport '+p);
 };
 let renderer,navigation,guard;
 const register=value=>{navigation=value;};
 let props={workspace:workspace(),presentationAllowed:true,registerDetailNavigation:register,onDenied:error=>denied.push(error),...(kind==='purchase'?{loginBoundary:1,sessionEnded:false,onLogin(){},onVerifyWorkspace:async()=>{}}:{loginKey:'login-1',historyOwner:'workspace',list:(...args)=>getDocuments('inbound-requests',...args)})};
 function Probe(){guard=useNavigationGuard();return null;}
 const screenTree=()=>React.createElement(NavigationGuardProvider,{authority:{lifecycleKey:'login-1',presentationAllowed:props.presentationAllowed}},React.createElement(Probe),React.createElement(kind==='purchase'?PurchaseRequestScreen:InboundRequestScreen,props));
 const tree=()=>options.store?React.createElement(ListViewProvider,{store:options.store},screenTree()):screenTree();
 const flush=async()=>{for(let i=0;i<5;i++)await act(async()=>{await tick();});};
 const render=async patch=>{props={...props,...patch};await act(async()=>{if(renderer)renderer.update(tree());else renderer=create(tree());});await flush();};
 const buttons=()=>renderer.root.findAllByType('button');
 const button=label=>buttons().find(b=>text(b)===label||b.props['aria-label']===label);
 const click=async label=>{const b=button(label);assert.ok(b,'button '+label);assert.ok(!b.props.disabled,'enabled '+label);await act(async()=>b.props.onClick?.({preventDefault(){}}));await flush();};
 const open=async id=>{await act(async()=>navigation.requestOpen(id));await flush();};
 const field=()=>renderer.root.findAll(node=>(node.type==='textarea'||node.type==='input')&&node.props.name===(kind==='purchase'?'notes':'inbound-header-notes'))[0];
 const edit=async value=>{assert.ok(field(),'real editor field');await act(async()=>field().props.onChange({target:{value}}));await flush();};
 const editor=()=>renderer.root.findByType(kind==='purchase'?MobileRequest:MobileInboundRequest);
 const refreshRows=()=>render(kind==='purchase'?{workspace:structuredClone(props.workspace)}:{list:(...args)=>getDocuments('inbound-requests',...args)});
 const submit=async()=>{const form=kind==='purchase'?renderer.root.findByProps({'aria-label':'Đề nghị mua hàng trên điện thoại'}):renderer.root.findByProps({'data-testid':'inbound-editor'}).findByType('form');await act(async()=>form.props.onSubmit({preventDefault(){}}));await flush();};
 const close=async()=>{await act(async()=>renderer?.unmount());await flush();audit.push({kind,calls:calls.map(({path,q,method})=>({path,q,method})),denied:denied.map(e=>e.status)});globalThis.fetch=saved.fetch;globalThis.window=saved.window;globalThis.document=saved.document;globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.caf;globalThis.__screenGuardObserve=saved.observe;await writeFile(path.join(output,'call-count.json'),JSON.stringify(audit,null,2));};
 await render({});return{model,calls,denied,held,registrations,root:()=>renderer.root,props:()=>props,nav:()=>navigation,guard:()=>guard,button,click,open,edit,field,editor,refreshRows,submit,render,flush,close};
}
for(const kind of ['purchase','inbound']){
 test(`${kind}: actual provider rejects removed target before discard, preserves exact dirty registration, and manual revert clears it`,async()=>{
  const f=await host(kind);try{
   await f.open('DOC-A');await f.edit('UNSAVED ORIGINAL');const editor=f.editor(),adapter=editor.props.adapter;
   const dirty=f.registrations.findLast(r=>r.value?.canDiscard);assert.ok(dirty);assert.equal(f.guard().isBlocked(),true);
   await f.open('DOC-B');assert.ok(f.root().findByProps({role:'alertdialog'}));
   f.model.ids=['DOC-A'];await f.refreshRows();const count=f.calls.length,registrationCount=f.registrations.length;
   await f.click('Bỏ thay đổi và rời màn hình');assert.equal(f.nav().selectedId,'DOC-A');assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.field().props.value,'UNSAVED ORIGINAL');assert.equal(f.calls.length,count);
   assert.equal(f.guard().isBlocked(),true);assert.equal(f.registrations.length,registrationCount,'rejection must not unregister/recreate any blocker');
   assert.strictEqual(f.registrations.findLast(r=>r.key===dirty.key).value,dirty.value,'original real editor blocker survives');
   assert.equal(f.root().findAllByProps({role:'alertdialog'}).length,0);
   await act(async()=>f.nav().requestClose());await f.flush();assert.ok(f.root().findByProps({role:'alertdialog'}));await f.click('Tiếp tục làm việc');assert.equal(f.nav().selectedId,'DOC-A');
   await f.edit('ORIGINAL');assert.equal(f.guard().isBlocked(),false,'true manual revert removes the original dirty guard without synthetic residue');
   await act(async()=>f.nav().requestClose());await f.flush();assert.equal(f.nav().selectedId,null);assert.equal(f.root().findAllByProps({role:'alertdialog'}).length,0);assert.ok(f.calls.every(c=>c.method==='GET'));
  }finally{await f.close();}
 });
 for(const change of ['scope','presentation','workspace-null','permission'])test(`${kind}: actual queued guard rejects current ${change} loss without selecting its old target`,async()=>{
  const f=await host(kind);try{
   await f.open('DOC-A');await f.edit('CURRENT AUTHORITY REQUIRED');const editor=f.editor(),adapter=editor.props.adapter;
   await f.open('DOC-B');const accept=f.button('Bỏ thay đổi và rời màn hình').props.onClick;
   if(change==='scope')await f.render({workspace:{...f.props().workspace,readScope:'e'.repeat(64)}});
   if(change==='presentation')await f.render({presentationAllowed:false});
   if(change==='workspace-null')await f.render({workspace:null});
   if(change==='permission')await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,capabilities:[]}}});
   const count=f.calls.length;await act(async()=>accept({preventDefault(){}}));await f.flush();
   assert.equal(f.nav().selectedId,'DOC-A');assert.equal(f.nav().getSelectedId(),'DOC-A');assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.calls.length,count);assert.equal(f.guard().isBlocked(),true);assert.ok(f.calls.every(c=>c.method==='GET'));
  }finally{await f.close();}
 });
 test(`${kind}: immediate refusal and synchronous accepted selection are distinct from committed history evidence`,async()=>{
  const f=await host(kind);try{
   await act(async()=>{f.nav().requestOpen('NOT-A-ROW');assert.equal(f.nav().getSelectedId(),null);});
   await act(async()=>{const before=f.nav();before.requestOpen('DOC-A');assert.equal(before.getSelectedId(),'DOC-A');assert.equal(before.selectedId,null,'registration remains committed evidence');});await f.flush();assert.equal(f.nav().selectedId,'DOC-A');
   await f.edit('PRESERVE CANCELLATION');await f.open('DOC-B');assert.equal(f.nav().getSelectedId(),'DOC-A');await f.click('Tiếp tục làm việc');assert.equal(f.nav().selectedId,'DOC-A');
   await f.open('DOC-B');await f.click('Bỏ thay đổi và rời màn hình');assert.equal(f.nav().selectedId,'DOC-B');assert.equal(f.nav().getSelectedId(),'DOC-B');assert.equal(f.guard().isBlocked(),false);
  }finally{await f.close();}
 });
 test(`${kind}: accepted batched A→B→A rotates detail identity without confusing same-document no-op`,async()=>{
  const f=await host(kind);try{
   await f.open('DOC-A');const before=f.calls.length;
   await act(async()=>{const navigation=f.nav();navigation.requestOpen('DOC-B');assert.equal(navigation.getSelectedId(),'DOC-B');navigation.requestOpen('DOC-A');assert.equal(navigation.getSelectedId(),'DOC-A');});await f.flush();
   assert.equal(f.nav().selectedId,'DOC-A');assert.ok(f.calls.length>before,'new selection incarnation receives a fresh read');await f.edit('NO-OP KEEPS DIRTY');const count=f.calls.length;await f.open('DOC-A');assert.equal(f.calls.length,count);assert.equal(f.guard().isBlocked(),true);assert.equal(f.root().findAllByProps({role:'alertdialog'}).length,0);
  }finally{await f.close();}
 });
 test(`${kind}: request lists have no QR search entry and typing remains draft until explicitly applied`,async()=>{
  const f=await host(kind);try{
   const search=()=>f.root().findAllByType('input').find(n=>n.props['aria-label']===(kind==='purchase'?'Tìm mã đề nghị':'Tìm phiếu nhập hàng'));
   const before=f.calls.length;
   assert.equal(f.root().findAllByType(RequestQrSearch).length,0);assert.equal(f.root().findAllByType(QrScanner).length,0);
   await act(async()=>search().props.onChange({target:{value:'QA-DRAFT'}}));await f.flush();
   assert.equal(search().props.value,'QA-DRAFT');assert.equal(f.nav().selectedId,null);assert.equal(f.calls.length,before,'typing is not Search or transport');
   await f.render({presentationAllowed:false});await f.render({presentationAllowed:true});assert.equal(search().props.value,'QA-DRAFT');
   await f.render(kind==='purchase'?{loginBoundary:2}:{loginKey:'login-2'});await f.flush();assert.equal(search().props.value,'');
   assert.equal(f.root().findAllByType(QrScanner).length,0);assert.ok(f.calls.every(c=>c.method==='GET'));
  }finally{await f.close();}
 });
 test(`${kind}: accept-phase validator observes newly dispatched custody before the dirty registration's layout update`,async()=>{
  const f=await host(kind,{writeHold:true});try{
   await f.open('DOC-A');await f.edit('SYNCHRONOUS CUSTODY');await f.open('DOC-B');await f.submit();
   const accept=f.button('Bỏ thay đổi và rời màn hình').props.onClick,save=f.button(kind==='purchase'?'Lưu nháp trên ERP':'Lưu thay đổi').props.onClick;
   const dirty=f.registrations.findLast(r=>r.value?.canDiscard);assert.ok(dirty);
   await act(async()=>{
    save();assert.strictEqual(f.registrations.findLast(r=>r.key===dirty.key).value,dirty.value,'dispatch precedes editor layout guard propagation');
    const count=f.registrations.length;accept({preventDefault(){}});
    assert.equal(f.nav().getSelectedId(),'DOC-A');assert.equal(f.guard().isBlocked(),true);assert.equal(f.registrations.length,count,'provider did not clear/rebuild original dirty registration');
   });await f.flush();assert.equal(f.nav().selectedId,'DOC-A');assert.equal(f.held.filter(h=>h.kind==='write').length,1);
   await act(async()=>f.nav().requestClose());await f.flush();assert.ok(f.root().findByProps({role:'alertdialog'}),'current pending Close shows its nondiscardable warning');assert.equal(f.button('Bỏ thay đổi và rời màn hình'),undefined);
   f.model.writeHold=false;await act(async()=>f.held.find(h=>h.kind==='write').resolve());await f.flush();assert.equal(f.nav().selectedId,'DOC-A');
  }finally{await f.close();}
 });
 test(`${kind}: queued discard cannot retire a command that becomes pending/unknown; reconciliation preserves frozen original body`,async()=>{
  const f=await host(kind,{writeHold:true});try{
   await f.open('DOC-A');await f.edit('FROZEN ORIGINAL');await f.open('DOC-B');const accepted=f.button('Bỏ thay đổi và rời màn hình').props.onClick;
   await f.submit();await f.click(kind==='purchase'?'Lưu nháp trên ERP':'Lưu thay đổi');assert.equal(f.held.filter(h=>h.kind==='write').length,1);
   const original=f.calls.find(c=>c.method==='POST').body;assert.match(original,/FROZEN ORIGINAL/);
   await act(async()=>accepted({preventDefault(){}}));await f.flush();assert.equal(f.nav().selectedId,'DOC-A');assert.equal(f.guard().isBlocked(),true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
   f.model.writeHold=false;await act(async()=>f.held.find(h=>h.kind==='write').resolve());await f.flush();await f.open('DOC-B');assert.equal(f.nav().selectedId,'DOC-A');assert.ok(f.root().findByProps({role:'alertdialog'}),'unknown custody still explains why navigation is blocked');assert.equal(f.button('Bỏ thay đổi và rời màn hình'),undefined);
   await f.click(kind==='purchase'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc');const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,2);assert.equal(writes[1].body,original);assert.equal(f.nav().selectedId,'DOC-A');assert.equal(f.guard().isBlocked(),true);
  }finally{await f.close();}
 });
}

test('purchase: readonly reference uses exact raw IDs/rate; loading and lookup errors never erase or block document/dirty state',async()=>{
 const f=await host('purchase',{lookupHold:true,lookupStatus:503});try{
  await f.open('DOC-A');const ref=f.root().findByType(PurchaseReferenceDetails);assert.equal(ref.props.purposeId,7);assert.equal(ref.props.currencyId,'USD');assert.equal(ref.props.documentRateExchange,9.125);assert.equal(ref.props.allowed,true);assert.ok(f.root().findByProps({'aria-label':'Dữ liệu ERP đầy đủ'}));
  assert.equal(f.held.filter(h=>h.kind==='lookup').length,2);await f.edit('KEPT DURING LOOKUP');const editor=f.editor(),adapter=editor.props.adapter;
  await act(async()=>f.held.forEach(h=>h.resolve()));await f.flush();assert.equal(f.nav().selectedId,'DOC-A');assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.field().props.value,'KEPT DURING LOOKUP');assert.equal(f.denied.length,0);assert.equal(f.guard().isBlocked(),true);assert.match(text(f.root()),/Thông tin chứng từ vẫn độc lập/);assert.doesNotMatch(text(f.root()),/private-source-diagnostic/);
  f.model.lookupHold=false;f.model.lookupStatus=null;await f.click('Thử lại tham chiếu mục đích');await f.click('Thử lại tham chiếu tiền tệ');assert.match(text(f.root()),/Nguồn ERP không có tên \(NULL\)/);assert.match(text(f.root()),/-2.5/);assert.match(text(f.root()),/9.125/);assert.equal(f.field().props.value,'KEPT DURING LOOKUP');assert.ok(f.calls.every(c=>c.method==='GET'));
  const reference=f.root().findByType(PurchaseReferenceDetails);assert.equal(reference.findAllByType('input').length,0);assert.equal(reference.findAllByType('select').length,0);
 }finally{await f.close();}
});
test('purchase: only current reference authority failures reach root, once across re-verification and never from retired lookup',async()=>{
 const f=await host('purchase',{lookupStatus:403});try{
  await f.open('DOC-A');assert.deepEqual(f.denied.map(e=>e.status),[403]);assert.equal(f.nav().selectedId,'DOC-A');assert.ok(f.root().findByProps({'aria-label':'Dữ liệu ERP đầy đủ'}));
  await f.refreshRows();assert.deepEqual(f.denied.map(e=>e.status),[403],'same authority re-read cannot loop onDenied');
  f.model.lookupStatus=401;f.model.lookupHold=true;await f.refreshRows();const late=f.held.filter(h=>h.kind==='lookup');assert.ok(late.length);
  await f.render({presentationAllowed:false});await act(async()=>late.forEach(h=>h.resolve()));await f.flush();assert.deepEqual(f.denied.map(e=>e.status),[403]);assert.ok(late.every(h=>h.call.signal.aborted));
  f.model.lookupHold=false;f.model.lookupStatus=409;await f.render({presentationAllowed:true});assert.deepEqual(f.denied.map(e=>e.status),[403,409]);assert.equal(f.denied.at(-1).code,'read_scope_changed');
 }finally{await f.close();}
});
test('inbound: confirmed receipt with failed matching readback keeps actual root navigation blocked',async()=>{
 const f=await host('inbound',{writeMode:'receipt'});try{
  await f.open('DOC-A');await f.edit('RECEIPT ORIGINAL');await f.submit();await f.click('Lưu thay đổi');assert.equal(f.root().findByProps({'data-testid':'inbound-request-host'}).props['data-readback-pending'],true);
  const before=f.calls.filter(c=>c.method==='POST').length;await f.open('DOC-B');await act(async()=>f.nav().requestClose());await f.flush();assert.equal(f.nav().selectedId,'DOC-A');assert.equal(f.guard().isBlocked(),true);assert.equal(f.calls.filter(c=>c.method==='POST').length,before);assert.equal(f.button('Bỏ thay đổi và rời màn hình'),undefined);assert.ok(f.root().findByProps({role:'alertdialog'}),'matching-readback custody still presents its warning');
 }finally{await f.close();}
});

test('purchase: a later authentication failure is not shadowed by an already reported catalog authority failure',async()=>{
 const f=await host('purchase',{lookupStatusByKind:{purposes:403,currencies:401},lookupHold:true});try{
  await f.open('DOC-A');const purpose=f.held.find(h=>h.call.q.kind==='purposes'),currency=f.held.find(h=>h.call.q.kind==='currencies');
  await act(async()=>purpose.resolve());await f.flush();assert.deepEqual(f.denied.map(e=>e.status),[403]);
  await act(async()=>currency.resolve());await f.flush();assert.deepEqual(f.denied.map(e=>e.status),[403,401]);assert.equal(f.nav().selectedId,'DOC-A');
 }finally{await f.close();}
});

test('purchase: verification retains dirty edits without a QR search entry or implicit transport',async()=>{
 const f=await host('purchase');try{
  await f.open('DOC-A');await f.edit('CUSTODY MUST NOT DISCARD');
  const count=f.calls.length;await f.render({verifying:true});assert.equal(f.root().findAllByType(RequestQrSearch).length,0);assert.equal(f.root().findAllByType(QrScanner).length,0);
  await f.flush();assert.equal(f.calls.length,count);assert.equal(f.field().props.value,'CUSTODY MUST NOT DISCARD');assert.equal(f.guard().isBlocked(),true);
  await f.render({verifying:false});assert.equal(f.root().findAllByType(QrScanner).length,0);assert.equal(f.root().findAllByType('input').find(n=>n.props['aria-label']==='Tìm mã đề nghị').props.value,'');
 }finally{await f.close();}
});

for(const kind of ['purchase','inbound'])test(`${kind}: actual unmount keeps only list controls; fresh mount rereads and does not restore selected/editor state`,async()=>{
 const store=createListViewStore();store.admit('ROOT-A');let f=await host(kind,{store});
 try{
  const search=()=>f.root().findAllByType('input').find(node=>node.props['aria-label']===(kind==='purchase'?'Tìm mã đề nghị':'Tìm phiếu nhập hàng'));
  const listForm=()=>f.root().findByType('form');
  await act(async()=>search().props.onChange({target:{value:'QA-APPLIED'}}));await act(async()=>listForm().props.onSubmit({preventDefault(){}}));await f.flush();
  await act(async()=>search().props.onChange({target:{value:'QA-DRAFT'}}));await f.open('DOC-A');assert.equal(f.nav().selectedId,'DOC-A');
  await f.close();f=await host(kind,{store});assert.equal(f.nav().selectedId,null);assert.equal(search().props.value,'QA-DRAFT');
  const listCalls=f.calls.filter(call=>call.path.endsWith(kind==='purchase'?'/purchase-requests':'/documents/inbound-requests'));assert.ok(listCalls.some(call=>call.q.search==='QA-APPLIED'),'fresh actual list uses applied filter after bootstrap');
  assert.equal(f.root().findAllByType(kind==='purchase'?MobileRequest:MobileInboundRequest).filter(node=>kind==='purchase'||node.props.documentId!==null).length,0);
  const saved=store.read(kind==='purchase'?'purchase-requests':'inbound-requests');assert.equal(saved.draftSearch,'QA-DRAFT');assert.equal(saved.appliedSearch,'QA-APPLIED');assert.equal(Object.hasOwn(saved,'selectedId'),false);
  await act(async()=>{store.admit('ROOT-B');store.admit('ROOT-A');});await f.flush();assert.equal(search().props.value,'');
 }finally{await f.close();}
});

test('purchase orders: actual Documents remount restores draft/applied/page controls, never selection, and changes branch immediately',async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window},events=new EventTarget(),store=createListViewStore();store.admit('ROOT-ORDER-A');let renderer,detail,calls=[];
 globalThis.window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 const w=workspace();w.navigation.push({id:'purchase-orders',label:'Synthetic orders',group:'Synthetic',href:'ignored'});w.session.capabilities.push('purchase-orders.read');
 globalThis.fetch=async(url)=>{const u=new URL(url,'https://synthetic.invalid');calls.push(Object.fromEntries(u.searchParams));return response({rows:[{documentId:'QA-ORDER',documentDate:'2026-10-01',branchId:'BR-A',statusId:1,isLocked:false}],page:Number(u.searchParams.get('page')),pageSize:50,hasMore:true});};
 const tree=()=>React.createElement(ListViewProvider,{store},React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})},React.createElement(Documents,{kind:'purchase-orders',workspace:w,verified:true,generation:1,compact:false,setCompact(){},onLogin(){},onDenied(){},renderDetail:(selected)=>{detail=selected;return null;}})));
 const flush=async()=>{for(let i=0;i<5;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});};const mount=async()=>{await act(async()=>renderer=create(tree()));await flush();};
 try{
  await mount();const search=()=>renderer.root.findAllByType('input').find(node=>node.props['aria-label']==='Tìm mã chứng từ');
  await act(async()=>search().props.onChange({target:{value:'QA-APPLIED'}}));await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));await flush();
  await act(async()=>search().props.onChange({target:{value:'QA-DRAFT'}}));const branch=renderer.root.findByType('select');await act(async()=>branch.props.onChange({target:{value:'BR-A'}}));await flush();assert.equal(calls.at(-1).branchId,'BR-A');
  const open=renderer.root.findAllByType('button').find(node=>node.props['aria-label']==='Mở chứng từ QA-ORDER');assert.ok(open,JSON.stringify({buttons:renderer.root.findAllByType('button').map(node=>({text:text(node),aria:node.props['aria-label']})),calls,detail}));await act(async()=>open.props.onClick());assert.equal(detail.documentId,'QA-ORDER');
  await act(async()=>renderer.unmount());await mount();assert.equal(detail,null);assert.equal(search().props.value,'QA-DRAFT');assert.equal(calls.at(-1).search,'QA-APPLIED');assert.equal(calls.at(-1).branchId,'BR-A');
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original.fetch;globalThis.window=original.window;}
});

for(const kind of ['purchase','inbound'])test(`${kind}: real editor retires queued delete confirmation on host presentation loss and restore`,async()=>{
 const f=await host(kind);try{
  await f.open('DOC-A');await f.edit('PRESENTATION CUSTODY');const editor=f.editor(),adapter=editor.props.adapter;
  const count=()=>kind==='purchase'?f.editor().findAllByType('article').length:f.editor().findAllByType('legend').filter(n=>/^Dòng 1/.test(text(n))).length;
  const before=count();assert.equal(before,1);await f.click(kind==='purchase'?'Bỏ dòng 1':'Xóa dòng 1');
  const queued=f.button('Xóa dòng').props.onClick;const review=f.editor().findByType('form').props.onSubmit;await f.render({presentationAllowed:false});
  await act(async()=>{queued({preventDefault(){}});review({preventDefault(){}});});await f.flush();
  assert.equal(f.button('Quay lại chỉnh sửa'),undefined,'Masked footer/form cannot advance review');
  assert.equal(count(),before,'Queued confirmation must not mutate a presentation-masked draft');
  assert.equal(f.root().findAllByProps({role:'alertdialog'}).length,0,'Body confirmation is hidden when the host is masked');
  const footers=f.root().findAll(n=>n.type==='div'&&n.props.className?.split(' ').includes('request-action-bar'));assert.equal(footers.length,1);assert.ok(footers.every(n=>n.props.hidden&&n.props.inert),'Portaled footer mirrors current host eligibility');
  await f.render({presentationAllowed:true});await act(async()=>{queued({preventDefault(){}});review({preventDefault(){}});});await f.flush();
  assert.equal(f.button('Quay lại chỉnh sửa'),undefined,'Restoration cannot revive a queued old footer/form action');
  assert.equal(count(),before,'Restoration cannot revive the retired queued action');assert.equal(f.root().findAllByProps({role:'alertdialog'}).length,0);
  assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.field().props.value,'PRESENTATION CUSTODY');assert.equal(f.guard().isBlocked(),true);
  await f.click(kind==='purchase'?'Bỏ dòng 1':'Xóa dòng 1');await f.click('Xóa dòng');assert.equal(count(),0,'Only a fresh confirmation can remove the original line');
  assert.ok(f.calls.every(c=>c.method==='GET'),'Local confirmation never implements a business write');
 }finally{await f.close();}
});
