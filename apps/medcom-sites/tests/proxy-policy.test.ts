import{test}from"node:test";import assert from"node:assert/strict";import{backendOrigin,localHttpsOrigin,resolveErpOrigins,erpCookies,relayCookie,routeAllowed,sameOriginWrite,erpScreenModules,requestBodyLimit,isNotificationId,notificationGetRoute,notificationReadRoute}from"../lib/erp/proxy-policy.ts";
test("only deployed HTTPS DNS origins",()=>{assert.equal(backendOrigin("https://erp.example.com"),"https://erp.example.com");for(const v of[undefined,"http://erp.example.com","https://localhost","https://127.0.0.1","https://[::1]","https://user:pass@erp.example.com","https://erp.example.com/path","https://erp.example.com?url=x"])assert.equal(backendOrigin(v),null);});
test("the ERP configuration drift report is readable through the proxy but not writable",()=>{assert.equal(routeAllowed("api/platform/erp-config-drift","GET"),true);assert.equal(routeAllowed("api/platform/erp-config-drift","POST"),false);assert.equal(routeAllowed("api/platform/erp-lookup-check","GET"),true);assert.equal(routeAllowed("api/platform/erp-lookup-check","POST"),false);});
test("route allowlist prevents open proxy and unsupported mutation",()=>{assert.ok(routeAllowed("api/auth/login","POST"));for(const p of["api/admin/delete","api/auth/../admin","https://evil.example","api/documents/purchase-orders/write"])assert.equal(routeAllowed(p,"GET"),false);assert.equal(routeAllowed("api/documents/purchase-orders","POST"),false);});

test("PM and SA attachments expose exact read routes without admitting other mutations",()=>{
 for(const module of ["sales-order-pm","sales-order-sa"]){
  for(const suffix of ["attachments","attachments/content"]){
   assert.equal(routeAllowed(`api/erp/${module}/${suffix}`,"GET"),true);
   assert.equal(routeAllowed(`api/erp/${module}/${suffix}`,"POST"),false);
  }
  assert.equal(routeAllowed(`api/erp/${module}/attachments/delete`,"POST"),false);
  assert.equal(routeAllowed(`api/erp/${module}/attachments/other`,"GET"),false);
 }
});
test("inbound photos: every step lists them, only steps whose form can edit may upload",()=>{
 for(const module of ["inbound-requests","inbound-warehouse","inbound-sa","inbound-tech","inbound-pm","inbound-bld"]){
  for(const suffix of ["attachments","attachments/content"])assert.equal(routeAllowed(`api/erp/${module}/${suffix}`,"GET"),true);
  assert.equal(routeAllowed(`api/erp/${module}/attachments/delete`,"POST"),false);
 }
 for(const module of ["inbound-requests","inbound-warehouse","inbound-tech","inbound-pm"]){
  assert.equal(routeAllowed(`api/erp/${module}/attachments/upload`,"POST"),true);
  assert.equal(requestBodyLimit(`api/erp/${module}/attachments/upload`,"POST"),12*1024*1024);
 }
 // TP SA and BLĐ forms hide Edit (HBE), so their photos are read-only as in ERP.
 for(const module of ["inbound-sa","inbound-bld"])assert.equal(routeAllowed(`api/erp/${module}/attachments/upload`,"POST"),false);
});

