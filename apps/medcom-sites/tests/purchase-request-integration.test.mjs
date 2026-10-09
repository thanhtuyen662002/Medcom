import {serveLocalFont} from './local-font-assets.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..').replaceAll('\\','/');
const output=path.join(app,'.test-runtime','i17-purchase-workspace');await mkdir(output,{recursive:true});
await build({absWorkingDir:app,entryPoints:['lib/erp/purchase-request-api.ts'],outfile:path.join(output,'api.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
const api=await import(pathToFileURL(path.join(output,'api.mjs')).href);
const {proxyErpRequest}=await import('../.test-runtime/erp-tests/proxy.js');
const {routeAllowed}=await import('../.test-runtime/erp-tests/proxy-policy.js');
const scope='a'.repeat(64);
// Test-only native observer; fresh pages start with zero and each scenario
// compares a captured baseline so legitimate modal opening is never miscounted.
function installPurchaseDetailFocusObserver(){
 window.purchaseDetailFocuses=0;const native=HTMLElement.prototype.focus;
 HTMLElement.prototype.focus=function(...args){if(this.matches('.request-detail-dialog[role="dialog"],[aria-label="Phiếu mua hàng hiện có"]'))window.purchaseDetailFocuses++;return Reflect.apply(native,this,args);};
}
test('purchase focus observer counts repeated target calls while preserving native receiver and options',()=>{
 const calls=[],token={},error=Error('synthetic-focus-error');class HTMLElement{constructor(target){this.target=target;}matches(){return this.target;}focus(...args){calls.push({receiver:this,args});if(args[0]?.fail)throw error;return token;}}
 const window={};runInNewContext(`(${installPurchaseDetailFocusObserver.toString()})();`,{window,HTMLElement,Reflect});
 const target=new HTMLElement(true),other=new HTMLElement(false),options={preventScroll:true};assert.strictEqual(target.focus(options),token);assert.strictEqual(target.focus(options),token);assert.strictEqual(other.focus(options),token);
 assert.equal(window.purchaseDetailFocuses,2);assert.deepEqual(calls.map(call=>call.receiver),[target,target,other]);assert.ok(calls.every(call=>call.args.length===1&&call.args[0]===options));assert.throws(()=>other.focus({fail:true}),caught=>caught===error);assert.equal(window.purchaseDetailFocuses,2);
});
function document(id='QA-000',branch='QA-A',count=1){return {purchaseRequestId:id,branchId:branch,statusId:1,isLocked:null,
 header:{purchaseDate:'2026-10-06T13:14:15.000',purposeId:1,personSuggest:'SYNTHETIC REQUESTER',department:'SYNTHETIC DEPARTMENT',purposeDescOrClient:null,price:'15.25',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1.25},
 lines:Array.from({length:count},(_,index)=>({lineId:`QA-L${String(index+1).padStart(3,'0')}`,values:{itemId:'QA-ITEM',budget:null,timeRequired:'synthetic wall clock',quantity:'999999999999999999',unitPrice:'2',totalPrice:'7',model:null}}))};}
function readback(doc=document()){return {document:doc,stateToken:'prs1.'+'1'.repeat(64)};}

test('fixed adapter preserves precision/full readback and refuses incomplete mobile projections',()=>{
 const data=readback();const mobile=api.mobilePurchaseSnapshot(data);assert.equal(mobile.values.lines[0].quantity,'999999999999999999');assert.equal(data.document.header.purchaseDate,'2026-10-06T13:14:15.000');assert.equal(data.document.lines[0].values.totalPrice,'7');
 assert.equal(api.mobilePurchaseSnapshot(readback(document('QA-LARGE','QA-A',101))),null);
 const nullable=readback();nullable.document.header.purchaseDate=null;assert.equal(api.mobilePurchaseSnapshot(nullable),null);
 for(const route of ['api/purchase-requests','api/purchase-requests/workspace','api/purchase-requests/detail','api/purchase-requests/lookup']){assert.equal(routeAllowed(route,'GET'),true);assert.equal(routeAllowed(route,'POST'),false);}
 assert.equal(routeAllowed('api/purchase-requests/sql','GET'),false);
});
test('typed responses reject scope mixing, numeric decimal loss and wrong selected identity',async()=>{
 const original=global.fetch;
 try{
  global.fetch=async()=>Response.json({scopeKey:'b'.repeat(64),data:{rows:[],page:1,pageSize:20,hasMore:false}});
  await assert.rejects(api.getPurchaseList(scope,1,'',''),error=>error.code==='purchase_scope_changed');
  const lossy=readback();lossy.document.lines[0].values.quantity=999999999999999999;
  global.fetch=async()=>Response.json({scopeKey:scope,data:lossy});await assert.rejects(api.getPurchaseDetail(scope,'QA-000'),error=>error.code==='invalid_api_response');
  global.fetch=async()=>Response.json({scopeKey:scope,data:readback(document('QA-OTHER'))});await assert.rejects(api.getPurchaseDetail(scope,'QA-000'),error=>error.code==='invalid_api_response');
 }finally{global.fetch=original;}
});

test('detail failures retain a fresh list but never soften authorization or scope denial',async()=>{
 const original=global.fetch;
 try{
  for(const status of [404,503,401,403,409]){
   global.fetch=async url=>String(url).includes('/detail?')?Response.json({code:'synthetic-detail-error'},{status}):Response.json({scopeKey:scope,data:{rows:[],page:1,pageSize:20,hasMore:false}});
   const result=api.getPurchaseDocuments(scope,['QA-A'],1,'','', 'QA-DOC');
   if([401,403,409].includes(status))await assert.rejects(result,error=>error.status===status);
   else{const data=await result;assert.deepEqual(data.list.rows,[]);assert.equal(data.detail,undefined);assert.equal(data.detailError.status,status);}
  }
 }finally{global.fetch=original;}
});

test('I33 purchase focus uses accepted current read evidence and stable read identity',async t=>{
 // Execute the production readiness expressions. These are source/VM assertions,
 // not claims about browser layout or ERP runtime behavior.
 const source=await readFile(path.join(app,'components/erp/purchase-request-screen.tsx'),'utf8');
 const file=ts.createSourceFile('purchase-request-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=new Map();let options,sameAuthority;
 const visit=node=>{
  if(ts.isVariableDeclaration(node)&&node.initializer)values.set(node.name.getText(file),node.initializer.getText(file));
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useRequestSelectionFocus')options=node.arguments[0].getText(file);
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='sameReadAuthority')sameAuthority=node.getText(file);
  ts.forEachChild(node,visit);
 };visit(file);assert.ok(options&&sameAuthority);
 const names=['allowed','safeBranch','criteriaKey','key','active','busy','currentAuthority','activeDetail','detailBusy','denied','canRead','freshRequired','focusOwner'];
 for(const name of names)assert.ok(values.has(name),`missing production ${name}`);
 const declarations=names.map(name=>`const ${name}=${values.get(name)};`).join('\n');
 const code=ts.transpileModule(`${sameAuthority}\nfunction identity(){const safeBranch=${values.get('safeBranch')};const criteriaKey=${values.get('criteriaKey')};return ${values.get('key')};}\nfunction read(){${declarations}\nreturn ${options};}\n({read,identity});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 function fixture(){
  class ReadError extends Error{constructor(status){super('synthetic');this.status=status;}}
  const workspace={session:{capabilities:['purchase-requests.read']},branchIds:['QA-A'],sessionScope:'session-a',readScope:'read-a'};
  const selection={id:'QA-000',version:1};
  const context={workspace,verifiedWorkspace:workspace,verifiedDetailWorkspace:workspace,selection,criteria:{version:0},observationVersion:0,boundary:'login-a',knownScope:scope,selected:'QA-000',search:'',branch:'',page:1,refresh:0,detailRefresh:0,verifying:false,
   editor:{raw:readback(),scopeKey:scope,observation:workspace,bridge:{needsFreshRead:()=>false}},
   state:{key:'',refresh:0,observation:workspace,scopeKey:scope,detail:readback(),list:{rows:[]},loading:false},
   workspaceReadViewScope:value=>JSON.stringify([value.sessionScope,value.readScope]),ApiError:ReadError};
  const functions=runInNewContext(code,context);context.state.key=functions.identity();context.readAuthority={...context.state,observationVersion:0};context.detailState={authority:context.readAuthority,selection,detail:readback(),refresh:0};return{...functions,context,ReadError};
 }
 await t.test('ready requires full selected detail but does not require command permission',()=>{
  const f=fixture(),ready=f.read();assert.equal(ready.openReady,true);assert.equal(ready.openFailed,false);assert.equal(ready.listReady,true);assert.ok(ready.owner);
  f.context.detailState.detail=undefined;assert.equal(f.read().openReady,false);
  f.context.detailState.detail=readback(document('QA-OTHER'));assert.equal(f.read().openReady,false);
 });
 for(const [name,change] of [
  ['stale selection key',f=>{f.context.state.key='old-selection';}],
  ['superseded document',f=>{f.context.selected='QA-OTHER';}],
  ['unfinished refresh',f=>{f.context.refresh++;}],
  ['loading',f=>{f.context.state.loading=true;}],
  ['workspace verification',f=>{f.context.verifying=true;}],
  ['unverified workspace',f=>{f.context.verifiedWorkspace=null;}],
  ['stale observation',f=>{f.context.workspace={...f.context.workspace};f.context.verifiedWorkspace=f.context.workspace;}],
  ['detail failure',f=>{f.context.detailState.error=new f.ReadError(503);}],
  ['authority denial',f=>{f.context.state.error=new f.ReadError(403);}],
  ['lost read capability',f=>{f.context.workspace.session.capabilities=[];}],
  ['lost selected branch',f=>{f.context.workspace.branchIds=['QA-B'];}],
  ['post-ACK fresh read requirement',f=>{f.context.editor.bridge.needsFreshRead=()=>true;}],
 ])await t.test(`${name} cannot admit focus`,()=>{const f=fixture();change(f);assert.equal(f.read().openReady,false);});
 await t.test('owner and return list stay stable across selection and harmless refresh, but not scope/filter/page changes',()=>{
  const f=fixture(),first=f.read();f.context.selected=null;f.context.refresh++;let next=f.read();assert.equal(next.owner,first.owner);assert.equal(next.listKey,first.listKey);
  f.context.search='OTHER';assert.notEqual(f.read().listKey,first.listKey);f.context.search='';f.context.page=2;assert.notEqual(f.read().listKey,first.listKey);
  f.context.page=1;f.context.branch='QA-A';assert.notEqual(f.read().listKey,first.listKey);
  f.context.workspace={...f.context.workspace,readScope:'read-b'};f.context.verifiedWorkspace=f.context.workspace;assert.notEqual(f.read().owner,first.owner);
  f.context.workspace=null;assert.equal(f.read().owner,null);
 });
});

test('I33 purchase Open/Close only arm after accepted movement; same-document focus preserves dirty custody',async t=>{
 const source=await readFile(path.join(app,'components/erp/purchase-request-screen.tsx'),'utf8');
 const file=ts.createSourceFile('purchase-request-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),bodies=[];let confirmed,cancelRefresh,cancelReceipt;
 const visit=node=>{
  if(ts.isFunctionDeclaration(node)&&['move','open','close','find'].includes(node.name?.text))bodies.push(node.getText(file));
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='onConfirmed')confirmed=node.initializer.arguments[0].getText(file);
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useLayoutEffect'&&node.arguments[0]?.getText(file).includes('cancelFocus()')){
   if(node.arguments[1].getText(file).includes('workspace'))cancelRefresh=node;else if(node.arguments[1].getText(file).includes('receiptId'))cancelReceipt=node;
  }
  ts.forEachChild(node,visit);
 };visit(file);assert.equal(bodies.length,4);assert.ok(confirmed&&cancelRefresh&&cancelReceipt);
 assert.match(cancelRefresh.arguments[1].getText(file),/workspace,verifying,refresh/);
 assert.match(cancelReceipt.arguments[1].getText(file),/editor\?\.receiptId/);
 const code=ts.transpileModule(`${bodies.join('\n')}\n({open,close,find,confirmed:${confirmed},revalidate:${cancelRefresh.arguments[0].getText(file)},receipt:${cancelReceipt.arguments[0].getText(file)}});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 function fixture(){
  const calls=[];let guarded,pending=false;
  const bridge={hasPending:()=>pending,retire:()=>calls.push('retire'),currentReadback:()=>readback()};
  const context={openAuthority:{current:{scope:'same-session',rows:new Set(['QA-000','QA-001'])}},presentationAllowed:true,active:{list:{rows:[{documentId:'QA-000'},{documentId:'QA-001'}]}},verifiedWorkspace:null,workspace:null,selected:'QA-000',selectionRef:{current:{id:'QA-000',version:1}},canRead:true,busy:false,verifying:false,freshRequired:false,work:{current:{dirty:true,unresolved:false}},editorRef:{current:{bridge,raw:readback()}},
   focusOpen:id=>calls.push(['open',id]),focusClose:()=>calls.push('close'),cancelFocus:()=>calls.push('cancel'),
   guardNavigation:(action,validate)=>{if(!validate||validate('request'))guarded={action,validate};},setSelected:id=>{calls.push(['selected',id]);context.selected=id;context.selectionRef.current={id,version:context.selectionRef.current.version+1};},retain:value=>{calls.push(['retain',value]);context.editorRef.current=value;context.editor=value;},
   searchInput:'SYNTHETIC FILTER',setSearch:value=>calls.push(['search',value]),setPage:value=>calls.push(['page',value]),setRefresh:()=>calls.push('refresh')};
  return{...runInNewContext(code,context),context,calls,pending:value=>{pending=value;},accept:()=>{assert.ok(guarded);const queued=guarded;guarded=null;if(!queued.validate||queued.validate('accept'))queued.action();},cancel:()=>{guarded=null;},guarded:()=>!!guarded};
 }
 await t.test('cancelled Open and Close leave selection, editor and focus untouched',()=>{
  const f=fixture();f.open('QA-001');assert.equal(f.guarded(),true);assert.deepEqual(f.calls,[]);f.cancel();assert.equal(f.context.selected,'QA-000');assert.equal(f.context.work.current.dirty,true);
  f.close();assert.deepEqual(f.calls,[]);f.cancel();assert.ok(f.context.editorRef.current);
 });
 await t.test('accepted different Open and Close arm in their original guarded callback',()=>{
  let f=fixture();f.open('QA-001');f.accept();assert.deepEqual(f.calls,[['open','QA-001'],['selected','QA-001']]);assert.equal(f.context.work.current.dirty,false);
  f=fixture();f.close();f.accept();assert.deepEqual(f.calls,['close','retire',['retain',null],['selected',null]]);
 });
 await t.test('same-document explicit focus neither requests discard nor mutates the dirty draft/guard',()=>{
  const f=fixture(),work=f.context.work.current,editor=f.context.editorRef.current;f.open('QA-000');assert.deepEqual(f.calls,[['open','QA-000']]);assert.equal(f.guarded(),false);assert.equal(f.context.work.current,work);assert.equal(work.dirty,true);assert.equal(f.context.editorRef.current,editor);
  f.close();assert.equal(f.guarded(),true);assert.equal(f.calls.length,1,'the next real navigation must still wait for its dirty guard');
 });
 for(const mode of ['pending','unresolved'])await t.test(`${mode} custody blocks repeated and different Open and Close`,()=>{
  for(const action of [f=>f.open('QA-000'),f=>f.open('QA-001'),f=>f.close()]){const f=fixture();if(mode==='pending')f.pending(true);else f.context.work.current.unresolved=true;action(f);assert.equal(f.guarded(),true,'valid pending navigation retains its nondiscardable warning');f.accept();assert.deepEqual(f.calls,[]);assert.equal(f.context.work.current.dirty,true);}
 });
 for(const mode of ['pending','unresolved'])await t.test('I43 later '+mode+' invalidates earlier discard acceptance',()=>{
  const f=fixture();f.close();if(mode==='pending')f.pending(true);else f.context.work.current.unresolved=true;
  f.accept();assert.deepEqual(f.calls,[]);assert.equal(f.context.selected,'QA-000');assert.ok(f.context.editorRef.current);
 });
 await t.test('refresh/revalidation/ACK cancel rather than arm; filter cancellation waits for acceptance',()=>{
  let f=fixture();f.revalidate();assert.deepEqual(f.calls,['cancel']);f.calls.length=0;f.confirmed({documentId:'QA-000'},'synthetic-receipt');assert.equal(f.context.editorRef.current.receiptId,'synthetic-receipt');f.receipt();assert.equal(f.calls.at(-1),'cancel');assert.equal(f.calls.some(value=>Array.isArray(value)&&value[0]==='open'),false);
  f=fixture();let prevented=false;f.find({preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);assert.deepEqual(f.calls,[]);f.accept();assert.equal(f.calls[0],'cancel');assert.equal(f.calls.at(-1),'refresh');
 });
 await t.test('accepted Close clearing a prior receipt keeps its newly armed return ticket',()=>{
  const f=fixture();f.context.editor=f.context.editorRef.current;f.context.editor.receiptId='previous-receipt';f.close();f.accept();f.receipt();assert.deepEqual(f.calls,['close','retire',['retain',null],['selected',null]]);
  f.context.editor={};f.calls.length=0;f.receipt();assert.deepEqual(f.calls,[],'a newly opened editor without a receipt does not cancel its Open ticket');
 });
});

test('production session continuations cannot mutate a retired account',async()=>{
 // Execute the actual function bodies with synthetic I/O, not a second implementation.
 const source=await readFile(path.join(app,'components/erp/workspace.tsx'),'utf8');
 const file=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),bodies=[];
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&['extend','performSignOut'].includes(node.name?.text))bodies.push(node.getText(file));ts.forEachChild(node,visit);};visit(file);assert.equal(bodies.length,2);
 function fixture(){
  let resolveContinue,rejectContinue,resolveLogout,generation=0;const calls=[];let auth={signOutPending:false,proofLifecycleKey:'current'};
  const continuation=new Promise((resolve,reject)=>{resolveContinue=resolve;rejectContinue=reject;}),logout=new Promise(resolve=>{resolveLogout=resolve;});
  const context={presentationAllowed:true,presentationCurrent:()=>context.presentationAllowed,publishAuth:update=>{auth=update(auth);calls.push(['auth',auth]);},mounted:{current:true},signOutPending:{current:false},authorityFence:{current:{begin:()=>++generation,isCurrent:value=>value===generation,invalidate:()=>{generation++;}}},
   continueSession:()=>continuation,logout:()=>logout,getWorkspace:async()=>{calls.push('read');return{};},loadWorkspace:async()=>{calls.push('read');},
   setWorkspace:value=>calls.push(['workspace',value]),setSessionError:value=>calls.push(['error',value]),setSessionBusy:()=>{},setAuthorityChecking:()=>{},onDenied:()=>calls.push('denied'),
   queryClient:{clear(){}},ApiError:api.ApiError??class extends Error{},errorMessage:error=>String(error),toast:{success:()=>calls.push('success'),error:()=>calls.push('error')}};
  const code=ts.transpileModule(bodies.join('\n')+'\n({extend,performSignOut});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return{...runInNewContext(code,context),context,calls,resolveContinue,rejectContinue,resolveLogout};
 }
 let f=fixture(),pending=f.extend();f.context.authorityFence.current.invalidate();f.calls.length=0;f.resolveContinue();await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.extend();f.context.authorityFence.current.invalidate();f.calls.length=0;f.rejectContinue(Object.assign(new Error('expired'),{status:401}));await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.performSignOut();f.context.authorityFence.current.invalidate();f.calls.length=0;f.resolveLogout();await pending;assert.deepEqual(f.calls,[]);
 f=fixture();pending=f.performSignOut();f.context.mounted.current=false;f.calls.length=0;f.resolveLogout();await pending;assert.deepEqual(f.calls,[]);
 for(const action of ['extend','performSignOut']){f=fixture();f.context.presentationAllowed=false;await f[action]();assert.deepEqual(f.calls,[],'concealed presentation must not start '+action);}
 f=fixture();pending=f.performSignOut();assert.deepEqual(structuredClone(f.calls[0]),['auth',{signOutPending:true,proofLifecycleKey:null}]);f.resolveLogout();await pending;assert.ok(f.calls.includes('success'));
});

test('Workspace deadline source callbacks fence a completed login while its new read is delayed',async t=>{
 // Actual source callbacks with mocked hooks/timers. This is not React/browser evidence.
 const source=await readFile(path.join(app,'components/erp/workspace.tsx'),'utf8');
 const file=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let deadline,success,load;
 const visit=node=>{
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0]?.getText(file).includes('const limit=knownSessionLimit.current'))deadline=node.arguments[0].getText(file);
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='loadWorkspace')load=node.initializer.arguments[0].getText(file);
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='onLoginSuccess')success=node.initializer.getText(file);
  ts.forEachChild(node,visit);
 };visit(file);assert.ok(deadline&&success&&load,'deadline, login and load must come from production source');
 const code=ts.transpileModule(`const loadWorkspace=${load};({deadline:${deadline},success:${success}});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 function fixture(expiry='idle'){
  const now=Date.parse('2026-10-06T07:00:00.000Z'),limit=now+100,far=now+60000,timers=[];let generation=0,invalidated=0,releaseRead,pendingRead;
  const initial={session:{idleExpiresAt:new Date(expiry==='idle'?limit:far).toISOString(),absoluteExpiresAt:new Date(expiry==='absolute'?limit:far).toISOString()}};
  class Clock extends Date{static now(){return now;}}
  class SessionError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
  const context={authState:{lifecycleKey:'current'},currentAuth:{lifecycleKey:'current'},readAuth:()=>context.currentAuth,signOutPending:{current:false},suspendReads:()=>{},workspace:initial,sessionEnded:false,loginBoundary:1,sessionError:null,sessionBusy:false,knownSessionLimit:{current:null},mounted:{current:true},Date:Clock,ApiError:SessionError,
   authorityFence:{current:{begin:()=>++generation,isCurrent:value=>value===generation,invalidate:()=>{invalidated++;generation++;}}},queryClient:{clear(){}},
   getWorkspace:()=>{assert.equal(context.knownSessionLimit.current,null,'clear previous deadline synchronously before starting the new read');pendingRead=new Promise(resolve=>{releaseRead=resolve;});return pendingRead;},
   setWorkspace:value=>{context.workspace=value;},setSessionError:value=>{context.sessionError=value;},setSessionBusy:value=>{context.sessionBusy=value;},setAuthorityChecking:()=>{},setLoginBoundary:update=>{context.loginBoundary=update(context.loginBoundary);},
   setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}};
  return{...runInNewContext(code,context),context,timers,initial,limit,invalidated:()=>invalidated,finishRead:async value=>{releaseRead(value);await pendingRead;await Promise.resolve();await Promise.resolve();}};
 }
 for(const reason of ['lifecycle','sign-out'])await t.test(`login completion rejects a stale ${reason} owner`,()=>{
  const f=fixture();f.deadline();if(reason==='lifecycle')f.context.currentAuth={lifecycleKey:'replacement'};else f.context.signOutPending.current=true;
  f.success();assert.equal(f.context.workspace,f.initial);assert.equal(f.context.knownSessionLimit.current,f.limit);assert.equal(f.context.loginBoundary,1);assert.equal(f.invalidated(),0);assert.equal(f.context.sessionBusy,false);
 });
 await t.test('queued prior deadline cannot cancel the new login read, before cleanup or after its new deadline is installed',async()=>{
  const f=fixture();f.deadline();const oldTimer=f.timers.at(-1);assert.equal(oldTimer.ms,100);
  f.context.workspace=null;f.deadline();assert.equal(f.context.knownSessionLimit.current,f.limit,'same-session outage retains the old deadline');
  f.success();assert.equal(f.context.knownSessionLimit.current,null);assert.equal(f.context.loginBoundary,2);assert.equal(f.context.sessionBusy,true);
  const invalidations=f.invalidated();oldTimer.fn();assert.equal(f.invalidated(),invalidations);assert.equal(f.context.sessionError,null);
  const count=f.timers.length;f.deadline();assert.equal(f.timers.length,count,'no old deadline is re-armed while the new read waits');
  const next={session:{idleExpiresAt:new Date(f.limit+60000).toISOString(),absoluteExpiresAt:new Date(f.limit+120000).toISOString()}};
  await f.finishRead(next);assert.equal(f.context.workspace,next);assert.equal(f.context.sessionBusy,false);assert.equal(f.context.sessionError,null);
  f.deadline();oldTimer.fn();assert.equal(f.invalidated(),invalidations);assert.equal(f.context.workspace,next);
 });
 for(const expiry of ['idle','absolute'])await t.test(`${expiry} deadline remains authoritative during a same-session outage`,()=>{
  const f=fixture(expiry);f.deadline();f.context.workspace=null;f.deadline();assert.equal(f.context.knownSessionLimit.current,f.limit);assert.equal(f.timers.at(-1).ms,100);
  f.timers.at(-1).fn();assert.equal(f.invalidated(),1);assert.equal(f.context.sessionError.status,401);assert.equal(f.context.sessionError.code,'session_expired');assert.equal(f.context.knownSessionLimit.current,null);
 });
 await t.test('already elapsed deadline uses the same zero-delay guarded timer',()=>{
  const f=fixture();f.context.workspace=null;f.context.knownSessionLimit.current=f.limit-200;f.deadline();
  assert.equal(f.invalidated(),0);assert.equal(f.timers.at(-1).ms,0);f.timers.at(-1).fn();assert.equal(f.context.sessionError.status,401);
 });
});

// Compile-only coverage uses the same bundles/CSS bytes later served by the browser fixtures.
// No listener, browser process, empty module shim or synthetic geometry is involved.
let applicationCss;
async function browserAssets(built){
 const script=built.outputFiles.find(file=>file.path.endsWith('.js'));
 const modules=built.outputFiles.filter(file=>file.path.endsWith('.css'));
 assert.ok(script?.contents.length,'Browser JavaScript must be selected by its emitted extension');
 assert.ok(modules.length&&modules.every(file=>file.contents.length),'Actual auth CSS modules must be emitted');
 if(!applicationCss){const require=createRequire(import.meta.url),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');applicationCss=postcss([tailwind({base:app})]).process(await readFile(path.join(app,'app/globals.css'),'utf8'),{from:path.join(app,'app/globals.css')}).then(result=>result.css);}
 const css=modules.map(file=>file.text).join('\n')+'\n'+await applicationCss;
 assert.doesNotMatch(css,/@import\s+["']tailwindcss["']/,'Tailwind must be compiled before serving');
 return {bundle:script.contents,css};
}
async function compileReadBrowser(){
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';import{PurchaseRequestScreen}from'./components/erp/purchase-request-screen';import{NavigationGuardProvider}from'./components/erp/navigation-guard';import{getWorkspace}from'./lib/erp/api';
 function App(){const[controlled,setControlled]=useState(false),[authority,setAuthority]=useState(null),[boundary,setBoundary]=useState(0),[ended,setEnded]=useState(false);window.qa={controlled:async()=>{setAuthority(await getWorkspace());setEnded(false);setControlled(true);},authority:async(retire=false)=>{const next=await getWorkspace();setAuthority(next);setEnded(false);if(retire)setBoundary(value=>value+1);}};
 return controlled?<NavigationGuardProvider><PurchaseRequestScreen workspace={authority} loginBoundary={boundary} sessionEnded={ended} onVerifyWorkspace={async()=>{setAuthority(await getWorkspace());setEnded(false);}} onDenied={error=>{if(error.status===401){setAuthority(null);setEnded(true);}}} onLogin={()=>{}}/></NavigationGuardProvider>:<Workspace/>;}createRoot(document.getElementById('root')).render(<App/>);`;
 // Next's image runtime needs its framework bundler. Only image rendering is shimmed;
 // the workspace, controls, data adapters, BFF and HTTP requests are the production code.
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'browser.js'),write:false,bundle:true,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',
  plugins:[{name:'fixture-next-image',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'fixture-next-image',namespace:'i17-fixture'}));build.onLoad({filter:/.*/,namespace:'i17-fixture'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return React.createElement('img',{src,alt,width,height});}",resolveDir:app,loader:'jsx'}));}}]});
  return browserAssets(built);
}
// Observe the synchronous native Retry click, without replacing its production
// handler. Focus/online/poll requests must not consume a planned retry response.
// eventPhase returns to NONE after dispatch, so no timer or sticky flag is needed.
function installCustodyWorkspaceObserver(){
 const nativeFetch=window.fetch.bind(window),io={events:[],requests:[]};let retryClick=null;
 window.custodyWorkspaceIO=io;
 window.addEventListener('click',event=>{
  retryClick=event.target?.closest?.('button')?.textContent?.trim()==='Thử lại'?event:null;
  if(retryClick)io.events.push({type:'retry-click',at:Date.now(),focused:document.hasFocus()});
 },true);
 window.addEventListener('pointerdown',event=>{if(event.target?.closest?.('button')?.textContent?.trim()==='Thử lại')io.events.push({type:'retry-pointerdown',at:Date.now(),focused:document.hasFocus()});},true);
 for(const type of ['focus','online'])window.addEventListener(type,()=>io.events.push({type,at:Date.now()}));
 document.addEventListener('visibilitychange',()=>io.events.push({type:'visibilitychange',visibility:document.visibilityState,at:Date.now()}));
 window.fetch=(input,init)=>{
  if(String(input).split('?')[0]!=='/api/erp/api/workspace'||(init?.method??'GET').toUpperCase()!=='GET')return nativeFetch(input,init);
  const explicitRetry=!!retryClick&&retryClick.eventPhase!==0,headers=new Headers(init?.headers);
  if(explicitRetry)headers.set('X-Synthetic-Workspace-Retry','1');
  const request={explicitRetry,status:'pending',at:Date.now()};io.requests.push(request);
  return nativeFetch(input,{...init,headers}).then(response=>{request.status=response.status;return response;},error=>{request.status='network';throw error;});
 };
}
function custodyWorkspaceFailure(state,explicitRetry){
 if(explicitRetry&&state.retryOutcome){state.failure=state.retryOutcome.failure;state.retryOutcome=null;}
 return state.failure;
}
test('custody fixture recovery is consumed only by a dispatched Retry, never incidental focus',async()=>{
 const listeners=new Map(),requests=[],response={status:200};
 const window={addEventListener:(type,handler)=>listeners.set(type,handler),fetch:async(input,init)=>{requests.push({input,init});return response;}};
 runInNewContext(`(${installCustodyWorkspaceObserver.toString()})();`,{window,document:{addEventListener(){},hasFocus:()=>true},Headers,Date});
 const state={failure:503,retryOutcome:{failure:null}},signal=new AbortController().signal;
 const read=()=>window.fetch('/api/erp/api/workspace',{signal,headers:{'X-Existing':'preserved'}});
 await read();assert.equal(requests.at(-1).init.headers.has('X-Synthetic-Workspace-Retry'),false);
 assert.equal(custodyWorkspaceFailure(state,false),503);assert.ok(state.retryOutcome);
 const event={target:{closest:()=>({textContent:'Thử lại'})},eventPhase:1};listeners.get('click')(event);event.eventPhase=3;
 assert.equal(await read(),response);assert.equal(requests.at(-1).init.headers.get('X-Synthetic-Workspace-Retry'),'1');
 assert.equal(requests.at(-1).init.headers.get('X-Existing'),'preserved');assert.equal(requests.at(-1).init.signal,signal);
 assert.equal(custodyWorkspaceFailure(state,true),null);assert.equal(state.retryOutcome,null);
 const workspacePost={method:'POST',body:'unchanged',signal};await window.fetch('/api/erp/api/workspace',workspacePost);
 assert.equal(requests.at(-1).init,workspacePost,'the active click observer only annotates Workspace GET');
 event.eventPhase=0;state.failure='network';state.retryOutcome={failure:401};listeners.get('focus')();await read();
 assert.equal(requests.at(-1).init.headers.has('X-Synthetic-Workspace-Retry'),false);
 assert.equal(custodyWorkspaceFailure(state,false),'network');assert.equal(state.retryOutcome.failure,401);
 const save={method:'POST',body:'original body',signal};await window.fetch('/api/erp/api/purchase-requests/save',save);
 assert.equal(requests.at(-1).init,save,'observer does not change the command DTO, signal or dispatch');
});
async function compileCustodyBrowser(){
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';
 (${installCustodyWorkspaceObserver.toString()})();
 // Deliberately let an old HTTP save response finish even after the application's
 // AbortSignal fires. The production adapter/editor must reject that late ACK.
 // Lost ACK is an explicit transport seam: consume the entire synthetic HTTP
 // response, then discard it. Do not destroy a pre-header socket and invite an
 // unobserved browser HTTP retry. This does not simulate a SQL engine failure.
 const nativeFetch=window.fetch.bind(window);window.custodyIO={aborted:0,replies:0,rejected:0,discarded:0,executes:[],fetches:[]};
 window.fetch=(input,init)=>{
  const path=String(input).split('?')[0];
  if(path.startsWith('/api/erp/api/purchase-requests/')&&init?.method==='POST')window.custodyIO.fetches.push({path,body:init.body,idempotencyKey:JSON.parse(init.body).idempotencyKey});
  if(path==='/api/erp/api/purchase-requests/save'&&init?.method==='POST'){
   const {signal,...rest}=init;signal?.addEventListener('abort',()=>window.custodyIO.aborted++);
   return nativeFetch(input,rest).then(async response=>{
    window.custodyIO.replies++;
    if(response.headers.get('X-Synthetic-Lost-Ack')==='discard-completed-response'){await response.arrayBuffer();window.custodyIO.discarded++;throw Error('Synthetic seam discarded a completed save response');}
    return response;
   },error=>{window.custodyIO.rejected++;throw error;});
  }
  return nativeFetch(input,init);
 };
 createRoot(document.getElementById('root')).render(<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'custody.js'),bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',
  plugins:[{name:'custody-command-execute-observer',setup(build){
   // Wrap only the exported entry point; the original adapter still runs unchanged.
   build.onResolve({filter:/purchase-request-command-adapter$/},()=>({path:'command-observer',namespace:'custody-command-observer'}));
   build.onLoad({filter:/.*/,namespace:'custody-command-observer'},()=>({contents:`
    export * from ${JSON.stringify(path.join(app,'lib/erp/purchase-request-command-adapter.ts'))};
    import {createPurchaseCommandAdapter as create} from ${JSON.stringify(path.join(app,'lib/erp/purchase-request-command-adapter.ts'))};
    export function createPurchaseCommandAdapter(...args){const bridge=create(...args),execute=bridge.adapter.execute;
     bridge.adapter.execute=(intent,signal)=>{window.custodyIO.executes.push({intentId:intent.intentId,action:intent.action});return execute(intent,signal);};return bridge;}
   `,resolveDir:app,loader:'js'}));
  }},{name:'custody-next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'custody-image'}));build.onLoad({filter:/.*/,namespace:'custody-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return React.createElement('img',{src,alt,width,height});}",resolveDir:app,loader:'jsx'}));}}]});
 return browserAssets(built);
}
test('compile actual purchase Workspace browser fixtures with emitted CSS and real Tailwind',async()=>{for(const compile of [compileReadBrowser,compileCustodyBrowser]){const assets=await compile();assert.ok(assets.bundle.length);assert.match(assets.css,/min-height:\s*100dvh/);assert.match(Buffer.from(assets.bundle).toString(),/\.request-detail-dialog/);assert.match(assets.css,/@layer utilities/);}});

test('real HTTP → BFF → existing workspace/browser purchase controls and authority fences',async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('Required installed playwright-core unavailable. Set MEDCOM_BROWSER_TOOLCHAIN; no download or skip.');}
 const records=Array.from({length:25},(_,index)=>document(`QA-${String(index).padStart(3,'0')}`,index%2?'QA-B':'QA-A'));
 records.push(document('QA-LARGE','QA-A',101));const nullable=document('QA-NULL','QA-A');nullable.header.purchaseDate=null;records.push(nullable);
 const lifetime={idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()};
 const state={scope,displayName:'SYNTHETIC USER',branches:['QA-A','QA-B'],canRead:true,authenticated:true,hold:false,release:null,started:null,detailFailure:null};const calls=[];
 function workspace(){return {session:{displayName:state.displayName,tenantId:'qa-tenant',companyId:'qa-company',companyName:'SYNTHETIC COMPANY',authorityVersion:1,
  ...lifetime,capabilities:state.canRead?['purchase-requests.read']:[]},
  navigation:state.canRead?[{id:'purchase-requests',label:'Đề nghị mua hàng',href:'/workspace/?screen=purchase-requests'}]:[],branchIds:state.branches};}
 const send=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
 const backend=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method,cookie:request.headers.cookie??''});
  if(url.pathname==='/health/ready')return send(response,503,{status:'unavailable',checks:[{component:'business_release',status:'not_configured'}]});
  if(!state.authenticated||!request.headers.cookie?.includes('__Host-Medcom.Session=synthetic-i17'))return send(response,401,{code:'authentication_required'});
  if(url.pathname==='/api/workspace'){response.setHeader('X-Medcom-Session-Scope','a'.repeat(64));response.setHeader('X-Medcom-Read-Scope',state.scope);return send(response,200,workspace());}
  if(url.pathname.startsWith('/api/purchase-requests')&&!state.canRead)return send(response,403,{code:'forbidden'});
  const envelope=data=>({scopeKey:state.scope,data});
  if(url.pathname==='/api/purchase-requests/workspace')return send(response,200,envelope({branchIds:state.branches,writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[
   {kind:'branches',available:true,reason:null,evidence:'synthetic native branches'},...['items','objects','purposes','currencies'].map(kind=>({kind,available:false,reason:'source_binding_unqualified',evidence:'synthetic UNKNOWN binding'}))]}));
  if(url.pathname==='/api/purchase-requests'){
   const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||20),branch=url.searchParams.get('branchId'),search=url.searchParams.get('search')||'';
   if(branch&&!state.branches.includes(branch))return send(response,403,{code:'forbidden'});
   const filtered=records.filter(record=>state.branches.includes(record.branchId)&&(!branch||record.branchId===branch)&&record.purchaseRequestId.includes(search));
   return send(response,200,envelope({rows:filtered.slice((page-1)*size,page*size).map(record=>({documentId:record.purchaseRequestId,purchaseDate:record.header.purchaseDate,branchId:record.branchId,personSuggest:record.header.personSuggest,department:record.header.department,statusId:record.statusId,isLocked:record.isLocked})),page,pageSize:size,hasMore:filtered.length>page*size}));
  }
  if(url.pathname==='/api/purchase-requests/detail'){
   if(state.detailFailure)return send(response,state.detailFailure,{code:'synthetic_detail_failure'});
   const record=records.find(record=>record.purchaseRequestId===url.searchParams.get('documentId')&&state.branches.includes(record.branchId));
   if(!record)return send(response,404,{code:'purchase_request_not_found'});
   const answer=envelope(readback(structuredClone(record)));
   if(state.hold){state.started?.();await new Promise(resolve=>{state.release=resolve;});}
   return send(response,200,answer);
  }
  if(url.pathname==='/api/purchase-requests/lookup')return send(response,200,envelope({available:false,reason:'source_binding_unqualified',items:[],page:1,hasMore:false}));
  send(response,404,{code:'endpoint_unavailable'});
 });backend.listen(0,'127.0.0.1');await once(backend,'listening');const backendAddress=`http://127.0.0.1:${backend.address().port}`;
 const {bundle,css}=await compileReadBrowser();let frontend;
 frontend=createServer(async(request,response)=>{
  if(request.url.startsWith('/api/erp/')){
   const incoming=new URL(request.url,`http://localhost:${frontend.address().port}`);const headers=new Headers(request.headers);
   const result=await proxyErpRequest(new Request(`https://synthetic-frontend.medcom.test${incoming.pathname}${incoming.search}`,{method:request.method,headers}),incoming.pathname.slice('/api/erp/'.length).split('/'),
    'https://synthetic-backend.medcom.test','https://synthetic-frontend.medcom.test',async(url,init)=>{
     const target=new URL(url);assert.equal(target.origin,'https://synthetic-backend.medcom.test');return fetch(`${backendAddress}${target.pathname}${target.search}`,init);
    });response.writeHead(result.status,Object.fromEntries(result.headers));return response.end(Buffer.from(await result.arrayBuffer()));
  }
  if(request.url==='/browser.css'){response.writeHead(200,{'Content-Type':'text/css'});return response.end(css);}
  if(request.url==='/browser.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}
  if(request.url.startsWith('/_next/')||request.url.startsWith('/assets/')){response.writeHead(404);return response.end();}
  response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/browser.css"><body><div id="root"></div><script src="/browser.js"></script></body></html>');
 });frontend.listen(0,'127.0.0.1');await once(frontend,'listening');let browser,context,page;const errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-component-update','--disable-default-apps','--no-default-browser-check']});
  context=await browser.newContext({viewport:{width:390,height:844}});const origin=`http://localhost:${frontend.address().port}`;
  // Chromium permits secure cookies on localhost; no production cookie/TLS policy changes.
  await context.addCookies([{name:'__Host-Medcom.Session',value:'synthetic-i17',domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();await page.addInitScript(installPurchaseDetailFocusObserver);page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?screen=purchase-requests');
  const screen=page.locator('section[aria-label="Danh sách đề nghị mua hàng"]');
  await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).waitFor();
  await t.test('existing workspace navigation mounts the real screen and available read controls',async()=>{
   await page.getByRole('heading',{level:1,name:'Đề nghị mua hàng',exact:true}).waitFor();
   assert.equal(await screen.getByRole('grid',{name:'Danh sách đề nghị',exact:true}).locator('[data-grid-row]').count(),20);
   const create=screen.getByRole('button',{name:'Tạo đề nghị',exact:true}),qualification=screen.locator('#purchase-write-qualification');
   assert.equal(await create.isVisible(),true);assert.equal(await create.isDisabled(),true);
   assert.equal(await create.getAttribute('aria-describedby'),'purchase-write-qualification');
   assert.equal(await qualification.textContent(),'Chỉ mở các phiếu hiện có.','mobile retains the disabled action’s accessible explanation');
   await page.setViewportSize({width:1280,height:900});await qualification.waitFor({state:'visible'});
   assert.equal(await qualification.innerText(),'Chỉ mở các phiếu hiện có.');assert.equal(await create.isDisabled(),true);
   await page.setViewportSize({width:390,height:844});
   assert.ok(calls.some(call=>call.path==='/api/purchase-requests'&&call.cookie.includes('synthetic-i17')));
  });
  await t.test('next/previous pages, branch selection and exact search all use actual BFF HTTP',async()=>{
   await screen.getByRole('button',{name:'Trang sau',exact:true}).click();await screen.getByText('Trang 2',{exact:true}).waitFor();assert.equal(await screen.getByRole('grid',{name:'Danh sách đề nghị',exact:true}).locator('[data-grid-row]').count(),7);
   await screen.getByRole('button',{name:'Trang trước',exact:true}).click();await screen.getByText('Trang 1',{exact:true}).waitFor();
   await screen.getByLabel('Chi nhánh',{exact:true}).selectOption('QA-B');await screen.getByRole('button',{name:'Mở đề nghị QA-001',exact:true}).waitFor();assert.equal(await screen.getByRole('grid',{name:'Danh sách đề nghị',exact:true}).locator('[data-grid-row]').count(),12);
   await screen.getByLabel('Chi nhánh',{exact:true}).selectOption('');await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).waitFor();
   await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill('QA-003');await screen.getByLabel('Tìm mã đề nghị',{exact:true}).press('Enter');await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).waitFor();assert.equal(await screen.getByRole('grid',{name:'Danh sách đề nghị',exact:true}).locator('[data-grid-row]').count(),1);
   assert.ok(calls.some(call=>call.query.page==='2'));assert.ok(calls.some(call=>call.query.branchId==='QA-B'));assert.ok(calls.some(call=>call.query.search==='QA-003'));
  });
  async function find(id){if(await screen.getByRole('dialog').count())await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill(id);await screen.getByLabel('Tìm mã đề nghị',{exact:true}).press('Enter');await screen.getByRole('button',{name:`Mở đề nghị ${id}`,exact:true}).waitFor();}
  async function expandFullReadback(){const detail=screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await detail.waitFor();const disclosure=detail.locator('details');if(!await disclosure.evaluate(el=>el.open))await disclosure.locator('summary').click();}
  const focusRegion='.request-detail-dialog[role="dialog"]';
  async function focused(selector){await page.waitForFunction(value=>document.activeElement?.matches(value),selector);}
  async function focusPaint(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
  await t.test('open/refresh/close preserve precise values and the full hidden header',async()=>{
   const count=path=>calls.filter(call=>call.path===path).length,initialWorkspace=count('/api/purchase-requests/workspace'),initialList=count('/api/purchase-requests');
   await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).click();const detail=screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await detail.waitFor();
   await focused(focusRegion);assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).getAttribute('tabindex'),'-1');
   assert.equal(count('/api/purchase-requests/workspace'),initialWorkspace);assert.equal(count('/api/purchase-requests'),initialList);
   await expandFullReadback();assert.match(await detail.innerText(),/2026-10-06T13:14:15.000/);assert.match(await detail.innerText(),/15.25/);assert.match(await detail.innerText(),/999999999999999999/);
   // Programmatic activation of the mounted background refresh handler, not pointer reachability through the modal.
   const before=calls.filter(call=>call.path.endsWith('/detail')).length;const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/purchase-requests/detail');await screen.getByRole('button',{name:'Làm mới',exact:true}).evaluate(button=>button.click());await refreshed;await detail.waitFor();assert.ok(calls.filter(call=>call.path.endsWith('/detail')).length>before);
   const beforeCloseWorkspace=count('/api/purchase-requests/workspace'),beforeCloseList=count('/api/purchase-requests');
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).waitFor();assert.equal(await detail.count(),0);
   assert.equal(beforeCloseWorkspace,initialWorkspace+1);assert.equal(beforeCloseList,initialList+1);assert.equal(count('/api/purchase-requests/workspace'),beforeCloseWorkspace);assert.equal(count('/api/purchase-requests'),beforeCloseList);
   await focused('[aria-label="Mở đề nghị QA-003"]');
  });
  await t.test('101 lines and nullable source date have complete read-only fallback without truncation',async()=>{
   await find('QA-LARGE');await screen.getByRole('button',{name:'Mở đề nghị QA-LARGE',exact:true}).click();await expandFullReadback();
   const table=screen.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true});await table.waitFor();const rows=table.locator('tbody tr');assert.equal(await rows.count(),101);
   for(let index=0;index<101;index++){
    const cells=rows.nth(index).getByRole('cell');assert.equal(await cells.count(),8);
    // Mobile cards add aria-hidden field labels; assert each complete business value separately.
    for(const [column,expected] of [[0,String(index+1)],[4,'999999999999999999']]){
     const value=cells.nth(column).locator(':scope > span:not([aria-hidden="true"])');assert.equal(await value.count(),1);assert.equal(await value.innerText(),expected);
    }
    const identity=cells.nth(1).locator(':scope > dl[aria-label="Thông tin mặt hàng"]');assert.equal(await identity.count(),1);
    assert.deepEqual(await identity.locator(':scope > div > dt').allTextContents(),['Mã hàng','Mã hàng NSX','Tên hàng / dịch vụ','ĐVT']);
    assert.deepEqual(await identity.locator(':scope > div > dd').allTextContents(),[records.find(record=>record.purchaseRequestId==='QA-LARGE').lines[index].values.itemId,'Chưa có thông tin','Chưa có thông tin','Chưa có thông tin']);
   }
   assert.equal(await table.getByText('QA-L101',{exact:true}).count(),0,'Opaque internal row IDs stay hidden');
   await find('QA-NULL');await screen.getByRole('button',{name:'Mở đề nghị QA-NULL',exact:true}).click();await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();await expandFullReadback();assert.match(await screen.innerText(),/NULL/);
  });
  await t.test('refresh of a deleted selected document retains close/list recovery without stale detail',async()=>{
   await find('QA-003');await screen.getByRole('button',{name:'Mở đề nghị QA-003',exact:true}).click();
   const detail=screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true});await detail.waitFor();
   const index=records.findIndex(record=>record.purchaseRequestId==='QA-003'),[removed]=records.splice(index,1);
   try{
    // This deliberate programmatic background-handler challenge preserves selected-read refresh coverage.
    await screen.getByRole('button',{name:'Làm mới',exact:true}).evaluate(button=>button.click());await screen.getByRole('alert').waitFor();
    assert.equal(await detail.count(),0);await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await screen.getByText('Trang 1',{exact:true}).waitFor();
   }finally{records.splice(index,0,removed);}
   await find('QA-000');
  });
  await t.test('new accounts and opaque scope changes retire selected documents and filters at a fixed lifetime',async()=>{
   await page.evaluate(()=>window.qa.controlled());
   for(const [nextScope,nextName] of [['b'.repeat(64),'SYNTHETIC SECOND USER'],['c'.repeat(64),'SYNTHETIC SECOND USER']]){
    await find('QA-000');await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();
    state.scope=nextScope;state.displayName=nextName;await page.evaluate(()=>window.qa.authority());
    await screen.getByRole('button',{name:'Mở đề nghị QA-001',exact:true}).waitFor();
    assert.equal(await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).count(),0);assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'');
   }
  });
  await t.test('I43 held Open focuses its modal immediately; late read cannot steal a newer modal-control focus',async()=>{
   await page.evaluate(()=>window.qa.controlled());await find('QA-000');
   state.hold=true;const started=new Promise(resolve=>{state.started=resolve;});await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await started;
   assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   await focused(focusRegion);const close=screen.getByTitle('Đóng hộp thoại',{exact:true});await close.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
   assert.equal(await close.evaluate(element=>element===document.activeElement),true);state.hold=false;state.release();
   await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();await focusPaint();assert.equal(await close.evaluate(element=>element===document.activeElement),true);
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await focused('[aria-label="Mở đề nghị QA-000"]');
  });
  await t.test('I33 failed and superseded reads never create a deferred detail focus',async()=>{
   // Observe actual target.focus calls, including a repeated focus on the already
   // active frame. Modal opening has its own legitimate initial focus baseline.
   const frameFocusCount=()=>page.evaluate(()=>window.purchaseDetailFocuses);const beforeFailedOpen=await frameFocusCount();
   state.detailFailure=503;await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await screen.getByRole('alert').waitFor();await focused(focusRegion);await focusPaint();
   const initialModalFocus=await frameFocusCount();assert.equal(initialModalFocus,beforeFailedOpen+1,'Failed Open still gives the named modal its one immediate focus');
   state.detailFailure=null;state.hold=true;const retryStarted=new Promise(resolve=>{state.started=resolve;});await screen.getByRole('button',{name:'Xác minh lại phiếu',exact:true}).click();await retryStarted;
   const laterControl=screen.getByTitle('Đóng hộp thoại',{exact:true});await laterControl.focus();const retryFocus=await frameFocusCount();
   state.hold=false;state.release();await screen.getByRole('region',{name:'Dữ liệu ERP đầy đủ',exact:true}).waitFor();await focusPaint();assert.equal(await frameFocusCount(),retryFocus,'refresh cannot revive a failed Open ticket');assert.equal(await laterControl.evaluate(element=>element===document.activeElement),true,'refresh preserves the newer modal-control focus');
   // Same-document Open is a programmatic mounted-handler challenge while the modal blocks the list.
   const explicitFocus=await frameFocusCount();await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).evaluate(button=>button.click());await focused(focusRegion);assert.equal(await frameFocusCount(),explicitFocus+1,'an explicit same-document handler focuses its owned frame exactly once without a new read');
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await focused('[aria-label="Mở đề nghị QA-000"]');
   const beforeHeldOpen=await frameFocusCount();state.hold=true;const started=new Promise(resolve=>{state.started=resolve;});await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await started;await focused(focusRegion);await focusPaint();
   const heldModalFocus=await frameFocusCount();assert.equal(heldModalFocus,beforeHeldOpen+1,'A second deliberate modal opening adds only its immediate focus');
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await focused('[aria-label="Mở đề nghị QA-000"]');state.hold=false;state.release();await focusPaint();
   assert.equal(await frameFocusCount(),heldModalFocus,'A late closed read cannot restore focus to either the frame or obsolete region');assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
  });
  await t.test('late result after a login boundary is discarded, and grant denial removes rows',async()=>{
   await page.evaluate(()=>window.qa.controlled());await find('QA-000');state.hold=true;const started=new Promise(resolve=>{state.started=resolve;});
   await screen.getByRole('button',{name:'Mở đề nghị QA-000',exact:true}).click();await started;
   state.canRead=false;await page.evaluate(()=>window.qa.authority(true));state.hold=false;state.release();await page.getByText('Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.',{exact:true}).waitFor();
   await page.waitForTimeout(50);assert.equal(await page.getByRole('table',{name:'Toàn bộ dòng đề nghị',exact:true}).count(),0);assert.equal(await page.getByRole('grid',{name:'Danh sách đề nghị',exact:true}).locator('[data-grid-row]').count(),0);
   assert.equal(await page.evaluate(()=>document.activeElement?.matches('.request-detail-dialog[role="dialog"],[aria-label="Phiếu mua hàng hiện có"]')),false);
  });
  assert.deepEqual(errors,[]);assert.equal(calls.some(call=>call.method!=='GET'),false);await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],calls:calls.length,nonGetCalls:0,errors},null,2));
 }catch(error){await writeFile(path.join(output,'synthetic-failure.json'),JSON.stringify({errors,calls,body:await page?.locator('body').innerText().catch(()=>''),error:String(error)},null,2));throw error;}
 finally{state.release?.();await context?.close();await browser?.close();await new Promise(resolve=>frontend.close(resolve));await new Promise(resolve=>backend.close(resolve));}
});

