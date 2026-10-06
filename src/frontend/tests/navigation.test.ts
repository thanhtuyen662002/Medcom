import { test } from "node:test";
import assert from "node:assert/strict";
import { documentScreenFor, supportedNavigation } from "../lib/navigation.ts";

const navigation = [
  { id: "platform-status", label: "Status", href: "/workspace/" as const },
  { id: "purchase-orders", label: "Orders", href: "/workspace/?screen=purchase-orders" as const },
  { id: "purchase-requests", label: "Requests", href: "/workspace/?screen=purchase-requests" as const },
  { id: "inbound-requests", label: "Inbound", href: "/workspace/?screen=inbound-requests" as const },
];
test("bundled menu preserves supported server grants and excludes the unimplemented screen", () => {
  assert.deepEqual(supportedNavigation(navigation), [navigation[0], navigation[1], navigation[3]]);
  assert.deepEqual(supportedNavigation([navigation[2]]), []);
  assert.deepEqual(supportedNavigation([]), []);
});
test("document rendering requires a matching supported id/href grant", () => {
  assert.equal(documentScreenFor("purchase-orders", navigation), "purchase-orders");
  assert.equal(documentScreenFor("inbound-requests", navigation), "inbound-requests");
  for (const screen of ["purchase-requests", "unknown", "platform-status"])
    assert.equal(documentScreenFor(screen, navigation), null);
  assert.equal(documentScreenFor("purchase-orders", []), null);
  const mismatched = [{ ...navigation[1], href: "/workspace/?screen=purchase-requests" as const }];
  assert.deepEqual(supportedNavigation(mismatched), []);
  assert.equal(documentScreenFor("purchase-orders", mismatched), null);
});
