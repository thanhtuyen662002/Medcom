import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {build} from 'esbuild';import {readFile,mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
await mkdir('.test-runtime/i50-render',{recursive:true});
await build({stdin:{contents:`export {WorkspaceSearch,screenFinderShortcut} from './components/erp/workspace-search';export {ScreenHeader} from './components/erp/screen-shell';export {ListLoading} from './components/erp/list-loading';export {RequestListComposition,RequestListPanel,RequestListContent,RequestListTable,RequestListToolbar,RequestSearch,RequestBranch,RequestRefresh} from './components/erp/request-list-shell';export {RecordDialog,RecordActionBar,RecordDetailToolbar,RecordDetailStatus,RecordSection,RecordFieldset} from './components/erp/record-dialog';export {RequestHelp} from './components/erp/request-help';export {MobileRequest} from './components/erp/mobile-request';export {MobileInboundRequest} from './components/erp/mobile-inbound-request';export {RequestLoading,RequestError} from './components/erp/request-presentation';export {ApiError} from './lib/erp/api';export {ConfiguredDocumentSheet} from './components/erp/configured-screen';export {ReportWorkspace} from './components/erp/reports';export {QueryClient,QueryClientProvider} from '@tanstack/react-query';`,loader:'tsx',resolveDir:process.cwd()},outfile:'.test-runtime/i50-render/ui.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning'});
const {WorkspaceSearch,screenFinderShortcut,RecordDetailToolbar,RecordDetailStatus,RecordSection,RecordFieldset,ScreenHeader,ListLoading,RequestListComposition,RequestListPanel,RequestListContent,RequestListTable,RequestListToolbar,RequestSearch,RequestBranch,RequestRefresh,RecordDialog,RecordActionBar,MobileRequest,RequestHelp,RequestLoading,RequestError,ApiError,ConfiguredDocumentSheet,ReportWorkspace,QueryClient,QueryClientProvider}=require('../.test-runtime/i50-render/ui.cjs'),h=React.createElement;
test('all actual list hosts use shared composition/loading/header and do not expose a scanner or per-screen guide',async()=>{
 for(const name of ['purchase-request-screen','inbound-request-screen','documents']){const source=await readFile(`components/erp/${name}.tsx`,'utf8');assert.match(source,/RequestListComposition/);assert.match(source,/<RequestListPanel\b/);assert.match(source,/<RequestListContent\b/);assert.match(source,/RequestListToolbar/);assert.match(source,/RequestListHeader/);assert.match(source,/RequestLoading/);assert.match(source,/useListControls/);assert.doesNotMatch(source,/RequestQrSearch|TabsTrigger[^>]*value="guide"/);}
 const shell=await readFile('components/erp/workspace.tsx','utf8');assert.match(shell,/<RequestHelp\/>/);assert.match(shell,/<ListViewProvider store={listViews}>/);assert.match(shell,/listViews\.admit\(JSON\.stringify\(\[key,scope\]\)\)/);assert.match(shell,/listViews\.retire\(\)/);assert.match(shell,/setGuideOpen\(true\).*presentationCurrent/);
});
test('real components SSR escape IDs, keep decimal text, show table-shaped verification, and accept only explicit assigned branch locking',()=>{
 const output=renderToStaticMarkup(h(RequestListTable,{label:'QA table',columns:[{id:'id',label:'Mã phiếu'},{id:'quantity',label:'Số lượng'}],rows:[{id:'QA',cells:['QA-<script>','999999999999999999.0001'],action:'Mở',actionLabel:'Mở QA',onOpen:()=>{throw Error('SSR must not invoke Open');}}]}));
 assert.match(output,/data-selectable="false"/);assert.doesNotMatch(output,/role="checkbox"/);assert.match(output,/Tùy chỉnh bảng/);assert.match(output,/999999999999999999\.0001/);assert.match(output,/QA-&lt;script&gt;/);assert.doesNotMatch(output,/<script>/);
 const skeleton=renderToStaticMarkup(h(ListLoading,{label:'Xác minh ERP'}));assert.match(skeleton,/aria-busy="true"/);assert.equal((skeleton.match(/class="skeleton-table-row"/g)??[]).length,6);assert.doesNotMatch(skeleton,/h-24|QA-/);
 const generic=renderToStaticMarkup(h(RequestBranch,{label:'Branch',value:'',branches:[],onChange:()=>{}}));assert.match(generic,/Tất cả/);assert.doesNotMatch(generic,/MB|MN|disabled/);
 const fixed=renderToStaticMarkup(h(RequestBranch,{label:'Branch',value:'',branches:['MB','MN'],assignedBranchId:'MB',onChange:()=>{}}));assert.match(fixed,/disabled=""/);assert.match(fixed,/<option value="MB" selected="">MB/);assert.doesNotMatch(fixed,/Tất cả/);
});
test('retained record shell renders business identity and preserves children while masking; creation grants no implicit action',()=>{
 const masked=renderToStaticMarkup(h(RecordDialog,{open:true,presentationAllowed:false,title:'QA record',documentNumber:'QA-DOC',closeLabel:'Đóng',onRequestClose:()=>{}},h('input',{value:'RETAINED EDIT',readOnly:true})));assert.match(masked,/hidden="" inert=""/);assert.match(masked,/RETAINED EDIT/);
 const fencedActions=renderToStaticMarkup(h(RecordActionBar,{presentationAllowed:false},h("button",null,"PROTECTED ACTION")));assert.match(fencedActions,/hidden="" inert="" aria-hidden="true"/);
 const create=renderToStaticMarkup(h(RecordDialog,{open:true,mode:'create',title:'QA create',closeLabel:'Đóng',onRequestClose:()=>{}},h('p',null,'Không có hợp đồng tạo mới')));assert.match(create,/data-record-mode="create"/);assert.doesNotMatch(create,/Lưu|Xóa|Gửi/);
});
test('synthetic render evidence uses production components and compiled CSS without requests or private data',async()=>{
 const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'})).css;assert.ok(!css.includes('@import "tailwindcss"'));
 const rows=Array.from({length:6},(_,index)=>({id:`QA-DOC-${index+1}`,cells:[`QA-DOC-${index+1}`,'MB','Chưa có trạng thái'],action:'Mở',actionLabel:`Mở QA-DOC-${index+1}`,onOpen:()=>{}}));
 const list=h(RequestListComposition,null,h(RequestListPanel,null,h(ScreenHeader,{title:'Danh sách chứng từ kiểm thử',description:'Dữ liệu tổng hợp, không kết nối ERP.'}),h(RequestListToolbar,{onSubmit:()=>{}},h(RequestSearch,{label:'Tìm mã',placeholder:'Tìm mã…',value:'',onChange:()=>{}}),h(RequestBranch,{label:'Chi nhánh',value:'',branches:['MB','MN'],onChange:()=>{}}),h(RequestRefresh,{onClick:()=>{}})),h(RequestListContent,null,h(RequestListTable,{label:'Danh sách kiểm thử',columns:[{id:'id',label:'Mã chứng từ'},{id:'branch',label:'Chi nhánh'},{id:'status',label:'Trạng thái'}],rows}))));
 const content=renderToStaticMarkup(h('main',{className:'workspace-content'},h(ScreenHeader,{level:1,title:'Medcom · Kiểm thử giao diện',description:'SSR thực tế — cần trình duyệt để xác nhận responsive và focus.'}),list,h(ListLoading,{label:'Đang xác minh ERP'}),h(RequestHelp)));
 const html='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Medcom I50 synthetic render</title><style>'+css+'</style><body>'+content+'</body></html>';
 assert.doesNotMatch(content,/https?:\/\/(?!www\.w3\.org)/);await writeFile('.test-runtime/i50-render/synthetic-ui.html',html);
 const deniedWrite=async()=>{throw Error('Synthetic SSR must never invoke a service');};
 const initial={documentId:'QA-DOC-ONLY',version:'synthetic',confirmation:'draft',status:{id:'0',label:'Tổng hợp'},values:{purchaseDate:'2026-10-08',personSuggest:'',department:'',purposeId:'',purposeDescOrClient:'',notes:'',branchId:'MB',currencyId:'',objectId:'',lines:[{localKey:'QA-INTERNAL',lineId:'INTERNAL-HIDDEN-ID',itemId:'QA-ITEM',quantity:'',unitPrice:'',budget:'',timeRequired:'',model:''}]}};
 const access={scopeKey:'synthetic-ssr',canRead:true,canEdit:false,canSaveDraft:false,canSubmit:false,available:true,existingOnly:true,branches:[{id:'MB',label:'MB'}],currencies:[],purposes:[],maxNotesLength:2000,maxPurposeLength:2000,maxLines:500,itemLookupId:'synthetic-item',objectLookupId:'synthetic-object'};
 const record=renderToStaticMarkup(h(RecordDialog,{open:true,title:'Đề nghị mua hàng',documentNumber:initial.documentId,closeLabel:'Đóng',onRequestClose:()=>{}},h(MobileRequest,{initial,access,adapter:{execute:deniedWrite,reconcile:deniedWrite,lookup:deniedWrite}})));
 assert.match(record,/QA-ITEM/);assert.doesNotMatch(record,/INTERNAL-HIDDEN-ID/);
 await writeFile('.test-runtime/i50-render/synthetic-record.html','<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic readonly record</title><style>'+css+'</style><body>'+record+'</body></html>');await writeFile('.test-runtime/i50-render/render-evidence.json',JSON.stringify({status:'PASS',method:'ReactDOMServer production components + production build CSS',nativeBrowser:'NOT_RUN',responsiveGeometry:'NOT_RUN',focusAndStacking:'NOT_RUN',data:'synthetic only',requests:0},null,2)+'\n');
});

test('actual delete confirmation rejects queued prior targets and revoked authority',async()=>{
 const names=['AlertDialog','AlertDialogContent','AlertDialogHeader','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'];
 const primitives="import React from 'react';"+names.map(name=>`export function ${name}({children,...props}){return React.createElement('${name==='AlertDialogAction'||name==='AlertDialogCancel'?'button':'div'}',props,children);}`).join('');
 await build({stdin:{contents:"export {RecordDeleteConfirmation} from './components/erp/record-delete-confirmation';",loader:'tsx',resolveDir:process.cwd()},outfile:'.test-runtime/i50-render/delete-test.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning',plugins:[{name:'DOM-only-modal-primitives',setup(build){build.onLoad({filter:/components[\\/]ui[\\/]alert-dialog\.tsx$/},()=>({contents:primitives,loader:'jsx'}));}}]});
 const {RecordDeleteConfirmation}=require('../.test-runtime/i50-render/delete-test.cjs'),{act,create}=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const first={},second={};let confirmed=0,allowed=true,tree;const render=intent=>h(RecordDeleteConfirmation,{open:true,intent,identity:'Dòng 1 · QA-ITEM',presentationAllowed:allowed,isAllowed:()=>allowed,onCancel:()=>{},onConfirm:()=>{confirmed++;}});
 try{await act(async()=>{tree=create(render(first));});const action=()=>tree.root.findAllByType('button').find(button=>button.children.includes('Xóa dòng'));const queued=action().props.onClick;await act(async()=>tree.update(render(second)));await act(async()=>queued());assert.equal(confirmed,0,'old local removal target cannot become the new target');await act(async()=>action().props.onClick());assert.equal(confirmed,1);const current=action().props.onClick;allowed=false;await act(async()=>tree.update(render(second)));await act(async()=>current());assert.equal(confirmed,1,'authority loss fences an already queued confirmation');allowed=true;await act(async()=>tree.update(render(second)));await act(async()=>current());assert.equal(confirmed,1,'Same-target presentation restoration cannot revive a queued old confirmation');await act(async()=>action().props.onClick());assert.equal(confirmed,2,'Fresh current confirmation remains actionable');}finally{await act(async()=>tree?.unmount());}
});


test('shared LIST panel leaves viewport sticky ancestry visible and clips only sibling content (static/SSR, not native scroll)',async()=>{
 const html=renderToStaticMarkup(h(RequestListComposition,null,h(RequestListPanel,{className:'caller-panel'},h(RequestListToolbar,null,h('input',{readOnly:true})),h(RequestListContent,null,h('div',null,'SYNTHETIC CONTENT')))));
 assert.match(html,/data-list-panel=""[^>]*class="[^"]*request-list-panel/);assert.match(html,/data-list-content=""[^>]*class="request-list-content/);assert.equal((html.match(/request-list-panel/g)??[]).length,1);
 const css=require('postcss').parse(await readFile('app/globals.css','utf8'));const declarations=selector=>{const found={};css.walkRules(selector,rule=>{rule.walkDecls(decl=>{found[decl.prop]=decl.value;});});return found;};
 assert.equal(declarations('.request-list-panel').overflow,'visible');assert.equal(declarations('.request-list-content').overflow,'hidden');assert.equal(declarations('.request-panel').overflow,'hidden','Generic panels and modal clipping are not globally relaxed');assert.equal(declarations('.document-panel').overflow,undefined,'No orders-only overflow escape remains');assert.equal(declarations('.request-list-toolbar').position,'sticky');
 await writeFile('.test-runtime/i50-render/list-panel-contract.json',JSON.stringify({status:'PASS',method:'actual components SSR + PostCSS source declarations',nativeScroll:'NOT_RUN',listPanel:'overflow:visible',innerContent:'overflow:hidden',genericPanelClipping:'preserved',screens:['purchase-requests','purchase-orders','inbound-requests']},null,2)+'\n');
});

test('approved configured/report loading hosts reach shared form/list geometry without transport (actual SSR)',async()=>{
 const blocked=async()=>{assert.fail('Synthetic SSR must not dispatch service calls');};const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const workspace={session:{tenantId:'QA-T',companyId:'QA-C',authorityVersion:1,capabilities:['purchase-orders.read']},sessionScope:'QA-SESSION',readScope:'QA-READ',branchIds:['QA-BRANCH'],navigation:[]};
 const wrapped=node=>renderToStaticMarkup(h(QueryClientProvider,{client},node));
 try{
  const form=renderToStaticMarkup(h(RequestLoading,{form:true,label:'Synthetic form verification'}));assert.match(form,/form-skeleton/);assert.equal((form.match(/class="skeleton-fields"/g)??[]).length,1);assert.doesNotMatch(form,/skeleton-table-row/);
  const configured=wrapped(h(ConfiguredDocumentSheet,{screen:'purchase-orders',workspace,extension:{load:blocked},documentId:'QA-DOC',selected:null,close:()=>{},onDenied:()=>{}}));assert.match(configured,/aria-label="Đang xác minh chứng từ"/);assert.match(configured,/form-skeleton/);assert.doesNotMatch(configured,/h-60/);
  const reports=wrapped(h(ReportWorkspace,{adapter:{catalog:blocked,jobs:blocked,start:blocked,reconcileStart:blocked,download:blocked},lookupAdapter:blocked,scopeKey:'synthetic-ssr',onDenied:()=>{}}));assert.equal((reports.match(/aria-busy="true"/g)??[]).length,3);assert.match(reports,/form-skeleton/);assert.equal((reports.match(/class="skeleton-table-row"/g)??[]).length,12);
  const inboundSource=await readFile('components/erp/mobile-inbound-request.tsx','utf8');assert.match(inboundSource,/state\.phase==="loading"&&!unresolved&&!state\.awaitingSnapshot&&<RequestLoading form/);assert.match(inboundSource,/state\.awaitingSnapshot&&<p role="alert">/);assert.match(inboundSource,/unresolved&&<div><p>Yêu cầu gốc:/);
 }finally{client.clear();}
});

test('shared dialog exposes its actual scroll owner and orders bind guarded capture/restoration there (SSR/source, not native scroll)',async()=>{
 const bodyRef=React.createRef();const html=renderToStaticMarkup(h(RecordDialog,{open:true,title:'Synthetic order',closeLabel:'Đóng',onRequestClose:()=>{},bodyRef,onBodyScroll:()=>{}},h('div',{className:'detail-body'},'QA-CONTENT')));assert.match(html,/class="request-detail-body"><div class="detail-body"/);
 const source=await readFile('components/erp/workspace.tsx','utf8');assert.match(source,/<RecordDialog bodyRef={detailViewport} onBodyScroll=/);assert.match(source,/if\(presentationAllowed&&read\.active&&detail\)scroll\.current=event\.currentTarget\.scrollTop/);assert.match(source,/if\(presentationAllowed&&read\.active&&detail&&detailViewport\.current\)detailViewport\.current\.scrollTop=scroll\.current/);assert.doesNotMatch(source,/<div ref={detailViewport} className="detail-body"/);
});


test('I59 shared refresh forwards exact caller state, handler and ref; branch IDs and locking stay native',async()=>{
 const {act,create}=require('react-test-renderer');const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const click=()=>{},ref=React.createRef();let tree;
 try{
  await act(async()=>{tree=create(h(RequestRefresh,{disabled:true,onClick:click,ref,refreshing:true,className:'caller-refresh'}));});
  let button=tree.root.findByType('button');assert.equal(button.props.type,'button');assert.equal(button.props['aria-label'],'Làm mới');assert.equal(button.props.disabled,true);assert.strictEqual(button.props.onClick,click);assert.strictEqual(button.props.ref,ref);assert.match(button.props.className,/caller-refresh/);assert.match(tree.root.findByType('svg').props.className,/spin/);assert.equal(tree.root.findByType('svg').props['aria-hidden'],'true');
  await act(async()=>tree.update(h(RequestRefresh,{disabled:false,onClick:click,ref})));
  button=tree.root.findByType('button');assert.equal(button.props.disabled,false);assert.strictEqual(button.props.onClick,click);assert.doesNotMatch(tree.root.findByType('svg').props.className,/spin/);
  const branches=['QA-BRANCH','ERP-SOURCE-ID-UNCHANGED'];
  for(const assignedBranchId of [undefined,'ERP-SOURCE-ID-UNCHANGED']){
   const html=renderToStaticMarkup(h(RequestBranch,{label:'Source branch',value:'QA-BRANCH',branches,assignedBranchId,onChange:()=>{}}));
   for(const id of branches)assert.match(html,new RegExp('<option value="'+id+'"(?: selected="")?>'+id+'</option>'));
   assert.equal(/disabled=""/.test(html),assignedBranchId!==undefined);assert.equal(/>Tất cả<\/option>/.test(html),assignedBranchId===undefined);assert.match(html,/lucide-chevron-down/);assert.doesNotMatch(html,/role="combobox"/);
  }
  const expected=[['documents','disabled={query.isFetching||!allowed} onClick={()=>void query.refetch()}'],['purchase-request-screen','disabled={busy} onClick={()=>move(()=>{cancelFocus();setRefresh(value=>value+1);})}'],['inbound-request-screen','disabled={!contextCurrent||!currentRows} onClick={()=>navigate(()=>{cancelFocus();setRetry(value=>value+1);})}']];
  for(const [name,contract]of expected){const source=await readFile(`components/erp/${name}.tsx`,'utf8');assert.ok(source.includes(contract),name+' preserves its exact refresh authority/custody callback');assert.equal((source.match(/<RequestRefresh\b/g)??[]).length,1);}
 }finally{if(tree)await act(async()=>tree.unmount());if(previous===undefined)delete globalThis.IS_REACT_ACT_ENVIRONMENT;else globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
});

test('I59 compiled mobile toolbar overrides the exact desktop padding specificity and keeps desktop rules',async()=>{
 const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');const compiled=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'})).css;
 const root=postcss.parse(compiled),rules=[];root.walkRules(rule=>rules.push(rule));
 const exact=selector=>rules.filter(rule=>rule.selectors.includes(selector));
 const declarations=rule=>Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
 const mobile=rule=>rule.parent.type==='atrule'&&rule.parent.name==='media'&&/^\(max-width:\s*767px\)$/.test(rule.parent.params)&&rule.parent.parent.type==='root';
 const afterDesktop=(selector,property,desktopValue,mobileValue)=>{
  const matches=exact(selector),desktop=matches.find(rule=>rule.parent.type==='root'),narrow=matches.filter(mobile).at(-1);
  assert.ok(desktop&&narrow,selector+' requires the exact same unlayered selector in desktop and mobile');assert.equal(declarations(desktop)[property],desktopValue);assert.equal(declarations(narrow)[property],mobileValue);assert.ok(rules.indexOf(narrow)>rules.indexOf(desktop));return narrow;
 };
 const select=afterDesktop('.request-list-branch .request-select','padding-inline','36px 32px','12px 36px');assert.equal(declarations(select)['font-size'],'16px');
 afterDesktop('.request-list-search:has(kbd) .request-input','padding-right','48px','12px');
 const kbd=exact('.request-list-search > kbd').filter(mobile).at(-1);assert.equal(declarations(kbd).display,'none');
 const building=exact('.request-list-branch > svg:first-of-type').filter(mobile).at(-1);assert.equal(declarations(building).display,'none');
 assert.ok(exact('.request-list-branch > svg').every(rule=>declarations(rule).display!=='none'),'Mobile must not hide the dropdown chevron with the building icon');
 assert.equal(declarations(exact('.request-list-branch > svg:last-child')[0]).right,'12px');
 const toolbar=exact('.request-panel .request-list-toolbar').filter(mobile).at(-1);assert.equal(declarations(toolbar).display,'grid');assert.equal(declarations(toolbar)['grid-template-columns'],'minmax(0,1fr) 44px');
 const branch=exact('.request-list-toolbar .request-list-branch').filter(mobile).at(-1);assert.equal(declarations(branch)['grid-column'],'1');assert.equal(declarations(branch)['min-width'],'0');
 const refresh=exact('.request-list-toolbar .request-list-refresh').filter(mobile).at(-1);assert.equal(declarations(refresh).width,'44px');assert.equal(declarations(refresh).height,'44px');
 const search=exact('.request-list-toolbar .request-list-search').filter(mobile).at(-1);assert.equal(declarations(search)['grid-column'],'1/-1');
 assert.equal(declarations(exact('.request-list-refresh-label').filter(mobile).at(-1)).display,'none');
 await writeFile('.test-runtime/i50-render/i59-toolbar-compiled-contract.json',JSON.stringify({status:'PASS',method:'actual React components + compiled Tailwind CSS specificity',nativeGeometry:'NOT_RUN',mobileWidths:[320,360,390],nativeEvidenceRequired:true,desktopPadding:'preserved',selectPadding:'12px 36px',searchShortcut:'hidden without reserved padding',refresh:'shared labeled 44px icon button'},null,2)+'\n');
});


