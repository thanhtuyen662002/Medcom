import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proxyErpRequest} from '../.test-runtime/erp-tests/proxy.js';
import {sameOriginWrite} from '../.test-runtime/erp-tests/proxy-policy.js';
const publicOrigin='https://medcom.example';
const backend='https://erp.example.com';
const login=(origin,extra={})=>new Request('http://127.0.0.1:3100/api/erp/api/auth/login',{method:'POST',headers:{...(origin===null?{}:{Origin:origin}),...extra}});
test('trusted configured public origin works behind an internal HTTP proxy URL',async()=>{
 let calls=0;
 const result=await proxyErpRequest(login(publicOrigin),['api','auth','login'],backend,publicOrigin,async(url,options)=>{
  calls++;assert.equal(url,backend+'/api/auth/login');assert.equal(options.headers.get('origin'),null);return Response.json({ok:true});
 });
 assert.equal(result.status,200);assert.equal(calls,1);
});
test('POST fails closed when public origin is unset or invalid',async()=>{
 for(const origin of [undefined,'','http://medcom.example','https://medcom.example/path','https://user:secret@medcom.example']){
  const response=await proxyErpRequest(login(publicOrigin),['api','auth','login'],backend,origin,()=>assert.fail('no upstream'));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'frontend_not_configured'});
 }
});
test('forwarded headers and Host cannot authorize a foreign or missing Origin',async()=>{
 for(const origin of [null,'null','https://other.example','https://medcom.example.evil.example','https://medcom.example/','http://medcom.example','https://medcom.example:444']){
  const response=await proxyErpRequest(login(origin,{'X-Forwarded-Host':'medcom.example','X-Forwarded-Proto':'https',Host:'medcom.example'}),['api','auth','login'],backend,publicOrigin,()=>assert.fail('no upstream'));
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{code:'origin_rejected'});
 }
 assert.equal(sameOriginWrite(undefined,null),false);
});
test('runtime wrapper reads only private server environment and keeps Node dynamic route',()=>{
 const source=readFileSync('app/api/erp/[...path]/route.ts','utf8');
 assert.match(source,/runtime="nodejs"/);assert.match(source,/dynamic="force-dynamic"/);
 assert.match(source,/process\.env\.MEDCOM_API_ORIGIN/);assert.match(source,/process\.env\.MEDCOM_PUBLIC_ORIGIN/);
 assert.doesNotMatch(source,/cloudflare:|NEXT_PUBLIC_|oai-authenticated/);
});