// I20 tests run the actual adapter and BFF. These Node/transport-double cases
// are not ASP.NET or production SQL evidence.
await build({absWorkingDir:app,entryPoints:['lib/erp/purchase-request-command-adapter.ts'],outfile:path.join(output,'i20-command.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
test('I20 actual command module and BFF / Node synthetic parity',async t=>{
 const {commandPurchaseSnapshot,freezePurchaseCommand,createPurchaseCommandAdapter}=await import(pathToFileURL(path.join(output,'i20-command.mjs')).href);
 const policy=await import('../.test-runtime/erp-tests/proxy-policy.js');
 const cases=[];const register=(name,run)=>cases.push([name,run]);
const scope='a'.repeat(64),token=n=>'prs1.'+String(n).repeat(64);
function raw(count=2){return {stateToken:token(1),document:{purchaseRequestId:'QA-DOC',branchId:'QA-A',statusId:1,isLocked:null,
 header:{purchaseDate:'2026-10-06T13:14:15.003',purposeId:null,personSuggest:'',department:'QA',purposeDescOrClient:'',price:'9999999999999999.99',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:0.125},
 lines:Array.from({length:count},(_,i)=>({lineId:'L'+String(i).padStart(3,'0'),values:{itemId:'QA-ITEM',budget:null,timeRequired:'',quantity:'999999999999999999',unitPrice:'-2',totalPrice:i%2?null:'7',model:null}}))}};}
function intent(r,action='saveDraft',id=crypto.randomUUID()){const v=commandPurchaseSnapshot(r).values;if(action==='saveDraft')v.notes='Đã kiểm tra';return {intentId:id,action,documentId:r.document.purchaseRequestId,expectedVersion:r.stateToken,values:v};}
function ack(f,n=2,outcome=0){return {scopeKey:scope,data:{outcome,receipt:{actionId:'purchase-request.'+(f.action==='saveDraft'?'save-draft':'submit'),idempotencyKey:f.dto.idempotencyKey,document:structuredClone(f.desired),stateToken:token(n),allocatedLines:[]}}};}
const signal=()=>new AbortController().signal;
register('lossless full raw overlay, timestamp, NULL, empty, float and decimal strings',()=>{
 const r=raw(),i=intent(r);i.values.lines[0].quantity='9007199254740993';const f=freezePurchaseCommand(r,i);
 assert.equal(f.dto.header.price,'9999999999999999.99');assert.equal(f.dto.header.rateExchange,0.125);assert.equal(f.dto.header.purchaseDate,'2026-10-06T13:14:15.003');
 assert.equal(f.dto.header.purposeId,null);assert.equal(f.dto.header.purposeDescOrClient,'');assert.equal(f.dto.lineChanges[0].kind,'Update');assert.equal(f.dto.lineChanges[0].values.quantity,'9007199254740993');
 assert.equal(f.dto.lineChanges[0].values.totalPrice,'7');assert.equal(f.dto.lineChanges[0].values.budget,null);assert.equal(f.dto.lineChanges[0].values.model,null);assert.equal(f.dto.lineChanges[0].values.timeRequired,'');
 assert.equal(f.desired.lines[1].values.totalPrice,null);assert.equal(r.document.header.notes,null);assert.ok(Object.isFrozen(f.dto.header));assert.ok(Object.isFrozen(f.dto.lineChanges[0].values));
});
register('NULL SQL date and unchanged nullable text are retained, not defaulted',()=>{const r=raw();r.document.header.purchaseDate=null;const i=intent(r);i.values.notes='';i.values.department='OTHER';const f=freezePurchaseCommand(r,i);assert.equal(f.dto.header.purchaseDate,null);assert.equal(f.dto.header.notes,null);assert.equal(f.dto.header.purposeDescOrClient,'');});
register('all 500 original rows retained; only explicit updates become changes',()=>{const r=raw(500),i=intent(r);i.values.lines[0].quantity='9007199254740993';const f=freezePurchaseCommand(r,i);assert.equal(f.desired.lines.length,500);assert.deepEqual(f.dto.lineChanges,[{kind:'Update',lineId:'L000',clientLineKey:null,values:{...r.document.lines[0].values,quantity:'9007199254740993'}}]);assert.deepEqual(f.desired.lines.slice(1),r.document.lines.slice(1));const missing=intent(r);missing.values.lines=missing.values.lines.slice(1);assert.throws(()=>freezePurchaseCommand(r,missing),/Original line set required/);});
for(const field of ['branchId','purchaseDate','purposeId','currencyId','objectId'])register('locked field '+field,()=>{const r=raw(),i=intent(r);i.values[field]='different';assert.throws(()=>freezePurchaseCommand(r,i));});
register('no Create/Add, duplicate IDs or item substitution',()=>{for(const change of [i=>i.documentId=null,i=>i.values.lines.push({...i.values.lines[0],lineId:null,localKey:'NEW'}),i=>i.values.lines.push({...i.values.lines[0]}),i=>i.values.lines[0].itemId='OTHER']){const r=raw(),i=intent(r);change(i);assert.throws(()=>freezePurchaseCommand(r,i));}});
register('exact integer edits reject fractions, overflow and malformed nullable value',()=>{for(const value of ['1.5','9999999999999999999','1e9','']){const r=raw(),i=intent(r);i.values.lines[0].quantity=value;assert.throws(()=>freezePurchaseCommand(r,i));}const r=raw(),i=intent(r);i.values.lines[0].quantity='0002';assert.equal(freezePurchaseCommand(r,i).dto.lineChanges[0].values.quantity,'2');});
register('invalid Unicode is rejected before transport',()=>{const r=raw(),i=intent(r);i.values.notes='\ud800';assert.throws(()=>freezePurchaseCommand(r,i));});
register('dirty Submit never dispatches an implicit Save or Submit',async()=>{const r=raw(),i=intent(r,'submit');i.values.notes='dirty';let calls=0;const bridge=createPurchaseCommandAdapter(scope,r,async()=>{calls++});const result=await bridge.adapter.execute(i,signal());assert.equal(result.kind,'rejected');assert.equal(calls,0);assert.equal(bridge.hasPending(),false);});
register('separate Save -> confirmed new token -> intentional Submit, no fresh edit',async()=>{
 const r=raw(),save=intent(r),f=freezePurchaseCommand(r,save),calls=[];
 const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{calls.push({s,route,body});if(route==='save')return ack(f,2);const current=bridge.currentReadback(),sub=intent(current,'submit',JSON.parse(body).idempotencyKey);assert.equal(JSON.parse(body).expectedStateToken,token(2));return ack(freezePurchaseCommand(current,sub),3);});
 const saved=await bridge.adapter.execute(save,signal());assert.equal(saved.kind,'confirmed');assert.equal(bridge.needsFreshRead(),true);
 assert.equal((await bridge.adapter.execute(intent(bridge.currentReadback()),signal())).kind,'rejected');assert.equal(calls.length,1);
 const submitted=await bridge.adapter.execute(intent(bridge.currentReadback(),'submit'),signal());assert.equal(submitted.kind,'confirmed');assert.deepEqual(calls.map(c=>c.route),['save','submit']);assert.equal(submitted.snapshot.confirmation,'submitted');assert.deepEqual(Object.keys(JSON.parse(calls[1].body)),['idempotencyKey','branchId','purchaseRequestId','expectedStateToken']);
});
register('double tap sends exactly one command and keeps first intent',async()=>{const r=raw(),i=intent(r);let release,calls=0;const bridge=createPurchaseCommandAdapter(scope,r,async()=>{calls++;return new Promise(res=>release=res);});const first=bridge.adapter.execute(i,signal());assert.equal((await bridge.adapter.execute(i,signal())).kind,'unknown');assert.equal((await bridge.adapter.execute(intent(r),signal())).kind,'unknown');assert.equal(calls,1);release(ack(freezePurchaseCommand(r,i)));assert.equal((await first).kind,'confirmed');});
register('lost ACK: every non-Committed lookup keeps exact original JSON/key; final committed resolves',async()=>{
 const r=raw(),i=intent(r),f=freezePurchaseCommand(r,i),bodies=[];let outcome=1;
 const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{bodies.push({route,body});if(route==='save')throw Error('ACK lost');return outcome===0?ack(f):{scopeKey:scope,data:{outcome,receipt:null}};});
 assert.equal((await bridge.adapter.execute(i,signal())).kind,'unknown');assert.throws(()=>bridge.adoptReadback(raw()));
 for(outcome of [1,2,3,4,5,6,7,8,9,-1,'Committed',null]){assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'unknown');assert.equal(bridge.hasPending(),true);assert.equal(bridge.currentReadback().stateToken,token(1));}
 outcome=0;assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'confirmed');assert.equal(bridge.hasPending(),false);assert.ok(bodies.every(b=>b.body===f.json));assert.equal(bodies.filter(b=>b.route==='save').length,1);assert.ok(bodies.slice(1).every(b=>b.route==='save/lookup'));
});
register('command Replayed=1 is not lookup Pending=1',async()=>{const r=raw(),i=intent(r);const bridge=createPurchaseCommandAdapter(scope,r,async()=>ack(freezePurchaseCommand(r,i),2,1));assert.equal((await bridge.adapter.execute(i,signal())).kind,'confirmed');});
for(const mutate of [a=>a.scopeKey='b'.repeat(64),a=>a.data.receipt.idempotencyKey='other',a=>a.data.receipt.actionId='purchase-request.submit',a=>a.data.receipt.document.header.price='0.00',a=>a.data.receipt.document.lines.pop(),a=>a.data.receipt.allocatedLines.push({clientLineKey:'x',lineId:'x'}),a=>a.data.receipt.stateToken='not-a-token',a=>a.data.receipt.document.header.notes=null,a=>a.data.receipt.extra='x'])register('malformed/mismatched receipt retains unknown '+mutate.toString(),async()=>{const r=raw(),i=intent(r),answer=ack(freezePurchaseCommand(r,i));mutate(answer);const b=createPurchaseCommandAdapter(scope,r,async()=>answer);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);});
register('abort after dispatch ignores late response; reconciliation still uses original command',async()=>{const r=raw(),i=intent(r);let release;const b=createPurchaseCommandAdapter(scope,r,async(s,route)=>route==='save'?new Promise(res=>release=res):ack(freezePurchaseCommand(r,i)));const c=new AbortController(),p=b.adapter.execute(i,c.signal);c.abort();release(ack(freezePurchaseCommand(r,i)));assert.equal((await p).kind,'unknown');assert.equal(b.currentReadback().stateToken,token(1));assert.equal(b.hasPending(),true);assert.equal((await b.adapter.reconcile(i,signal())).kind,'confirmed');});
register('retired session ignores late receipt and prevents future transport',async()=>{const r=raw(),i=intent(r);let release,calls=0;const b=createPurchaseCommandAdapter(scope,r,async()=>{calls++;return new Promise(res=>release=res);});const p=b.adapter.execute(i,signal());b.retire();release(ack(freezePurchaseCommand(r,i)));assert.equal((await p).kind,'unknown');assert.equal((await b.adapter.reconcile(i,signal())).kind,'unknown');assert.equal(calls,1);});
register('confirmed receipt survives failed read adoption; fresh authorized read admits next edit',async()=>{const r=raw(),i=intent(r);const b=createPurchaseCommandAdapter(scope,r,async()=>ack(freezePurchaseCommand(r,i)));await b.adapter.execute(i,signal());const other=raw();other.document.purchaseRequestId='OTHER';assert.throws(()=>b.adoptReadback(other));assert.equal(b.currentReadback().stateToken,token(2));assert.equal(b.needsFreshRead(),true);b.adoptReadback(structuredClone(b.currentReadback()));assert.equal(b.needsFreshRead(),false);});
const ui='https://ui.medcom.test',backend='https://api.medcom.test';
function request(route='api/purchase-requests/save',body='{}',extra={}){const init={method:'POST',headers:{Origin:ui,'Content-Type':'application/json','X-Purchase-Scope':scope,'X-CSRF-TOKEN':'qa-csrf',Cookie:'__Host-Medcom.Session=qa; other=not-forwarded',...extra.headers},body,...extra};if(body instanceof ReadableStream)init.duplex='half';return new Request(ui+'/api/erp/'+route,init);}
function proxy(req,route='api/purchase-requests/save',fetcher=async()=>Response.json({ok:true})){return proxyErpRequest(req,route.split('/'),backend,ui,fetcher);}
for(const route of ['api/purchase-requests/save','api/purchase-requests/submit','api/purchase-requests/save/lookup','api/purchase-requests/submit/lookup'])register('fixed route and 1MiB boundary '+route,async()=>{assert.equal(policy.routeAllowed(route,'POST'),true);assert.equal(policy.routeAllowed(route,'GET'),false);assert.equal(policy.requestBodyLimit(route,'POST'),1048576);let calls=0;const fetcher=async()=>{calls++;return Response.json({})};const exact=JSON.stringify({x:'x'.repeat(1048576-8)});assert.equal(Buffer.byteLength(exact),1048576);assert.equal((await proxy(request(route,exact),route,fetcher)).status,200);assert.equal((await proxy(request(route,exact+' '),route,fetcher)).status,413);assert.equal(calls,1);});
register('auth remains 16KiB, GET catalogue unchanged, no generic or Create paths',async()=>{const route='api/auth/login';assert.equal(policy.requestBodyLimit(route,'POST'),16384);assert.equal((await proxy(request(route,'x'.repeat(16385)),route)).status,413);assert.equal(policy.routeAllowed('api/purchase-requests/lookup','GET'),true);for(const p of ['api/purchase-requests/create','api/purchase-requests/sql','api/purchase-requests/save/other'])assert.equal(policy.routeAllowed(p,'POST'),false);});
register('bounded chunked stream is cancelled above limit without upstream dispatch',async()=>{let cancelled=false,calls=0;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1048576));c.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});const r=await proxy(request(undefined,stream),undefined,async()=>{calls++;return Response.json({})});assert.equal(r.status,413);assert.equal(calls,0);assert.equal(cancelled,true);});
for(const body of [new Uint8Array([123,34,120,34,58,34,195,40,34,125]),'{',JSON.stringify(null),'[]',new Uint8Array([239,187,191,123,125])])register('malformed JSON/UTF8/BOM/root rejected '+JSON.stringify(body),async()=>{let calls=0;assert.equal((await proxy(request(undefined,body),undefined,async()=>{calls++;return Response.json({})})).status,400);assert.equal(calls,0);});
register('origin, scope, content-type, query, malformed length fail before upstream',async()=>{for(const [headers,status] of [[{Origin:'https://evil.test'},403],[{'X-Purchase-Scope':'bad'},409],[{'Content-Type':'application/jsonp'},415],[{'content-length':'NaN'},400],[{'content-length':'1048577'},413]]){let calls=0;const req=request();for(const [k,v] of Object.entries(headers))req.headers.set(k,v);assert.equal((await proxy(req,undefined,async()=>{calls++;return Response.json({})})).status,status);assert.equal(calls,0);}const req=request('api/purchase-requests/save?table=x');assert.equal((await proxy(req)).status,400);});
register('actual Node loopback HTTP + production BFF preserves bytes/cookie/CSRF/scope and no-store; NOT ASP.NET',async()=>{
 let received;const server=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);received={headers:req.headers,body:Buffer.concat(chunks).toString(),url:req.url};res.setHeader('Content-Type','application/json');res.end('{"outcome":0}');});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const r=raw(),i=intent(r),body=freezePurchaseCommand(r,i).json;const result=await proxy(request(undefined,body),undefined,async(url,init)=>{assert.equal(new URL(url).origin,backend);assert.equal(init.cache,'no-store');assert.equal(init.redirect,'manual');return fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,init);});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(received.body,body);assert.equal(received.headers.origin,backend);assert.equal(received.headers['x-csrf-token'],'qa-csrf');assert.equal(received.headers['x-purchase-scope'],scope);assert.equal(received.headers.cookie,'__Host-Medcom.Session=qa');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
