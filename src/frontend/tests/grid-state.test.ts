import assert from "node:assert/strict";
import { test } from "node:test";
import { documentScopeKey, moveColumn, navigateCell, setColumnHidden, setColumnWidth } from "../components/grid/grid-state.ts";

test("grid navigation clamps boundaries and keeps the active column between rows", () => {
  assert.deepEqual(navigateCell({ row: 1, column: 2 }, "ArrowDown", 3, 5), { row: 2, column: 2 });
  assert.deepEqual(navigateCell({ row: 2, column: 4 }, "ArrowDown", 3, 5), { row: 2, column: 4 });
  assert.deepEqual(navigateCell({ row: 0, column: 0 }, "ArrowLeft", 3, 5), { row: 0, column: 0 });
  assert.deepEqual(navigateCell({ row: 1, column: 3 }, "Home", 3, 5), { row: 1, column: 0 });
  assert.deepEqual(navigateCell({ row: 1, column: 3 }, "End", 3, 5), { row: 1, column: 4 });
});
test("control endpoints and viewport jumps stay in the fetched page", () => {
  assert.deepEqual(navigateCell({ row: 15, column: 2 }, "Home", 50, 5, true), { row: 0, column: 0 });
  assert.deepEqual(navigateCell({ row: 15, column: 2 }, "End", 50, 5, true), { row: 49, column: 4 });
  assert.deepEqual(navigateCell({ row: 15, column: 2 }, "PageDown", 50, 5, false, 12), { row: 27, column: 2 });
  assert.deepEqual(navigateCell({ row: 5, column: 2 }, "PageUp", 50, 5, false, 12), { row: 0, column: 2 });
  assert.equal(navigateCell({ row: 0, column: 0 }, "Tab", 50, 5), null);
  assert.equal(navigateCell({ row: 0, column: 0 }, "ArrowDown", 0, 5), null);
});
test("view controls cannot hide or move the identity column; stable IDs survive reordering", () => {
  const original = [{ id: "id", hidden: false, width: 220 }, { id: "date", hidden: false, width: 180 }, { id: "branch", hidden: false, width: 180 }];
  assert.deepEqual(setColumnHidden(original, "id", true), original);
  assert.deepEqual(moveColumn(original, "id", 1), original);
  assert.deepEqual(moveColumn(original, "date", -1), original);
  const moved = moveColumn(setColumnHidden(original, "branch", true), "branch", -1);
  assert.deepEqual(moved.map(value => value.id), ["id", "branch", "date"]);
  assert.equal(moved[1].hidden, true);
  assert.deepEqual(original.map(value => value.id), ["id", "date", "branch"]);
});
test("column width input is finite, bounded and leaves unrelated columns untouched", () => {
  const original = [{ id: "id", hidden: false, width: 220 }, { id: "date", hidden: false, width: 180 }];
  assert.equal(setColumnWidth(original, "date", Number.NaN), original);
  assert.equal(setColumnWidth(original, "date", 9999)[1].width, 480);
  assert.equal(setColumnWidth(original, "date", -1)[1].width, 100);
  assert.equal(setColumnWidth(original, "date", 200.6)[1].width, 201);
  assert.equal(setColumnWidth(original, "date", 200)[0], original[0]);
});
test("authority, tenant, company and branch changes reset local grid state; branch order does not", () => {
  const session = { tenantId: "tenant", companyId: "company", authorityVersion: 1, capabilities: ["purchase-orders.read"] };
  const key = documentScopeKey("purchase-orders", session, ["branch-b", "branch-a"]);
  assert.equal(key, documentScopeKey("purchase-orders", session, ["branch-a", "branch-b"]));
  for (const change of [{ tenantId: "other" }, { companyId: "other" }, { authorityVersion: 2 }, { capabilities: [] }]) {
    assert.notEqual(key, documentScopeKey("purchase-orders", { ...session, ...change }, ["branch-a", "branch-b"]));
  }
  assert.notEqual(key, documentScopeKey("purchase-orders", session, ["branch-a"]));
  assert.notEqual(key, documentScopeKey("inbound-requests", session, ["branch-a", "branch-b"]));
});
