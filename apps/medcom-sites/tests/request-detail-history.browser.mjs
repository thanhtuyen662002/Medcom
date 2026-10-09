import {serveLocalFont} from './local-font-assets.mjs';
// Actual composed Workspace detail-history regression, production clients and
// NavigationGuardProvider. Synthetic HTTP only; not ERP/SQL acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.MEDCOM_HISTORY_EVIDENCE_DIR??path.join(app,'.test-runtime','request-detail-history');
const sha=value=>createHash('sha256').update(value).digest('hex');
const scope='a'.repeat(64),session='b'.repeat(64);
const purchase={purchaseRequestId:'QA-PURCHASE-001',branchId:'QA-BRANCH',statusId:1,isLocked:false,
 header:{purchaseDate:'2026-10-01T14:22:11.003',purposeId:1,personSuggest:'Nhân viên tổng hợp kiểm thử với tên hiển thị dài',department:'Bộ phận kinh doanh tổng hợp kiểm thử',purposeDescOrClient:'Nội dung tổng hợp để kiểm tra xuống dòng trên màn hình nhỏ.',price:'999999999999999999',notes:null,currencyId:'VND',objectId:'QA-OBJECT',rateExchange:1},
 lines:[{lineId:'QA-LINE-001',values:{itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',budget:null,timeRequired:null,quantity:'999999999999999999',unitPrice:'1',totalPrice:null,model:''}}]};
const inbound={documentId:'QA-INBOUND-001',statusId:0,stateEqualityToken:'C'.repeat(64),costRowCount:0,costEditingSupported:false,
 header:{documentDate:'2026-10-01T14:22:11.003',orderNumber:'Đơn tổng hợp kiểm thử với nội dung đủ dài',invoiceNo:'',departurePoint:'Điểm đi tổng hợp',destinationPoint:'Điểm đến tổng hợp',orderTypeId:'QA-TYPE',branchId:'QA-BRANCH',objectId:null,currencyId:'VND',rateExchange:'1.0000000000',notes:''},
 details:[{rowId:'QA-ROW-001',clientLineId:null,itemId:'QA-ITEM-WITH-LONG-SYNTHETIC-CODE',lotNumberByDocument:'QA-LOT',setQuantityByDocument:'999999999999999999',barrelQuantityByDocument:'0',expireDateByDocument:'2027-01-02T12:34:56.997',unitPrice:'1'}]};

const orderRow=index=>({documentId:'QA-ORDER-'+index,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:1,isLocked:false});
const readonlyProjection=(documentId,page=1)=>({document:{documentId,documentDate:'2026-10-01',branchId:'QA-BRANCH',statusId:0,isLocked:false},purchaseOrderLines:[],inboundRequestLines:[],page,pageSize:50,hasMore:false});
// Currency label is its exact source ID; the human-readable name is separate.
const historyCurrency={id:'VND',label:'VND',currencyName:'Synthetic currency',rateExchange:1};
function historyOutcome(results,errors,firstFailure,fatal,expectedCases=28){
 const passedCases=results.length,failedCases=firstFailure?1:0,completedCases=passedCases+failedCases,notRunCases=expectedCases-completedCases;
 const passed=!fatal&&!firstFailure&&!errors.length&&passedCases===expectedCases;
 return {status:passed?'passed':'failed',passed,expectedCases,completedCases,passedCases,failedCases,notRunCases,remainingStatus:notRunCases>0?'NOT_RUN':null};
}
async function runRequiredHistoryCase(context,name,body,diagnose){
 context.signal?.throwIfAborted();let failure;
 await context.test(name,async()=>{try{await body();}catch(error){failure=error;await diagnose(name,error);throw error;}});
 // node:test resolves failed children; rethrow the first cause before another
 // scenario can reset its evidence or manufacture a passed partial receipt.
 if(failure)throw failure;context.signal?.throwIfAborted();
}
// Recovery is not an editing phase. Purchase retains its reviewed values;
// I18 intentionally unbinds its old form while retaining the original command.
async function waitForHistoryOriginal(page,screen,documentId,originalValue,eventually){
 const isPurchase=screen==='purchase-requests';
 const title=isPurchase?'Phiếu mua hàng hiện có':'Phiếu nhập hàng đã chọn';
 const dialog=page.getByRole('dialog',{name:title+' '+documentId,exact:true});await dialog.waitFor();
 const editor=isPurchase?dialog.getByRole('form',{name:'Đề nghị mua hàng trên điện thoại',exact:true}):dialog.locator('[data-testid="inbound-editor"][data-phase="unknown"]');await editor.waitFor();
 const reconcile=editor.getByRole('button',{name:isPurchase?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc',exact:true});await reconcile.waitFor();await eventually(()=>reconcile.isEnabled());
 if(isPurchase){
  await editor.getByText('Chưa xác nhận kết quả',{exact:true}).waitFor();
  const review=editor.getByRole('region',{name:'Rà soát thông tin phiếu',exact:true});await review.waitFor();
  assert.equal(await editor.locator('label[for$="-notes"] + strong').innerText(),originalValue);assert.equal(await editor.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).count(),0);
  for(const name of ['Quay lại chỉnh sửa','Lưu nháp trên ERP','Gửi đề nghị'])assert.equal(await dialog.getByRole('button',{name,exact:true}).isDisabled(),true);
 }else{
  assert.equal(await editor.getAttribute('data-document-id'),documentId);
  await editor.getByText(`Yêu cầu gốc: ${documentId}. Dữ liệu không được lưu bền trên thiết bị; tải lại hoặc đóng trang có thể mất khả năng kiểm tra.`,{exact:true}).waitFor();
  assert.equal(await editor.locator('form').count(),0,'An unbound pre-outage DTO cannot reappear before original reconciliation and matching readback');
 }
 return reconcile;
}
// A healthy Workspace observation may reuse its authorized list. Explicit
// list controls, rather than focus revalidation, request these changed rows.
async function refreshHistoryRows(page,screen,expectedIds,eventually){
 const isPurchase=screen==='purchase-requests',listPath=isPurchase?'/api/erp/api/purchase-requests':'/api/erp/api/documents/inbound-requests';
 const response=page.waitForResponse(reply=>reply.request().method()==='GET'&&new URL(reply.url()).pathname===listPath);
 await page.getByRole('button',{name:'Làm mới',exact:true}).click();
 const reply=await response;assert.equal(reply.status(),200);assert.equal(await reply.headerValue('x-medcom-session-scope'),session);assert.equal(await reply.headerValue('x-medcom-read-scope'),scope);
 const body=await reply.json(),data=isPurchase?body.data:body;if(isPurchase)assert.equal(body.scopeKey,scope);
 assert.equal(data.page,1);assert.equal(data.pageSize,isPurchase?20:50);assert.deepEqual(data.rows.map(row=>row.documentId),expectedIds);
 const table=page.locator(`[data-shared-grid][aria-label="${isPurchase?'Danh sách đề nghị':'Phiếu nhập hàng'}"]`);
 if(expectedIds.length)await table.waitFor();else await page.getByText(isPurchase?'Không có đề nghị phù hợp':'Không có phiếu trong trang này.',{exact:true}).waitFor();
 await eventually(async()=>JSON.stringify(await table.locator('[data-grid-row]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-grid-row'))))===JSON.stringify(expectedIds));
}
test('history fixture branches pass real list/detail clients and failures stop subsequent cases',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),ts=require('typescript'),{runInNewContext}=require('node:vm');
 await mkdir(output,{recursive:true});const file=path.join(output,'history-fixture-contract.mjs');
 await build({absWorkingDir:app,stdin:{contents:'export {getPurchaseList,getPurchaseLookup,getPurchaseWorkspace,getPurchaseDetail,postPurchaseCommand} from "./lib/erp/purchase-request-api";export {getDocuments,getDetail,getWorkspace} from "./lib/erp/api";export {createInboundRequestApi} from "./lib/erp/inbound-request-api";export {observedView} from "./lib/erp/inbound-draft";',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},logLevel:'warning'});
 const clients=await import(pathToFileURL(file).href),source=await readFile(fileURLToPath(import.meta.url),'utf8'),ast=ts.createSourceFile('history-fixture.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),declarations={};let handler;
 const visit=node=>{if(ts.isVariableDeclaration(node)){
  const name=node.name.getText(ast);if(['reset','workspace','send','release','releaseAll'].includes(name)){assert.equal(declarations[name],undefined);declarations[name]=node.getText(ast);}
  if(name==='server'&&node.initializer?.expression?.getText(ast)==='createServer'){assert.equal(handler,undefined);handler=node.initializer.arguments[0].getText(ast);}
 }ts.forEachChild(node,visit);};const browserTest=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.arguments[0]?.text==='composed request detail history, guarded traversal and original custody');assert.ok(browserTest);visit(browserTest.expression.arguments.at(-1));assert.equal(Object.keys(declarations).length,5);assert.ok(handler);
 // Execute the exact current HTTP handler, reset and release bytes with request/response
 // doubles. No local server/browser, copied envelopes or replacement decoders.
 const harness=runInNewContext('let model;const calls=[],errors=[],origin="http://synthetic.invalid";const '+Object.values(declarations).join(';const ')+';const handler='+handler+';({reset,release,releaseAll,handler,calls,errors,getModel:()=>model})',{purchase,inbound,historyCurrency,orderRow,readonlyProjection,scope,session,sha,structuredClone,URL,Buffer,Date,assert});
 const native=globalThis.fetch,calls=[],checked=[],readScope={sessionScope:session,readScope:scope},signal=new AbortController().signal;let changeReply=reply=>reply,observeReply=()=>{};
 globalThis.fetch=async(url,init={})=>{
  const req={url:String(url),method:init.method??'GET',async *[Symbol.asyncIterator](){if(init.body)yield Buffer.from(init.body);}};
  let status,headers,body;await harness.handler(req,{destroyed:false,writeHead:(value,fields)=>{status=value;headers=fields;},end:value=>{body=value;}});
  assert.ok(status,'Fixture handler must complete its response');const reply=changeReply({status,headers,body},url);calls.push({url:String(url),method:req.method,status:reply.status});
  observeReply({url:()=>new URL(String(url),'http://synthetic.invalid').href,request:()=>({method:()=>req.method}),status:()=>reply.status,headerValue:async name=>new Headers(reply.headers).get(name),json:async()=>JSON.parse(reply.body)});
  return new Response(reply.body,{status:reply.status,headers:reply.headers});
 };
 const inboundApi=clients.createInboundRequestApi(globalThis.fetch);
 const list=(kind,page=1)=>kind==='purchase'?clients.getPurchaseList(scope,page,'','',signal):clients.getDocuments('inbound-requests',page,'','',signal,readScope);
 try{
  for(const kind of ['purchase','inbound']){
   const isPurchase=kind==='purchase',key=isPurchase?'purchaseDocuments':'inboundDocuments',size=isPurchase?20:50,base=isPurchase?purchase:inbound,idKey=isPurchase?'purchaseRequestId':'documentId';
   const documents=Array.from({length:size*2},(_,i)=>({...structuredClone(base),[idKey]:'QA-'+kind.toUpperCase()+'-'+String(i+1).padStart(3,'0')}));
   for(const [mode,patch,pages] of [['default',{},[1]],['two rows',{[key]:documents.slice(0,2)},[1]],['paged',{paged:true,[key]:documents},[1,2]],['empty',{empty:true},[1]]]){
    harness.reset(patch);
    for(const page of pages){const data=await list(kind,page);assert.equal(typeof data.hasMore,'boolean');assert.equal(data.page,page);assert.equal(data.pageSize,size);
     assert.equal(data.rows.length,mode==='paged'?size:mode==='two rows'?2:mode==='empty'?0:1);assert.equal(data.hasMore,mode==='paged'&&page===1);
     if(mode==='default')assert.equal(data.rows[0].documentId,base[idKey]);
    }
    checked.push(kind+' '+mode+' list');
   }
   // Exact old omission: undefined is removed by JSON serialization.
   harness.reset({paged:undefined});await assert.rejects(()=>list(kind),error=>error.code==='invalid_api_response');
   harness.reset({status:503});await assert.rejects(()=>list(kind),error=>error.status===503);
  }
  // Exercise the exact browser list-refresh helper through the real clients
  // and exact HTTP handler. Only Playwright's click/response/DOM transport is
  // doubled; native history and actual control wiring remain browser coverage.
  for(const kind of ['purchase','inbound']){
   const isPurchase=kind==='purchase',screen=kind+'-requests',base=isPurchase?purchase:inbound,idKey=isPurchase?'purchaseRequestId':'documentId',second={...structuredClone(base),[idKey]:'QA-SECOND'};
   harness.reset({[isPurchase?'purchaseDocuments':'inboundDocuments']:[base,second]});let renderedIds=[base[idKey],second[idKey]],waiting,clicks=0;
   const listPath=isPurchase?'/api/erp/api/purchase-requests':'/api/erp/api/documents/inbound-requests',replyAt=(route,method='GET')=>({url:()=>`http://synthetic.invalid${route}`,request:()=>({method:()=>method})});
   const page={
    waitForResponse:predicate=>{assert.equal(predicate(replyAt(listPath)),true);assert.equal(predicate(replyAt('/api/erp/api/workspace')),false);assert.equal(predicate(replyAt(listPath,'POST')),false);return new Promise(resolve=>{waiting={predicate,resolve};});},
    getByRole:(role,options)=>{assert.equal(role,'button');assert.deepEqual(options,{name:'Làm mới',exact:true});return {click:async()=>{assert.ok(waiting,'Arm the current list response before clicking');clicks++;const data=await list(kind);renderedIds=data.rows.map(row=>row.documentId);}};},
    getByText:(value,options)=>{assert.equal(value,isPurchase?'Không có đề nghị phù hợp':'Không có phiếu trong trang này.');assert.deepEqual(options,{exact:true});return {waitFor:async()=>assert.deepEqual(renderedIds,[])};},
    locator:selector=>{assert.equal(selector,`[data-shared-grid][aria-label="${isPurchase?'Danh sách đề nghị':'Phiếu nhập hàng'}"]`);return {waitFor:async()=>assert.ok(renderedIds.length),locator:rows=>{assert.equal(rows,'[data-grid-row]');return {evaluateAll:async evaluate=>evaluate(renderedIds.map(id=>({getAttribute:name=>{assert.equal(name,'data-grid-row');return id;}})))};}};},
   };
   observeReply=reply=>{if(waiting?.predicate(reply)){waiting.resolve(reply);waiting=null;}};
   for(const empty of [true,false]){
    harness.getModel().empty=empty;const at=calls.length,expected=empty?[]:[base[idKey],second[idKey]];
    await refreshHistoryRows(page,screen,expected,async condition=>assert.equal(await condition(),true));
    assert.deepEqual(renderedIds,expected);assert.equal(calls.length,at+1);assert.equal(harness.getModel().listResponses,clicks);
   }
   assert.equal(clicks,2);harness.getModel().empty=false;
   await assert.rejects(()=>refreshHistoryRows(page,screen,['QA-WRONG-ROW'],async condition=>assert.equal(await condition(),true)));
   observeReply=()=>{};checked.push(kind+' explicit list controls, prearmed authorized GET, exact empty/restored rows and wrong-row rejection');
  }
  harness.reset();const workspace=await clients.getWorkspace(signal);assert.deepEqual(workspace.branchIds,['QA-BRANCH']);assert.equal(workspace.readScope,scope);
  assert.equal((await clients.getPurchaseWorkspace(signal)).data.writeAvailable,false);checked.push('workspace and purchase workspace');
  for(const [kind,search,expected] of [['purposes','1',[{id:'1',label:'Synthetic purpose'}]],['currencies','VND',[historyCurrency]]])assert.deepEqual((await clients.getPurchaseLookup(scope,kind,search,1,signal)).items,expected);
  changeReply=reply=>{const value=JSON.parse(reply.body);value.data.items[0].label='Synthetic currency';return {...reply,body:JSON.stringify(value)};};
  await assert.rejects(()=>clients.getPurchaseLookup(scope,'currencies','VND',1,signal),error=>error.code==='invalid_api_response');changeReply=reply=>reply;checked.push('purpose and strict source currency lookups');
  for(const writable of [true,false]){
   harness.reset({writable});const detail=await clients.getPurchaseDetail(scope,purchase.purchaseRequestId,signal);assert.deepEqual(detail.document,purchase);assert.equal(detail.commandAccess.canSave,writable);
   for(const readKey of [null,scope]){const result=await inboundApi.read(inbound.documentId,readKey,signal);assert.deepEqual(clients.observedView(result.data,inbound.documentId),inbound);assert.equal(result.access.canSave,writable);}
  }
  for(const [kind,base,idKey] of [['purchase',purchase,'purchaseRequestId'],['inbound',inbound,'documentId']]){
   const second={...structuredClone(base),[idKey]:'QA-SECOND'};harness.reset({[kind==='purchase'?'purchaseDocuments':'inboundDocuments']:[base,second]});
   if(kind==='purchase')assert.deepEqual((await clients.getPurchaseDetail(scope,'QA-SECOND',signal)).document,second);else assert.deepEqual(clients.observedView((await inboundApi.read('QA-SECOND',scope,signal)).data,'QA-SECOND'),second);
   await assert.rejects(()=>kind==='purchase'?clients.getPurchaseDetail(scope,'QA-MISSING',signal):inboundApi.read('QA-MISSING',scope,signal),error=>error.status===404);
  }
  checked.push('purchase and complete inbound default/multiple/read-only details');
  harness.reset({detailStatus:503});await assert.rejects(()=>clients.getPurchaseDetail(scope,purchase.purchaseRequestId,signal),error=>error.status===503);await assert.rejects(()=>inboundApi.read(inbound.documentId,scope,signal),error=>error.status===503);
  harness.reset({draftMalformed:true});await assert.rejects(()=>inboundApi.read(inbound.documentId,scope,signal),error=>error.status===502&&error.reason==='invalid');
  const unavailable={scopeKey:null,access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},data:{outcome:'Unavailable',document:null}};
  harness.reset({draftEnvelope:unavailable});assert.deepEqual(await inboundApi.read(inbound.documentId,null,signal),{...unavailable,itemDisplayContext:null});checked.push('draft errors, malformed JSON and unavailable override');
  harness.reset();assert.deepEqual((await clients.getDocuments('purchase-orders',1,'','',signal,readScope)).rows,[orderRow(1)]);
  const order=await clients.getDetail('purchase-orders',orderRow(1).documentId,1,signal,readScope);assert.equal(order.purchaseOrderLines[0].quantity,'999999999999999999.0001');
  harness.reset({orderPages:[[orderRow(1)],[orderRow(2)]]});for(const page of [1,2]){const orders=await clients.getDocuments('purchase-orders',page,'','',signal,readScope);assert.deepEqual(orders.rows,[orderRow(page)]);assert.equal(orders.hasMore,page===1);assert.deepEqual((await clients.getDetail('purchase-orders',orderRow(page).documentId,page,signal,readScope)).document,orderRow(page));}
  await assert.rejects(()=>clients.getDetail('purchase-orders','QA-MISSING',1,signal,readScope),error=>error.status===404);
  for(const page of [1,2])assert.deepEqual(await clients.getDetail('inbound-requests',inbound.documentId,page,signal,readScope),readonlyProjection(inbound.documentId,page));
  harness.reset({projectionStatus:404});await assert.rejects(()=>clients.getDetail('inbound-requests',inbound.documentId,1,signal,readScope),error=>error.status===404);
  for(const projectionKind of ['malformed','wrong-document','wrong-page','wrong-read-scope','wrong-session-scope','missing-read-scope']){
   harness.reset({projectionKind});await assert.rejects(()=>clients.getDetail('inbound-requests',inbound.documentId,1,signal,readScope),error=>[409,502].includes(error.status));
  }
  // These projections remain structurally decodable. The read-only host owns
  // branch authorization and stable page-size checks, not the generic client.
  harness.reset({projectionKind:'wrong-branch'});assert.equal((await clients.getDetail('inbound-requests',inbound.documentId,1,signal,readScope)).document.branchId,'QA-UNAUTHORIZED-BRANCH');
  harness.reset({projectionKind:'wrong-page-size'});assert.equal((await clients.getDetail('inbound-requests',inbound.documentId,2,signal,readScope)).pageSize,25);
  for(const listResponseHeaders of [{},{'X-Medcom-Session-Scope':'c'.repeat(64),'X-Medcom-Read-Scope':scope}]){harness.reset({listResponseHeaders});await assert.rejects(()=>list('inbound'),error=>[409,502].includes(error.status));}
  checked.push('purchase-order list/detail and every independent inbound projection failure/scope branch');
  for(const kind of ['purchase','inbound'])for(const unknown of [false,true]){
   harness.reset({holdCommands:true,unknown});const model=harness.getModel(),isPurchase=kind==='purchase',id='11111111-1111-4111-8111-111111111111';
   const body=JSON.stringify(isPurchase?{idempotencyKey:id,header:purchase.header,lineChanges:[]}:{operationId:id,action:'Save',header:inbound.header,removedDetailIds:[],detailUpserts:[]});
   const command=(lookup=false)=>isPurchase?clients.postPurchaseCommand(scope,lookup?'save/lookup':'save',body,signal):inboundApi.command(lookup?'reconcile':'save',body,scope,signal,()=>{});
   let settled=false;const completion=command().then(value=>{settled=true;return {value};},error=>{settled=true;return {error};});
   // Only in-memory request/response microtasks run before the queued latch.
   await new Promise(setImmediate);assert.equal(model.commandWaiters.length,1);assert.equal(settled,false);assert.equal(model.effects,0);assert.equal(model.commandResponses,0);
   assert.equal(model.writes.length,1);assert.equal(model.originals.get(id),body);assert.equal(model.writes[0].bodySha256,sha(body));
   harness.release('Commands');assert.equal(model.holdCommands,false);assert.equal(model.commandWaiters.length,0,'Commands release must drain the exact queue holding the already-dispatched POST');
   const result=await completion;if(unknown)assert.equal(result.error?.status,503);else{assert.equal(result.error,undefined);assert.equal(result.value.data.outcome,isPurchase?0:'Committed');}
   assert.equal(model.effects,1);assert.equal(model.commandResponses,1);assert.equal(model.writes.length,1);assert.equal(model.originals.get(id),body);
   harness.release('Commands');assert.equal(model.commandWaiters.length,0);assert.equal(model.effects,1,'Repeated release cannot dispatch or apply the original again');
   const reconciled=await command(true);assert.equal(reconciled.data.outcome,isPurchase?0:'Replayed');assert.deepEqual(Array.from(model.reconciles),[sha(body)]);assert.equal(model.effects,1);assert.equal(model.writes.length,1);
   checked.push(kind+' held command release '+(unknown?'lost acknowledgement':'committed')+' and exact-original reconciliation');
  }
  assert.deepEqual(Array.from(harness.errors),[]);
  const original=Error('synthetic first readiness failure'),runs=[],diagnostics=[],context={test:async(name,body)=>{try{await body();}catch{}}};
  await assert.rejects(async()=>{for(const name of ['first','must-not-start'])await runRequiredHistoryCase(context,name,async()=>{runs.push(name);throw original;},async(name,error)=>diagnostics.push({name,error}));},error=>error===original);
  assert.deepEqual(runs,['first']);assert.deepEqual(diagnostics,[{name:'first',error:original}]);
  assert.deepEqual(historyOutcome(['completed'],[],{name:'first'},'failed'),{status:'failed',passed:false,expectedCases:28,completedCases:2,passedCases:1,failedCases:1,notRunCases:26,remainingStatus:'NOT_RUN'});
  assert.equal(historyOutcome(Array(4).fill('completed'),[],null,null).passed,false,'A partial receipt can never claim success');
  const complete=Array(28).fill('completed');assert.equal(historyOutcome(complete,[],null,null).passed,true);
  assert.equal(historyOutcome(complete,['fixture error'],null,null).passed,false);assert.equal(historyOutcome(complete,[],null,'fatal').passed,false);
  await writeFile(path.join(output,'fixture-api-contract.json'),JSON.stringify({result:'PASS',realClients:true,exactHandlerAndReset:true,exactReleaseHelper:true,browserExecuted:false,missingHasMoreRejected:true,heldCommandsCompleteOnce:true,firstFailureStopsSetup:true,checked,calls},null,2));
 }finally{harness.releaseAll();globalThis.fetch=native;}
});
test('history original readiness follows real purchase review and unbound inbound recovery',async()=>{
 const require=createRequire(import.meta.url),{build}=require('esbuild'),React=require('react'),{act,create}=require('react-test-renderer');
 await mkdir(output,{recursive:true});const file=path.join(output,'history-original-editors.mjs');
 await build({absWorkingDir:app,stdin:{contents:'export {MobileRequest} from "./components/erp/mobile-request";export {MobileInboundRequest} from "./components/erp/mobile-inbound-request";export {RequestDetailDialog} from "./components/erp/request-detail-dialog";export {commandPurchaseSnapshot} from "./lib/erp/purchase-request-command-adapter";',resolveDir:app,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning'});
 const {MobileRequest,MobileInboundRequest,RequestDetailDialog,commandPurchaseSnapshot}=await import(pathToFileURL(file).href),savedAct=globalThis.IS_REACT_ACT_ENVIRONMENT,checked=[];
 let renderer;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 // Only the locator transport is a test double. Every host node, state change,
 // review value and command below comes from the actual retained React editors.
 // Browser geometry, accessibility visibility and history remain the 28-case gate.
 const textOf=node=>typeof node==='string'?node:node.children.map(textOf).join('');
 const hostNodes=(roots,predicate)=>[...new Set(roots.flatMap(root=>root.findAll(node=>typeof node.type==='string'&&predicate(node))))];
 const disabled=node=>!!node.props.disabled||!!node.parent&&(node.parent.type==='fieldset'&&!!node.parent.props.disabled||disabled(node.parent));
 const hidden=node=>!!node&&(!!node.props.hidden||!!node.props.inert||node.props['aria-hidden']==='true'||node.props.style?.display==='none'||hidden(node.parent));
 // Model the shared title's separate text and block document-number segments.
 const locator=nodes=>{
  const single=()=>{assert.equal(nodes.length,1,'Exact production locator must resolve one rendered node');return nodes[0];};
  return {
   nodes,or:other=>locator([...new Set([...nodes,...other.nodes])]),
   waitFor:async()=>{single();},count:async()=>nodes.length,innerText:async()=>textOf(single()),getAttribute:async name=>single().props[name],isEnabled:async()=>!disabled(single()),isDisabled:async()=>disabled(single()),
   getByRole:(role,{name,exact,includeHidden=false})=>{assert.equal(exact,true);return locator(hostNodes(nodes,node=>{
    if(!includeHidden&&hidden(node))return false;
    const actual=node.props.role??(node.type==='button'?'button':node.type==='textarea'?'textbox':node.type==='form'&&node.props['aria-label']?'form':node.type==='section'&&(node.props['aria-label']||node.props['aria-labelledby'])?'region':null);
    const label=node.props['aria-label']??(node.props['aria-labelledby']?hostNodes([renderer.root],item=>item.props.id===node.props['aria-labelledby']).map(item=>item.children.map(textOf).join(' ')).join(' '):actual==='textbox'?hostNodes([renderer.root],item=>item.type==='label'&&item.props.htmlFor===node.props.id).map(textOf).join(' '):textOf(node));return actual===role&&label===name;
   }));},
   getByText:(value,{exact})=>{assert.equal(exact,true);return locator(hostNodes(nodes,node=>textOf(node)===value&&!node.children.some(child=>typeof child!=='string'&&textOf(child)===value)));},
   getByLabel:(value,{exact})=>{assert.equal(exact,true);const ids=hostNodes(nodes,node=>node.type==='label'&&textOf(node)===value).map(node=>node.props.htmlFor);return locator(hostNodes(nodes,node=>['input','textarea','select'].includes(node.type)&&ids.includes(node.props.id)));},
   locator:selector=>{
    if(selector==='[data-testid="inbound-editor"][data-phase="unknown"]')return locator(hostNodes(nodes,node=>node.props['data-testid']==='inbound-editor'&&node.props['data-phase']==='unknown'));
    if(selector==='form')return locator(hostNodes(nodes,node=>node.type==='form'));
    if(selector==='label[for$="-notes"] + strong')return locator(hostNodes(nodes,node=>node.type==='label'&&node.props.htmlFor?.endsWith('-notes')).flatMap(node=>{const siblings=node.parent.children,at=siblings.indexOf(node),next=siblings[at+1];return next?.type==='strong'?[next]:[];}));
    throw Error('Unexpected readiness selector: '+selector);
   },
  };
 };
 const page={getByRole:(...args)=>locator([renderer.root]).getByRole(...args),getByLabel:(...args)=>locator([renderer.root]).getByLabel(...args)};
 const settled=async condition=>assert.equal(await condition(),true,'Original reconciliation must be enabled');
 const button=name=>hostNodes([renderer.root],node=>node.type==='button'&&textOf(node)===name)[0];
 try{
  for(const screen of ['purchase-requests','inbound-requests']){
   const isPurchase=screen==='purchase-requests',documentId=isPurchase?purchase.purchaseRequestId:inbound.documentId,originalValue='EXACT ORIGINAL AUTH CUSTODY',executed=[],reconciled=[];let release;
   const unknown=original=>isPurchase?{kind:'unknown',intentId:original.intentId,message:'Synthetic lost acknowledgement'}:{outcome:'OutcomeUnknown',receipt:null,code:null};
   const adapter={lookup:async()=>({items:[],hasMore:false}),read:async()=>({outcome:'Observed',document:structuredClone(inbound)}),execute:original=>{executed.push(original);return new Promise(resolve=>{release=()=>resolve(unknown(original));});},reconcile:async original=>{reconciled.push(original);return unknown(original);}};
   const access=isPurchase?{scopeKey:scope,authorityKey:'original',canRead:true,canEdit:true,canSaveDraft:true,canSubmit:true,canReconcile:true,available:true,existingOnly:true,canAddLines:false,branches:[{id:'QA-BRANCH',label:'QA-BRANCH'}],currencies:[historyCurrency],purposes:[{id:'1',label:'Synthetic purpose'}],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:'items',objectLookupId:'objects'}:{scopeKey:scope,canRead:true,canSave:true,canSend:true,available:true,maxCommandBytes:1048576};
   const props=isPurchase?{adapter,access,initial:commandPurchaseSnapshot({document:structuredClone(purchase),stateToken:'prs1.'+'1'.repeat(64),commandAccess:{canSave:true,canSubmit:true,canLookup:true,canAddLines:false,reason:'available'}})}:{adapter,access,documentId};
   const render=(next,presentationAllowed=true)=>React.createElement(RequestDetailDialog,{open:true,presentationAllowed,title:isPurchase?'Phiếu mua hàng hiện có':'Phiếu nhập hàng đã chọn',documentNumber:documentId,closeLabel:'Close',onRequestClose:()=>{}},React.createElement(isPurchase?MobileRequest:MobileInboundRequest,next));
   await act(async()=>{renderer=create(render(props));});
   assert.equal(await page.getByRole('region',{name:'Ghi chú',exact:true}).count(),1,'Notes keeps its independently named section');
   assert.equal(await page.getByRole('textbox',{name:isPurchase?'Ghi chú':'Số đơn',exact:true,includeHidden:true}).count(),1,'Exact textbox lookup admits only the editable control');
   const retainedNotes=page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}),retainedNoteValue=await retainedNotes.getAttribute('value');
   await act(async()=>renderer.update(render(props,false)));
   assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true}).count(),0,'Masked notes leave the accessibility tree');
   assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).count(),1,'A hidden retained note cannot satisfy the zero-textbox absence assertion');
   assert.equal(await page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}).getAttribute('value'),retainedNoteValue,'Exact hidden textbox remains inspectable without changing its value');
   await act(async()=>renderer.update(render(props)));
   const input=hostNodes([renderer.root],node=>node.type==='textarea'&&(isPurchase?node.props.name==='notes':node.props.id==='inbound-header-orderNumber'));assert.equal(input.length,1);
   await assert.rejects(()=>waitForHistoryOriginal(page,screen,documentId,originalValue,settled));
   await act(async()=>input[0].props.onChange({target:{value:originalValue}}));
   await act(async()=>hostNodes([renderer.root],node=>node.type==='form')[0].props.onSubmit({preventDefault(){}}));
   await act(async()=>button(isPurchase?'Lưu nháp trên ERP':'Lưu thay đổi').props.onClick());assert.equal(executed.length,1);const original=executed[0],json=JSON.stringify(original);
   await act(async()=>renderer.update(render({...props,access:{...access,canRead:false,available:false}})));await act(async()=>release());
   await act(async()=>renderer.update(render(props)));
   await waitForHistoryOriginal(page,screen,documentId,originalValue,settled);
   await assert.rejects(()=>page.getByRole('textbox',{name:isPurchase?'Ghi chú':'Số đơn',exact:true,includeHidden:true}).waitFor(),/Exact production locator/,'Editable-control readiness fails in both actual recovery phases');
   await assert.rejects(()=>waitForHistoryOriginal(page,screen,'QA-WRONG-DOCUMENT',originalValue,settled));
   if(isPurchase)await assert.rejects(()=>waitForHistoryOriginal(page,screen,documentId,'WRONG ORIGINAL VALUE',settled));
   await act(async()=>button(isPurchase?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc').props.onClick());
   assert.equal(executed.length,1);assert.equal(reconciled.length,1);assert.strictEqual(reconciled[0],original);assert.equal(JSON.stringify(reconciled[0]),json);assert.equal(isPurchase?original.values.notes:original.header.orderNumber,originalValue);
   checked.push({screen,originalObjectRetained:true,originalJsonRetained:true,oldInputReadinessRejected:true,wrongDocumentRejected:true,dispatches:executed.length,reconciles:reconciled.length});
   await act(async()=>renderer.unmount());renderer=null;
  }
  await writeFile(path.join(output,'recovery-readiness-contract.json'),JSON.stringify({result:'PASS',actualEditors:true,exactReadinessHelper:true,browserExecuted:false,checked},null,2));
 }finally{if(renderer)await act(async()=>renderer.unmount());if(savedAct===undefined)delete globalThis.IS_REACT_ACT_ENVIRONMENT;else globalThis.IS_REACT_ACT_ENVIRONMENT=savedAct;}
});
let compiled;
async function compile(){
 if(compiled)return compiled;
 const require=createRequire(import.meta.url),{build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './components/erp/workspace';
 window.authFixture={posts:[],ignoreAbort:false,tools:{},life:{},adapters:{},adapterIds:new WeakMap(),nextAdapter:0};window.testVisibility='visible';
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
 Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:(tool,{signal})=>{window.authFixture.tools[tool.name]=tool;signal.addEventListener('abort',()=>{if(window.authFixture.tools[tool.name]===tool)delete window.authFixture.tools[tool.name];});}}});
 const nativeHistoryGo=history.go.bind(history);window.authFixture.historyCalls=[];window.authFixture.heldHistory=[];window.authFixture.holdHistory=false;
 history.go=delta=>{window.authFixture.historyCalls.push({delta,index:history.state?.medcomWorkspace?.index});if(window.authFixture.holdHistory)window.authFixture.heldHistory.push(delta);else nativeHistoryGo(delta);};
 window.authFixture.userTraverse=nativeHistoryGo;window.authFixture.releaseHistory=()=>{if(window.authFixture.heldHistory.length)nativeHistoryGo(window.authFixture.heldHistory.shift());};
 const nativeFetch=window.fetch.bind(window);window.fetch=(url,init)=>{if(init?.method==='POST')window.authFixture.posts.push({url:String(url),body:String(init.body)});if(window.authFixture.ignoreAbort){const {signal,...rest}=init??{};void signal;return nativeFetch(url,rest);}return nativeFetch(url,init);};
 createRoot(document.getElementById('root')).render(<Workspace/>);`;
 const built=await build({absWorkingDir:app,stdin:{contents:entry,resolveDir:app,loader:'tsx'},outfile:'auth-fixture.js',bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':app},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'warning',plugins:[{name:'observe-production-detail-seam',setup(build){build.onLoad({filter:/[/\\]request-detail-dialog\.tsx$/},async args=>{
  const original=await readFile(args.path,'utf8'),needle='export function useRequestDetailNavigation(register: RegisterRequestDetailNavigation | undefined, navigation: RequestDetailNavigation) {';
  assert.ok(original.includes(needle),'Observe the actual production navigation seam, never replace it');
  return {loader:'tsx',resolveDir:path.dirname(args.path),contents:original.replace(needle,needle+'\n useLayoutEffect(() => {window.authFixture.navigation = navigation; return () => {if(window.authFixture.navigation === navigation)window.authFixture.navigation = null;};});')};
 });}},{name:'observe-production-editor-lifetimes',setup(build){build.onLoad({filter:/[/\\](?:mobile-(?:inbound-)?request|document-editor)\.tsx$/},async args=>{
  const name=args.path.endsWith('mobile-request.tsx')?'RequestEditor':args.path.endsWith('mobile-inbound-request.tsx')?'InboundEditor':'DocumentEditor';
  const original=await readFile(args.path,'utf8'),header=original.match(new RegExp('function '+name+'\\([^]*?\\)\\s*\\{'))?.[0];assert.ok(header,'Production editor function must remain observable');
  const instrumentation=`
   observeEditorLifecycle(()=>{const life=window.authFixture.life['${name}']??={mounts:0,unmounts:0};life.mounts++;return()=>{life.unmounts++;};},[]);
   observeEditorLifecycle(()=>{if(adapter){let id=window.authFixture.adapterIds.get(adapter);if(!id){id=++window.authFixture.nextAdapter;window.authFixture.adapterIds.set(adapter,id);}const seen=window.authFixture.adapters['${name}']??=[];if(!seen.includes(id))seen.push(id);}});
  `;
  return {loader:'tsx',resolveDir:path.dirname(args.path),contents:original.replace('"use client";','"use client";\nimport {useLayoutEffect as observeEditorLifecycle} from "react";').replace(header,header+instrumentation)};
 });}},{name:'next-image-only',setup(build){build.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'auth-image'}));build.onLoad({filter:/.*/,namespace:'auth-image'},()=>({contents:"import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}",resolveDir:app,loader:'jsx'}));}}]});
 const emitted=built.outputFiles.find(file=>file.path.endsWith('.css'));assert.ok(emitted?.contents.length,'Auth CSS modules must be emitted');
 const css=Buffer.from(emitted.contents).toString()+(await postcss([tailwind({base:app})]).process(await readFile(path.join(app,'app/globals.css'),'utf8'),{from:path.join(app,'app/globals.css')})).css;
 assert.ok(!css.includes('@import "tailwindcss"'),'Compile real application CSS');
 compiled={script:built.outputFiles.find(file=>file.path.endsWith('.js')).contents,css,logo:await readFile(path.join(app,'public/medcom-logo.png'))};return compiled;
}
test('compile composed Workspace detail history with real application CSS',async()=>{const result=await compile();assert.ok(result.script.length>0);assert.match(result.css,/min-height:\s*100dvh/);});
test('composed request detail history, guarded traversal and original custody',{timeout:360000},async t=>{
 const {script,css,logo}=await compile(),require=createRequire(import.meta.url),toolchain=process.env.MEDCOM_BROWSER_TOOLCHAIN;
 const {chromium}=(toolchain?createRequire(path.join(path.resolve(toolchain),'package.json')):require)('playwright-core');
 const executable=process.env.MEDCOM_EDGE_PATH??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 assert.ok(existsSync(executable),'NOT_RUN: existing supported browser required; never install or bypass sandbox');
 let model,browser,context,page,origin,currentScenario,firstFailure=null,fatal=null;const expectedCases=28,calls=[],errors=[],results=[],evidence=[];
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
 const reset=(patch={})=>{model={paged:false,authenticated:true,loginStatus:200,loginCalls:0,holdLogin:false,loginWaiters:[],workspaceStatus:200,holdWorkspace:false,workspaceWaiters:[],sessionScope:session,version:1,lifetime:{idleExpiresAt:new Date(Date.now()+3600000).toISOString(),absoluteExpiresAt:new Date(Date.now()+7200000).toISOString()},writable:true,status:200,holdList:false,waiters:[],listResponses:0,holdDetail:false,detailWaiters:[],detailStatus:200,draftResponses:0,projectionStatus:200,projectionResponses:0,holdProjection:false,projectionWaiters:[],purchase:structuredClone(purchase),inbound:structuredClone(inbound),purchaseVersion:1,inboundVersion:1,originals:new Map(),receipts:new Map(),writes:[],reconciles:[],effects:0,holdCommands:false,commandWaiters:[],commandResponses:0,unknown:false,...patch};calls.length=0;};
 const workspace=()=>({session:{displayName:'SYNTHETIC USER',tenantId:'QA-T',companyId:'QA-C',companyName:'SYNTHETIC',authorityVersion:model.version,...model.lifetime,capabilities:model.capabilities??['purchase-requests.read','inbound-requests.read','purchase-orders.read']},branchIds:['QA-BRANCH'],navigation:(model.navigation??['purchase-requests','inbound-requests','purchase-orders']).map(id=>({id,label:id,href:'https://untrusted.invalid/'+id}))});
 const send=(res,status,data,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(status===204?undefined:JSON.stringify(data));};
 const release=kind=>{model['hold'+kind]=false;(model[kind==='Commands'?'commandWaiters':kind[0].toLowerCase()+kind.slice(1)+'Waiters']??[]).splice(0).forEach(resolve=>resolve());};
 const releaseAll=()=>{for(const kind of ['Workspace','Login','Commands','Detail','Projection'])release(kind);model.holdList=false;model.waiters.splice(0).forEach(resolve=>resolve());model.commandWaiters.splice(0).forEach(resolve=>resolve());};
 const server=createServer(async(req,res)=>{if(serveLocalFont(req,res))return;const m=model;try{
  const url=new URL(req.url,origin??'http://localhost');
  if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/medcom-logo.png'){res.setHeader('Content-Type','image/png');return res.end(logo);}
  if(!url.pathname.startsWith('/api/erp/')){res.setHeader('Content-Type','text/html');return res.end(html);}
  const route=url.pathname.slice('/api/erp'.length);calls.push({route,method:req.method,query:url.search});
  const readHeaders={'X-Medcom-Session-Scope':m.sessionScope,'X-Medcom-Read-Scope':scope};
  if(route==='/health/ready')return send(res,503,{status:'not_ready',checks:[]});
  if(route==='/api/auth/csrf')return send(res,200,{token:'synthetic-only'});
  if(route==='/api/auth/login'){m.loginCalls++;for await(const chunk of req)void chunk;if(m.holdLogin)await new Promise(resolve=>m.loginWaiters.push(resolve));if(m.loginStatus!==200)return send(res,m.loginStatus,{code:'authentication_required'});m.authenticated=true;m.sessionScope=sha('synthetic login '+m.loginCalls);return send(res,200,workspace().session);}
  if(route==='/api/workspace'){const status=m.authenticated?m.workspaceStatus:401,data=workspace();if(m.holdWorkspace)await new Promise(resolve=>m.workspaceWaiters.push(resolve));return send(res,status,status===200?data:{code:status===401?'authentication_required':'backend_unavailable'},readHeaders);}
  if(!m.authenticated)return send(res,401,{code:'authentication_required'});
  if(route==='/api/auth/logout'){m.authenticated=false;return send(res,204,null);}
  if(route==='/api/auth/session/continue')return send(res,200,workspace().session);
   if(route==='/api/purchase-requests/workspace')return send(res,200,{scopeKey:scope,data:{branchIds:['QA-BRANCH'],writeAvailable:false,writeReason:'numbering_journal_runtime_unqualified',lookups:[]}});
   if(route==='/api/purchase-requests/lookup')return send(res,200,{scopeKey:scope,data:{available:true,reason:null,items:url.searchParams.get('kind')==='purposes'?[{id:'1',label:'Synthetic purpose'}]:[historyCurrency],page:Number(url.searchParams.get('page')??1),hasMore:false}});
   if(route==='/api/documents/purchase-orders'){
    const page=Number(url.searchParams.get('page')??1),pages=m.orderPages??[[orderRow(1)]];
    return send(res,200,{rows:pages[page-1]??[],page,pageSize:50,hasMore:page<pages.length},readHeaders);
   }
   if(route==='/api/documents/purchase-orders/detail'){
    const document=(m.orderPages??[[orderRow(1)]]).flat().find(row=>row.documentId===url.searchParams.get('documentId'));
    if(!document)return send(res,404,{code:'request_failed'},readHeaders);
    return send(res,200,{document,purchaseOrderLines:[{lineId:'QA-ORDER-LINE-001',itemId:'QA-ORDER-ITEM-001',quantity:'999999999999999999.0001',quantity2:null}],inboundRequestLines:[],page:Number(url.searchParams.get('page')??1),pageSize:50,hasMore:false},readHeaders);
   }
   if(route==='/api/purchase-requests'||route==='/api/documents/inbound-requests'){
    if(m.holdList)await new Promise(resolve=>m.waiters.push(resolve));
    if(m.status!==200){if(m.status===403)m.deniedLists++;return send(res,m.status,{code:'request_failed'},readHeaders);}
    const isPurchase=route==='/api/purchase-requests';
    const rows=m.empty?[]:isPurchase?(m.purchaseDocuments??[m.purchase]).map(document=>({documentId:document.purchaseRequestId,purchaseDate:document.header.purchaseDate,branchId:document.branchId,personSuggest:document.header.personSuggest,department:document.header.department,statusId:document.statusId,statusName:"Trạng thái tổng hợp",isLocked:document.isLocked})):(m.inboundDocuments??[m.inbound]).map(document=>({documentId:document.documentId,documentDate:'2026-10-01',branchId:document.header.branchId,statusId:document.statusId,statusName:"Trạng thái tổng hợp",isLocked:false}));
    const page=Number(url.searchParams.get('page')??1),size=isPurchase?20:50;const data={rows:m.paged?rows.slice((page-1)*size,page*size):rows,page,pageSize:size,hasMore:m.paged&&page*size<rows.length};m.listResponses++;return send(res,200,isPurchase?{scopeKey:scope,data}:data,isPurchase?readHeaders:m.listResponseHeaders??readHeaders);
   }
   if(route==='/api/documents/inbound-requests/detail'){
    const detail=readonlyProjection(url.searchParams.get('documentId'),Number(url.searchParams.get('page')??1));
    let headers=readHeaders;const status=m.projectionStatus;
    if(m.projectionKind==='malformed')detail.inboundRequestLines.push({lineId:'QA-PROJECTION-LINE',itemId:'QA-ITEM',setQuantityByDocument:42,barrelQuantityByDocument:'0',setQuantityByReal:null,barrelQuantityByReal:null});
    if(m.projectionKind==='wrong-document')detail.document.documentId='QA-OTHER-DOCUMENT';
    if(m.projectionKind==='wrong-branch')detail.document.branchId='QA-UNAUTHORIZED-BRANCH';
    if(m.projectionKind==='wrong-page')detail.page++;
    if(m.projectionKind==='wrong-page-size'&&detail.page===2)detail.pageSize=25;
    if(m.projectionKind==='wrong-read-scope')headers={...readHeaders,'X-Medcom-Read-Scope':'c'.repeat(64)};
    if(m.projectionKind==='wrong-session-scope')headers={...readHeaders,'X-Medcom-Session-Scope':'c'.repeat(64)};
    if(m.projectionKind==='missing-read-scope')headers={};
    if(m.holdProjection)await new Promise(resolve=>m.projectionWaiters.push(resolve));
    m.projectionResponses++;return send(res,status,status===200?detail:{code:'request_failed'},headers);
   }
   if(route==='/api/purchase-requests/detail'||route==='/api/inbound-requests/draft'){
    if(m.holdDetail)await new Promise(resolve=>m.detailWaiters.push(resolve));if(route==='/api/inbound-requests/draft')m.draftResponses++;if(m.detailStatus!==200)return send(res,m.detailStatus,{code:'backend_unavailable'});
    const id=url.searchParams.get('documentId');
    if(route==='/api/purchase-requests/detail'){const document=m.purchaseDocuments?m.purchaseDocuments.find(document=>document.purchaseRequestId===id):m.purchase;if(!document)return send(res,404,{code:'request_failed'});return send(res,200,{scopeKey:scope,data:{document,stateToken:'prs1.'+m.purchaseVersion.toString(16).padStart(64,'0'),commandAccess:{canSave:m.writable,canSubmit:m.writable,canLookup:m.writable,canAddLines:false,reason:m.writable?'available':'command_access_provider_unavailable'}}});}
    if(m.draftMalformed){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"scopeKey":');}
    if(m.draftEnvelope)return send(res,200,m.draftEnvelope);
    const document=m.inboundDocuments?m.inboundDocuments.find(document=>document.documentId===id):m.inbound;if(!document)return send(res,404,{code:'request_failed'});return send(res,200,{scopeKey:scope,access:{canRead:true,canSave:m.writable,canSend:m.writable,available:true,maxCommandBytes:1048576},data:{outcome:'Observed',document}});
   }
   if(req.method==='POST'&&['/api/inbound-requests/draft/save','/api/inbound-requests/draft/send-to-warehouse','/api/inbound-requests/draft/reconcile','/api/purchase-requests/save','/api/purchase-requests/submit','/api/purchase-requests/save/lookup','/api/purchase-requests/submit/lookup'].includes(route)){
    const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString('utf8'),command=JSON.parse(body);
    const isPurchase=route.startsWith('/api/purchase-requests/'),lookup=route.endsWith('/reconcile')||route.endsWith('/lookup');
    const id=isPurchase?command.idempotencyKey:command.operationId;
    if(lookup){assert.equal(body,m.originals.get(id),'Reconciliation preserves the exact original body');m.reconciles.push(sha(body));if(!isPurchase&&!m.receipts.has(id)&&(m.rejected||m.conflict))return send(res,200,{scopeKey:scope,data:{outcome:'OutcomeUnknown',receipt:null,code:null}});assert.ok(m.receipts.get(id),'Only a committed fixture receipt may be replayed');return send(res,200,{scopeKey:scope,data:isPurchase?{outcome:0,receipt:m.receipts.get(id)}:{outcome:'Replayed',receipt:m.receipts.get(id),code:null}});}
    m.writes.push({operationId:id,bodySha256:sha(body)});
    if(m.originals.has(id)){assert.equal(m.originals.get(id),body);return send(res,503,{code:'backend_unavailable'});}
    m.originals.set(id,body);if(m.holdCommands)await new Promise(resolve=>m.commandWaiters.push(resolve));
    if(m.rejected||m.conflict){m.commandResponses++;return send(res,200,{scopeKey:scope,data:{outcome:m.conflict?'Conflict':'Rejected',receipt:null,code:null}});}
    let receipt;
    if(isPurchase){
     const submit=route.endsWith('/submit');if(submit){m.purchase.statusId=2;m.purchase.isLocked=true;}else{m.purchase.header=structuredClone(command.header);for(const line of command.lineChanges){if(line.kind==='Remove')m.purchase.lines=m.purchase.lines.filter(row=>row.lineId!==line.lineId);else if(line.kind==='Update')m.purchase.lines=m.purchase.lines.map(row=>row.lineId===line.lineId?{lineId:line.lineId,values:line.values}:row);}}
     m.purchaseVersion++;receipt={actionId:'purchase-request.'+(submit?'submit':'save-draft'),idempotencyKey:id,document:structuredClone(m.purchase),stateToken:'prs1.'+m.purchaseVersion.toString(16).padStart(64,'0'),allocatedLines:[]};
    }else{
     if(command.action==='Save'){m.inbound.header=structuredClone(command.header);m.inbound.details=m.inbound.details.filter(row=>!command.removedDetailIds.includes(row.rowId));for(const row of command.detailUpserts){const next={...row,rowId:row.rowId??'QA-NEW-ROW',clientLineId:null};const at=m.inbound.details.findIndex(old=>old.rowId===next.rowId);if(at<0)m.inbound.details.push(next);else m.inbound.details[at]=next;}}else m.inbound.statusId=2;
     m.inbound.stateEqualityToken=(++m.inboundVersion).toString(16).toUpperCase().padStart(64,'0');receipt={operationId:id,documentId:m.inbound.documentId,statusId:m.inbound.statusId,stateEqualityToken:m.inbound.stateEqualityToken,auditId:'22222222-2222-4222-8222-222222222222',committedAtUtc:new Date().toISOString()};
    }
    m.receipts.set(id,receipt);m.effects++;m.commandResponses++;if(!isPurchase&&m.afterWriteDraftEnvelope)m.draftEnvelope=structuredClone(m.afterWriteDraftEnvelope);if(m.unknown)return send(res,503,{code:'backend_unavailable'});
    const wireReceipt=m.malformed?(isPurchase?{...receipt,idempotencyKey:'not-original'}:{...receipt,auditId:'invalid'}):receipt;
    return send(res,200,{scopeKey:scope,data:isPurchase?{outcome:0,receipt:wireReceipt}:{outcome:'Committed',receipt:wireReceipt,code:null}});
   }
  return send(res,404,{code:'request_failed'});
 }catch(error){errors.push(String(error));send(res,500,{code:'fixture_failure'});}});
 reset();server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const eventually=async check=>{const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,'Expected fixture condition did not settle');await new Promise(resolve=>setTimeout(resolve,20));}};
 const start=async(width,screen,patch={})=>{currentScenario={width,screen,stage:'start',responses:[],networkFailures:[]};releaseAll();await context?.close();reset(patch);context=await browser.newContext({viewport:{width,height:900}});page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));const scenario=currentScenario,bounded=(values,value)=>{values.push(value);if(values.length>32)values.shift();};page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/erp/'))bounded(scenario.responses,{path:url.pathname,status:response.status()});});page.on('requestfailed',request=>bounded(scenario.networkFailures,{path:new URL(request.url()).pathname,error:request.failure()?.errorText}));await page.route('**/api/erp/api/workspace',route=>model.workspaceNetwork?route.abort('failed'):route.continue());await page.goto(origin+'/?screen='+encodeURIComponent(screen)+(patch.configured?'&configured=1':''));};
 const recovery=()=>page.getByRole('heading',{name:'Chưa thể xác minh phiên làm việc',exact:true});
 const refresh=async()=>{const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/erp/api/workspace');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;await paint();};
 const gateOnly=async()=>{await paint();assert.equal(await page.locator('.topbar:visible,.erp-sidebar:visible,.workspace-content:visible,.mobile-bottom-nav:visible').count(),0);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.getByRole('menu').count(),0);assert.equal(await page.locator('[data-sonner-toast]:visible').count(),0);assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('section[tabindex="-1"]')),true);};
 const field=screen=>screen==='purchase-requests'?page.getByRole('textbox',{name:'Ghi chú',exact:true,includeHidden:true}):page.getByLabel('Số đơn',{exact:true});
 const open=screen=>page.getByRole('button',{name:screen==='purchase-requests'?'Mở đề nghị '+purchase.purchaseRequestId:new RegExp('^Mở phiếu '+inbound.documentId+' '),exact:screen==='purchase-requests'}).click();
 const save=async screen=>{await field(screen).fill('EXACT ORIGINAL AUTH CUSTODY');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();await page.getByRole('button',{name:screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi',exact:true}).click();};
 const life=screen=>page.evaluate(name=>({life:window.authFixture.life[name],adapters:window.authFixture.adapters[name]}),screen==='purchase-requests'?'RequestEditor':'InboundEditor');
 const go=id=>page.evaluate(id=>window.authFixture.tools.navigate_medcom_screen.execute({screen:id}),id);
 const diagnose=async(name,error)=>{
  if(firstFailure)return;firstFailure={name,error:String(error).slice(0,3000),scenario:currentScenario,passedCases:results.length,failedCases:1,completedCases:results.length+1,expectedCases,notRunCases:expectedCases-results.length-1,remainingStatus:'NOT_RUN',pageErrors:errors.slice(0,8),calls:calls.slice(-32),model:{paged:model.paged,listResponses:model.listResponses,detailStatus:model.detailStatus,writes:model.writes.length,reconciles:model.reconciles.length}};
  try{firstFailure.dom=await page.evaluate(()=>({readyState:document.readyState,screen:new URL(location.href).searchParams.get('screen'),selected:window.authFixture.navigation?.selectedId??null,historyIndex:history.state?.medcomWorkspace?.index,body:document.body?.innerText.slice(0,6000),tables:[...document.querySelectorAll('[data-shared-grid]')].slice(0,3).map(node=>({label:node.getAttribute('aria-label'),rows:node.querySelectorAll('[data-grid-row]').length,hidden:!!node.closest('[hidden],[inert],[aria-hidden="true"]')})),dialogs:[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].slice(0,4).map(node=>({role:node.getAttribute('role'),text:node.textContent?.slice(0,500),hidden:!!node.closest('[hidden],[inert]'),ariaHidden:!!node.closest('[aria-hidden="true"]')})),overlays:[...document.querySelectorAll('[data-slot$="overlay"]')].slice(0,6).map(node=>({slot:node.getAttribute('data-slot'),state:node.getAttribute('data-state'),pointerEvents:getComputedStyle(node).pointerEvents,animationName:getComputedStyle(node).animationName})),bodyPointerEvents:getComputedStyle(document.body).pointerEvents}));}catch(diagnosticError){firstFailure.domError=String(diagnosticError).slice(0,500);}
  try{await page.screenshot({path:path.join(output,'first-failure.png'),fullPage:false,timeout:2000});firstFailure.screenshot='first-failure.png';}catch(diagnosticError){firstFailure.screenshotError=String(diagnosticError).slice(0,500);}
  await writeFile(path.join(output,'first-failure.json'),JSON.stringify(firstFailure,null,2));t.diagnostic(JSON.stringify(firstFailure));
 };
 const run=(name,fn)=>runRequiredHistoryCase(t,name,async()=>{await fn();results.push(name);},diagnose);
 const selected=()=>page.evaluate(()=>window.authFixture.navigation?.selectedId??null);
 const index=()=>page.evaluate(()=>history.state?.medcomWorkspace?.index);
 const atIndex=async expected=>{await paint();await eventually(async()=>await index()===expected);};
 const warning=()=>page.getByRole('alertdialog');
 const cancel=()=>page.getByRole('button',{name:'Tiếp tục làm việc',exact:true}).click();
 const accept=()=>page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).click();
 const idFor=screen=>screen==='purchase-requests'?purchase.purchaseRequestId:inbound.documentId;
 const openReady=async screen=>{currentScenario.stage='open-list-row';await open(screen);currentScenario.stage='detail-ready';await field(screen).waitFor();await eventually(async()=>await selected()===idFor(screen));await paint();currentScenario.stage='scenario';};
 const back=()=>page.evaluate(()=>history.back());
 const forward=()=>page.evaluate(()=>history.forward());
 const privacy=async()=>{
  const state=await page.evaluate(()=>({url:location.href,state:history.state,local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))}));
  assert.doesNotMatch(JSON.stringify(state),/QA-(?:PURCHASE|INBOUND|ROW|LINE)|stateEqualityToken|idempotencyKey|operationId/);
  assert.deepEqual(Object.keys(state.state.medcomWorkspace).sort(),['index','owner']);assert.equal(state.state.medcomInboundHost,undefined);
 };
 const commandLabel=screen=>screen==='purchase-requests'?'Lưu nháp trên ERP':'Lưu thay đổi';
 const reconcileLabel=screen=>screen==='purchase-requests'?'Kiểm tra kết quả yêu cầu gốc':'Kiểm tra yêu cầu gốc';
 const dispatchReviewed=screen=>page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>button.textContent?.trim()===label)?.click(),commandLabel(screen));
 const releaseHistory=()=>page.evaluate(()=>window.authFixture.releaseHistory());
 const heldHistory=()=>page.evaluate(()=>window.authFixture.heldHistory.length);
 const login=async()=>{const form=page.getByRole('form',{name:'Đăng nhập ERP',exact:true});await form.getByLabel('Tên đăng nhập',{exact:true}).fill('same-synthetic-name');await form.getByLabel('Mật khẩu',{exact:true}).fill('synthetic-password');await form.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.topbar').waitFor();};
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,chromiumSandbox:true});
  for(const width of [1280,390])for(const screen of ['purchase-requests','inbound-requests']){
   await run(`${width} ${screen} accepted open Back Forward close preserve filtered page and scroll`,async()=>{
    const isPurchase=screen==='purchase-requests',size=isPurchase?20:50;
    const documents=Array.from({length:size*2},(_,i)=>isPurchase?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-PAGE-'+String(i+1).padStart(3,'0')}:{...structuredClone(inbound),documentId:'QA-INBOUND-PAGE-'+String(i+1).padStart(3,'0')});
    const target=isPurchase?documents[size].purchaseRequestId:documents[size].documentId;
    await start(width,screen,{paged:true,[isPurchase?'purchaseDocuments':'inboundDocuments']:documents});
    const search=page.getByLabel(isPurchase?'Tìm mã đề nghị':'Tìm phiếu nhập hàng',{exact:true});await search.fill('QA');
    await page.getByLabel(isPurchase?'Chi nhánh':'Lọc chi nhánh',{exact:true}).selectOption('QA-BRANCH');await search.press('Enter');
    const pager=page.getByRole('navigation',{name:isPurchase?'Phân trang đề nghị':'Trang danh sách phiếu',exact:true});
    await pager.getByRole('button',{name:'Trang sau',exact:true}).click();await pager.getByText('Trang 2',{exact:true}).waitFor();
    const opener=page.getByRole('button',{name:isPurchase?'Mở đề nghị '+target:new RegExp('^Mở phiếu '+target+' '),exact:isPurchase});await opener.waitFor();
    const list=await page.locator('.erp-grid').first().elementHandle();
    // Set only naturally scrollable production ancestors. Do not replace CSS or
    // inject a fake viewport; zero-overflow ancestors legitimately stay at zero.
    const offsets=await opener.evaluate(element=>{const result=[];for(let node=element.parentElement;node;node=node.parentElement){node.scrollTop=37;node.scrollLeft=29;result.push({top:node.scrollTop,left:node.scrollLeft});}element.focus({preventScroll:true});return result;});
    assert.ok(offsets.some(value=>value.top>0),'Fixture must exercise real vertical overflow');
    await opener.evaluate(element=>element.click());await field(screen).waitFor();await atIndex(1);await privacy();
    await page.keyboard.press('Control+k');assert.equal(await page.locator('.command-modal:visible').count(),0);
    const box=await page.locator('.request-detail-dialog:visible').boundingBox();assert.ok(box);assert.ok(box.x>=-1&&box.x+box.width<=width+1);assert.ok(box.y>=-1&&box.y+box.height<=901);
    if(width===390){assert.ok(box.width>=389);assert.ok(box.height>=899);}else assert.ok(box.width<width);
    await back();await eventually(async()=>await selected()===null);await atIndex(0);assert.equal(await search.inputValue(),'QA');assert.equal(await page.getByLabel(isPurchase?'Chi nhánh':'Lọc chi nhánh',{exact:true}).inputValue(),'QA-BRANCH');await pager.getByText('Trang 2',{exact:true}).waitFor();
    assert.equal(await list.evaluate(element=>element.isConnected),true);await eventually(()=>opener.evaluate(element=>document.activeElement===element));
    assert.deepEqual(await opener.evaluate(element=>{const result=[];for(let node=element.parentElement;node;node=node.parentElement)result.push({top:node.scrollTop,left:node.scrollLeft});return result;}),offsets);
    await forward();await field(screen).waitFor();await eventually(async()=>await selected()===target);await atIndex(1);
    await page.keyboard.press('Escape');await eventually(async()=>await selected()===null);await atIndex(0);await forward();await field(screen).waitFor();await atIndex(1);
    await page.getByTitle('Đóng hộp thoại',{exact:true}).click();await eventually(async()=>await selected()===null);await atIndex(0);await forward();await field(screen).waitFor();await atIndex(1);await go(screen);await eventually(async()=>await selected()===null);await atIndex(0);
    await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'Tìm màn hình',exact:true}).waitFor();await page.keyboard.press('Escape');
    assert.equal(model.writes.length,0);assert.ok(calls.some(call=>call.query.includes('page=2')&&call.query.includes('QA')));await privacy();
   });
   await run(`${width} ${screen} dirty canceled close and open never advance history or run obsolete choice`,async()=>{
    const second=screen==='purchase-requests'?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-002'}:{...structuredClone(inbound),documentId:'QA-INBOUND-002'};
    const secondId=second.purchaseRequestId??second.documentId;
    await start(width,screen,{[screen==='purchase-requests'?'purchaseDocuments':'inboundDocuments']:[screen==='purchase-requests'?structuredClone(purchase):structuredClone(inbound),second]});await openReady(screen);await atIndex(1);await field(screen).fill('RETAIN ON CANCEL');
    await back();await warning().waitFor();await atIndex(1);await back();await warning().waitFor();await atIndex(1);await cancel();await paint();assert.equal(await selected(),idFor(screen));assert.equal(await field(screen).inputValue(),'RETAIN ON CANCEL');
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();await cancel();await atIndex(1);assert.equal(await selected(),idFor(screen));
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();const obsolete=await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).elementHandle();
    await back();await warning().waitFor();await atIndex(1);await cancel();await obsolete.evaluate(element=>element.click());await paint();assert.equal(await selected(),idFor(screen));assert.equal(await field(screen).inputValue(),'RETAIN ON CANCEL');
    await back();await warning().waitFor();await accept();await eventually(async()=>await selected()===null);await atIndex(0);await forward();await openReadyOrExisting(screen);await atIndex(1);assert.equal(await selected(),idFor(screen));assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} newer route while apply is held supersedes prior detail traversal`,async()=>{
    await start(width,screen);await openReady(screen);await atIndex(1);
    await page.evaluate(()=>{window.authFixture.holdHistory=true;history.back();});await eventually(async()=>await heldHistory()===1);assert.equal(await selected(),idFor(screen));
    await releaseHistory();await eventually(async()=>await heldHistory()===1&&await selected()===null);await atIndex(1);
    await go('home');await releaseHistory();await eventually(async()=>await heldHistory()===1);await page.evaluate(()=>{window.authFixture.holdHistory=false;window.authFixture.releaseHistory();});
    await eventually(()=>new URL(page.url()).searchParams.get('screen')==='home');await atIndex(2);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} final screen apply rechecks newly dispatched non-discardable original`,async()=>{
    await start(width,'home',{holdCommands:true,unknown:true});await page.locator('.topbar').waitFor();await go(screen);await openReady(screen);await atIndex(2);await field(screen).fill('LATE ORIGINAL');await page.getByRole('button',{name:'Rà soát phiếu',exact:true}).click();
    await page.evaluate(()=>{window.authFixture.holdHistory=true;window.authFixture.userTraverse(-2);});await eventually(async()=>await heldHistory()===1);await releaseHistory();await warning().waitFor();await atIndex(2);await accept();await eventually(async()=>await heldHistory()===1);
    await dispatchReviewed(screen);await eventually(()=>model.commandWaiters.length===1);const original=model.writes[0];await paint();await releaseHistory();await eventually(async()=>await heldHistory()===1);await page.evaluate(()=>{window.authFixture.holdHistory=false;window.authFixture.releaseHistory();});await warning().waitFor();await atIndex(2);
    assert.equal(await selected(),idFor(screen));assert.equal(new URL(page.url()).searchParams.get('screen'),screen);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);assert.equal(model.writes.length,1);assert.equal(model.writes[0].bodySha256,original.bodySha256);await cancel();release('Commands');await eventually(()=>model.effects===1);await privacy();
   });
   await run(`${width} ${screen} pending unknown and readback custody survive Back outage and recovery`,async()=>{
    await start(width,screen,{holdCommands:true,unknown:true});await openReady(screen);await save(screen);await eventually(()=>model.commandWaiters.length===1);const original=model.writes[0],originalBody=model.originals.get(original.operationId),originalDto=JSON.parse(originalBody),retained=await life(screen);
    assert.equal(originalDto[screen==='purchase-requests'?'idempotencyKey':'operationId'],original.operationId);assert.equal(originalDto.header[screen==='purchase-requests'?'notes':'orderNumber'],'EXACT ORIGINAL AUTH CUSTODY');
    await back();await warning().waitFor();await atIndex(1);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);
    model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();assert.deepEqual(await life(screen),retained);release('Commands');await eventually(()=>model.effects===1);
    await back();await paint();await atIndex(1);await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await waitForHistoryOriginal(page,screen,idFor(screen),'EXACT ORIGINAL AUTH CUSTODY',eventually);await paint();assert.equal(await selected(),idFor(screen));assert.deepEqual(await life(screen),retained);await atIndex(1);await back();await warning().waitFor();assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);await cancel();
    if(screen==='inbound-requests')model.holdDetail=true;
    await page.getByRole('button',{name:reconcileLabel(screen),exact:true}).click();await eventually(()=>model.reconciles.length===1);assert.equal(model.reconciles[0],original.bodySha256);
    if(screen==='inbound-requests'){
     await eventually(()=>model.detailWaiters.length>0);await back();await warning().waitFor();await atIndex(1);assert.equal(await page.getByRole('button',{name:'Bỏ thay đổi và rời màn hình',exact:true}).count(),0);await cancel();release('Detail');
     await page.locator('[data-testid="inbound-editor"][data-phase="editing"]').waitFor();await eventually(()=>page.locator('[data-testid="inbound-request-host"][data-readback-pending="false"]').isVisible());await field(screen).waitFor();assert.equal(await field(screen).inputValue(),'EXACT ORIGINAL AUTH CUSTODY');
    }else await page.getByText('Nháp đã được ERP xác nhận',{exact:true}).waitFor();
    const posts=await page.evaluate(()=>window.authFixture.posts);assert.equal(posts.length,2);assert.equal(posts[0].body,originalBody);assert.equal(posts[1].body,originalBody);assert.equal(model.originals.get(original.operationId),originalBody);await atIndex(1);assert.equal(await selected(),idFor(screen));
    assert.equal(model.writes.length,1);assert.equal(model.effects,1);assert.deepEqual(await life(screen),retained);evidence.push({width,screen,originalBodySha256:original.bodySha256,reconcileBodySha256:model.reconciles[0],dispatches:model.writes.length,effects:model.effects});await privacy();
   });
   await run(`${width} ${screen} rejected or canceled Forward cannot capture a later manual Open`,async()=>{
    const isPurchase=screen==='purchase-requests',second=isPurchase?{...structuredClone(purchase),purchaseRequestId:'QA-PURCHASE-002'}:{...structuredClone(inbound),documentId:'QA-INBOUND-002'},secondId=second.purchaseRequestId??second.documentId;
    const rowsPatch={[isPurchase?'purchaseDocuments':'inboundDocuments']:[isPurchase?structuredClone(purchase):structuredClone(inbound),second]};
    await start(width,screen,rowsPatch);await openReady(screen);await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await eventually(async()=>await selected()===secondId);await atIndex(2);await field(screen).waitFor();
    await back();await eventually(async()=>await selected()===idFor(screen));await atIndex(1);await field(screen).waitFor();await back();await eventually(async()=>await selected()===null);await atIndex(0);
    model.empty=true;await refreshHistoryRows(page,screen,[],eventually);await atIndex(0);assert.equal(await selected(),null);
    await forward();await paint();await atIndex(0);assert.equal(await selected(),null);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);
    model.empty=false;await refreshHistoryRows(page,screen,[idFor(screen),secondId],eventually);await atIndex(0);assert.equal(await selected(),null);await page.getByRole('button',{name:isPurchase?'Mở đề nghị '+idFor(screen):new RegExp('^Mở phiếu '+idFor(screen)+' '),exact:isPurchase}).waitFor();
    const afterRefusal=await page.evaluate(()=>window.authFixture.historyCalls.length);await openReady(screen);await atIndex(1);assert.equal(await page.evaluate(()=>window.authFixture.historyCalls.length),afterRefusal,'A later manual Open creates a new entry, never applies a refused Forward');await forward();await paint();await atIndex(1);assert.equal(await selected(),idFor(screen),'Manual Open truncates the old Forward B entry');
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await eventually(async()=>await selected()===secondId);await atIndex(2);await field(screen).waitFor();await back();await eventually(async()=>await selected()===idFor(screen));await atIndex(1);await field(screen).fill('CANCELED FORWARD');
    await forward();await warning().waitFor();await atIndex(1);await cancel();const afterCancel=await page.evaluate(()=>window.authFixture.historyCalls.length);
    await page.evaluate(id=>window.authFixture.navigation.requestOpen(id),secondId);await warning().waitFor();await accept();await eventually(async()=>await selected()===secondId);await atIndex(2);assert.equal(await page.evaluate(()=>window.authFixture.historyCalls.length),afterCancel,'Cancel retires the old Forward expectation before a later accepted manual Open');assert.equal(model.writes.length,0);await privacy();
   });
   await run(`${width} ${screen} queued history is masked by outage and obsolete login details cannot replay`,async()=>{
    await start(width,screen);await openReady(screen);await field(screen).fill('OLD LOGIN DRAFT');await back();await warning().waitFor();await atIndex(1);model.workspaceStatus=503;await refresh();await recovery().waitFor();await gateOnly();model.workspaceStatus=200;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await warning().waitFor();await cancel();assert.equal(await field(screen).inputValue(),'OLD LOGIN DRAFT');await atIndex(1);
    model.workspaceStatus=401;await refresh();await page.getByRole('form',{name:'Đăng nhập ERP',exact:true}).waitFor();await gateOnly();model.workspaceStatus=200;await login();assert.equal(new URL(page.url()).searchParams.get('screen'),screen);await eventually(()=>page.evaluate(()=>!!window.authFixture.navigation));assert.equal(await selected(),null);
    await back();await atIndex(0);await forward();await atIndex(1);assert.equal(await selected(),null);assert.equal(await page.locator('.request-detail-dialog:visible').count(),0);assert.equal(await warning().count(),0);assert.equal(model.writes.length,0);await privacy();
   });
  }
  assert.deepEqual(errors,[]);assert.equal(results.length,expectedCases,'Every required history case must complete');
 }catch(error){fatal=String(error);throw error;}finally{
  const sourcePaths=['components/erp/workspace.tsx','components/erp/navigation-guard.tsx','components/erp/request-detail-dialog.tsx','components/erp/purchase-request-screen.tsx','components/erp/inbound-request-screen.tsx','tests/request-detail-history.browser.mjs'];
  const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async file=>[file,sha(await readFile(path.join(app,file)))])));
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'evidence.json'),JSON.stringify({...historyOutcome(results,errors,firstFailure,fatal,expectedCases),firstFailure,fatal,results,errors,browserVersion:browser?.version()??null,node:process.version,sourceHashes,evidence,scope:'Actual composed Workspace, request hosts, production clients and guard; synthetic HTTP and native history timing instrumentation. Not ERP/SQL acceptance.'},null,2));
  releaseAll();await context?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 async function openReadyOrExisting(screen){await field(screen).waitFor();await eventually(async()=>await selected()===idFor(screen));}
});