register('upstream redirect is never followed',async()=>{const result=await proxy(request(),undefined,async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}));assert.equal(result.status,502);});

register('changed effect with unchanged token cannot confirm',async()=>{const r=raw(),i=intent(r),a=ack(freezePurchaseCommand(r,i),1);const b=createPurchaseCommandAdapter(scope,r,async()=>a);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);});
register('HTTP200 without valid bound receipt remains unknown',async()=>{const r=raw(),i=intent(r);for(const answer of [{ok:true},{scopeKey:scope,data:{outcome:0,receipt:null}},{scopeKey:scope,data:{outcome:'Committed',receipt:ack(freezePurchaseCommand(r,i)).data.receipt}}]){const b=createPurchaseCommandAdapter(scope,r,async()=>answer);assert.equal((await b.adapter.execute(i,signal())).kind,'unknown');assert.equal(b.hasPending(),true);}});
register('changed DTO cannot replace frozen original during reconciliation',async()=>{const r=raw(),i=intent(r);let calls=0;const b=createPurchaseCommandAdapter(scope,r,async()=>{calls++;throw Error('lost')});await b.adapter.execute(i,signal());const altered=structuredClone(i);altered.values.notes='replacement';assert.equal((await b.adapter.reconcile(altered,signal())).kind,'unknown');assert.equal(calls,1);assert.equal(b.hasPending(),true);});

