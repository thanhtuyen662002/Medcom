import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const script = readFileSync(new URL("../../src/backend/Medcom.Api/Swagger/medcom-swagger.js", import.meta.url), "utf8");
const reply = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body, headers: { get: name => headers[name] || null } });
function fixture(fetchImpl, href = "https://erp.example.test/swagger/index.html") {
  const calls = [], events = {}, elements = {}, handlers = {};
  let reloads = 0, config;
  const window = { location: { href, reload() { reloads++; } }, addEventListener(name, handler) { events[name] = handler; } };
  for (const id of ["medcom-status", "medcom-login", "medcom-password", "medcom-username", "medcom-logout"]) {
    elements[id] = { value: "", textContent: "", querySelectorAll: () => [],
      addEventListener(name, handler) { handlers[id + ":" + name] = handler; } };
  }
  const bundle = options => { config = options; return {}; };
  bundle.presets = { apis: {} };
  const context = { window, URL, document: { getElementById: id => elements[id] }, SwaggerUIBundle: bundle,
    fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); } };
  vm.runInNewContext(script, context);
  return { client: window.MedcomSwagger, calls, events, elements, handlers,
    get reloads() { return reloads; }, get config() { return config; } };
}

test("contract inspection performs no auth/scope fetch and cannot change the server from query configuration", async () => {
  const f = fixture(url => url.endsWith("openapi.json") ? reply({ paths: {} }) : reply({}, 401));
  const req = { url: "https://erp.example.test/api/contracts/openapi.json" };
  assert.equal(await f.client.prepareRequest(req), req);
  assert.equal(f.calls.length, 0);
  await f.events.load();
  assert.equal(f.config.url, req.url);
  assert.equal(f.config.queryConfigEnabled, false);
  assert.equal(f.config.validatorUrl, null);
  assert.equal(f.config.persistAuthorization, false);
  assert.equal(f.config.withCredentials, true);
  assert.equal(f.config.docExpansion, "none");
  assert.equal(f.config.defaultModelsExpandDepth, -1);
});
test("protected reads acquire current scope without changing paging or sending a command", async () => {
  const f = fixture(() => reply({}, 200, { "X-Medcom-Read-Scope": "current-scope" }));
  const req = { url: "https://erp.example.test/api/erp/purchase-orders?page=2&pageSize=20", method: "GET", headers: {} };
  await f.client.prepareRequest(req);
  assert.equal(req.headers["X-Medcom-Read-Scope"], "current-scope");
  assert.equal(req.url.endsWith("?page=2&pageSize=20"), true);
  assert.deepEqual(f.calls.map(call => call.url), ["https://erp.example.test/api/workspace"]);
  assert.equal(f.calls[0].options.credentials, "same-origin");
  assert.equal(f.calls[0].options.cache, "no-store");
});
test("writes get CSRF and scope once while preserving the original intent and idempotency key", async () => {
  const f = fixture(url => url.endsWith("/csrf") ? reply({ token: "csrf" }) : reply({}, 200, { "X-Medcom-Read-Scope": "scope" }));
  const body = '{"idempotencyKey":"unchanged","documentId":"QA-DOC","stateToken":"original"}';
  const req = { url: "https://erp.example.test/api/erp/purchase-orders/save", method: "POST", headers: {}, body };
  await f.client.prepareRequest(req);
  assert.equal(req.body, body);
  assert.equal(req.headers["X-CSRF-TOKEN"], "csrf");
  assert.equal(req.headers["X-Medcom-Read-Scope"], "scope");
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => !call.options.method)); // auxiliary GET only; never dispatch/retry
});
test("explicit caller token and scope are preserved so stale commands cannot be silently upgraded", async () => {
  const f = fixture(() => assert.fail("unexpected fetch"));
  const req = { url: "https://erp.example.test/api/erp/purchase-orders/save", method: "POST",
    headers: { "x-csrf-token": "old-csrf", "x-medcom-read-scope": "old-scope" } };
  await f.client.prepareRequest(req);
  assert.deepEqual(req.headers, { "x-csrf-token": "old-csrf", "x-medcom-read-scope": "old-scope" });
});
test("expired workspace and failed CSRF stop preparation without command redispatch", async () => {
  const noSession = fixture(() => reply({}, 401));
  await assert.rejects(noSession.client.prepareRequest({ url: "https://erp.example.test/api/lookups/branches" }), /đăng nhập lại/);
  assert.equal(noSession.calls.length, 1);
  const noCsrf = fixture(() => reply({}, 503));
  await assert.rejects(noCsrf.client.prepareRequest({ url: "https://erp.example.test/api/auth/login", method: "POST" }), /token/);
  assert.equal(noCsrf.calls.length, 1);
});
test("cross-origin destinations and HTTP writes are rejected before fetching any credentials", async () => {
  const f = fixture(() => assert.fail("unexpected fetch"));
  await assert.rejects(f.client.prepareRequest({ url: "https://other.example.test/api/workspace" }), /BE đang mở/);
  const plain = fixture(() => assert.fail("unexpected fetch"), "http://erp.example.test/swagger/index.html");
  await assert.rejects(plain.client.prepareRequest({ url: "http://erp.example.test/api/auth/login", method: "POST" }), /HTTPS/);
});
test("IIS mounted apps use their own contract, CSRF and workspace paths", async () => {
  const f = fixture(url => url.endsWith("/csrf") ? reply({ token: "csrf" }) : reply({}, 200, { "X-Medcom-Read-Scope": "scope" }),
    "https://erp.example.test/medcom/swagger/index.html");
  const req = { url: "https://erp.example.test/api/erp/purchase-orders/save", method: "POST", headers: {} };
  await f.client.prepareRequest(req);
  assert.equal(req.url, "https://erp.example.test/medcom/api/erp/purchase-orders/save");
  assert.deepEqual(f.calls.map(call => call.url), ["https://erp.example.test/medcom/api/auth/csrf", "https://erp.example.test/medcom/api/workspace"]);
});
test("login uses the real endpoint and clears the password even after a denied attempt", async () => {
  const f = fixture(url => url.endsWith("/csrf") ? reply({ token: "csrf" }) : reply({}, 401));
  f.events.load();
  f.elements["medcom-username"].value = "qa-user";
  f.elements["medcom-password"].value = "synthetic-password";
  await f.handlers["medcom-login:submit"]({ preventDefault() {} });
  const login = f.calls.find(call => call.options.method === "POST");
  assert.equal(login.url, "https://erp.example.test/api/auth/login");
  assert.equal(login.options.headers["X-CSRF-TOKEN"], "csrf");
  assert.equal(login.options.credentials, "same-origin");
  assert.equal(f.elements["medcom-password"].value, "");
  assert.match(f.elements["medcom-status"].textContent, /không đúng/);
  assert.equal(f.reloads, 0);
});
test("UI grouping preserves operations, security, payload schemas and explicit tags", () => {
  const f = fixture(() => reply({}));
  const original = { paths: {
    "/api/erp/purchase-orders/create": { post: { tags: ["Đặt mua hàng"], security: [{ SessionCookie: [] }], requestBody: { required: true } } },
    "/api/erp/unknown": { get: { responses: { 200: {} } } },
    "/api/notifications": { get: { tags: ["Existing"], responses: { 200: {} } } },
    "/health/live": { get: { security: [] } }
  } };
  const document = f.client.groupDocument(structuredClone(original));
  assert.equal(document.paths["/api/erp/purchase-orders/create"].post.tags[0], "Đặt mua hàng");
  assert.equal(document.paths["/api/erp/unknown"].get.tags[0], "Màn hình ERP");
  assert.deepEqual(document.paths["/api/notifications"].get.tags, ["Existing"]);
  for (const [path, item] of Object.entries(document.paths))
    for (const [method, operation] of Object.entries(item)) {
      const before = original.paths[path][method], after = { ...operation };
      if (!before.tags) delete after.tags;
      assert.deepEqual(after, before);
    }
});
test("browser-managed headers do not block Swagger parameter validation while branch and body requirements remain", () => {
  const f = fixture(() => reply({}));
  const document = f.client.groupDocument({ paths: { "/api/erp/purchase-orders/save": { post: {
    requestBody: { required: true }, parameters: [
      { name: "Origin", in: "header", required: true },
      { name: "X-Medcom-Read-Scope", in: "header", required: true },
      { name: "branchId", in: "query", required: true }
    ]
  } } } });
  const op = document.paths["/api/erp/purchase-orders/save"].post;
  assert.equal(op.parameters.some(parameter => parameter.name === "Origin"), false);
  assert.equal(op.parameters.find(parameter => parameter.name === "X-Medcom-Read-Scope").required, false);
  assert.equal(op.parameters.find(parameter => parameter.name === "branchId").required, true);
  assert.equal(op.requestBody.required, true);
});
test("login double submit is bounded and successful logout clears the inspection state", async () => {
  let finish;
  const f = fixture(url => url.endsWith("/csrf") ? new Promise(resolve => { finish = resolve; }) : reply({}, 401));
  f.events.load();
  const first = f.handlers["medcom-login:submit"]({ preventDefault() {} });
  await f.handlers["medcom-login:submit"]({ preventDefault() {} });
  finish(reply({ token: "csrf" }));
  await first;
  assert.equal(f.calls.filter(call => call.options.method === "POST").length, 1);
  f.client.responseInterceptor({ url: "https://erp.example.test/api/auth/logout", status: 204 });
  assert.equal(f.reloads, 1);
  f.client.responseInterceptor({ url: "https://erp.example.test/api/erp/purchase-orders/save", status: 409 });
  assert.equal(f.reloads, 1);
});
