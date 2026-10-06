import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {proxyErpRequest} from '../.test-runtime/erp-tests/proxy.js';
import {login,getWorkspace,getDocuments,getDetail,continueSession,logout,ApiError} from '../.test-runtime/erp-tests/api.js';

// Synthetic HTTP contract fixtures, pinned to BE #53 99781dec. These do not run
// ASP.NET antiforgery, Tools.dll or SQL and cannot establish staging acceptance.
const site='https://site.example';
const backend='https://erp.example.com';
const session={displayName:'Synthetic test user',tenantId:'test',companyId:'test',companyName:'Test only',authorityVersion:1,idleExpiresAt:'2026-10-04T03:00:00Z',absoluteExpiresAt:'2026-10-04T04:00:00Z',capabilities:['purchase-orders.read','inbound-requests.read']};
const document={documentId:'test-document',documentDate:'2026-10-04',branchId:'test-branch',statusId:1,isLocked:false};
const reply=(body,status=200,extra={})=>new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Correlation-ID':'synthetic-correlation','X-Medcom-Session-Scope':'a'.repeat(64),'X-Medcom-Read-Scope':'b'.repeat(64),...extra}});
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

// I28: transport contract tests, not TLS/browser or actual ERP runtime proof.
const localSite='https://localhost:7444',localBackend='https://localhost:7443';
const localInbound='api/inbound-requests/draft',localScope='a'.repeat(64);
function localRequest(path=localInbound+'/save',{method='POST',headers={},body='{}',...options}={}){
 return new Request(`${localSite}/api/erp/${path}`,{method,headers:{Origin:localSite,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json; charset=utf-8','X-Inbound-Scope':localScope,'X-CSRF-TOKEN':'synthetic-csrf',...headers},...(method==='GET'?{}:{body}),...options});
}
function localProxy(req,upstream=()=>assert.fail('unexpected local backend request'),{origin=localBackend,publicOrigin=localSite,mode='1',path}={}){
 return proxyErpRequest(req,path??new URL(req.url).pathname.slice('/api/erp/'.length).split('/'),origin,publicOrigin,upstream,mode);
}

test('I28 localhost requires literal server opt-in and every other value keeps production behavior',async()=>{
 for(const mode of [undefined,'','0','true','TRUE','01','1 ',' 1','1\n','enabled']){
  let calls=0;const upstream=async()=>{calls++;return reply({ok:true});};
  const r=await proxyErpRequest(localRequest('api/workspace',{method:'GET',headers:{'MEDCOM_LOCAL_HTTPS':'1','X-Medcom-Local-Https':'1'}}),['api','workspace'],localBackend,localSite,upstream,mode);
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'backend_not_configured'});assert.equal(calls,0);
  const production=await proxyErpRequest(request('api/auth/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:'{}'}),['api','auth','login'],'https://ERP.EXAMPLE.COM:443/','https://SITE.EXAMPLE/',async(url)=>{assert.equal(url,backend+'/api/auth/login');return reply({ok:true});},mode);
  assert.equal(production.status,200);
  // Existing production GET requests still need no configured public origin.
  assert.equal((await proxyErpRequest(request('api/workspace'),['api','workspace'],backend,undefined,upstream,mode)).status,200);
 }
});

test('I28 local mode rejects missing, mixed and noncanonical pairs on reads and writes',async()=>{
 const invalid=[undefined,'','https://erp.example.com','http://localhost:7443','https://localhost','https://localhost:443','https://localhost:07443','https://localhost:65536','https://LOCALHOST:7443','https://127.0.0.1:7443','https://[::1]:7443','https://alias.localhost:7443','https://localhost.:7443','https://user:secret@localhost:7443','https://localhost:7443/','https://localhost:7443?','https://localhost:7443#','https://localhost:7443\n'];
 for(const value of invalid)for(const pair of [[value,localSite],[localBackend,value]])for(const [path,method] of [['api/workspace','GET'],['api/auth/login','POST'],[localInbound,'GET']]){
  let calls=0;const r=await proxyErpRequest(localRequest(path,{method}),path.split('/'),...pair,async()=>{calls++;return reply({});},'1');
  assert.equal(r.status,503,`${method} ${path} ${JSON.stringify(pair)}`);assert.equal(calls,0);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 let calls=0;const r=await proxyErpRequest(request('api/workspace'),['api','workspace'],backend,site,async()=>{calls++;return reply({});},'1');
 assert.equal(r.status,503);assert.equal(calls,0);
});

test('I28 local browser provenance stays exact and never trusts forwarding headers',async()=>{
 for(const origin of [null,'null','https://localhost:7443','https://localhost:7445','https://localhost','http://localhost:7444','https://LOCALHOST:7444','https://127.0.0.1:7444','https://localhost:07444',localSite+'/',localSite+'?x=1',localSite+'#x',localSite+', '+localSite,site]){
  const req=localRequest(undefined,{headers:{Origin:origin??localSite,Host:'localhost:7444','X-Forwarded-Host':'localhost:7444','X-Forwarded-Proto':'https','Forwarded':'host=localhost:7444;proto=https'}});
  if(origin===null)req.headers.delete('Origin');
  const r=await localProxy(req);assert.equal(r.status,403,String(origin));assert.deepEqual(await r.json(),{code:'origin_rejected'});
 }
 for(const site of ['cross-site','same-site','none','same-origin, same-origin']){
  assert.equal((await localProxy(localRequest(undefined,{headers:{'Sec-Fetch-Site':site}}))).status,403);
  assert.equal((await localProxy(localRequest(localInbound,{method:'GET',headers:{'Sec-Fetch-Site':site}}))).status,403);
 }
 for(const withOrigin of [true,false]){
  const req=localRequest(localInbound+'?documentId=DOC-A',{method:'GET'});if(!withOrigin)req.headers.delete('Origin');
  assert.equal((await localProxy(req,async(url,init)=>{assert.equal(url,localBackend+'/'+localInbound+'?documentId=DOC-A');assert.equal(init.headers.get('Origin'),localBackend);return reply({});})).status,200);
 }
 for(const metadata of [undefined,'cross-site','same-origin, same-origin']){
  const req=localRequest(localInbound,{method:'GET'});req.headers.delete('Origin');if(metadata===undefined)req.headers.delete('Sec-Fetch-Site');else req.headers.set('Sec-Fetch-Site',metadata);
  assert.equal((await localProxy(req)).status,403);
 }
 assert.equal((await localProxy(localRequest(),undefined,{path:['api/inbound-requests','draft','save']})).status,404);
 for(const [path,method] of [['api/admin/delete','GET'],[localInbound+'/create','POST'],[localInbound+'/save','GET'],[localInbound,'POST']])assert.equal((await localProxy(localRequest(path,{method}))).status,404);
});

test('I28 local inbound commands retain exact bytes, fixed HTTPS target and cookie isolation',async()=>{
 const bytes=Buffer.from(' { "operationId" : "11111111-1111-4111-8111-111111111111", "notes":"Tiếng Việt\\n", "decimal":"0001.0000", "duplicate":1, "duplicate":2 }\n');
 for(const action of ['save','send-to-warehouse','reconcile']){
  let calls=0;
  const r=await localProxy(localRequest(localInbound+'/'+action,{body:bytes,headers:{'Content-Length':String(bytes.length),Cookie:'other=private; __Host-Medcom.Session=a; __Host-Medcom.SessionC1=b; __Host-Medcom.Csrf=c',Authorization:'Bearer private','X-Purchase-Scope':'b'.repeat(64),'X-Forwarded-For':'spoofed','X-Forwarded-Proto':'http'}}),async(url,init)=>{
   calls++;assert.equal(url,localBackend+'/'+localInbound+'/'+action);assert.equal(new URL(url).protocol,'https:');assert.ok(init.body instanceof Uint8Array);assert.deepEqual(Buffer.from(init.body),bytes);
   assert.equal(init.headers.get('Origin'),localBackend);assert.equal(init.headers.get('Content-Type'),'application/json; charset=utf-8');assert.equal(init.headers.get('X-Inbound-Scope'),localScope);assert.equal(init.headers.get('X-CSRF-TOKEN'),'synthetic-csrf');
   assert.equal(init.headers.get('Cookie'),'__Host-Medcom.Session=a; __Host-Medcom.SessionC1=b; __Host-Medcom.Csrf=c');
   assert.deepEqual([...init.headers.keys()].sort(),['accept','content-type','cookie','origin','x-csrf-token','x-inbound-scope']);assert.equal(init.cache,'no-store');assert.equal(init.redirect,'manual');
   const headers=new Headers({'Content-Type':'application/json','X-Private':'not-for-browser','Location':'https://other.example'});
   for(const value of [cookie('__Host-Medcom.Session','new'),cookie('__Host-Medcom.SessionC1','chunk'),cookie('__Host-Medcom.Csrf','token'),cookie('tracking','bad'),'__Host-Medcom.Session=bad; Domain=localhost; Path=/; Secure; HttpOnly','__Host-Medcom.Session=bad; Path=/; HttpOnly','__Host-Medcom.Session=bad; Path=/private; Secure; HttpOnly','__Host-Medcom.Csrf=bad; Path=/; Secure'])headers.append('Set-Cookie',value);
   return new Response('{}',{headers});
  });
  assert.equal(r.status,200);assert.equal(calls,1);assert.deepEqual(r.headers.getSetCookie(),[cookie('__Host-Medcom.Session','new'),cookie('__Host-Medcom.SessionC1','chunk'),cookie('__Host-Medcom.Csrf','token')]);
  assert.equal(r.headers.get('X-Private'),null);assert.equal(r.headers.get('Location'),null);assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
 }
});

test('I28 local CSRF, scope, media and malformed commands reject before transport',async()=>{
 const cases=[
  [{headers:{'X-CSRF-TOKEN':''}},403,'csrf_invalid'],[{headers:{'X-CSRF-TOKEN':'one, two'}},403,'csrf_invalid'],[{headers:{'X-CSRF-TOKEN':'x'.repeat(8192)}},403,'csrf_invalid'],
  [{headers:{'X-Inbound-Scope':''}},409,'inbound_scope_changed'],[{headers:{'X-Inbound-Scope':'A'.repeat(64)}},409,'inbound_scope_changed'],[{headers:{'X-Inbound-Scope':localScope+', '+localScope}},409,'inbound_scope_changed'],
  [{headers:{'Content-Encoding':'identity'}},415,'json_required'],[{headers:{'Content-Encoding':'gzip'}},415,'json_required'],
  ...['text/plain','application/jsonp','application/json; charset=utf-16','application/json; boundary=x'].map(value=>[{headers:{'Content-Type':value}},415,'json_required']),
  ...['','[]','null','1','\ufeff{}','{'].map(body=>[{body},400,'invalid_request_body']),
  [{body:Uint8Array.of(0xc3,0x28)},400,'invalid_request_body'],[{headers:{'Content-Length':'3'}},400,'invalid_request_body'],[{headers:{'Content-Length':'-1'}},400,'invalid_request_body'],
  [{headers:{'Content-Length':'1048577'}},413,'payload_too_large'],[{headers:{'Content-Length':'9007199254740992'}},413,'payload_too_large'],[{body:'x'.repeat(1048577)},413,'payload_too_large'],
 ];
 for(const [options,status,code] of cases){const r=await localProxy(localRequest(undefined,options));assert.equal(r.status,status);assert.deepEqual(await r.json(),{code});assert.equal(r.headers.get('cache-control'),'no-store');}
 for(const [name,status] of [['X-CSRF-TOKEN',403],['X-Inbound-Scope',409]]){const req=localRequest();req.headers.delete(name);assert.equal((await localProxy(req)).status,status);}
 assert.equal((await localProxy(localRequest(localInbound+'/save?command=save'))).status,400);
 assert.equal((await localProxy(localRequest(`api/workspace?x=${'x'.repeat(4096)}`,{method:'GET'}))).status,400);
 assert.equal((await localProxy(localRequest('api/auth/login',{body:'x'.repeat(16385)}))).status,413);
 assert.equal((await localProxy(localRequest('api/purchase-requests/save?command=save',{headers:{'X-Purchase-Scope':localScope}}))).status,400);
});

test('I28 local streaming accepts exact byte bound, cancels overflow and contains read failures',async()=>{
 const bytes=Buffer.from('{"notes":"'+'x'.repeat(1048576-12)+'"}');assert.equal(bytes.length,1048576);
 for(const declared of [false,true]){
  let calls=0;const body=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,250000));c.enqueue(bytes.subarray(250000));c.close();}});
  const r=await localProxy(localRequest(undefined,{body,duplex:'half',headers:declared?{'Content-Length':String(bytes.length)}:{}}),async(_url,init)=>{calls++;assert.deepEqual(Buffer.from(init.body),bytes);return reply({});});
  assert.equal(r.status,200);assert.equal(calls,1);
 }
 let cancelled=false;
 const overflow=new ReadableStream({pull(c){c.enqueue(new Uint8Array(600000));},cancel(){cancelled=true;}});
 assert.equal((await localProxy(localRequest(undefined,{body:overflow,duplex:'half'}))).status,413);assert.equal(cancelled,true);
 const broken=new ReadableStream({start(c){c.error(Error('private stream failure'));}});
 const r=await localProxy(localRequest(undefined,{body:broken,duplex:'half'}));assert.equal(r.status,400);assert.deepEqual(await r.json(),{code:'invalid_request_body'});
});