test('I61 shared search platform labels and detail toolbar keep bounded presentation contracts',async()=>{
 for(const [platform,label,keys] of [['Win32','Ctrl+K','Control+K'],['Linux x86_64','Ctrl+K','Control+K'],['MacIntel','Cmd+K','Meta+K'],['iPad','Cmd+K','Meta+K']]){
  const shortcut=screenFinderShortcut(platform);assert.deepEqual(shortcut,{label,keys});
  const html=renderToStaticMarkup(h(WorkspaceSearch,{open:false,onOpen:()=>{throw Error('SSR must not open finder');},shortcut}));
  assert.match(html,/aria-label="Tìm màn hình"/);assert.match(html,/aria-haspopup="dialog"/);assert.match(html,new RegExp('aria-keyshortcuts="'+keys.replace('+','\\+')+'"'));
  assert.ok(html.includes('<kbd aria-hidden="true">'+label+'</kbd>'));assert.match(html,/class="global-search-label"/);
 }
 const toolbar=renderToStaticMarkup(h(RecordDetailToolbar,null,h('button',null,'Close'),h('button',null,'Verify')));
 assert.match(toolbar,/class="record-detail-toolbar" role="group" aria-label="Thao tác phiếu"/);assert.equal((toolbar.match(/<button/g)??[]).length,2);
 const dialog=renderToStaticMarkup(h(RecordDialog,{open:true,title:'Record',closeLabel:'Back',onRequestClose:()=>{}},'Body'));
 assert.match(dialog,/class="record-dialog-header-actions"/);assert.match(dialog,/record-dialog-close/);assert.match(dialog,/height:auto;max-height:min\(860px,calc\(100dvh - 48px\)\)/);
 for(const host of ['inbound-request-screen','purchase-request-screen'])assert.match(await readFile('components/erp/'+host+'.tsx','utf8'),/<RecordDetailToolbar>/);
 const source=await readFile('components/erp/workspace.tsx','utf8');assert.match(source,/<WorkspaceSearch open={commandOpen}/);assert.match(source,/\(e.metaKey\|\|e.ctrlKey\)\&\&e.key.toLowerCase\(\)==="k"/);
 const css=require('postcss').parse(await readFile('app/globals.css','utf8'));
 const final=selector=>{const value={};css.walkRules(selector,rule=>{if(rule.parent.type==='root')rule.walkDecls(decl=>{value[decl.prop]=decl.value;});});return value;};
 assert.equal(final('.global-search').overflow,'hidden');assert.equal(final('.global-search-label')['min-width'],'0');assert.equal(final('.global-search-label')['text-overflow'],'ellipsis');assert.equal(final('.global-search kbd')['flex-shrink'],'0');assert.equal(final('.global-search kbd')['white-space'],'nowrap');assert.equal(final('.record-dialog-header-actions').order,'initial');assert.equal(final('.record-dialog-header-actions').gap,'8px');assert.equal(final('.record-detail-toolbar').gap,'8px');assert.equal(final('.record-detail-toolbar')['flex-wrap'],'wrap');
});
test('I60 purchase read error displays its safe support code while arbitrary errors and references remain masked',()=>{
 const reference='0123456789abcdef0123456789abcdef';
 const safe=renderToStaticMarkup(h(RequestError,{error:new ApiError(503,'purchase_read_unavailable',reference)}));
 assert.match(safe,/503/);assert.match(safe,/purchase_read_unavailable/);assert.match(safe,new RegExp(reference));assert.doesNotMatch(safe,/unknown_code/);
 const masked=renderToStaticMarkup(h(RequestError,{error:new ApiError(503,'PRIVATE_SQL_SENTINEL','PRIVATE_COOKIE_SENTINEL')}));
 assert.match(masked,/503/);assert.match(masked,/unknown_code/);assert.doesNotMatch(masked,/PRIVATE_SQL_SENTINEL|PRIVATE_COOKIE_SENTINEL/);
});


