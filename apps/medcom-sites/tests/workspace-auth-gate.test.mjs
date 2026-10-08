import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {act,create} from 'react-test-renderer';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(app,'.test-runtime/i44');await mkdir(out,{recursive:true});
await build({absWorkingDir:app,stdin:{contents:`export {AuthorityFence} from './lib/erp/navigation';export * from './lib/erp/workspace-auth-state';export * from './components/erp/workspace-auth-gate';export * from './components/erp/workspace-login';`,resolveDir:app,loader:'tsx'},outfile:path.join(out,'production.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':app},loader:{'.css':'empty'},jsx:'automatic'});
const {AuthorityFence,deriveWorkspaceAuthState:derive,parseWorkspaceReturnTarget:parse,resolveWorkspaceReturnTarget:resolve,WorkspaceAuthGate:Gate,WorkspaceLogin:Login,protectedPresentationProps:mask}=await import(pathToFileURL(path.join(out,'production.mjs')));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.document={activeElement:null};globalThis.HTMLElement=class {};
const input={lifecycleKey:'A',session:'unresolved',hasAuthenticatedProof:false,authority:'verifying',proofLifecycleKey:null,signOutPending:false};
const verified={...input,session:'live',hasAuthenticatedProof:true,authority:'verified',proofLifecycleKey:'A'};
const h=React.createElement;
const login={configured:true,onSuccess(){}};
test('root lifecycle precedence, mismatched proof, outage and POST-only boundaries',()=>{
 assert.equal(derive(input).phase,'verifying');
 for(const status of [403,503,'offline']){const state=derive({...input,authority:'unavailable',diagnostic:status});assert.equal(state.phase,'recovery');assert.equal(state.mountProtected,false);}
 assert.equal(derive(verified).presentationAllowed,true);
 for(const session of ['anonymous','expired'])assert.equal(derive({...verified,session}).phase,session);
 for(const patch of [{signOutPending:true},{proofLifecycleKey:'B'},{lifecycleKey:'B'},{authority:'verifying'},{authority:'unavailable'},{hasAuthenticatedProof:false},{session:'unresolved'}])assert.equal(derive({...verified,...patch}).presentationAllowed,false);
 assert.equal(derive({...verified,authority:'unavailable',proofLifecycleKey:null}).mountProtected,true);
});
test('bounded requested screen resolution waits for proof and intersects current grants',()=>{
 const all=['home','settings','purchase-orders','purchase-requests','purchase-approval','inbound-requests','transfers','sales','accounting','reports'];
 for(const id of all){assert.equal(parse(id),id);assert.equal(resolve(id,all,derive(input)),null);assert.equal(resolve(id,all,derive(verified)),id==='sales'?'home':id);}
 for(const bad of ['https://evil.test','javascript:alert(1)','//evil','/settings','unknown',{},null]){assert.equal(parse(bad),null);assert.equal(resolve(bad,['settings'],derive(verified)),'settings');}
 assert.equal(resolve('purchase-orders',['home'],derive(verified)),'home');assert.equal(resolve('home',[],derive(verified)),null);assert.equal(resolve('sales',['sales'],derive(verified)),null);
});
test('actual gate admits once and retains child state/sentinel through repeated recovery',async()=>{
 let mounts=0,unmounts=0,r;
 function Child(){React.useEffect(()=>{mounts++;return()=>unmounts++;},[]);const [filter,set]=React.useState('draft');return h('input',{'aria-label':'filter',value:filter,onChange:e=>set(e.target.value),'data-intent':'unresolved'});}
 const render=state=>h(Gate,{state:derive(state),login,onRetry(){}},h(Child));
 await act(()=>{r=create(render(input));});assert.equal(mounts,0);
 await act(()=>r.update(render(verified)));assert.equal(mounts,1);
 await act(()=>r.root.findByType('input').props.onChange({target:{value:'retained'}}));
 for(const authority of ['unavailable','verifying','verified']){await act(()=>r.update(render({...verified,authority})));assert.equal(r.root.findByType('input').props.value,'retained');assert.equal(r.root.findByType('input').props['data-intent'],'unresolved');assert.equal(mounts,1);assert.equal(unmounts,0);}
 assert.deepEqual(mask(false),{hidden:true,inert:true,'aria-hidden':true,style:{display:'none'}});
 await act(()=>r.unmount());assert.equal(unmounts,1);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fill(r){await act(()=>{r.root.findAllByType('input')[0].props.onChange({target:{value:' user '}});r.root.findAllByType('input')[1].props.onChange({target:{value:'synthetic-password'}});});}
test('production login double submit, clearing, visibility, failure, success and late unmount',async()=>{
 let r,calls=0,success=0,d=deferred();const authenticate=(u,p)=>{calls++;assert.equal(u,'user');assert.equal(p,'synthetic-password');return d.promise;};
 const props={active:true,configured:true,lifecycleKey:'A',authenticate,onSuccess:()=>success++};
 await act(()=>{r=create(h(Login,props));});await fill(r);
 await act(()=>r.root.findAllByType('button')[0].props.onClick());assert.equal(r.root.findAllByType('input')[1].props.type,'text');
 await act(()=>{const submit=r.root.findByType('form').props.onSubmit;void submit({preventDefault(){}});void submit({preventDefault(){}});});assert.equal(calls,1);assert.equal(r.root.findAllByType('input')[1].props.value,'');
 await act(async()=>{d.reject(Error('sensitive diagnostic'));await Promise.resolve();});assert.equal(success,0);assert.doesNotMatch(JSON.stringify(r.toJSON()),/sensitive diagnostic/);
 d=deferred();await fill(r);await act(()=>{void r.root.findByType('form').props.onSubmit({preventDefault(){}});});await act(async()=>{d.resolve({});await Promise.resolve();});assert.equal(success,1);assert.equal(r.root.findAllByType('input')[1].props.value,'');assert.equal(r.root.findAllByType('button')[1].props.disabled,true);
 await act(()=>r.update(h(Login,{...props,lifecycleKey:'B'})));d=deferred();await fill(r);await act(()=>{void r.root.findByType('form').props.onSubmit({preventDefault(){}});});await act(()=>r.update(h(Login,{...props,lifecycleKey:'C'})));await act(async()=>{d.resolve({});await Promise.resolve();});assert.equal(success,1);assert.equal(r.root.findAllByType('input')[1].props.value,'');
 d=deferred();await fill(r);await act(()=>{void r.root.findByType('form').props.onSubmit({preventDefault(){}});});await act(()=>r.unmount());await act(async()=>{d.resolve({});await Promise.resolve();});assert.equal(success,1);
});
test('default login uses existing CSRF and POST semantics; success alone leaves root gate closed',async()=>{
 const saved=globalThis.fetch;const calls=[];let r,success=0;
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json(String(url).endsWith('/csrf')?{token:'synthetic-csrf'}:{displayName:'Synthetic',tenantId:'T',companyId:'C',companyName:'C',authorityVersion:1,idleExpiresAt:'2026-10-08T00:00:00Z',absoluteExpiresAt:'2026-10-09T00:00:00Z',capabilities:[]});};
 try{await act(()=>{r=create(h(Gate,{state:derive({...input,session:'anonymous'}),login:{configured:true,onSuccess:()=>success++},onRetry(){}},h('div',null,'PROTECTED')));});await fill(r);await act(async()=>{await r.root.findByType('form').props.onSubmit({preventDefault(){}});});assert.equal(success,1);assert.deepEqual(calls.map(c=>c.url),['/api/erp/api/auth/csrf','/api/erp/api/auth/login']);assert.equal(calls[1].init.headers['X-CSRF-TOKEN'],'synthetic-csrf');assert.deepEqual(JSON.parse(calls[1].init.body),{username:'user',password:'synthetic-password'});assert.doesNotMatch(JSON.stringify(r.toJSON()),/PROTECTED/);}finally{await act(()=>r?.unmount());globalThis.fetch=saved;}
});

// This controlled root models admission using the existing fence; it does not
// execute Workspace's effects, timers or sign-out implementation.
test('controlled root discards late reads across retirement, sign-out and new-account boundaries',()=>{
 const fence=new AuthorityFence();let state={...verified};
 const read=()=>{const generation=fence.begin(),key=state.lifecycleKey;return ()=>{if(fence.isCurrent(generation)&&state.lifecycleKey===key&&state.session!=='expired'&&state.session!=='anonymous'&&!state.signOutPending)state={...state,authority:'verified',proofLifecycleKey:key};};};
 for(const reason of ['401','deadline','sign-out']){state={...verified};const late=read();fence.invalidate();state={...state,session:reason==='sign-out'?'anonymous':'expired',authority:'unavailable',proofLifecycleKey:null};late();assert.equal(derive(state).presentationAllowed,false);}
 state={...verified};const old=read();fence.invalidate();state={...input,lifecycleKey:'B'};old();assert.equal(derive(state).presentationAllowed,false);
 state={...state,session:'live'};const fresh=read();state={...state,hasAuthenticatedProof:true};fresh();assert.equal(derive(state).presentationAllowed,true);
});
test('synchronous login callback failure and lifecycle dismissal clear transient password',async()=>{
 let r;await act(()=>{r=create(h(Login,{active:true,configured:true,lifecycleKey:'A',authenticate:()=>{throw Error('private');},onSuccess(){throw Error('must not succeed');}}));});await fill(r);await act(async()=>{await r.root.findByType('form').props.onSubmit({preventDefault(){}});});assert.equal(r.root.findAllByType('input')[1].props.value,'');
 await fill(r);await act(()=>r.update(h(Login,{active:false,configured:true,lifecycleKey:'A',onSuccess(){}})));assert.equal(r.toJSON(),null);await act(()=>r.update(h(Login,{active:true,configured:true,lifecycleKey:'A',onSuccess(){}})));assert.equal(r.root.findAllByType('input')[1].props.value,'');await act(()=>r.unmount());
});
