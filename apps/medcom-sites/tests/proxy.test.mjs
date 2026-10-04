import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxyErpRequest} from '../.test-runtime/erp-tests/proxy.js';
import {login,getWorkspace,getDocuments,getDetail,continueSession,logout,ApiError} from '../.test-runtime/erp-tests/api.js';

// Synthetic HTTP contract fixtures, pinned to BE #53 99781dec. These do not run
// ASP.NET antiforgery, Tools.dll or SQL and cannot establish staging acceptance.
const site='https://site.example';
const backend='https://erp.example.com';
const session={displayName:'Synthetic test user',tenantId:'test',companyId:'test',companyName:'Test only',authorityVersion:1,idleExpiresAt:'2026-10-04T03:00:00Z',absoluteExpiresAt:'2026-10-04T04:00:00Z',capabilities:['purchase-orders.read','inbound-requests.read']};
const document={documentId:'test-document',documentDate:'2026-10-04',branchId:'test-branch',statusId:1,isLocked:false};
const reply=(body,status=200,extra={})=>new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Correlation-ID':'synthetic-correlation',...extra}});
const cookie=(name,value)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict`;
function request(path,init={}){return new Request(`${site}/api/erp/${path}`,init);}
function proxy(req,origin=backend,upstream=()=>assert.fail('unexpected backend request')){
 const path=new URL(req.url).pathname.slice('/api/erp/'.length).split('/');
 return proxyErpRequest(req,path,origin,site,upstream);
}

test('unconfigured and forbidden routes fail closed before network access',async()=>{
 for(const [req,origin,status,code] of [
  [request('api/workspace'),'',503,'backend_not_configured'],
  [request('api/workspace'),'http://erp.example.com',503,'backend_not_configured'],
  [request('api/admin/delete'),backend,404,'endpoint_unavailable'],
  [request('api/documents/purchase-orders',{method:'POST'}),backend,404,'endpoint_unavailable'],
  [request('api/auth/login',{method:'POST',headers:{Origin:'https://other.example'}}),backend,403,'origin_rejected'],
 ]){let calls=0;const r=await proxy(req,origin,async()=>{calls++;return reply({});});assert.equal(calls,0);assert.equal(r.status,status);assert.equal((await r.json()).code,code);assert.equal(r.headers.get('cache-control'),'no-store');}
});

test('only ERP authority headers/cookies cross the proxy boundary',async()=>{
 const r=await proxy(request('api/workspace',{headers:{Cookie:'chatgpt=private; __Host-Medcom.Session=a; __Host-Medcom.SessionC1=b; __Host-Medcom.Csrf=c',Authorization:'Bearer not-for-erp','X-User-Id':'spoofed','X-Forwarded-For':'spoofed','X-Correlation-ID':'spoofed'}}),backend,async(url,init)=>{
  assert.equal(url,`${backend}/api/workspace`);
  assert.deepEqual([...init.headers.keys()].sort(),['accept','cookie']);
  assert.equal(init.headers.get('cookie'),'__Host-Medcom.Session=a; __Host-Medcom.SessionC1=b; __Host-Medcom.Csrf=c');
  assert.equal(init.redirect,'manual');
  const headers=new Headers({'Content-Type':'application/json','X-Correlation-ID':'server-reference','Retry-After':'60','Location':'https://other.example','X-Private':'do-not-relay'});
  for(const c of [cookie('__Host-Medcom.Session','a'),cookie('__Host-Medcom.SessionC1','b'),cookie('__Host-Medcom.Csrf','c'),cookie('tracking','d'),'__Host-Medcom.Session=e; Domain=example.com; Path=/; Secure; HttpOnly'])headers.append('Set-Cookie',c);
  return new Response('{}',{headers});
 });
 assert.equal(r.headers.get('x-correlation-id'),'server-reference');assert.equal(r.headers.get('retry-after'),'60');
 assert.equal(r.headers.get('x-private'),null);assert.equal(r.headers.get('location'),null);
 assert.equal(r.headers.getSetCookie().length,3);assert.equal(r.headers.get('cache-control'),'no-store');
});

test('redirects and upstream errors are not retried or exposed',async()=>{
 for(const status of [301,302,303,307,308]){let calls=0;const r=await proxy(request('api/workspace'),backend,async()=>{calls++;return new Response(null,{status,headers:{Location:'https://other.example'}});});assert.equal(r.status,502);assert.equal((await r.json()).code,'upstream_redirect_rejected');assert.equal(calls,1);}
 let calls=0;const r=await proxy(request('api/workspace'),backend,async()=>{calls++;throw new Error('private upstream detail');});
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'backend_unavailable'});assert.equal(calls,1);
});

test('query and streamed body limits reject before upstream fetch',async()=>{
 let r=await proxy(request(`api/workspace?x=${'x'.repeat(4096)}`));assert.equal(r.status,400);
 const headers={Origin:site,'Content-Type':'application/json'};
 r=await proxy(request('api/auth/login',{method:'POST',headers:{...headers,'Content-Length':'16385'},body:'{}'}));assert.equal(r.status,413);
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(16385));},cancel(){cancelled=true;}});
 r=await proxy(request('api/auth/login',{method:'POST',headers,body:stream,duplex:'half'}));assert.equal(r.status,413);assert.equal(cancelled,true);
 r=await proxy(request('api/auth/login',{method:'POST',headers:{Origin:site,'Content-Type':'text/plain'},body:'{}'}));assert.equal(r.status,415);
});

test('errored upload streams are contained without forwarding private details',async()=>{
 const stream=new ReadableStream({start(controller){controller.error(new Error('private upload detail'));}});
 let calls=0;
 const r=await proxy(request('api/auth/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:stream,duplex:'half'}),backend,async()=>{calls++;return reply({});});
 assert.equal(calls,0);assert.equal(r.status,400);assert.deepEqual(await r.json(),{code:'invalid_request_body'});assert.equal(r.headers.get('cache-control'),'no-store');
});

test('client cancellation reaches the upstream request',async()=>{
 const controller=new AbortController();let upstreamStarted;
 const started=new Promise(resolve=>{upstreamStarted=resolve;});
 const result=proxy(request('api/workspace',{signal:controller.signal}),backend,async(_url,init)=>{
  upstreamStarted();await new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
  assert.fail('aborted upstream must not resolve');
 });
 await started;controller.abort();const r=await result;assert.equal(r.status,503);
});

for(const kind of ['purchase-orders','inbound-requests']){
 test(`client → proxy → fixture: login, workspace, ${kind} pages, continue, logout`,async()=>{
  const originalFetch=global.fetch;const jar=new Map();let authenticated=false;let csrfReads=0;const calls=[];
  const upstream=async(url,init)=>{
   const u=new URL(url);calls.push(u.pathname);assert.equal(u.origin,backend);assert.equal(init.redirect,'manual');
   const cookies=init.headers.get('cookie')??'';
   if(u.pathname==='/api/auth/csrf'){
    csrfReads++;return reply({token:authenticated?'csrf-authenticated':'csrf-anonymous'},200,{'Set-Cookie':cookie('__Host-Medcom.Csrf','fixture')});
   }
   if(init.method==='POST'){
    assert.match(cookies,/__Host-Medcom.Csrf=fixture/);
    assert.equal(init.headers.get('X-CSRF-TOKEN'),authenticated?'csrf-authenticated':'csrf-anonymous');
   }
   if(u.pathname==='/api/auth/login'){
    assert.deepEqual(JSON.parse(init.body),{username:'synthetic-user',password:'synthetic-password'});
    authenticated=true;return reply(session,200,{'Set-Cookie':cookie('__Host-Medcom.Session','fixture')});
   }
   if(!authenticated)return reply({code:'authentication_required'},401);
   assert.match(cookies,/__Host-Medcom.Session=fixture/);
   if(u.pathname==='/api/workspace')return reply({session,navigation:[{id:kind,label:'Fixture',href:`/workspace/?screen=${kind}`}],branchIds:['test-branch']});
   if(u.pathname===`/api/documents/${kind}`){
    assert.equal(u.searchParams.get('search'),'test & document');assert.equal(u.searchParams.get('pageSize'),'50');
    if(u.searchParams.get('branchId')!=='test-branch')return reply({title:'Access denied.'},403);
    const page=Number(u.searchParams.get('page'));return reply({rows:page===1?[document]:[],page,pageSize:50,hasMore:page===1});
   }
   if(u.pathname===`/api/documents/${kind}/detail`){
    assert.equal(u.searchParams.get('documentId'),document.documentId);
    return reply({document,purchaseOrderLines:kind==='purchase-orders'?[{lineId:'1',itemId:'test',quantity:'999999999999999999999999.1234',quantity2:null}]:[],inboundRequestLines:kind==='inbound-requests'?[{lineId:'1',itemId:'test',setQuantityByDocument:'1.0000',barrelQuantityByDocument:null,setQuantityByReal:'0.0000',barrelQuantityByReal:null}]:[],page:1,pageSize:50,hasMore:false});
   }
   if(u.pathname==='/api/auth/session/continue')return reply({...session,idleExpiresAt:'2026-10-04T03:30:00Z'});
   if(u.pathname==='/api/auth/logout'){authenticated=false;return reply(null,204,{'Set-Cookie':`${cookie('__Host-Medcom.Session','')}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`});}
   assert.fail(`unexpected endpoint ${u.pathname}`);
  };
  try{
   global.fetch=async(path,init={})=>{
    const headers=new Headers(init.headers);headers.set('Cookie',['chatgpt=not-for-erp',...[...jar].map(([k,v])=>`${k}=${v}`)].join('; '));
    if(init.method==='POST')headers.set('Origin',site);
    assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
    const r=await proxy(request(path.replace('/api/erp/',''),{...init,headers}),backend,upstream);
    for(const value of r.headers.getSetCookie()){const pair=value.split(';')[0];const at=pair.indexOf('=');const name=pair.slice(0,at),token=pair.slice(at+1);if(token)jar.set(name,token);else jar.delete(name);}
    return r;
   };
   assert.equal((await login('synthetic-user','synthetic-password')).companyId,'test');
   assert.deepEqual((await getWorkspace()).branchIds,['test-branch']);
   const page1=await getDocuments(kind,1,'test & document','test-branch');assert.equal(page1.rows[0].documentId,document.documentId);assert.equal(page1.hasMore,true);
   const page2=await getDocuments(kind,2,'test & document','test-branch');assert.deepEqual(page2.rows,[]);assert.equal(page2.hasMore,false);
   const detail=await getDetail(kind,document.documentId,1);assert.equal(detail.document.documentId,document.documentId);
   if(kind==='purchase-orders')assert.equal(detail.purchaseOrderLines[0].quantity,'999999999999999999999999.1234');
   else assert.equal(detail.inboundRequestLines[0].setQuantityByDocument,'1.0000');
   await assert.rejects(getDocuments(kind,1,'test & document','unavailable-branch'),e=>e instanceof ApiError&&e.status===403&&e.correlationId==='synthetic-correlation');
   assert.equal((await continueSession()).idleExpiresAt,'2026-10-04T03:30:00Z');
   await logout();assert.equal(jar.has('__Host-Medcom.Session'),false);assert.equal(csrfReads,3);
   await assert.rejects(getWorkspace(),e=>e instanceof ApiError&&e.status===401);
   assert.equal(calls.filter(p=>p==='/api/auth/login').length,1);assert.equal(calls.filter(p=>p==='/api/auth/logout').length,1);
  }finally{global.fetch=originalFetch;}
 });
}