test("ERP screen modules, routes and 1MiB body limits are correctly allowlisted",()=>{
 assert.equal(erpScreenModules.length,25);
 for(const m of erpScreenModules){
  assert.ok(routeAllowed(`api/erp/${m}/screen`,"GET"));
  assert.ok(routeAllowed(`api/erp/${m}`,"GET"));
  assert.ok(routeAllowed(`api/erp/${m}/status-counts`,"GET"));
  assert.equal(routeAllowed(`api/erp/${m}/status-counts`,"POST"),false);
  assert.ok(routeAllowed(`api/erp/${m}/detail`,"GET"));
  assert.ok(routeAllowed(`api/erp/${m}/actions`,"GET"));
  assert.ok(routeAllowed(`api/erp/${m}/options`,"POST"));
  assert.ok(routeAllowed(`api/erp/${m}/commands/lookup`,"POST"));
  assert.equal(requestBodyLimit(`api/erp/${m}/options`,"POST"),1048576);
  assert.equal(requestBodyLimit(`api/erp/${m}/commands/lookup`,"POST"),1048576);
  assert.equal(routeAllowed(`api/erp/${m}/invalid`,"GET"),false);
 }
 assert.ok(routeAllowed("api/erp/sales-orders/contract-info","GET"));
 assert.ok(routeAllowed("api/erp/sales-qr/contract-info","GET"));
 assert.ok(routeAllowed("api/erp/sales-order-pm/contract-info","GET"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/contract-info","GET"));

 for(const m of ["purchase-requests", "sales-orders", "internal-transfer-requests", "machine-movements", "machine-repairs", "purchase-orders", "inbound-requests", "internal-transfer-batches"]){
  assert.ok(routeAllowed(`api/erp/${m}/create`,"POST"));
  assert.ok(routeAllowed(`api/erp/${m}/save`,"POST"));
  assert.ok(routeAllowed(`api/erp/${m}/delete`,"POST"));
  assert.equal(requestBodyLimit(`api/erp/${m}/create`,"POST"),1048576);
  assert.equal(requestBodyLimit(`api/erp/${m}/save`,"POST"),1048576);
  assert.equal(requestBodyLimit(`api/erp/${m}/delete`,"POST"),1048576);
 }

 for(const m of ["internal-transfer-pm", "internal-transfer-tech", "internal-transfer-sa", "internal-transfer-accounting", "internal-transfer-warehouse-out", "internal-transfer-warehouse-in"]){
  assert.ok(routeAllowed(`api/erp/${m}/save`,"POST"));
  assert.equal(routeAllowed(`api/erp/${m}/create`,"POST"),false);
  assert.equal(routeAllowed(`api/erp/${m}/delete`,"POST"),false);
  assert.equal(requestBodyLimit(`api/erp/${m}/save`,"POST"),1048576);
 }

 for(const m of ["purchase-approvals", "sales-order-pm", "sales-order-sa"]){
  assert.equal(routeAllowed(`api/erp/${m}/create`,"POST"),false);
  assert.equal(routeAllowed(`api/erp/${m}/save`,"POST"),false);
  assert.equal(routeAllowed(`api/erp/${m}/delete`,"POST"),false);
 }

 assert.ok(routeAllowed("api/erp/inbound-requests/sections/costs/save","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-tech/sections/assets/save","POST"));
 assert.equal(requestBodyLimit("api/erp/inbound-requests/sections/costs/save","POST"),1048576);
 assert.equal(requestBodyLimit("api/erp/internal-transfer-tech/sections/assets/save","POST"),1048576);

 assert.ok(routeAllowed("api/erp/purchase-orders/item-price","POST"));
 assert.equal(requestBodyLimit("api/erp/purchase-orders/item-price","POST"),1048576);

 assert.ok(routeAllowed("api/erp/warehouse-qr/qr/add","POST"));
 assert.ok(routeAllowed("api/erp/warehouse-qr/qr/delete","POST"));
 assert.ok(routeAllowed("api/erp/sales-qr/qr/add","POST"));
 assert.ok(routeAllowed("api/erp/sales-qr/qr/delete","POST"));
 assert.equal(routeAllowed("api/erp/warehouse-qr/create","POST"),false);
 assert.equal(routeAllowed("api/erp/sales-qr/create","POST"),false);

 assert.ok(routeAllowed("api/erp/purchase-requests/actions/submit","POST"));
 assert.ok(routeAllowed("api/erp/purchase-requests/actions/send-purchase-order","POST"));
 assert.ok(routeAllowed("api/erp/sales-orders/actions/send-pm","POST"));
 assert.ok(routeAllowed("api/erp/sales-orders/actions/send-pm/options","POST"));
 assert.ok(routeAllowed("api/erp/sales-orders/actions/recall","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-requests/actions/send-pm","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-requests/actions/send-pm/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-requests/actions/recall","POST"));
 assert.ok(routeAllowed("api/erp/inbound-requests/actions/send-management","POST"));
 assert.ok(routeAllowed("api/erp/inbound-requests/actions/send-warehouse","POST"));
 assert.ok(routeAllowed("api/erp/purchase-approvals/actions/approve","POST"));
 assert.ok(routeAllowed("api/erp/purchase-approvals/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-pm/actions/send-sa","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-pm/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/actions/send-accounting","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/actions/send-tech","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/actions/return-step","POST"));
 assert.ok(routeAllowed("api/erp/sales-order-sa/actions/return-step/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-pm/actions/pm-confirm","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-pm/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-batches/actions/sync-requests","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-batches/actions/send-tech","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-batches/actions/send-sa","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-tech/actions/send-sa","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-tech/actions/send-sa/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-tech/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-sa/actions/send-accounting","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-sa/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-sa/actions/return-step","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-sa/actions/return-step/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-accounting/actions/send-warehouse","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-accounting/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-accounting/actions/return-step","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-accounting/actions/return-step/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-warehouse-out/actions/dispatch","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-warehouse-out/actions/reject","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-warehouse-out/actions/return-step","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-warehouse-out/actions/return-step/options","POST"));
 assert.ok(routeAllowed("api/erp/internal-transfer-warehouse-in/actions/receive","POST"));
});
test("documents v2, query/field contracts and openapi routes are correctly allowlisted",()=>{
 for(const p of [
  "api/v2/documents/purchase-orders",
  "api/v2/documents/purchase-orders/detail",
  "api/v2/documents/inbound-requests",
  "api/v2/documents/inbound-requests/detail",
  "api/v2/purchase-requests",
  "api/v2/purchase-requests/detail",
  "api/documents/field-contract",
  "api/documents/query-contract",
  "api/contracts/openapi.json",
  "api/lookups/branches",
 ]){
  assert.ok(routeAllowed(p,"GET"));
  assert.equal(routeAllowed(p,"POST"),false);
 }
});
test("ERP notification routes and positive int32 ID validation",()=>{
 for(const validId of ["1","42","999","2147483647"]){
  assert.equal(isNotificationId(validId),true);
  assert.equal(notificationGetRoute(`api/notifications/${validId}`),true);
  assert.equal(notificationGetRoute(`api/notifications/${validId}/target`),true);
  assert.equal(notificationReadRoute(`api/notifications/${validId}/read`),true);
  assert.equal(routeAllowed(`api/notifications/${validId}`,"GET"),true);
  assert.equal(routeAllowed(`api/notifications/${validId}/target`,"GET"),true);
  assert.equal(routeAllowed(`api/notifications/${validId}/read`,"POST"),true);
  assert.equal(routeAllowed(`api/notifications/${validId}`,"POST"),false);
  assert.equal(routeAllowed(`api/notifications/${validId}/target`,"POST"),false);
  assert.equal(routeAllowed(`api/notifications/${validId}/read`,"GET"),false);
  assert.equal(routeAllowed(`api/notifications/${validId}/delete`,"POST"),false);
 }
 assert.equal(notificationGetRoute("api/notifications"),true);
 assert.equal(routeAllowed("api/notifications","GET"),true);
 assert.equal(routeAllowed("api/notifications","POST"),false);
 for(const invalidId of ["0","-1","-42","abc","1a","2147483648","99999999999","01",""]){
  assert.equal(isNotificationId(invalidId),false);
  assert.equal(routeAllowed(`api/notifications/${invalidId}`,"GET"),false);
  assert.equal(routeAllowed(`api/notifications/${invalidId}/target`,"GET"),false);
  assert.equal(routeAllowed(`api/notifications/${invalidId}/read`,"POST"),false);
 }
});
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
