// Real configured host, editor, reducer, query client and navigation provider.
// Only DOM primitives are doubled; all adapters/data are synthetic. No browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),React=require('react'),{act,create}=require('react-test-renderer'),{QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const out=path.join(app,'.test-runtime','configured-authority');await mkdir(out,{recursive:true});
await build({stdin:{contents:`export {ConfiguredDocumentSheet} from './components/erp/configured-screen'; export {DocumentEditor} from './components/erp/document-editor'; export {NavigationGuardProvider,useNavigationGuard} from './components/erp/navigation-guard';`,resolveDir:app,loader:'tsx'},outfile:path.join(out,'fixture.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',alias:{'@':app},logLevel:'warning',plugins:[{name:'dom-primitives-only',setup(builder){
 builder.onResolve({filter:/components\/ui\//},args=>({path:args.path.split('/').at(-1),namespace:'dom'}));
 builder.onLoad({filter:/.*/,namespace:'dom'},args=>{
  if(args.path==='alert-dialog')return {loader:'tsx',resolveDir:app,contents:`import React from 'react';const C=React.createContext(null);export function AlertDialog({open,onOpenChange,children}){return <C.Provider value={{open,onOpenChange}}>{children}</C.Provider>};export function AlertDialogContent({children}){return React.useContext(C).open?<section role="alertdialog">{children}</section>:null};export const AlertDialogHeader=({children})=><div>{children}</div>;export const AlertDialogTitle=({children})=><h2>{children}</h2>;export const AlertDialogDescription=({children})=><p>{children}</p>;export const AlertDialogFooter=({children})=><div>{children}</div>;export function AlertDialogCancel({children}){const c=React.useContext(C);return <button onClick={()=>c.onOpenChange(false)}>{children}</button>};export const AlertDialogAction=props=><button {...props}/>;`};
  const names={button:['Button'],textarea:['Textarea'],badge:['Badge'],empty:['Empty','EmptyDescription','EmptyHeader','EmptyTitle'],input:['Input'],switch:['Switch'],select:['Select','SelectTrigger','SelectValue','SelectContent','SelectItem'],tabs:['Tabs','TabsList','TabsTrigger','TabsContent'],skeleton:['Skeleton'],dialog:['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'],command:['Command','CommandInput','CommandList','CommandEmpty','CommandItem']}[args.path];
  assert.ok(names,args.path);return {loader:'tsx',resolveDir:app,contents:`import React from 'react';`+names.map(name=>`export const ${name}=props=>React.createElement('${name==='Button'?'button':name==='Input'?'input':'div'}',props);`).join('')};
 });
}}]});
const {ConfiguredDocumentSheet,DocumentEditor,NavigationGuardProvider,useNavigationGuard}=require(path.join(out,'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const text=node=>typeof node==='string'?node:node?.children?.map(text).join('')??'';
const workspace=()=>({session:{tenantId:'T',companyId:'C',authorityVersion:1,capabilities:['purchase-orders.read']},navigation:[{id:'purchase-orders'}],branchIds:['B'],sessionScope:'b'.repeat(64),readScope:'c'.repeat(64)});
const snapshot=(version='v1',enabled=true)=>({id:'DOC',version,values:{note:'ORIGINAL',other:'OTHER'},definition:{id:'configured',version,label:'Synthetic',sections:[{id:'main',label:'Main'}],fields:[{id:'note',label:'Note',sectionId:'main',kind:'text'},{id:'other',label:'Other',sectionId:'main',kind:'text'}],actions:[{id:'save',label:'Save configured',enabled}]}});
async function host(options={}){
 const saved={window:globalThis.window,document:globalThis.document};globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.document={};
 const model={response:snapshot(),rootAllowed:true,holdLoad:false,holdSave:false,saveResult:{kind:'unknown',message:'Synthetic lost ACK',referenceId:'ORIGINAL-OP'},reconcileResult:{kind:'unknown',message:'Synthetic still unknown',referenceId:'ORIGINAL-OP'},...options};
 const calls={load:[],save:[],reconcile:[],reload:[]},held=[],denied=[];
 const extension={load:async(id,ws)=>{calls.load.push({id,ws});if(model.holdLoad)await new Promise(resolve=>held.push({kind:'load',resolve}));return structuredClone(model.response);},adapter:{save:async(...args)=>{calls.save.push(args);if(model.holdSave)await new Promise(resolve=>held.push({kind:'save',resolve}));return model.saveResult;},reconcile:async input=>{calls.reconcile.push(input);return model.reconcileResult;},reload:async id=>{calls.reload.push(id);return structuredClone(model.response);}},lookup:async()=>({items:[],hasMore:false})};
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});let renderer,guard,closed=0,props={workspace:workspace(),presentationAllowed:true,extension};
 function Probe(){guard=useNavigationGuard();return null;}
 const authority=()=>({lifecycleKey:'synthetic-session',presentationAllowed:model.rootAllowed&&props.presentationAllowed});
 const tree=()=>React.createElement(QueryClientProvider,{client},React.createElement(NavigationGuardProvider,{authority:authority(),getAuthority:authority},React.createElement(Probe),options.standalone?React.createElement(DocumentEditor,{snapshot:model.response,adapter:extension.adapter,lookupAdapter:extension.lookup,onConfirmed(){},onDenied:error=>denied.push(error)}):React.createElement(ConfiguredDocumentSheet,{screen:'purchase-orders',selected:{documentId:'DOC'},documentId:'DOC',close(){closed++;},onDenied:error=>denied.push(error),isPresentationAllowed:()=>model.rootAllowed,...props})));
 const flush=async()=>{for(let i=0;i<5;i++)await act(async()=>await new Promise(resolve=>setTimeout(resolve,3)));};
 const render=async patch=>{props={...props,...patch};await act(()=>{if(renderer)renderer.update(tree());else renderer=create(tree());});await flush();};
 const button=label=>renderer.root.findAllByType('button').find(node=>text(node).trim()===label);
 const input=(id='note')=>renderer.root.findAllByType('input').find(node=>node.props.id===`erp-field-${id}`);
 const edit=async(value,id='note')=>{await act(()=>input(id).props.onChange({target:{value}}));await flush();};
 const click=async label=>{const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' is enabled');await act(async()=>{b.props.onClick({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));});await flush();};
 const editor=()=>renderer.root.findByType(DocumentEditor),phase=()=>text(renderer.root.findByProps({className:'editor-phase'}));
 const recover=async response=>{await render({workspace:null,presentationAllowed:false});model.response=response;await render({workspace:workspace(),presentationAllowed:true});};
 const close=async()=>{await act(()=>renderer?.unmount());client.clear();globalThis.window=saved.window;globalThis.document=saved.document;};
 await render({});return {model,calls,held,denied,client,render,recover,flush,button,input,edit,click,editor,phase,guard:()=>guard,closed:()=>closed,props:()=>props,root:()=>renderer.root,close};
}

test('same-session fresh action revocation retains dirty editor but blocks button, shortcut, late callback and proxy',async()=>{
 const f=await host();try{
  await f.edit('UNSAVED');const editor=f.editor(),adapter=editor.props.adapter,original=editor.props.snapshot,lateSave=f.button('Save configured').props.onClick;
  assert.equal(f.guard().isBlocked(),true);await f.recover(snapshot('v2',false));
  assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.strictEqual(f.editor().props.snapshot,original);assert.equal(f.input().props.value,'UNSAVED');assert.equal(f.phase(),'Có thay đổi chưa lưu');assert.equal(f.button('Save configured').props.disabled,true);
  await act(()=>lateSave());await act(()=>f.root().findByProps({className:'panel document-editor'}).props.onKeyDown({ctrlKey:true,key:'s',preventDefault(){}}));
  await assert.rejects(adapter.save(original,{...original.values,note:'UNSAVED'},'save'),error=>error.status===403);assert.equal(f.calls.save.length,0);assert.equal(f.guard().isBlocked(),true);
  await f.edit('ORIGINAL');assert.equal(f.guard().isBlocked(),false,'authority refresh did not replace the original dirty comparison');
 }finally{await f.close();}
});

test('readonly revocation blocks prior unsaved field edits and queued input events without resetting values',async()=>{
 const f=await host();try{
  await f.edit('KEEP DIRTY');const editor=f.editor(),adapter=editor.props.adapter,original=editor.props.snapshot,lateChange=f.input().props.onChange,lateSave=f.button('Save configured').props.onClick;
  const current=snapshot('v2');current.definition.fields[0].readOnly=true;current.values.note='NEW SERVER VALUE';await f.recover(current);
  assert.equal(f.input().props.disabled,true);assert.equal(f.input().props.value,'KEEP DIRTY');assert.equal(f.button('Save configured').props.disabled,true);assert.strictEqual(f.editor(),editor);
  await act(()=>lateChange({target:{value:'LATE MUTATION'}}));await act(()=>lateSave());assert.equal(f.input().props.value,'KEEP DIRTY');
  await assert.rejects(adapter.save(original,{...original.values,note:'KEEP DIRTY'},'save'),error=>error.status===403);assert.equal(f.calls.save.length,0);assert.equal(f.guard().isBlocked(),true);
 }finally{await f.close();}
});

for(const mutation of ['removed','kind','required','maxLength','lookup','options','new-field','new-action','previously-readonly'])test(`current ${mutation} cannot silently authorize an old draft`,async()=>{
 const initial=snapshot();if(mutation==='previously-readonly')initial.definition.fields[0].readOnly=true;
 const f=await host({response:initial});try{
  await f.edit('DIRTY OTHER','other');const adapter=f.editor().props.adapter,original=f.editor().props.snapshot,late=f.input().props.onChange,current=snapshot('v2');
  if(mutation==='removed'){current.definition.fields.shift();delete current.values.note;}
  if(mutation==='kind')current.definition.fields[0].kind='decimal';
  if(mutation==='required')current.definition.fields[0].required=true;
  if(mutation==='maxLength')current.definition.fields[0].maxLength=2;
  if(mutation==='lookup'){current.definition.fields[0].kind='lookup';current.definition.fields[0].lookupId='new-lookup';}
  if(mutation==='options'){current.definition.fields[0].kind='enum';current.definition.fields[0].options=[{id:'new',label:'New'}];}
  if(mutation==='new-field'){current.definition.fields.push({id:'added',label:'Added',sectionId:'main',kind:'text'});current.values.added='NEW SERVER';}
  if(mutation==='new-action')current.definition.actions.push({id:'publish',label:'New publish',enabled:true});
  await f.recover(current);
  const id=mutation==='new-field'?'added':'note';
  if(['removed','lookup','options'].includes(mutation))assert.equal(f.input(),undefined);else if(mutation!=='new-action')assert.equal(f.input(id).props.disabled,true);
  if(mutation==='new-action')assert.equal(f.button('New publish').props.disabled,true);else if(mutation==='new-field'){await act(()=>f.input('added').props.onChange({target:{value:'LATE'}}));assert.equal(f.input('added').props.value,'');}else {await act(()=>late({target:{value:'LATE'}}));if(f.input())assert.equal(f.input().props.value,'ORIGINAL');}
  await assert.rejects(adapter.save(original,{...original.values,[id]:'ILLEGAL'},mutation==='new-action'?'publish':'save'),error=>error.status===403);assert.equal(f.calls.save.length,0);
 }finally{await f.close();}
});

test('pending and unknown custody survive revocation; reconciliation retains original identity with no new write',async()=>{
 const f=await host({holdSave:true});try{
  await f.edit('ORIGINAL INTENT');const editor=f.editor(),adapter=editor.props.adapter,lateSave=f.button('Save configured').props.onClick,lateChange=f.input().props.onChange;
  await act(()=>f.guard().request(()=>{throw Error('must not discard unresolved work');}));const lateDiscard=f.button('Bỏ thay đổi và rời màn hình').props.onClick;
  await f.click('Save configured');assert.equal(f.calls.save.length,1);const original=f.calls.save[0],frozen=JSON.stringify(original);assert.equal(f.phase(),'Đang gửi…');
  await f.render({workspace:null,presentationAllowed:false});const current=snapshot('v2',false);current.definition.fields[0].readOnly=true;current.values.note='REPLACEMENT';f.model.response=current;
  await act(()=>f.held.find(item=>item.kind==='save').resolve());await f.flush();assert.equal(f.phase(),'Chưa xác nhận kết quả');assert.strictEqual(f.editor(),editor);assert.equal(f.input().props.value,'ORIGINAL INTENT');
  await f.render({workspace:workspace(),presentationAllowed:true});await act(()=>lateSave());await act(()=>lateChange({target:{value:'LATE'}}));await act(()=>lateDiscard({preventDefault(){}}));
  assert.equal(f.calls.save.length,1);assert.equal(JSON.stringify(f.calls.save[0]),frozen);assert.equal(f.input().props.value,'ORIGINAL INTENT');assert.equal(f.guard().isBlocked(),true);assert.equal(f.button('Bỏ thay đổi và rời màn hình'),undefined);
  await f.click('Tiếp tục làm việc');await f.click('Kiểm tra kết quả');assert.deepEqual(f.calls.reconcile,[{documentId:'DOC',version:'v1',referenceId:'ORIGINAL-OP'}]);assert.equal(f.calls.save.length,1);assert.equal(f.phase(),'Chưa xác nhận kết quả');
  await f.render({presentationAllowed:false});await assert.rejects(adapter.reconcile(f.calls.reconcile[0]),error=>error.status===403);assert.equal(f.calls.reconcile.length,1);
 }finally{await f.close();}
});

test('cached authority cannot reopen a masked host before a fresh read, including an identical definition',async()=>{
 const f=await host();try{
  await f.edit('UNSAVED');const adapter=f.editor().props.adapter,original=f.editor().props.snapshot;
  await f.render({presentationAllowed:false});f.model.holdLoad=true;await f.render({presentationAllowed:true});
  assert.equal(f.editor().props.currentDefinition,null);assert.equal(f.button('Save configured').props.disabled,true);await assert.rejects(adapter.save(original,{...original.values,note:'UNSAVED'},'save'),error=>error.status===403);
  await act(()=>f.held.find(item=>item.kind==='load').resolve());await f.flush();assert.ok(f.editor().props.currentDefinition);assert.equal(f.button('Save configured').props.disabled,false);assert.equal(f.calls.save.length,0);
 }finally{await f.close();}
});

for(const fence of ['root','read-scope','screen','extension','unmount'])test(`retained proxy rechecks current ${fence} before save, reconcile and reload`,async()=>{
 const f=await host();let closed=false;try{
  const adapter=f.editor().props.adapter,original=f.editor().props.snapshot;
  if(fence==='root')f.model.rootAllowed=false;
  if(fence==='read-scope'){await f.render({workspace:{...workspace(),readScope:'d'.repeat(64)}});assert.equal(f.editor().props.currentDefinition,null);}
  if(fence==='screen')await f.render({workspace:{...workspace(),session:{...workspace().session,capabilities:[]}}});
  if(fence==='extension')await f.render({extension:{...f.props().extension}});
  if(fence==='unmount'){await f.close();closed=true;}
  await assert.rejects(adapter.save(original,{...original.values,note:'UNSAVED'},'save'),error=>error.status===403);
  await assert.rejects(adapter.reconcile({documentId:'DOC',version:'v1',referenceId:'ORIGINAL-OP'}),error=>error.status===403);
  await assert.rejects(adapter.reload('DOC'),error=>error.status===403);assert.equal(f.calls.save.length+f.calls.reconcile.length+f.calls.reload.length,0);
 }finally{if(!closed)await f.close();}
});

test('a late original completion can settle custody after write revocation without granting another dispatch',async()=>{
 const f=await host({holdSave:true});try{
  await f.edit('ORIGINAL INTENT');await f.click('Save configured');const editor=f.editor(),lateSave=f.button('Save configured').props.onClick;
  await f.recover(snapshot('v2',false));assert.strictEqual(f.editor(),editor);assert.equal(f.phase(),'Đang gửi…');
  f.model.saveResult={kind:'confirmed',snapshot:{...snapshot('committed'),values:{note:'ORIGINAL INTENT',other:'OTHER'}}};
  await act(()=>f.held.find(item=>item.kind==='save').resolve());await f.flush();assert.equal(f.phase(),'Đã lưu');assert.equal(f.guard().isBlocked(),false);assert.equal(f.input().props.value,'ORIGINAL INTENT');
  await act(()=>lateSave());await f.edit('SECOND INTENT');assert.equal(f.button('Save configured').props.disabled,true);assert.equal(f.calls.save.length,1);
 }finally{await f.close();}
});


test('standalone callers without explicit current authority retain baseline-driven behavior',async()=>{
 const f=await host({standalone:true});try{
  await f.edit('STANDALONE INTENT');const original=f.editor().props.snapshot;f.model.response=snapshot('v2',false);f.model.response.definition.fields[0].readOnly=true;await f.render({});
  assert.equal(f.input().props.value,'STANDALONE INTENT');assert.equal(f.input().props.disabled,false);assert.equal(f.button('Save configured').props.disabled,false);
  await f.click('Save configured');assert.equal(f.calls.save.length,1);assert.strictEqual(f.calls.save[0][0],original);assert.equal(f.calls.save[0][1].note,'STANDALONE INTENT');assert.equal(f.phase(),'Chưa xác nhận kết quả');
 }finally{await f.close();}
});

for(const pending of [false,true])test(`same read/session scope authorityVersion refresh preserves ${pending?'original reconciliation':'authorized new dispatch'}`,async()=>{
 const f=await host({holdSave:pending});try{
  await f.edit('ORIGINAL INTENT');const editor=f.editor(),adapter=editor.props.adapter,original=editor.props.snapshot;
  if(pending)await f.click('Save configured');
  await f.render({workspace:null,presentationAllowed:false});f.model.response=snapshot('v2',!pending);
  await f.render({workspace:{...workspace(),session:{...workspace().session,authorityVersion:2}},presentationAllowed:true});
  assert.strictEqual(f.editor(),editor);assert.strictEqual(f.editor().props.adapter,adapter);assert.equal(f.input().props.value,'ORIGINAL INTENT');
  if(pending){await act(()=>f.held.find(item=>item.kind==='save').resolve());await f.flush();await f.click('Kiểm tra kết quả');assert.deepEqual(f.calls.reconcile,[{documentId:'DOC',version:'v1',referenceId:'ORIGINAL-OP'}]);}
  else {await f.click('Save configured');assert.strictEqual(f.calls.save[0][0],original);assert.deepEqual(f.calls.save[0][1],{note:'ORIGINAL INTENT',other:'OTHER'});}
  assert.equal(f.calls.save.length,1);assert.equal(f.phase(),'Chưa xác nhận kết quả');assert.equal(f.guard().isBlocked(),true);
 }finally{await f.close();}
});