test('I66 shared detail primitives expose one icon dismissal, named groups and masked header content',()=>{
 const html=renderToStaticMarkup(h(RecordDialog,{open:true,title:'Synthetic record',documentNumber:'QA-DOC',closeLabel:'Quay lại danh sách',onRequestClose:()=>{}},h(RecordSection,{title:'Thông tin chung'},'QA GENERAL'),h(RecordSection,{title:'Dòng hàng'},'QA ITEMS'),h(RecordSection,{title:'Ghi chú'},'QA NOTES')));
 assert.equal((html.match(/<button\b/g)??[]).length,1);assert.match(html,/aria-label="Quay lại danh sách" title="Đóng hộp thoại"/);assert.match(html,/>×<\/button>/);assert.doesNotMatch(html,/>Quay lại danh sách<|>Đóng<|>Đóng phiếu/);
 assert.equal((html.match(/class="record-section"/g)??[]).length,3);for(const title of ['Thông tin chung','Dòng hàng','Ghi chú'])assert.ok(html.includes('>'+title+'</h3>'));
 const hidden=renderToStaticMarkup(h(React.Fragment,null,h(RecordDetailToolbar,{presentationAllowed:false},h('button',null,'VERIFY')),h(RecordDetailStatus,{presentationAllowed:false},'STALE STATUS')));
 assert.equal((hidden.match(/hidden="" inert="" aria-hidden="true"/g)??[]).length,2);
 const fields=renderToStaticMarkup(h(RecordFieldset,{title:'Thông tin chung',disabled:true},h('input',{name:'exact-original-field',defaultValue:'999999999999999999'})));
 assert.match(fields,/fieldset disabled="" class="record-section record-fieldset"/);assert.match(fields,/name="exact-original-field"/);assert.match(fields,/999999999999999999/);
});