test('I28 local redirects, backend failures and cancellation stay bounded without retries',async()=>{
 for(const status of [301,302,303,307,308]){
  let calls=0;const r=await localProxy(localRequest('api/workspace',{method:'GET'}),async()=>{calls++;return new Response(null,{status,headers:{Location:localSite+'/api/erp/api/workspace'}});});
  assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'upstream_redirect_rejected'});assert.equal(calls,1);
 }
 let calls=0;const r=await localProxy(localRequest(),async()=>{calls++;throw Error('private TLS/upstream detail');});assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'backend_unavailable'});assert.equal(calls,1);
 const controller=new AbortController();let started;const ready=new Promise(resolve=>{started=resolve;});
 const pending=localProxy(localRequest(undefined,{signal:controller.signal}),async(_url,init)=>{started();await new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});assert.fail('cancelled fetch resolved');});
 await ready;controller.abort();assert.equal((await pending).status,503);
});

test('I28 local opt-in is supplied only by the private dynamic Node route',async()=>{
 const source=readFileSync('app/api/erp/[...path]/route.ts','utf8');
 assert.match(source,/runtime="nodejs"/);assert.match(source,/dynamic="force-dynamic"/);
 assert.match(source,/proxyErpRequest\(request,path,process\.env\.MEDCOM_API_ORIGIN,process\.env\.MEDCOM_PUBLIC_ORIGIN,undefined,process\.env\.MEDCOM_LOCAL_HTTPS\)/);
 assert.doesNotMatch(source,/NEXT_PUBLIC_|request\.headers|searchParams|cookies\(/);
 // Execute the entire route with the real proxy. Only the actual network
 // boundary is intercepted here; the browser/TLS gate remains separate.
 const compiled=stripTypeScriptTypes(source.replace('"@/lib/erp/proxy"',JSON.stringify(new URL('../.test-runtime/erp-tests/proxy.js',import.meta.url).href)),{mode:'transform'});
 const route=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const keys=['MEDCOM_API_ORIGIN','MEDCOM_PUBLIC_ORIGIN','MEDCOM_LOCAL_HTTPS'],saved=keys.map(key=>[key,process.env[key]]),originalFetch=global.fetch;
 let calls=0;
 try{
  process.env.MEDCOM_API_ORIGIN=localBackend;process.env.MEDCOM_PUBLIC_ORIGIN=localSite;
  global.fetch=async(url,init)=>{calls++;assert.equal(url,localBackend+'/api/auth/login');assert.equal(init.redirect,'manual');return reply({ok:true});};
  for(const mode of [undefined,'true','1']){
   if(mode===undefined)delete process.env.MEDCOM_LOCAL_HTTPS;else process.env.MEDCOM_LOCAL_HTTPS=mode;
   // The URL observed by Next may be the fixed loopback HTTP relay hop.
   const url='http://127.0.0.1:3100/api/erp/api/auth/login'+(mode==='1'?'':'?MEDCOM_LOCAL_HTTPS=1');
   const req=new Request(url,{method:'POST',headers:{Origin:localSite,'Content-Type':'application/json','MEDCOM_LOCAL_HTTPS':'1'},body:'{}'});
   const r=await route.POST(req,{params:Promise.resolve({path:['api','auth','login']})});
   assert.equal(r.status,mode==='1'?200:503);
  }
  assert.equal(calls,1);
 }finally{
  global.fetch=originalFetch;
  for(const [key,value] of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

test('I29 response-only read markers are bounded to successful read endpoints and never forwarded as authority',async()=>{
 const valid={'X-Medcom-Session-Scope':'a'.repeat(64),'X-Medcom-Read-Scope':'b'.repeat(64)};
 for(const route of ['api/workspace','api/documents/purchase-orders','api/documents/purchase-orders/detail','api/documents/inbound-requests','api/documents/inbound-requests/detail']){
  const request=new Request('https://frontend.example/api/erp/'+route,{headers:valid});
  const response=await proxyErpRequest(request,route.split('/'),'https://backend.example','https://frontend.example',async(_url,init)=>{
   assert.equal(init.headers.has('X-Medcom-Session-Scope'),false);assert.equal(init.headers.has('X-Medcom-Read-Scope'),false);return Response.json({synthetic:true},{headers:valid});
  });
  assert.equal(response.status,200);assert.equal(response.headers.get('X-Medcom-Session-Scope'),valid['X-Medcom-Session-Scope']);assert.equal(response.headers.get('X-Medcom-Read-Scope'),valid['X-Medcom-Read-Scope']);
 }
 for(const [route,status,headers] of [
  ['api/workspace',401,valid],['api/workspace',503,valid],['api/auth/session',200,valid],['health/live',200,valid],
  ['api/workspace',200,{'X-Medcom-Session-Scope':valid['X-Medcom-Session-Scope']}],
  ['api/workspace',200,{...valid,'X-Medcom-Read-Scope':'B'.repeat(64)}],
  ['api/workspace',200,{...valid,'X-Medcom-Session-Scope':valid['X-Medcom-Session-Scope']+', '+valid['X-Medcom-Session-Scope']}],
 ]){
  const response=await proxyErpRequest(new Request('https://frontend.example/api/erp/'+route),route.split('/'),'https://backend.example','https://frontend.example',async()=>Response.json({synthetic:true},{status,headers}));
  assert.equal(response.headers.has('X-Medcom-Session-Scope'),false);assert.equal(response.headers.has('X-Medcom-Read-Scope'),false);
 }
});