register('a GET started before dispatch or ACK cannot overwrite the confirmed receipt',async()=>{
 const r=raw(),i=intent(r);let release;const b=createPurchaseCommandAdapter(scope,r,async()=>new Promise(resolve=>release=resolve));
 const beforeDispatch=b.readVersion(),sending=b.adapter.execute(i,signal()),beforeAck=b.readVersion();
 release(ack(freezePurchaseCommand(r,i)));assert.equal((await sending).kind,'confirmed');const confirmed=b.currentReadback();
 for(const epoch of [beforeDispatch,beforeAck])assert.throws(()=>b.adoptReadback(r,epoch));
 assert.deepEqual(b.currentReadback(),confirmed);assert.equal(b.needsFreshRead(),true);
 b.adoptReadback(confirmed,b.readVersion());assert.equal(b.needsFreshRead(),false);
});
 for(const [name,run] of cases)await t.test(name,run);
});

test('I20 React mobile intent lifecycle / production component and adapter with explicit transport double',async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('I20 browser tests require the pinned playwright-core toolchain; no skip or download.');}
 const fixture={document:document('QA-DOC','QA-A',2),stateToken:'prs1.'+'1'.repeat(64)};
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{MobileRequest}from'./components/erp/mobile-request';
 import{NavigationGuardProvider,useNavigationGuard}from'./components/erp/navigation-guard';
 import{commandPurchaseSnapshot,createPurchaseCommandAdapter}from'./lib/erp/purchase-request-command-adapter';
 const first=${JSON.stringify(fixture)},scope='a'.repeat(64);const clone=v=>structuredClone(v);
 const qa={calls:[],mode:'commit',outcome:1,release:null,receipt:null,persisted:clone(first.document),serial:1};window.qa=qa;
 async function transport(s,route,body,signal){
  qa.calls.push({scope:s,route,body});const dto=JSON.parse(body);
  if(route.endsWith('/lookup'))return{scopeKey:s,data:{outcome:qa.outcome,receipt:qa.outcome===0?clone(qa.receipt):null}};
  if(route==='save'){
   qa.persisted.header=clone(dto.header);
   for(const c of dto.lineChanges){if(c.kind==='Remove')qa.persisted.lines=qa.persisted.lines.filter(l=>l.lineId!==c.lineId);else if(c.kind==='Update'){const l=qa.persisted.lines.find(l=>l.lineId===c.lineId);if(!l)throw Error('missing');l.values=clone(c.values);}else throw Error('Add forbidden');}
  }else{qa.persisted.statusId=2;qa.persisted.isLocked=true;}
  qa.receipt={actionId:'purchase-request.'+(route==='save'?'save-draft':'submit'),idempotencyKey:dto.idempotencyKey,document:clone(qa.persisted),stateToken:'prs1.'+String(++qa.serial).repeat(64),allocatedLines:[]};
  if(qa.mode==='lost')throw Error('synthetic lost ACK');
  if(qa.mode==='hold')await new Promise(resolve=>{qa.release=resolve;});
  return{scopeKey:s,data:{outcome:0,receipt:clone(qa.receipt)}};
 }
 function Harness(){
  const[bridge,setBridge]=useState(()=>createPurchaseCommandAdapter(scope,first,transport));
  const[adapter,setAdapter]=useState(()=>bridge.adapter),[initial,setInitial]=useState(()=>commandPurchaseSnapshot(first)),[revision,setRevision]=useState(0),[visible,setVisible]=useState(true),[receipt,setReceipt]=useState(''),[error,setError]=useState('');
  const[access,setAccess]=useState({scopeKey:scope,canRead:true,canEdit:true,canSaveDraft:true,canSubmit:true,canReconcile:true,available:true,existingOnly:true,canAddLines:false,authorityKey:'one',requiresFreshRead:false,branches:[],currencies:[],purposes:[],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:'items',objectLookupId:'objects'});
  const{request}=useNavigationGuard();
  qa.raw=()=>bridge.currentReadback();qa.pending=()=>bridge.hasPending();
  qa.refreshFailure=()=>{setError('Synthetic refresh failed');setAccess(a=>({...a,requiresFreshRead:true}));};
  qa.readAgain=()=>{bridge.adoptReadback(clone(bridge.currentReadback()));setInitial(commandPurchaseSnapshot(bridge.currentReadback()));setRevision(n=>n+1);setAccess(a=>({...a,requiresFreshRead:false}));setError('');};
  qa.revoke=()=>setAccess(a=>({...a,canRead:false,canSaveDraft:false,canSubmit:false,canReconcile:false,authorityKey:'two'}));
  qa.restore=()=>setAccess(a=>({...a,canRead:true,canSaveDraft:true,canSubmit:true,canReconcile:true,authorityKey:'three'}));
  qa.swapAdapter=()=>setAdapter({...bridge.adapter});
  qa.selectOther=()=>{const d=clone(first);d.document.purchaseRequestId='QA-OTHER';d.document.header.notes='OTHER DOCUMENT';setInitial(commandPurchaseSnapshot(d));};
  qa.newSession=()=>{bridge.retire();const d=clone(first);d.document.header.notes='NEW ACCOUNT';const next=createPurchaseCommandAdapter('b'.repeat(64),d,transport);setBridge(next);setAdapter(next.adapter);setInitial(commandPurchaseSnapshot(d));setAccess(a=>({...a,scopeKey:'b'.repeat(64),authorityKey:'new-session'}));};
  return <><button onClick={()=>request(()=>setVisible(false))}>Rời phiếu thử nghiệm</button>{error&&<p role='alert'>{error}</p>}<p data-testid='receipt'>{receipt}</p>{visible&&<MobileRequest initial={initial} access={access} adapter={adapter} readRevision={revision} onConfirmed={(snap,id)=>{setReceipt(id);setInitial(old=>old.documentId===snap.documentId?snap:old);setAccess(a=>({...a,requiresFreshRead:true}));}}/>}</>;
 }createRoot(document.getElementById('root')).render(<NavigationGuardProvider><Harness/></NavigationGuardProvider>);`;
 await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:path.join(output,'i20-mobile-browser.js'),bundle:true,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning'});
 const bundle=await readFile(path.join(output,'i20-mobile-browser.js'));
 const server=createServer((request,response)=>{if(serveLocalFont(request,response))return;if(request.url==='/browser.css'){response.writeHead(200,{'Content-Type':'text/css'});return response.end(css);}
  if(request.url==='/browser.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/browser.js"></script></html>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');let browser,context,page;const errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  const origin=`http://localhost:${server.address().port}`;await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  async function reset(){await page.goto(origin);await page.getByRole('form',{name:'Đề nghị mua hàng trên điện thoại'}).waitFor();}
  async function edited(mode='commit'){await reset();await page.evaluate(m=>window.qa.mode=m,mode);await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).fill('MOBILE EDIT');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();}
  async function save(){await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).click();}
  await t.test('dirty Submit disabled, separate Save then Submit uses receipt token and no Add',async()=>{
   await edited();assert.ok(await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).isDisabled());await save();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Gửi đề nghị',exact:true}).click();await page.getByText('ERP đã xác nhận gửi phiếu',{exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.qa.calls);assert.deepEqual(calls.map(c=>c.route),['save','submit']);assert.equal(JSON.parse(calls[1].body).expectedStateToken,'prs1.'+'2'.repeat(64));assert.equal(JSON.parse(calls[0].body).header.purchaseDate,fixture.document.header.purchaseDate);
  });
  await t.test('double tap and navigation guard keep one unresolved request',async()=>{
   await edited('hold');await page.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).evaluate(el=>{el.click();el.click();});await page.waitForFunction(()=>window.qa.calls.length===1);
   await page.getByRole('button',{name:'Rời phiếu thử nghiệm',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
   await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.evaluate(()=>window.qa.release());await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
  });
  await t.test('lost ACK and all eight negative lookup outcomes preserve exact body, only Committed clears',async()=>{
   await edited('lost');await save();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();
   for(const n of [1,2,3,4,5,6,7,8]){await page.evaluate(value=>window.qa.outcome=value,n);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qa.pending()),true);}
   await page.evaluate(()=>window.qa.outcome=0);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.qa.calls);assert.equal(calls.filter(c=>c.route==='save').length,1);assert.ok(calls.every(c=>c.body===calls[0].body));assert.equal(await page.evaluate(()=>window.qa.pending()),false);
  });
  await t.test('confirmed receipt remains after refresh error; edits require successful fresh read',async()=>{
   await edited();await save();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();const id=await page.getByTestId('receipt').innerText();await page.evaluate(()=>window.qa.refreshFailure());await page.getByText('Synthetic refresh failed',{exact:true}).waitFor();assert.equal(await page.getByTestId('receipt').innerText(),id);
   assert.ok(await page.getByRole('button',{name:'Quay lại chỉnh sửa',exact:true}).isDisabled());await page.evaluate(()=>window.qa.readAgain());await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).inputValue(),'MOBILE EDIT');assert.ok(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).isEnabled());
   assert.ok(await page.getByRole('button',{name:'Thêm dòng hàng',exact:true}).isDisabled());assert.ok(await page.getByLabel('Ngày đề nghị',{exact:true}).isDisabled());assert.equal(await page.getByRole('combobox',{name:'Chi nhánh'}).count(),0);
  });
  await t.test('authority revocation discards late ACK but retains original for authorized lookup',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.revoke());await page.getByText('Đăng nhập bằng tài khoản được cấp quyền để mở phiếu.',{exact:true}).waitFor();await page.evaluate(()=>window.qa.release());assert.equal(await page.evaluate(()=>window.qa.raw().stateToken),'prs1.'+'1'.repeat(64));await page.evaluate(()=>{window.qa.restore();window.qa.outcome=0;});await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
  });
  await t.test('adapter replacement cannot adopt old ACK or resend through a replacement adapter',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.swapAdapter());await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();await page.evaluate(()=>window.qa.release());assert.ok(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).isDisabled());assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
  });
  await t.test('external document switch queues selection without moving old receipt to the new document',async()=>{
   await edited('lost');await save();await page.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();await page.evaluate(()=>window.qa.selectOther());await page.getByRole('region',{name:'Chờ xác nhận phiếu trước',exact:true}).waitFor();await page.evaluate(()=>window.qa.outcome=0);await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await page.getByText('QA-OTHER',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).inputValue(),'OTHER DOCUMENT');
  });
  await t.test('true session boundary retires old in-flight receipt',async()=>{
   await edited('hold');await save();await page.waitForFunction(()=>typeof window.qa.release==='function');await page.evaluate(()=>window.qa.newSession());await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).inputValue(),'NEW ACCOUNT');await page.evaluate(()=>window.qa.release());assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).inputValue(),'NEW ACCOUNT');assert.equal(await page.getByTestId('receipt').innerText(),'');
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'i20-react-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],transport:'explicit Node-free browser double; NOT ASP.NET/SQL',errors},null,2));
 }finally{await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

// I20 custody regression: mount the REAL Workspace (not just MobileRequest or a
// test-owned workspace prop). Its background getWorkspace failure must actually
// set workspace=null. HTTP responses are synthetic; this is not ASP.NET/SQL.
test('I20 Workspace custody across unverified authority / actual React mobile hierarchy', {timeout:180000}, async t=>{
 const qaRoot=process.env.MEDCOM_BROWSER_TOOLCHAIN;let chromium;
 try{({chromium}=(qaRoot?createRequire(path.join(path.resolve(qaRoot),'package.json')):createRequire(import.meta.url))('playwright-core'));}
 catch{throw Error('Required installed playwright-core unavailable for Workspace custody regression; NOT_RUN, no skip.');}
 const {bundle,css}=await compileCustodyBrowser();
 const lifetime={idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()};
 const access={canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'synthetic_only_NOT_runtime_qualified'};
 const calls=[],errors=[],dispatchEvidence=new Map();let state;
 function reset(mode){
  state={failure:null,retryOutcome:null,readerFailure:null,scope,sessionScope:'a'.repeat(64),displayName:'SYNTHETIC CUSTODY ACCOUNT A',lifetime:{...lifetime},canRead:true,
   saveMode:mode,record:document('QA-CUSTODY','QA-A',2),stateToken:'prs1.'+'1'.repeat(64),originalBody:null,receipt:null,
   releaseSave:null,holdScope:false,scopeStarted:null,releaseScope:null,holdWorkspace:false,releaseWorkspace:null,holdLogin:false,releaseLogin:null,effects:0};calls.length=0;
 }
 function workspace(){return{session:{displayName:state.displayName,tenantId:'qa-tenant',companyId:'qa-company',companyName:'SYNTHETIC COMPANY',authorityVersion:1,...state.lifetime,capabilities:state.canRead?['purchase-requests.read']:[]},
  navigation:state.canRead?[{id:'purchase-requests',label:'Đề nghị mua hàng',href:'/workspace/?screen=purchase-requests'}]:[],branchIds:['QA-A']};}
 const json=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
 const server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost'),route=url.pathname;
   if(route==='/custody.css'){response.writeHead(200,{'Content-Type':'text/css'});return response.end(css);}
   if(route==='/custody.js'){response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(bundle);}
   if(!route.startsWith('/api/erp/')){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/custody.css"><div id="root"></div><script src="/custody.js"></script></html>');}
   const p=route.slice('/api/erp'.length),parts=[];for await(const part of request)parts.push(part);const body=Buffer.concat(parts).toString('utf8');
   calls.push({path:p,method:request.method,body,scope:request.headers['x-purchase-scope']??null,idempotencyKey:p.startsWith('/api/purchase-requests/')&&body?JSON.parse(body).idempotencyKey??null:null});
   if(p==='/health/ready')return json(response,503,{status:'unavailable',checks:[{component:'business_release',status:'not_configured'}]});
   if(p==='/health/live')return json(response,200,{status:'healthy'});
   if(p==='/api/auth/csrf')return json(response,200,{token:'synthetic-custody-csrf'});
   if(p==='/api/auth/login'){assert.equal(request.method,'POST');if(state.holdLogin)await new Promise(resolve=>{state.releaseLogin=resolve;});return json(response,200,workspace().session);}
   if(p==='/api/workspace'){
    const explicitRetry=request.method==='GET'&&request.headers['x-synthetic-workspace-retry']==='1',failure=custodyWorkspaceFailure(state,explicitRetry),answer=workspace();
    Object.assign(calls.at(-1),{explicitRetry,outcome:failure??200});
    response.setHeader('X-Medcom-Session-Scope',state.sessionScope);response.setHeader('X-Medcom-Read-Scope',state.scope);
    if(state.holdWorkspace)await new Promise(resolve=>{state.releaseWorkspace=resolve;});
    if(failure==='network'){response.destroy();return;}
    if(failure===503||failure===401)return json(response,failure,{code:failure===401?'authentication_required':'identity_unavailable'});
    return json(response,200,answer);
   }
   if(state.failure===401)return json(response,401,{code:'authentication_required'});
   const scoped=data=>({scopeKey:state.scope,data});
   if(p==='/api/purchase-requests/workspace'){
    if(state.readerFailure===401)return json(response,401,{code:'authentication_required'});
    if(state.holdScope){state.scopeStarted?.();await new Promise(resolve=>{state.releaseScope=resolve;});}
    return json(response,200,scoped({branchIds:['QA-A'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}));
   }
   if(p==='/api/purchase-requests'){
    const d=state.record;return json(response,200,scoped({rows:[{documentId:d.purchaseRequestId,purchaseDate:d.header.purchaseDate,branchId:d.branchId,personSuggest:d.header.personSuggest,department:d.header.department,statusId:d.statusId,isLocked:d.isLocked}],page:Number(url.searchParams.get('page')||1),pageSize:20,hasMore:false}));
   }
   if(p==='/api/purchase-requests/detail')return json(response,200,scoped({document:state.record,stateToken:state.stateToken,commandAccess:access}));
   if(p==='/api/purchase-requests/lookup')return json(response,200,scoped({available:false,reason:'source_binding_unqualified',items:[],page:1,hasMore:false}));
   if(p==='/api/purchase-requests/save'){
    assert.equal(request.method,'POST');assert.equal(request.headers['x-csrf-token'],'synthetic-custody-csrf');assert.equal(request.headers['x-purchase-scope'],state.scope);
    assert.equal(state.originalBody,null,'writer must be called at most once in this scenario');state.originalBody=body;
    const dto=JSON.parse(body),desired=structuredClone(state.record);desired.header=structuredClone(dto.header);
    for(const change of dto.lineChanges){assert.notEqual(change.kind,'Add');if(change.kind==='Remove')desired.lines=desired.lines.filter(line=>line.lineId!==change.lineId);else{const line=desired.lines.find(line=>line.lineId===change.lineId);assert.ok(line);line.values=structuredClone(change.values);}}
    state.effects++;state.record=desired;state.stateToken='prs1.'+'2'.repeat(64);state.receipt={actionId:'purchase-request.save-draft',idempotencyKey:dto.idempotencyKey,document:structuredClone(desired),stateToken:state.stateToken,allocatedLines:[]};
    const answer=scoped({outcome:0,receipt:structuredClone(state.receipt)});
    if(state.saveMode==='lost'){response.setHeader('X-Synthetic-Lost-Ack','discard-completed-response');return json(response,200,answer);}
    await new Promise(resolve=>{state.releaseSave=resolve;});return json(response,200,answer);
   }
   if(p==='/api/purchase-requests/save/lookup'){
    assert.equal(request.method,'POST');assert.equal(request.headers['x-purchase-scope'],state.scope);
    assert.equal(body,state.originalBody,'lookup must use the EXACT original JSON, including key and pre-save token');
    return json(response,200,scoped({outcome:0,receipt:state.receipt}));
   }
   return json(response,404,{code:'endpoint_unavailable'});
  }catch(error){errors.push(String(error));if(!response.headersSent)json(response,500,{code:'synthetic_fixture_failure'});else response.destroy();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://localhost:${server.address().port}`;let browser,context,page;
 const writers=()=>calls.filter(call=>['/api/purchase-requests/save','/api/purchase-requests/submit'].includes(call.path));
 const lookups=()=>calls.filter(call=>call.path==='/api/purchase-requests/save/lookup');
 async function assertSingleWriter(){
  const io=await page.evaluate(()=>window.custodyIO),http=writers(),fetches=io.fetches.filter(call=>['/api/erp/api/purchase-requests/save','/api/erp/api/purchase-requests/submit'].includes(call.path));
  const diagnostics=JSON.stringify({executes:io.executes,fetches,http,effects:state.effects});
  assert.equal(io.executes.length,1,diagnostics);assert.equal(fetches.length,1,diagnostics);assert.equal(http.length,1,diagnostics);assert.equal(state.effects,1,diagnostics);
  const key=JSON.parse(state.originalBody).idempotencyKey;
  assert.deepEqual(io.executes,[{intentId:key,action:'saveDraft'}]);assert.equal(fetches[0].body,state.originalBody);assert.equal(fetches[0].idempotencyKey,key);assert.equal(http[0].body,state.originalBody);assert.equal(http[0].idempotencyKey,key);
  const clientLookups=io.fetches.filter(call=>call.path.endsWith('/save/lookup'));
  assert.equal(clientLookups.length,lookups().length,diagnostics);
  for(const call of [...clientLookups,...lookups()]){assert.equal(call.body,state.originalBody);assert.equal(call.idempotencyKey,key);}
  if(state.saveMode==='lost'){assert.equal(io.discarded,1);assert.equal(io.rejected,0);}
  dispatchEvidence.set(key,{transport:'completed-response discard / abort-ignoring save seams; synthetic HTTP only',executes:io.executes,fetches:io.fetches,http:[...http,...lookups()],effects:state.effects,discarded:io.discarded});
 }
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 let screen;
 async function begin(mode,{expiry,focusOnly=false}={}){
  state?.releaseSave?.();state?.releaseScope?.();state?.releaseWorkspace?.();state?.releaseLogin?.();await context?.close();reset(mode);
  const now=Date.now();if(expiry){const soon=new Date(now+30000).toISOString(),far=new Date(now+300000).toISOString();state.lifetime={idleExpiresAt:expiry==='idle'?soon:far,absoluteExpiresAt:expiry==='absolute'?soon:far};}
  context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();await page.addInitScript(installPurchaseDetailFocusObserver);page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  if(expiry)await page.clock.install({time:new Date(now)});
  await page.goto(origin+'/?screen=purchase-requests');screen=page.locator('section[aria-label="Danh sách đề nghị mua hàng"]');
  // Let both the initial and the real Workspace background authority read settle.
  await screen.getByRole('button',{name:'Mở đề nghị QA-CUSTODY',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');await screen.getByLabel('Tìm mã đề nghị',{exact:true}).fill('FILTER-CUSTODY');await screen.getByRole('button',{name:'Mở đề nghị QA-CUSTODY',exact:true}).click();
  await screen.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).fill('SYNTHETIC ORIGINAL INTENT — giữ NULL/time/18 digits');
  await page.evaluate(()=>{window.custodyNodes={host:document.querySelector('[aria-label="Danh sách đề nghị mua hàng"]'),editor:document.querySelector('[aria-label="Phiếu mua hàng hiện có"]')};});
  if(focusOnly)return;
  await screen.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/purchase-requests/save');
  await screen.getByRole('button',{name:'Lưu nháp trên ERP',exact:true}).evaluate(button=>{button.click();button.click();});await sent;
  if(mode==='lost')await screen.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();
  else await screen.getByText('Đang gửi yêu cầu…',{exact:true}).waitFor();
  // Request arrival precedes the synthetic handler's body read by a microtask.
  const deadline=Date.now()+5000;while(!state.originalBody){assert.ok(Date.now()<deadline,'synthetic writer did not receive original DTO');await new Promise(resolve=>setTimeout(resolve,1));}
  await assertSingleWriter();return {body:state.originalBody,dto:JSON.parse(state.originalBody)};
 }
 async function continueGuard(){
  const guard=page.getByRole('alertdialog');await guard.waitFor({state:'visible'});
  assert.equal(await guard.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
  await guard.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await guard.waitFor({state:'hidden'});
 }
 async function assertProtectedConcealed(){
  assert.equal(await screen.isVisible(),false,'same-session gate hides the retained purchase host');
  assert.equal(await page.evaluate(()=>window.custodyNodes.host===document.querySelector('[aria-label="Danh sách đề nghị mua hàng"]')&&window.custodyNodes.editor===document.querySelector('[aria-label="Phiếu mua hàng hiện có"]')),true,'outage preserves the exact host/editor nodes');
  assert.equal(await screen.locator('input:visible,textarea:visible,select:visible,table:visible,button:visible').count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/SYNTHETIC ORIGINAL INTENT|SYNTHETIC REQUESTER|QA-L001/);
  assert.equal(await page.locator('.mobile-bottom-nav button:visible').count(),0);
  for(let index=0;index<4;index++){await page.keyboard.press('Tab');assert.equal(await screen.evaluate(element=>element.contains(document.activeElement)),false,'hidden protected controls cannot receive keyboard focus');}
 }
 async function guardExplicitOutageNavigation(){
  await page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true}).waitFor();await paint();
  assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests','a transient outage keeps the intended route');
  assert.equal(await page.getByRole('alertdialog').count(),0,'queued warning is concealed until proof returns');
  await assertProtectedConcealed();await page.keyboard.press('Control+k');
  assert.equal(await page.getByRole('dialog').count(),0,'the full gate suppresses command/detail dialogs');
  // Programmatic challenge of the real mounted background navigation handler.
  // The modal/gate prevents ordinary pointer access; this is not user reachability.
  await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Không gian làm việc',exact:true,includeHidden:true}).evaluate(button=>button.click());
  assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
 }
 async function suspend(failure){
  // Queue a real navigation choice while authority is still live. The selected
  // detail blocks background pointer access, so activate its mounted handler explicitly.
  await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Không gian làm việc',exact:true}).evaluate(button=>button.click());
  await page.getByRole('alertdialog').waitFor();
  assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
  state.failure=failure;
  const failed=failure==='network'?page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname==='/api/erp/api/workspace'):
   page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===503);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await failed;
  await guardExplicitOutageNavigation();
 }
 async function recoverSame(){
  state.holdScope=true;state.releaseScope=null;
  await retryWorkspace(null);
  // The server-side hold below proves scoped-request arrival. Do not arm a
  // second independent timeout before Retry: it can fail the subtest while
  // retryWorkspace is still gathering the original failure's diagnostics.
  const deadline=Date.now()+5000;while(!state.releaseScope){assert.ok(Date.now()<deadline,'synthetic scope verification did not start');await new Promise(resolve=>setTimeout(resolve,1));}await paint();
  assert.equal(state.retryOutcome,null,'the explicit retry must consume its planned recovery before scoped proof begins');
  assert.equal(await screen.locator('input:visible,textarea:visible,select:visible,table:visible').count(),0,'a workspace 200 alone must NOT expose the old scope');
  assert.equal(lookups().length,0);await assertSingleWriter();
  state.holdScope=false;state.releaseScope();
  // The exact warning queued before the outage must survive, then explicit Cancel
  // keeps the route and original custody instead of silently executing navigation.
  await continueGuard();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
  assert.equal(await page.evaluate(()=>window.custodyNodes.host===document.querySelector('[aria-label="Danh sách đề nghị mua hàng"]')&&window.custodyNodes.editor===document.querySelector('[aria-label="Phiếu mua hàng hiện có"]')),true,'same-session recovery retains exact host/editor identity');
  assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'FILTER-CUSTODY','same-session parent recovery preserves local filter only after scope revalidation');
  assert.equal(await screen.getByText(/^ERP đã xác nhận yêu cầu /).count(),0,'late ACK must not resolve retained unknown');
 }
 async function retryWorkspace(failure){
  // Tab coverage can return focus from browser chrome and trigger a real parent
  // refresh. Keep the old outage until the actual click dispatches its request;
  // clearing it before Playwright clicks can remove Retry via auto-recovery.
  let stage='restore recovery focus';
  try{
   const retry=page.getByRole('button',{name:'Thử lại',exact:true});
   // Tab coverage deliberately exercises the browser's focus boundary. Restore
   // window/content focus while the old outage is still active; otherwise the
   // pointer's focus event can replace Retry between pointerdown and click.
   await page.bringToFront();await retry.waitFor();await retry.focus();
   await page.waitForFunction(()=>document.hasFocus()&&window.custodyWorkspaceIO.requests.every(request=>request.status!=='pending')&&[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Thử lại'&&button.getClientRects().length>0));
   await paint();await retry.focus();
   await page.waitForFunction(()=>document.hasFocus()&&document.activeElement?.textContent?.trim()==='Thử lại'&&window.custodyWorkspaceIO.requests.every(request=>request.status!=='pending'));
   assert.equal(state.retryOutcome,null,'the previous explicit retry must have been consumed');
   state.retryOutcome={failure};
   stage='dispatch explicit Workspace retry';
   const dispatched=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/workspace'&&request.headers()['x-synthetic-workspace-retry']==='1');
   const [,request]=await Promise.all([retry.click(),dispatched]);
   stage='receive explicit Workspace retry';
   const response=await request.response();assert.ok(response,'the exact Retry request must receive its planned HTTP response');
   assert.equal(response.status(),failure??200);assert.equal(await response.finished(),null);
  }
  catch(error){
   // Node subtest failures do not throw through the outer parent try/catch.
   // Emit the actual stage evidence here so both hosted OS logs retain it.
   const diagnostic={stage,error:String(error),retryOutcome:state.retryOutcome,calls:calls.filter(call=>call.path==='/api/workspace'),workspaceIO:await page.evaluate(()=>window.custodyWorkspaceIO).catch(()=>null),body:await page.locator('body').innerText().catch(()=>null)};
   t.diagnostic(JSON.stringify(diagnostic));await writeFile(path.join(output,'i20-workspace-custody-failure.json'),JSON.stringify(diagnostic,null,2));
   throw error;
  }
 }
 try{
  browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-component-update','--disable-default-apps','--no-default-browser-check']});
  await t.test('I33 same-document focus keeps the dirty guard; Cancel stays and accepted Close returns to recreated Open',async()=>{
   await begin('hold',{focusOnly:true});
   const notes=screen.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}),original=await notes.inputValue();
   // Programmatic same-document activation; the selected modal blocks the background list.
   await page.keyboard.press('Control+k');assert.equal(await page.locator('.command-modal:visible').count(),0);
   const beforeSameDocument=await page.evaluate(()=>window.purchaseDetailFocuses);await screen.getByRole('button',{name:'Mở đề nghị QA-CUSTODY',exact:true}).evaluate(button=>button.click());
   await page.waitForFunction(()=>{const editor=document.querySelector('[aria-label="Phiếu mua hàng hiện có"]');return !!editor&&document.activeElement===editor.closest('.request-detail-dialog[role="dialog"]');});assert.equal(await page.evaluate(()=>window.purchaseDetailFocuses),beforeSameDocument+1,'Accepted same-document focus adds exactly one owned-frame call');
   assert.equal(await notes.inputValue(),original);assert.equal(await page.getByRole('alertdialog').count(),0);
   assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true,'same-document focus must preserve the real dirty guard');
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await page.getByRole('alertdialog').waitFor();
   await page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});await paint();assert.equal(await notes.inputValue(),original);
   assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).isVisible(),true);
   await screen.getByRole('button',{name:'Đóng đề nghị',exact:true}).click();await page.getByRole('alertdialog').waitFor();
   await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement?.matches('[aria-label="Mở đề nghị QA-CUSTODY"]'));
   assert.equal(await screen.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);assert.equal(writers().length,0);
   assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'FILTER-CUSTODY');
  });
  for(const mode of ['lost','hold'])for(const failure of ['network',503])await t.test(`Save ${mode} → background ${failure} → same session → exact original lookup`,async()=>{
   const original=await begin(mode);await suspend(failure);
   if(mode==='hold'){state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();assert.ok(await page.evaluate(()=>window.custodyIO.aborted>=1));}
   assert.equal(lookups().length,0);await assertSingleWriter();
   await recoverSame();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();
   await screen.getByText(`ERP đã xác nhận yêu cầu ${original.dto.idempotencyKey}. Receipt vẫn được giữ khi đọc lại thất bại.`,{exact:true}).waitFor();
   assert.equal(lookups().length,1);assert.equal(lookups()[0].body,original.body);assert.deepEqual(JSON.parse(lookups()[0].body),original.dto);
   assert.equal(JSON.parse(lookups()[0].body).expectedStateToken,'prs1.'+'1'.repeat(64),'do not rebuild from fresh detail token 2');await assertSingleWriter();
  });
  await t.test('repeated failed verification preserves custody; recovery still uses the original writer body',async()=>{
   const original=await begin('lost');await suspend('network');
   await retryWorkspace(503);await guardExplicitOutageNavigation();await paint();
   await assertProtectedConcealed();await assertSingleWriter();assert.equal(lookups().length,0);
   await recoverSame();await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await screen.getByText(/^ERP đã xác nhận yêu cầu /).waitFor();assert.equal(lookups()[0].body,original.body);await assertSingleWriter();
  });
  await t.test('repeated null and verified transitions retain one reader and exact original intent until lookup',async()=>{
   const original=await begin('lost');
   for(const failure of [503,'network',503]){
    await suspend(failure);await recoverSame();await assertSingleWriter();assert.equal(lookups().length,0);
   }
   await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await screen.getByText(/^ERP đã xác nhận yêu cầu /).waitFor();
   assert.equal(lookups().length,1);assert.equal(lookups()[0].body,original.body);assert.deepEqual(JSON.parse(lookups()[0].body),original.dto);await assertSingleWriter();
  });
  for(const change of ['server-session','opaque-scope'])await t.test(`verified ${change} after null retires prior data and delayed ACK`,async()=>{
   await begin('hold');await suspend(503);state.scope='b'.repeat(64);state.displayName='SYNTHETIC ACCOUNT B';
   if(change==='server-session')state.sessionScope='c'.repeat(64);
   state.record=document('QA-NEW-ACCOUNT','QA-A',1);state.record.header.personSuggest='SYNTHETIC NEW ACCOUNT ONLY';state.stateToken='prs1.'+'3'.repeat(64);
   await retryWorkspace(null);await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-ACCOUNT',exact:true}).waitFor();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await screen.getByText(/^ERP đã xác nhận yêu cầu /).count(),0);
   assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|SYNTHETIC REQUESTER|QA-CUSTODY/);await assertSingleWriter();assert.equal(lookups().length,0);
   await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-ACCOUNT',exact:true}).click();await screen.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).waitFor();assert.equal(await screen.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).inputValue(),'');
  });
  await t.test('confirmed server logout (401), unlike 503, retires original intent before a delayed ACK',async()=>{
   await begin('hold');await suspend(503);
   await retryWorkspace(401);await paint();
   // A confirmed end retires protected custody while preserving the intended return route.
   await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).waitFor();
   async function assertRetired(){
    assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
    await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Tên đăng nhập',{exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'Đăng nhập',exact:true}).isVisible(),true);
    assert.equal(await page.locator('[aria-label="Danh sách đề nghị mua hàng"],[aria-label="Phiếu mua hàng hiện có"]').count(),0);
    assert.equal(await page.getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);
    assert.doesNotMatch(await page.locator('body').textContent(),/SYNTHETIC ORIGINAL INTENT|SYNTHETIC REQUESTER|QA-CUSTODY|ERP đã xác nhận yêu cầu/);
    assert.equal(await page.getByRole('alertdialog').count(),0);
    assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false,'ended session must unregister the old unresolved-intent navigation guard');
    await assertSingleWriter();assert.equal(lookups().length,0);
   }
   await assertRetired();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   await assertRetired();
  });
  await t.test('same-session recovery restores parent polling; focus refresh re-verifies current read authority before lookup',async()=>{
   const original=await begin('lost');await suspend(503);await recoverSame();
   state.canRead=false;
   const deniedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await deniedRefresh;await paint();
   assert.equal(await screen.isVisible(),false,'rights loss conceals the retained unresolved host');
   assert.equal(await screen.locator('input:visible,textarea:visible,select:visible,table:visible').count(),0);assert.equal(lookups().length,0);await assertSingleWriter();
   state.canRead=true;
   const allowedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await allowedRefresh;
   await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).waitFor();
   await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).click();await screen.getByText(/^ERP đã xác nhận yêu cầu /).waitFor();
   assert.equal(lookups().length,1);assert.equal(lookups()[0].body,original.body);assert.deepEqual(JSON.parse(lookups()[0].body),original.dto);await assertSingleWriter();
  });
  for(const expiry of ['idle','absolute'])await t.test(`${expiry} expiry after same-session recovery retires custody and rejects a delayed ACK`,async()=>{
   await begin('hold',{expiry});const originalLifetime={...state.lifetime};await suspend(503);await recoverSame();
   assert.deepEqual(state.lifetime,originalLifetime,'the original idle/absolute tuple must remain unchanged through recovery');
   await page.clock.fastForward(30000);
   await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).waitFor({timeout:5000});await paint();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);assert.equal(await page.getByText('QA-CUSTODY',{exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  await t.test('completed login survives the previous deadline while the new Workspace read is delayed',async()=>{
   await begin('hold',{expiry:'idle'});const previousLimit=Date.parse(state.lifetime.idleExpiresAt);await suspend(503);
   // A transient outage is recovery only. Obtain current 401 retirement before a new login.
   await retryWorkspace(401);await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).waitFor();
   state.failure=null;state.holdWorkspace=true;state.holdLogin=true;state.scope='b'.repeat(64);state.displayName='SYNTHETIC NEW LOGIN';
   state.lifetime={idleExpiresAt:new Date(previousLimit+300000).toISOString(),absoluteExpiresAt:new Date(previousLimit+600000).toISOString()};
   state.record=document('QA-NEW-LOGIN','QA-A',1);state.stateToken='prs1.'+'3'.repeat(64);
   await page.getByLabel('Tên đăng nhập',{exact:true}).fill('synthetic-login');await page.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');
   const posted=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/auth/login');
   await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await posted;
   const loginDeadline=Date.now()+5000;while(!state.releaseLogin){assert.ok(Date.now()<loginDeadline,'held successful login POST did not start');await new Promise(resolve=>setTimeout(resolve,1));}
   assert.equal(await screen.count(),0,'POST in flight cannot restore the retired editor');
   const started=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/erp/api/workspace');
   state.holdLogin=false;state.releaseLogin();await started;
   await page.getByRole('heading',{name:'Đang xác minh phiên làm việc…',exact:true}).waitFor();
   const deadline=Date.now()+5000;while(!state.releaseWorkspace){assert.ok(Date.now()<deadline,'new login Workspace read did not start');await new Promise(resolve=>setTimeout(resolve,1));}
   await page.clock.fastForward(30000);await paint();
   assert.equal(await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).count(),0,'old deadline must not expire a completed login');
   assert.equal(await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-LOGIN',exact:true}).count(),0,'new authority still waits for the held read');
   state.holdWorkspace=false;state.releaseWorkspace();await screen.getByRole('button',{name:'Mở đề nghị QA-NEW-LOGIN',exact:true}).waitFor();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).count(),0);
   assert.equal(await screen.getByLabel('Tìm mã đề nghị',{exact:true}).inputValue(),'');assert.equal(await screen.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);
   assert.doesNotMatch(await screen.innerText(),/SYNTHETIC ORIGINAL INTENT|QA-CUSTODY/);assert.equal(new URL(page.url()).searchParams.get('screen'),'purchase-requests');
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  await t.test('reader 401 after parent recovery ends the session, clears filter/selection and fences the delayed ACK',async()=>{
   await begin('hold');await suspend(503);await recoverSame();state.readerFailure=401;
   const reader401=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/purchase-requests/workspace'&&response.status()===401);
   const parentRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/erp/api/workspace'&&response.status()===200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await parentRefresh;await reader401;await page.getByRole('heading',{name:'Phiên làm việc đã kết thúc',exact:true}).waitFor();await paint();
   state.releaseSave();await page.waitForFunction(()=>window.custodyIO.replies===1);await paint();
   assert.equal(await page.getByLabel('Tìm mã đề nghị',{exact:true}).count(),0);assert.equal(await page.getByText('QA-CUSTODY',{exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Kiểm tra kết quả yêu cầu gốc',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Phiếu mua hàng hiện có',exact:true}).count(),0);
   await assertSingleWriter();assert.equal(lookups().length,0);
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'i20-workspace-custody-evidence.json'),JSON.stringify({node:process.version,browser:browser.version(),viewport:[390,844],hierarchy:'actual Workspace → PurchaseRequestScreen → MobileRequest → command adapter',transport:'synthetic HTTP API; completed-response discard and save-only abort-ignoring seams; NOT ASP.NET/SQL',dispatchEvidence:[...dispatchEvidence.values()],errors},null,2));
 }catch(error){await writeFile(path.join(output,'i20-workspace-custody-failure.json'),JSON.stringify({error:String(error),errors,calls,retryOutcome:state?.retryOutcome,workspaceIO:await page?.evaluate(()=>window.custodyWorkspaceIO).catch(()=>null),io:await page?.evaluate(()=>window.custodyIO).catch(()=>null),body:await page?.locator('body').innerText().catch(()=>''),dispatchEvidence:[...dispatchEvidence.values()]},null,2));throw error;}
 finally{state?.releaseSave?.();state?.releaseScope?.();state?.releaseWorkspace?.();state?.releaseLogin?.();await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('healthy verification blocks new actions without retiring a dispatched purchase intent',async()=>{
 // Execute the production dispatch continuations; compiled UI coverage is separate.
 const source=await readFile(path.join(app,'components/erp/mobile-request.tsx'),'utf8');
 const file=ts.createSourceFile('mobile-request.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),bodies=[];let retirementDependencies;
 const visit=node=>{
  if(ts.isFunctionDeclaration(node)&&['send','reconcile'].includes(node.name?.text))bodies.push(node.getText(file));
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useLayoutEffect'&&node.arguments[0]?.getText(file).includes('if(originalIntent.current)'))retirementDependencies=node.arguments[1].getText(file);
  ts.forEachChild(node,visit);
 };visit(file);assert.equal(bodies.length,2);assert.ok(retirementDependencies);assert.doesNotMatch(retirementDependencies,/verifying/);
 const code=ts.transpileModule(bodies.join('\n')+'\n({send,reconcile});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 function fixture(verifying=false){
  let release;const calls=[],accepted=[],reply=new Promise(resolve=>{release=resolve;});
  const access={verifying,canRead:true,existingOnly:true,canSaveDraft:true,canSubmit:true,canReconcile:true};
  const adapter={execute:async(intent,signal)=>{calls.push({kind:'execute',intent,signal});return reply;},reconcile:async(intent,signal)=>{calls.push({kind:'lookup',intent,signal});return reply;}};
  const context={adapter,access,serviceAvailable:true,editable:true,canSubmitExisting:true,originalIntent:{current:null},originalAdapter:{current:adapter},queuedDocument:{current:null},lock:{current:false},pending:false,uncertain:false,phase:'editing',review:true,dirty:true,
   baseline:{documentId:'SYNTHETIC',version:'v1'},values:{lines:[]},validatePurchaseRequest:()=>({}),copy:structuredClone,crypto:{randomUUID:()=> 'synthetic-intent'},generation:{current:0},request:{current:null},currentAccess:{current:access},currentAdapter:{current:adapter},AbortController,
   setErrors(){},setReview(){},setDispatchAdapter(){},setHasUnresolvedIntent(){},setPhase(){},setResult(){},setMessage(){},accept:(next,intent)=>accepted.push({next,intent}),unknown:()=>assert.fail('healthy verification must not fabricate unknown')};
  return{...runInNewContext(code,context),context,calls,accepted,release};
 }
 const blocked=fixture(true);await blocked.send('saveDraft');blocked.context.originalIntent.current={intentId:'existing'};blocked.context.phase='unknown';await blocked.reconcile();assert.deepEqual(blocked.calls,[]);
 const pending=fixture();const sent=pending.send('saveDraft');assert.equal(pending.calls.length,1);const original=pending.context.originalIntent.current;
 pending.context.currentAccess.current={...pending.context.access,verifying:true};pending.release({kind:'confirmed',intentId:original.intentId});await sent;
 assert.equal(pending.calls.length,1);assert.equal(pending.calls[0].signal.aborted,false);assert.equal(pending.accepted.length,1);assert.equal(pending.accepted[0].intent,original);assert.equal(pending.accepted[0].next.kind,'confirmed');
});

// I41 uses the production React screen, API parser and command adapter. Only
// child editor rendering, dirty registration, navigation confirmation and focus are explicit doubles.
// The guard double checks request admission and current acceptance separately before clearing blockers.
// Catalog reference lookups are separately typed, never counted as document-list reads.
// Synthetic fetches below are not browser, BFF, ASP.NET or SQL acceptance.
test('I41 actual React purchase read lifecycles and retained command custody',async t=>{
 const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
 assert.equal(React.version,'19.2.6');assert.equal(require('react-test-renderer/package.json').version,'19.2.6');
 const bundlePath=path.join(output,'i41-react-screen.mjs');
 const bundled=await build({metafile:true,stdin:{contents:"export {PurchaseRequestScreen} from './components/erp/purchase-request-screen';",resolveDir:app,loader:'tsx'},
  outfile:bundlePath,bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':app},logLevel:'warning',
  banner:{js:"import {createRequire as testRequire} from 'node:module';const require=testRequire(import.meta.url);"},
  plugins:[{name:'i41-child-doubles',setup(build){
   build.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:args.kind.startsWith('require-')?require.resolve(args.path):pathToFileURL(require.resolve(args.path)).href,external:true}));
   build.onResolve({filter:/^\.\/(mobile-request|navigation-guard|request-selection-focus)$/},args=>({path:args.path,namespace:'i41-double'}));
   build.onLoad({filter:/.*/,namespace:'i41-double'},args=>({loader:'js',contents:args.path.endsWith('mobile-request')
    ? "import React,{useEffect,useRef} from 'react';export const MobileRequest=props=>{const key=useRef(Symbol('synthetic-editor-dirty'));useEffect(()=>()=>globalThis.i43PurchaseGuard?.blockers.delete(key.current),[]);return React.createElement('synthetic-mobile',{...props,onWorkStateChange:state=>{const blockers=globalThis.i43PurchaseGuard.blockers;if(state.dirty||state.unresolved)blockers.set(key.current,{canDiscard:!state.unresolved});else blockers.delete(key.current);props.onWorkStateChange(state);}});};"
    :args.path.endsWith('navigation-guard')?"const register=(key,value)=>{const state=globalThis.i43PurchaseGuard;if(state){if(value)state.blockers.set(key,value);else state.blockers.delete(key);}};const isBlocked=()=>!!globalThis.i43PurchaseGuard?.queue||!!globalThis.i43PurchaseGuard?.blockers.size;const request=(action,validate)=>{const state=globalThis.i43PurchaseGuard;if(validate&&!validate('request'))return;if(state?.queue||state?.blockers.size)state.pending={action,validate};else if(!validate||validate('accept'))action();};export const useNavigationGuard=()=>({request,register,isBlocked});"
    :"const noop=()=>{},focus={open:noop,close:noop,cancel:noop,row:noop,detail:null,list:null};export const useRequestSelectionFocus=()=>focus;"}));
  }}]});
 const {PurchaseRequestScreen}=await import(pathToFileURL(bundlePath).href);
 const previousFetch=global.fetch,previousAct=globalThis.IS_REACT_ACT_ENVIRONMENT;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const workspace=()=>({session:{displayName:'SYNTHETIC',tenantId:'T',companyId:'C',companyName:'SYNTHETIC',authorityVersion:1,absoluteExpiresAt:'2099-01-01T00:00:00Z',capabilities:['purchase-requests.read']},branchIds:['QA-A','QA-B'],sessionScope:'c'.repeat(64),readScope:'d'.repeat(64),navigation:[]});
 const commandAccess={canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'synthetic'};
 async function host(){
  const guard=globalThis.i43PurchaseGuard={queue:false,pending:null,blockers:new Map()};
  const calls=[],denied=[],planned=[];let renderer,serverScope=scope,branches=['QA-A','QA-B'];
  const docs=[document('QA-000'),document('QA-001','QA-B')];
  const envelope=data=>({scopeKey:serverScope,data});
  let props={workspace:workspace(),loginBoundary:1,sessionEnded:false,onDenied:error=>denied.push(error.status),onLogin(){},onVerifyWorkspace:async()=>{}};
  global.fetch=async(url,init={})=>{
   const target=new URL(url,'https://synthetic.invalid'),p=target.pathname;
   const kind=p.endsWith('/workspace')?'workspace':p.endsWith('/detail')?'detail':p.endsWith('/csrf')?'csrf':p.endsWith('/save/lookup')?'lookup':p.endsWith('/save')?'save':p.endsWith('/lookup')?'reference-lookup':'list';
   const call={kind,query:Object.fromEntries(target.searchParams),signal:init.signal,body:init.body};calls.push(call);
   const index=planned.findIndex(item=>item.kind===kind),plan=index<0?null:planned.splice(index,1)[0];
   let data;
   if(kind==='workspace')data=envelope({branchIds:branches,writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]});
   else if(kind==='list'){const page=Number(target.searchParams.get('page'));data=envelope({rows:docs.filter(d=>branches.includes(d.branchId)).map(d=>({documentId:d.purchaseRequestId,purchaseDate:d.header.purchaseDate,branchId:d.branchId,personSuggest:d.header.personSuggest,department:d.header.department,statusId:1,isLocked:null})),page,pageSize:20,hasMore:page===1});}
   else if(kind==='detail'){const doc=docs.find(d=>d.purchaseRequestId===target.searchParams.get('documentId'));assert.ok(doc);data=envelope({...readback(structuredClone(doc)),commandAccess});}
   else if(kind==='reference-lookup')data=envelope({available:false,reason:'source_binding_unqualified',items:[],page:1,hasMore:false});
   else if(kind==='csrf')data={token:'synthetic-csrf'};
   else data=envelope({outcome:4,receipt:null});
   const answer=structuredClone(plan?.data??data);
   if(plan){plan.call=call;if(plan.hold)await new Promise(resolve=>{plan.release=resolve;});}
   return Response.json(plan?.status?{code:'synthetic_read_error'}:answer,{status:plan?.status??200});
  };
  const flush=async()=>act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
  const render=async patch=>{props={...props,...patch};await act(async()=>{if(renderer)renderer.update(React.createElement(PurchaseRequestScreen,props));else renderer=create(React.createElement(PurchaseRequestScreen,props));});await flush();};
  const buttons=()=>renderer.root.findAllByType('button');
  const button=name=>buttons().find(node=>node.props.children===name||node.props['aria-label']===name);
  const click=async name=>{const node=button(name);assert.ok(node,'button '+name);await act(async()=>node.props.onClick());await flush();};
  const open=id=>click('Mở đề nghị '+id);
  const rows=()=>buttons().filter(node=>node.props['aria-label']?.startsWith('Mở đề nghị '));
  const editor=()=>renderer.root.findAllByType('synthetic-mobile')[0];
  const shown=()=>renderer.root.findAll(node=>node.type==='section'&&node.props['aria-label']==='Phiếu mua hàng hiện có'&&!node.props.hidden).length;
  const hold=(kind,status=null,data)=>{const item={kind,status,data,hold:true};planned.push(item);return item;};
  const fail=(kind,status)=>planned.push({kind,status});
  const release=async item=>{assert.ok(item.release,'held '+item.kind+' began');await act(async()=>item.release());await flush();};
  const counts=()=>Object.fromEntries(['workspace','list','detail','save','lookup'].map(kind=>[kind,calls.filter(c=>c.kind===kind).length]));
  const search=async text=>{await act(async()=>renderer.root.findAllByType('input').find(n=>n.props.maxLength===100).props.onChange({target:{value:text}}));await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));await flush();};
  await render({});
  return {guard,accept:async()=>{const queued=guard.pending;assert.ok(queued);guard.pending=null;guard.queue=false;if(queued.validate&&!queued.validate('accept'))return;if([...guard.blockers.values()].some(value=>!value.canDiscard)){guard.pending=queued;return;}guard.blockers.clear();await act(async()=>queued.action());await flush();},calls,denied,planned,render,flush,click,open,rows,editor,shown,hold,fail,release,counts,search,button,props:()=>props,root:()=>renderer.root,docs,
   scope:value=>serverScope=value,branches:value=>branches=value,close:async()=>{await act(async()=>renderer.unmount());await flush();}};
 }
 try{
  await t.test('portable React imports bind the exact renderer instance',()=>{
   const imports=Object.values(bundled.metafile.outputs).flatMap(o=>o.imports).filter(i=>i.external);
   for(const item of imports)if(!item.kind.startsWith('require-'))assert.equal(new URL(item.path).protocol,'file:');
  });
  await t.test('Open, switch, A→B→A and Close preserve list and workspace request counts',async()=>{
   const f=await host();try{
    assert.deepEqual(f.counts(),{workspace:1,list:1,detail:0,save:0,lookup:0});
    const row=f.rows()[0];await f.open('QA-000');assert.equal(f.shown(),1);assert.ok(f.rows()[0]===row,'verified list row stays mounted');
    await f.open('QA-001');await f.open('QA-000');await f.click('Đóng đề nghị');
    assert.deepEqual(f.counts(),{workspace:1,list:1,detail:3,save:0,lookup:0});assert.ok(f.rows()[0]===row,'verified list row stays mounted');assert.equal(f.editor(),undefined);
    await f.open('QA-000');const current=f.editor();await f.open('QA-000');assert.ok(f.editor()===current,'same-document Open preserves the editor');assert.equal(f.counts().detail,4,'same-document Open is focus only');
   }finally{await f.close();}
  });
  for(const change of ['removed-row','scope','presentation','workspace-null','verifying'])await t.test('I43 R1 queued purchase Open rechecks current '+change+' before accepting discard',async()=>{
   const f=await host();let navigation;try{
    await f.render({registerDetailNavigation:value=>navigation=value});await f.open('QA-000');
    const instance=f.editor(),adapter=instance.props.adapter;await act(async()=>instance.props.onWorkStateChange({dirty:true,unresolved:false}));
    f.guard.queue=true;await act(async()=>navigation.requestOpen('QA-001'));assert.ok(f.guard.pending);
    if(change==='removed-row'){f.docs.splice(1,1);await f.render({workspace:structuredClone(f.props().workspace)});}
    if(change==='scope')await f.render({workspace:{...f.props().workspace,readScope:'e'.repeat(64)}});
    if(change==='presentation')await f.render({presentationAllowed:false});
    if(change==='workspace-null')await f.render({workspace:null});
    if(change==='verifying')await f.render({verifying:true});
    const before=f.counts();await f.accept();assert.equal(navigation.selectedId,'QA-000');assert.strictEqual(f.editor(),instance);assert.strictEqual(f.editor().props.adapter,adapter);assert.deepEqual(f.counts(),before);assert.ok(f.guard.blockers.size,'declined target cannot erase dirty protection');
   }finally{await f.close();}
  });
  await t.test('I43 R1 queued purchase Open still accepts a current same-scope target once',async()=>{
   const f=await host();let navigation;try{await f.render({registerDetailNavigation:value=>navigation=value});await f.open('QA-000');f.guard.queue=true;await act(async()=>navigation.requestOpen('QA-001'));await f.render({workspace:structuredClone(f.props().workspace)});await f.accept();assert.equal(navigation.selectedId,'QA-001');assert.equal(f.counts().save,0);}finally{await f.close();}
  });
  await t.test('I43 typed fixture adapter retains the editor and bridge while presentation is obscured, requiring fresh detail on return',async()=>{
   const f=await host();let navigation;try{
    await f.render({registerDetailNavigation:value=>navigation=value});
    assert.equal(navigation.selectedId,null);
    await act(async()=>navigation.requestOpen('QA-000'));await f.flush();
    assert.equal(navigation.selectedId,'QA-000');const editor=f.editor(),adapter=editor.props.adapter,row=f.rows()[0];
    const before=f.counts();await f.render({presentationAllowed:false});
    assert.ok(f.editor()===editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.ok(f.rows()[0]===row);
    const held=f.hold('detail');await f.render({presentationAllowed:true});assert.equal(f.shown(),0);
    await f.release(held);assert.equal(f.shown(),1);assert.ok(f.editor()===editor);assert.strictEqual(f.editor().props.adapter,adapter);
    assert.equal(f.counts().list,before.list);assert.equal(f.counts().save,0);assert.equal(f.counts().lookup,0);
    await act(async()=>navigation.requestOpen('NOT-IN-CURRENT-LIST'));await f.flush();assert.equal(navigation.selectedId,'QA-000');
    await act(async()=>navigation.requestClose());await f.flush();assert.equal(navigation.selectedId,null);assert.ok(f.rows()[0]===row);
   }finally{await f.close();assert.equal(navigation,null);}
  });
  await t.test('explicit refresh starts selected detail while its independent list is held',async()=>{
   const f=await host();try{
    await f.open('QA-000');const list=f.hold('list');await f.click('Làm mới');
    assert.ok(list.release);assert.deepEqual(f.counts(),{workspace:2,list:2,detail:2,save:0,lookup:0});
    await f.release(list);assert.equal(f.shown(),1);
    await f.search('SYNTHETIC FILTER');assert.equal(f.counts().workspace,3);assert.equal(f.counts().list,3);assert.equal(f.counts().detail,2);
    await f.click('Trang sau');assert.equal(f.counts().list,4);assert.equal(f.calls.filter(c=>c.kind==='list').at(-1).query.page,'2');
    await act(async()=>f.root().findByType('select').props.onChange({target:{value:'QA-A'}}));await f.flush();assert.equal(f.counts().list,5);
   }finally{await f.close();}
  });
  for(const status of [null,401,403,409])for(const boundary of ['close','open','aba','batched-aba','authority','scope','branch','filter','page','login','logout'])
   await t.test('late detail '+(status??'success')+' after '+boundary+' cannot affect newer proof',async()=>{
    const f=await host();try{
     const old=f.hold('detail',status);await f.open('QA-000');assert.ok(old.release);assert.equal(f.rows().length,2);
     if(boundary==='close')await f.click('Đóng đề nghị');
     else if(boundary==='open')await f.open('QA-001');
     else if(boundary==='aba'){await f.open('QA-001');await f.open('QA-000');}
     else if(boundary==='batched-aba'){const b=f.button('Mở đề nghị QA-001'),a=f.button('Mở đề nghị QA-000');await act(async()=>{b.props.onClick();a.props.onClick();});await f.flush();}
     else if(boundary==='authority')await f.render({workspace:structuredClone(f.props().workspace)});
     else if(boundary==='scope')await f.render({workspace:{...f.props().workspace,readScope:'e'.repeat(64)}});
     else if(boundary==='branch')await f.render({workspace:{...f.props().workspace,branchIds:['QA-B']}});
     else if(boundary==='filter')await f.search('OTHER');
     else if(boundary==='page')await f.click('Trang sau');
     else if(boundary==='login')await f.render({loginBoundary:2,workspace:workspace()});
     else await f.render({workspace:null,sessionEnded:true});
     const before=f.counts(),shown=f.shown(),adapter=f.editor()?.props.adapter;assert.equal(old.call.signal.aborted,true);
     await f.release(old);assert.deepEqual(f.denied,[]);assert.deepEqual(f.counts(),before);assert.equal(f.shown(),shown);assert.equal(f.editor()?.props.adapter,adapter);
     if(['close','open','aba','batched-aba'].includes(boundary)){assert.equal(before.workspace,1);assert.equal(before.list,1);}
    }finally{await f.close();}
   });
  for(const status of [401,403,409])await t.test('current detail '+status+' hides the list and selected data',async()=>{
   const f=await host();try{f.fail('detail',status);await f.open('QA-000');assert.equal(f.rows().length,0);assert.equal(f.shown(),0);assert.deepEqual(f.denied,[status]);}finally{await f.close();}
  });
  for(const status of [404,503])await t.test('detail '+status+' keeps the verified list; Close needs no request',async()=>{
   const f=await host();try{f.fail('detail',status);await f.open('QA-000');assert.equal(f.rows().length,2);assert.equal(f.shown(),0);const counts=f.counts();await f.click('Đóng đề nghị');assert.deepEqual(f.counts(),counts);assert.deepEqual(f.denied,[]);}finally{await f.close();}
  });
  await t.test('same-scope observations retain read-only data, hidden recovery waits for a new detail',async()=>{
   const f=await host();try{
    await f.open('QA-000');const bootstrap=f.hold('workspace');await f.render({workspace:structuredClone(f.props().workspace)});
    assert.equal(f.rows().length,2);assert.equal(f.shown(),1);assert.equal(f.editor().props.access.verifying,true);
    await f.release(bootstrap);assert.equal(f.shown(),1);
    const original=f.props().workspace;await f.render({workspace:null});assert.equal(f.rows().length,0);assert.equal(f.shown(),0);
    const detail=f.hold('detail');await f.render({workspace:original});assert.equal(f.rows().length,2);assert.equal(f.shown(),0,'fresh list cannot expose old hidden detail');
    await f.release(detail);assert.equal(f.shown(),1);
   }finally{await f.close();}
  });
  for(const boundary of ['workspace','filter','page','scope','branch'])await t.test('returning to identical '+boundary+' values waits for its new list and detail proof',async()=>{
   const f=await host();try{
    await f.open('QA-000');const original=f.props().workspace;
    if(boundary==='workspace')await f.render({workspace:null});
    else if(boundary==='filter')await f.search('OTHER');
    else if(boundary==='page')await f.click('Trang sau');
    else if(boundary==='scope')await f.render({workspace:{...original,readScope:'e'.repeat(64)}});
    else await f.render({workspace:{...original,branchIds:['QA-B']}});
    const held=f.hold('workspace'),beforeDetail=f.counts().detail;
    if(boundary==='filter')await f.search('');
    else if(boundary==='page')await f.click('Trang trước');
    else await f.render({workspace:original});
    assert.equal(f.rows().length,0);assert.equal(f.shown(),0);assert.equal(f.counts().detail,beforeDetail,'retired bootstrap must not start another detail');
    await f.release(held);assert.equal(f.rows().length,2);
   }finally{await f.close();}
  });
  for(const kind of ['workspace','list'])for(const status of [null,401,403,409])await t.test('late '+kind+' '+(status??'success')+' after a newer workspace cannot replace current data',async()=>{
   const f=await host();try{
    const old=f.hold(kind,status);await f.render({workspace:structuredClone(f.props().workspace)});
    await f.render({workspace:structuredClone(f.props().workspace)});const current=f.rows()[0];await f.release(old);
    assert.ok(f.rows()[0]===current,'late reply cannot replace the current row');assert.deepEqual(f.denied,[]);
   }finally{await f.close();}
  });
  await t.test('an immediate list403 before read-binding commit makes zero detail requests and masks both reads',async()=>{
   const f=await host();try{
    await f.open('QA-000');const before=f.counts();
    // The synthetic transport returns the denial in the same React act turn as
    // bootstrap completion, before its state binding can start the detail effect.
    f.fail('list',403);await f.render({workspace:structuredClone(f.props().workspace)});
    const after=f.counts(),delta=Object.fromEntries(Object.keys(after).map(kind=>[kind,after[kind]-before[kind]]));
    assert.deepEqual(delta,{workspace:1,list:1,detail:0,save:0,lookup:0});
    assert.equal(f.rows().length,0);assert.equal(f.shown(),0);assert.deepEqual(f.denied,[403]);
    await f.flush();assert.deepEqual(f.counts(),after,'early denial cannot schedule a detail or retry later');
   }finally{await f.close();}
  });
  await t.test('current detail denial wins over an independently delayed list success',async()=>{
   const f=await host();try{
    await f.open('QA-000');const list=f.hold('list');f.fail('detail',403);await f.render({workspace:structuredClone(f.props().workspace)});
    assert.equal(f.rows().length,0);await f.release(list);assert.equal(f.rows().length,0);assert.equal(f.shown(),0);assert.deepEqual(f.denied,[403]);
   }finally{await f.close();}
  });
  for(const kind of ['workspace','list'])for(const status of [401,403,409])await t.test('current '+kind+' '+status+' defeats a delayed detail success',async()=>{
   const f=await host();try{
    await f.open('QA-000');const failure=f.hold(kind,status),detail=kind==='list'?f.hold('detail'):null;await f.render({workspace:structuredClone(f.props().workspace)});
    await f.release(failure);assert.equal(f.rows().length,0);assert.equal(f.shown(),0);
    if(detail)await f.release(detail);assert.equal(f.rows().length,0);assert.equal(f.shown(),0);assert.deepEqual(f.denied,[status]);
   }finally{await f.close();}
  });
  for(const status of [403,409])await t.test('current '+status+' preserves the exact unknown original and adapter through recovery',async()=>{
   const f=await host();try{
    await f.open('QA-000');const editor=f.editor(),adapter=editor.props.adapter,snapshot=editor.props.initial;
    const intent={intentId:'12345678-abcd',action:'saveDraft',documentId:snapshot.documentId,expectedVersion:snapshot.version,values:structuredClone(snapshot.values)};intent.values.notes='SYNTHETIC ORIGINAL';
    let result;await act(async()=>{result=await adapter.execute(intent,new AbortController().signal);});assert.equal(result.kind,'unknown');
    const original=f.calls.find(c=>c.kind==='save').body;await f.click('Đóng đề nghị');assert.equal(f.editor().props.adapter,adapter);await f.open('QA-001');assert.equal(f.editor().props.adapter,adapter);
    f.fail('list',status);await f.render({workspace:structuredClone(f.props().workspace)});assert.equal(f.shown(),0);assert.equal(f.editor().props.adapter,adapter);
    await f.render({workspace:structuredClone(f.props().workspace)});assert.equal(f.editor().props.adapter,adapter);assert.equal(f.shown(),1);
    await act(async()=>{result=await adapter.reconcile(intent,new AbortController().signal);});assert.equal(result.kind,'unknown');
    assert.equal(f.calls.find(c=>c.kind==='lookup').body,original);assert.equal(f.counts().save,1);
    await f.click('Đóng đề nghị');assert.equal(f.editor().props.adapter,adapter);assert.equal(f.editor().props.initial.values.notes,snapshot.values.notes);
   }finally{await f.close();}
  });
  await t.test('batched A→B→A cannot display the previously accepted A while its new detail waits',async()=>{
   const f=await host();try{
    await f.open('QA-000');const held=f.hold('detail'),a=f.button('Mở đề nghị QA-000'),b=f.button('Mở đề nghị QA-001');
    await act(async()=>{b.props.onClick();a.props.onClick();});await f.flush();assert.equal(f.shown(),0);assert.equal(f.rows().length,2);
    await f.release(held);assert.equal(f.shown(),1);assert.equal(f.counts().workspace,1);assert.equal(f.counts().list,1);
   }finally{await f.close();}
  });
  await t.test('a GET predating a confirmed ACK retries detail only and preserves the confirmed receipt',async()=>{
   const f=await host();try{
    await f.open('QA-000');const stale=f.hold('detail');await f.render({workspace:structuredClone(f.props().workspace)});
    const editor=f.editor(),adapter=editor.props.adapter,snapshot=editor.props.initial;
    const intent={intentId:'12345678-abcd',action:'saveDraft',documentId:snapshot.documentId,expectedVersion:snapshot.version,values:structuredClone(snapshot.values)};intent.values.notes='CONFIRMED SYNTHETIC';
    const desired=structuredClone(f.docs[0]);desired.header.notes=intent.values.notes;const token='prs1.'+'2'.repeat(64);
    f.planned.push({kind:'save',data:{scopeKey:scope,data:{outcome:0,receipt:{actionId:'purchase-request.save-draft',idempotencyKey:intent.intentId,document:desired,stateToken:token,allocatedLines:[]}}}});
    let saved;await act(async()=>{saved=await adapter.execute(intent,new AbortController().signal);});assert.equal(saved.kind,'confirmed');
    await act(async()=>editor.props.onConfirmed(saved.snapshot,saved.receiptId));
    f.planned.push({kind:'detail',data:{scopeKey:scope,data:{document:desired,stateToken:token,commandAccess}}});
    const counts=f.counts();await f.release(stale);
    assert.equal(f.counts().workspace,counts.workspace);assert.equal(f.counts().list,counts.list);assert.equal(f.counts().detail,counts.detail+1);
    assert.equal(f.editor().props.adapter,adapter);assert.equal(f.editor().props.initial.version,token);assert.equal(f.editor().props.initial.values.notes,intent.values.notes);
    assert.equal(f.root().findAll(n=>n.type==='p'&&String(n.props.children).includes('ERP đã xác nhận yêu cầu')).length,1);
   }finally{await f.close();}
  });
  for(const phase of ['pending','unknown'])await t.test('I43 '+phase+' original survives equivalent-offset and deadline-only session observations',async()=>{
   const f=await host();try{
    await f.open('QA-000');const editor=f.editor(),adapter=editor.props.adapter,snapshot=editor.props.initial;
    const intent={intentId:'12345678-abcd',action:'saveDraft',documentId:snapshot.documentId,expectedVersion:snapshot.version,values:structuredClone(snapshot.values)};
    intent.values.notes='EXPIRY OBSERVATION ORIGINAL';const frozenIntent=JSON.stringify(intent);
    const held=phase==='pending'?f.hold('save'):null;let pending;
    await act(async()=>{pending=adapter.execute(intent,new AbortController().signal);if(!held)await pending;});await f.flush();
    const original=f.calls.find(c=>c.kind==='save').body;
    for(const absoluteExpiresAt of ['2099-01-01T07:00:00+07:00','2099-01-02T00:00:00Z']){
     const workspace=structuredClone(f.props().workspace);workspace.session.absoluteExpiresAt=absoluteExpiresAt;workspace.session.idleExpiresAt='2099-01-01T01:00:00Z';workspace.session.authorityVersion++;
     await f.render({workspace});assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.counts().save,1);assert.equal(f.counts().lookup,0);
     await f.click('Đóng đề nghị');assert.strictEqual(f.editor(),editor);
    }
    if(held)await f.release(held);assert.equal((await pending).kind,'unknown');
    await act(async()=>assert.equal((await adapter.reconcile(intent,new AbortController().signal)).kind,'unknown'));
    assert.equal(f.calls.find(c=>c.kind==='lookup').body,original);assert.equal(JSON.stringify(intent),frozenIntent);assert.equal(f.counts().save,1);assert.strictEqual(f.editor(),editor);
   }finally{await f.close();}
  });
  for(const boundary of ['tenant','company','sessionScope','loginBoundary','sessionEnded'])await t.test('I43 real '+boundary+' retirement still fences a held original and late receipt',async()=>{
   const f=await host();try{
    await f.open('QA-000');const adapter=f.editor().props.adapter,snapshot=f.editor().props.initial;
    const intent={intentId:'12345678-abcd',action:'saveDraft',documentId:snapshot.documentId,expectedVersion:snapshot.version,values:structuredClone(snapshot.values)};
    const held=f.hold('save',null,{scopeKey:scope,data:{outcome:0,receipt:{actionId:'purchase-request.save-draft',idempotencyKey:intent.intentId,document:structuredClone(f.docs[0]),stateToken:'prs1.'+'2'.repeat(64),allocatedLines:[]}}});let pending;
    await act(async()=>{pending=adapter.execute(intent,new AbortController().signal);});await f.flush();
    const workspace=structuredClone(f.props().workspace),patch={workspace};
    if(boundary==='tenant')workspace.session.tenantId='NEW-TENANT';
    if(boundary==='company')workspace.session.companyId='NEW-COMPANY';
    if(boundary==='sessionScope')workspace.sessionScope='e'.repeat(64);
    if(boundary==='loginBoundary')patch.loginBoundary=2;
    if(boundary==='sessionEnded'){patch.sessionEnded=true;patch.workspace=null;}
    await f.render(patch);assert.equal(f.editor(),undefined);await f.release(held);assert.equal((await pending).kind,'unknown');
    const calls=f.calls.length;assert.equal((await adapter.reconcile(intent,new AbortController().signal)).kind,'unknown');assert.equal(f.calls.length,calls);assert.equal(f.editor(),undefined);
   }finally{await f.close();}
  });
  await t.test('current detail 401 retires the original before a held command ACK',async()=>{
   const f=await host();try{
    await f.open('QA-000');const adapter=f.editor().props.adapter,snapshot=f.editor().props.initial;
    const intent={intentId:'12345678-abcd',action:'saveDraft',documentId:snapshot.documentId,expectedVersion:snapshot.version,values:structuredClone(snapshot.values)};
    const save=f.hold('save',null,{scopeKey:scope,data:{outcome:0,receipt:{actionId:'purchase-request.save-draft',idempotencyKey:intent.intentId,document:structuredClone(f.docs[0]),stateToken:'prs1.'+'2'.repeat(64),allocatedLines:[]}}});let pending;await act(async()=>{pending=adapter.execute(intent,new AbortController().signal);});await f.flush();
    f.fail('detail',401);await f.render({workspace:structuredClone(f.props().workspace)});assert.equal(f.editor(),undefined);assert.deepEqual(f.denied,[401]);
    await f.release(save);assert.equal((await pending).kind,'unknown');const count=f.calls.length;assert.equal((await adapter.reconcile(intent,new AbortController().signal)).kind,'unknown');assert.equal(f.calls.length,count);
   }finally{await f.close();}
  });
 }finally{global.fetch=previousFetch;globalThis.IS_REACT_ACT_ENVIRONMENT=previousAct;}
});

