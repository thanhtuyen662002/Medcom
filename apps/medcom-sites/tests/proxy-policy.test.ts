import{test}from"node:test";import assert from"node:assert/strict";import{backendOrigin,localHttpsOrigin,resolveErpOrigins,erpCookies,relayCookie,routeAllowed,sameOriginWrite}from"../lib/erp/proxy-policy.ts";
test("only deployed HTTPS DNS origins",()=>{assert.equal(backendOrigin("https://erp.example.com"),"https://erp.example.com");for(const v of[undefined,"http://erp.example.com","https://localhost","https://127.0.0.1","https://[::1]","https://user:pass@erp.example.com","https://erp.example.com/path","https://erp.example.com?url=x"])assert.equal(backendOrigin(v),null);});
test("route allowlist prevents open proxy and unsupported mutation",()=>{assert.ok(routeAllowed("api/auth/login","POST"));for(const p of["api/admin/delete","api/auth/../admin","https://evil.example","api/documents/purchase-orders/write"])assert.equal(routeAllowed(p,"GET"),false);assert.equal(routeAllowed("api/documents/purchase-orders","POST"),false);});
test("only ERP cookies forwarded",()=>{assert.equal(erpCookies("other=secret; __Host-Medcom.Session=a; __Host-Medcom.Csrf=b; csrf=fake; __Host-Medcom.SessionC1=c"),"__Host-Medcom.Session=a; __Host-Medcom.Csrf=b; __Host-Medcom.SessionC1=c");assert.equal(erpCookies(null),"");});
test("relayed cookies retain host security",()=>{assert.ok(relayCookie("__Host-Medcom.Session=a; Path=/; Secure; HttpOnly; SameSite=Strict"));for(const c of["tracking=x; Path=/; Secure; HttpOnly","__Host-Medcom.Session=x; Domain=example.com; Path=/; Secure; HttpOnly","__Host-Medcom.Session=x; Path=/; HttpOnly"])assert.equal(relayCookie(c),null);});
test("mutations require configured public origin",()=>{assert.equal(sameOriginWrite("https://medcom.example","https://medcom.example"),true);assert.equal(sameOriginWrite("https://medcom.example",null),false);assert.equal(sameOriginWrite("https://medcom.example","https://evil.example"),false);});

test("local HTTPS admits only canonical localhost with explicit nondefault ports",()=>{
 for(const port of [1,80,444,3000,7443,65535])assert.equal(localHttpsOrigin(`https://localhost:${port}`),`https://localhost:${port}`);
 for(const value of [undefined,"","https://localhost","https://localhost:","https://localhost:0","https://localhost:443","https://localhost:65536","https://localhost:999999",
  "http://localhost:7443","HTTPS://localhost:7443","https://LOCALHOST:7443","https://localhost.:7443","https://a.localhost:7443","https://erp.local:7443",
  "https://127.0.0.1:7443","https://127.1:7443","https://2130706433:7443","https://0x7f000001:7443","https://[::1]:7443","https://[::ffff:127.0.0.1]:7443",
  "https://user@localhost:7443","https://user:secret@localhost:7443","https://localhost:7443@other.example","https://localhost:7443/","https://localhost:7443/path",
  "https://localhost:7443/..","https://localhost:7443?","https://localhost:7443?next=x","https://localhost:7443#","https://localhost:7443#fragment",
  "https://localhost:07443","https://localhost:+7443","https://localhost:7.443","https://localhost:７４４３","https://%6cocalhost:7443",
  " https://localhost:7443","https://localhost:7443 ","https://localhost:7443\n","https://local\thost:7443","https:\\localhost:7443",
  "https://localhost:7443\\","https://localhost:7443, https://localhost:7443","https://erp.example.com:7443"])
  assert.equal(localHttpsOrigin(value),null,JSON.stringify(value));
});
test("local opt-in requires both configured origins to pass the strict policy",()=>{
 const backend="https://localhost:7443",publicOrigin="https://localhost:7444";
 assert.deepEqual(resolveErpOrigins(backend,publicOrigin,"1"),{backend,publicOrigin});
 for(const invalid of [undefined,"","https://erp.example.com","http://localhost:7443","https://localhost:7443/","https://127.0.0.1:7443"]){
  assert.deepEqual(resolveErpOrigins(invalid,publicOrigin,"1"),{backend:null,publicOrigin:null});
  assert.deepEqual(resolveErpOrigins(backend,invalid,"1"),{backend:null,publicOrigin:null});
 }
 assert.deepEqual(resolveErpOrigins("https://erp.example.com","https://site.example","1"),{backend:null,publicOrigin:null});
});
test("missing or unrecognized mode preserves production origin normalization and rejection",()=>{
 for(const mode of [undefined,"","0","true","TRUE","01","1 "," 1","1\n","enabled"]){
  for(const [backend,publicOrigin] of [["https://ERP.EXAMPLE.COM:443/","https://SITE.EXAMPLE/"],["https://erp.example.com",undefined],["https://localhost:7443","https://localhost:7444"],["http://erp.example.com","https://site.example"]])
   assert.deepEqual(resolveErpOrigins(backend,publicOrigin,mode),{backend:backendOrigin(backend),publicOrigin:backendOrigin(publicOrigin)});
 }
 // Local mode must never alter the original production-only helpers.
 assert.equal(backendOrigin("https://localhost:7443"),null);
 assert.equal(sameOriginWrite("https://localhost:7444","https://localhost:7444"),false);
});
