import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, errorMessage, safeReturnPath } from "../lib/api.ts";
import { sessionSchema, workspaceSchema, documentDetailSchema } from "../lib/contracts.ts";

test("return URLs cannot escape the approved workspace route", () => {
  for (const value of [null, "https://outside.invalid", "//outside.invalid", "/api/auth/login", "/workspace/?sql=arbitrary", "javascript:alert(1)"])
    assert.equal(safeReturnPath(value), "/workspace/");
});
test("unsafe server details and payload are never reflected into login errors", () => {
  assert.equal(errorMessage(new ApiError(500, "private exception with password")), "Không thể hoàn tất yêu cầu. Vui lòng thử lại.");
  assert.equal(errorMessage(new Error("private-data")), "Không thể kết nối. Kiểm tra mạng rồi thử lại.");
  assert.match(errorMessage(new ApiError(503, "identity_unavailable")), /chưa sẵn sàng/);
});
const valid = { displayName: "Synthetic", tenantId: "tenant", companyId: "company", companyName: "Synthetic company",
  authorityVersion: 1, idleExpiresAt: "2026-10-02T10:00:00+00:00", absoluteExpiresAt: "2026-10-03T10:00:00+00:00", capabilities: [] };
test("session contracts reject secret fields, missing binding and invalid version", () => {
  assert.equal(sessionSchema.safeParse(valid).success, true);
  assert.equal(sessionSchema.safeParse({ ...valid, password: "private" }).success, false);
  assert.equal(sessionSchema.safeParse({ ...valid, tenantId: "" }).success, false);
  assert.equal(sessionSchema.safeParse({ ...valid, authorityVersion: true }).success, false);
  assert.equal(sessionSchema.safeParse({ ...valid, authorityVersion: 0 }).success, false);
});
test("server navigation cannot introduce external or executable routes", () => {
  assert.equal(workspaceSchema.safeParse({ session: valid, navigation: [{ id: "status", label: "Status", href: "/workspace/" }] }).success, true);
  for (const href of ["javascript:alert(1)", "https://outside.invalid", "/api/rawsql"])
    assert.equal(workspaceSchema.safeParse({ session: valid, navigation: [{ id: "status", label: "Status", href }] }).success, false);
});
test("line quantities preserve ERP precision and reject numeric, money or mixed-shape payloads", () => {
  const detail = { document: { documentId: "TEST", documentDate: "2026-10-02", branchId: "BR-A", statusId: 1, isLocked: false },
    purchaseOrderLines: [{ lineId: "LINE", itemId: "ITEM", quantity: "12345678901234567890123456.78", quantity2: "1.2345" }],
    inboundRequestLines: [], page: 1, pageSize: 50, hasMore: false };
  assert.equal(documentDetailSchema.parse(detail).purchaseOrderLines[0].quantity, detail.purchaseOrderLines[0].quantity);
  for (const line of [{ ...detail.purchaseOrderLines[0], quantity: 123 }, { ...detail.purchaseOrderLines[0], quantity: "1e30" },
    { ...detail.purchaseOrderLines[0], amount: "999" }])
    assert.equal(documentDetailSchema.safeParse({ ...detail, purchaseOrderLines: [line] }).success, false);
  assert.equal(documentDetailSchema.safeParse({ ...detail, inboundRequestLines: [{ lineId: "OTHER", itemId: "OTHER",
    setQuantityByDocument: "1", barrelQuantityByDocument: "2", setQuantityByReal: null, barrelQuantityByReal: null }] }).success, false);
});

test("known purchase-request navigation does not invalidate the workspace", () => {
  const navigation = [
    { id: "platform-status", label: "Status", href: "/workspace/" },
    { id: "purchase-requests", label: "Đề nghị mua hàng", href: "/workspace/?screen=purchase-requests" },
  ];
  assert.deepEqual(workspaceSchema.parse({ session: valid, navigation }).navigation, navigation);
  for (const href of ["/workspace/?screen=unknown", "/workspace/?screen=purchase-requests&redirect=https://outside.invalid",
    "//outside.invalid", "/workspace/?screen=purchase-requests#script", "javascript:alert(1)"])
    assert.equal(workspaceSchema.safeParse({ session: valid, navigation: [{ ...navigation[1], href }] }).success, false);
});

test("malformed successful responses are compatibility errors, not network errors", async t => {
  const { getWorkspace, getHealth } = await import("../lib/api.ts");
  let response = new Response(JSON.stringify({ session: valid, navigation: [{ id: "purchase-requests", label: "Purchase requests",
    href: "/workspace/?screen=purchase-requests" }] }), { status: 200 });
  t.mock.method(globalThis, "fetch", async () => response);
  assert.equal((await getWorkspace()).session.displayName, valid.displayName);
  for (const body of ["not json", JSON.stringify({ session: valid, navigation: [{ id: "bad", label: "Bad", href: "javascript:alert(1)" }] })]) {
    response = new Response(body, { status: 200, headers: { "X-Correlation-ID": "synthetic-correlation" } });
    await assert.rejects(getWorkspace(), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "invalid_response");
      assert.equal(error.correlationId, "synthetic-correlation");
      assert.match(errorMessage(error), /không tương thích/);
      assert.doesNotMatch(errorMessage(error), /javascript|not json|Kiểm tra mạng/);
      return true;
    });
  }
  response = new Response("not json", { status: 503 });
  await assert.rejects(getHealth(), error => error instanceof ApiError && error.code === "invalid_response");
  response = new Response(JSON.stringify({ code: "session_expired" }), { status: 401 });
  await assert.rejects(getWorkspace(), error => error instanceof ApiError && error.status === 401 && error.code === "session_expired");
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(getWorkspace(), error => /Kiểm tra mạng/.test(errorMessage(error)));
});
