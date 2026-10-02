import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceActionsForForm, transferActions } from "../components/pilots/transfer-action-catalog.ts";
test("finite transfer projection covers eight bound forms and 17 unique source control groups", () => {
  assert.equal(transferActions.length, 17);
  assert.equal(new Set(transferActions.map(action => action.formId)).size, 8);
  assert.equal(new Set(transferActions.map(action => action.id)).size, 17);
  assert.deepEqual(sourceActionsForForm("unknown-form"), []);
});
test("request send/confirm/return map actual controls without guessing from labels", () => {
  const send = sourceActionsForForm("IV_InternalTransferRequestFrm");
  assert.equal(send.length, 1);
  assert.equal(send[0].procedure, "IV_InternalTransfer_RequestSendPMStp");
  assert.deepEqual(send[0].allowedSourceStatuses, [0, 30]);
  assert.equal(send[0].binding.key, "DocumentID");
  const pm = sourceActionsForForm("IV_InternalTransferPMFrm");
  assert.deepEqual(pm.map(action => action.procedure), ["IV_InternalTransfer_RequestPMConfirmStp", "IV_InternalTransfer_RequestPMReturnStp"]);
  assert.ok(pm.every(action => action.allowedSourceStatuses.join() === "10"));
});
test("warehouse actions preserve distinct source status domains and cannot enable mutations", () => {
  const receive = sourceActionsForForm("IV_InternalTransferWarehouseInFrm");
  assert.equal(receive[0].procedure, "IV_InternalTransfer_BatchReceiveStp");
  assert.deepEqual(receive[0].allowedSourceStatuses, [100, 130]);
  assert.equal(receive[0].binding.key, "BatchID");
  assert.ok(transferActions.every(action => action.writeEnabled === false && action.uiOnly));
  assert.ok(transferActions.every(action => action.preAction === "SaveContinue" && action.postAction === "Reload"));
});
test("source projection includes pinned provenance but no raw SQL/template interpolation", () => {
  for (const action of transferActions) {
    assert.match(action.procedureSha256, /^[a-f0-9]{64}$/);
    assert.ok(action.sourceLines.C4 > 0 && action.sourceLines.CS4 > 0);
    assert.match(action.menu.menuId, /^070101\d{2}$/);
  }
  assert.doesNotMatch(JSON.stringify(transferActions), /\{User\}|BEGIN TRAN|SELECT |UPDATE |INSERT /i);
});