// Pure production-adapter tests. Every malformed structural intent is rejected
// before the recording transport; no browser, listener, ERP or SQL is involved.
test('I58 actual existing purchase adapter rejects structural edits before transport', async t => {
 const {commandPurchaseSnapshot,freezePurchaseCommand,createPurchaseCommandAdapter}=await import(pathToFileURL(path.join(output,'i20-command.mjs')).href);
 const signal=()=>new AbortController().signal;
 const raw=count=>readback(document('QA-FIXED','QA-A',count));
 const intent=(r,action='saveDraft')=>({intentId:crypto.randomUUID(),action,documentId:r.document.purchaseRequestId,expectedVersion:r.stateToken,values:commandPurchaseSnapshot(r).values});
 const mutations=[
  ['one original row omitted',i=>{i.values.lines.pop();}],
  ['all original rows omitted',i=>{i.values.lines=[];}],
  ['additional allocated-looking ID',i=>{i.values.lines.push({...i.values.lines[0],localKey:'QA-NEW',lineId:'QA-NEW'});}],
  ['new row without ERP ID',i=>{i.values.lines.push({...i.values.lines[0],localKey:'QA-NEW',lineId:null});}],
  ['duplicate ID replaces an original at equal length',i=>{i.values.lines[1]={...i.values.lines[0]};}],
  ['substituted original ID at equal length',i=>{i.values.lines[1]={...i.values.lines[1],lineId:'QA-OTHER',localKey:'QA-OTHER'};}],
  ['missing original ERP ID at equal length',i=>{i.values.lines[1].lineId=null;}],
  ['substituted local key',i=>{i.values.lines[0].localKey='QA-OTHER';}],
  ['substituted item on original ID',i=>{i.values.lines[0].itemId='QA-OTHER';}],
 ];
 for(const action of ['saveDraft','submit'])for(const [name,mutate] of mutations)await t.test(`${action}: ${name} has zero transport and leaves original custody untouched`,async()=>{
  const r=raw(2),before=structuredClone(r),i=intent(r,action);mutate(i);const supplied=structuredClone(i),calls=[];
  const bridge=createPurchaseCommandAdapter(scope,r,async(...args)=>{calls.push(args);throw Error('Invalid structural intent reached transport');});
  assert.throws(()=>freezePurchaseCommand(r,i));assert.equal((await bridge.adapter.execute(i,signal())).kind,'rejected');
  assert.deepEqual(calls,[]);assert.equal(bridge.hasPending(),false);assert.equal(bridge.readVersion(),0);assert.equal(bridge.needsFreshRead(),false);
  assert.deepEqual(bridge.currentReadback(),before);assert.deepEqual(r,before);assert.deepEqual(i,supplied,'Do not silently restore omitted rows or modify the proposed edit');
  assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'unknown');assert.deepEqual(calls,[],'Rejected intent has no retained lookup command');
 });
 await t.test('all 500 exact original IDs may reorder and update while every hidden value remains untouched',async()=>{
  const r=raw(500),before=structuredClone(r),i=intent(r);r.document.header.price='9999999999999999.99';before.document.header.price=r.document.header.price;
  r.document.header.rateExchange=0.125;before.document.header.rateExchange=0.125;r.document.lines[0].values.totalPrice=null;before.document.lines[0].values.totalPrice=null;
  i.values.department='EDITED HEADER';i.values.lines[0].quantity='9007199254740993';i.values.lines.reverse();
  const frozen=freezePurchaseCommand(r,i),calls=[];
  const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{calls.push({s,route,body});return{scopeKey:s,data:{outcome:0,receipt:{actionId:'purchase-request.save-draft',idempotencyKey:i.intentId,document:structuredClone(frozen.desired),stateToken:'prs1.'+'2'.repeat(64),allocatedLines:[]}}};});
  assert.equal((await bridge.adapter.execute(i,signal())).kind,'confirmed');assert.equal(calls.length,1);assert.equal(calls[0].route,'save');assert.equal(calls[0].body,frozen.json);
  const dto=JSON.parse(calls[0].body);assert.deepEqual(dto.header,{...r.document.header,department:'EDITED HEADER'});
  assert.deepEqual(dto.lineChanges,[{kind:'Update',lineId:r.document.lines[0].lineId,clientLineKey:null,values:{...r.document.lines[0].values,quantity:'9007199254740993'}}]);
  assert.equal(frozen.desired.lines.length,500);assert.deepEqual(frozen.desired.lines.slice(1),r.document.lines.slice(1));assert.deepEqual(r,before);
  assert.ok(Object.isFrozen(frozen.dto));assert.ok(Object.isFrozen(frozen.dto.lineChanges[0].values));assert.equal(bridge.needsFreshRead(),true);
  const freshEdit=intent(bridge.currentReadback());freshEdit.values.notes='NEXT EDIT';assert.equal((await bridge.adapter.execute(freshEdit,signal())).kind,'rejected');assert.equal(calls.length,1,'Receipt does not authorize another Save without a fresh read');
 });
 await t.test('local rejection does not spend the original key or silently drop a row from the later valid command',async()=>{
  const r=raw(2),i=intent(r),calls=[];i.values.lines.pop();
  const bridge=createPurchaseCommandAdapter(scope,r,async(s,route,body)=>{calls.push({s,route,body});throw Error('Synthetic lost ACK');});
  assert.equal((await bridge.adapter.execute(i,signal())).kind,'rejected');assert.equal(calls.length,0);
  const corrected={...i,values:commandPurchaseSnapshot(r).values};corrected.values.department='EDITED';
  assert.equal((await bridge.adapter.execute(corrected,signal())).kind,'unknown');assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].body).idempotencyKey,i.intentId);assert.deepEqual(JSON.parse(calls[0].body).lineChanges,[]);
  assert.equal(bridge.hasPending(),true);assert.equal((await bridge.adapter.execute(corrected,signal())).kind,'unknown');assert.equal(calls.length,1);
  assert.equal((await bridge.adapter.reconcile(i,signal())).kind,'unknown');assert.equal(calls.length,1,'Rejected shortened DTO cannot replace the full frozen original');
  assert.equal((await bridge.adapter.reconcile(corrected,signal())).kind,'unknown');assert.equal(calls.length,2);assert.equal(calls[1].route,'save/lookup');assert.equal(calls[1].body,calls[0].body);
 });
});
