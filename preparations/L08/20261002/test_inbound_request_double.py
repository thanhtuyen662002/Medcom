#!/usr/bin/env python3
from dataclasses import replace
import unittest

from inbound_request_double import ActionSpec, Authority, Effect, InboundRequestModel, Record


AUTH = Authority("user-a", "company-a", "warehouse-a", 3, 5)
REQUEST = ActionSpec("synthetic.request", Effect.REQUEST, ("DRAFT",), "REQUEST_SUBMITTED", 1, "synthetic:evidence-request", True)
RECEIPT = ActionSpec("synthetic.receipt", Effect.RECEIPT, ("REQUEST_SUBMITTED",), "RECEIPT_RECORDED", 1, "synthetic:evidence-receipt", True)
POST = ActionSpec("synthetic.post", Effect.STOCK_POSTING, ("RECEIPT_RECORDED",), "STOCK_POSTED", 1, "synthetic:evidence-post", True)


class InboundRequestDoubleTests(unittest.TestCase):
    def model(self, specs=(REQUEST,), authority=AUTH):
        return InboundRequestModel({spec.synthetic_action_id: spec for spec in specs}, authority)

    def apply(self, model, record=Record(), action="synthetic.request", operation="op1", payload=None, **changes):
        args = dict(
            action_id=action,
            contract_revision=1,
            authority=AUTH,
            record=record,
            expected_version=record.version,
            operation_id=operation,
            payload={"request": "synthetic"} if payload is None else payload,
            business_state_ok=True,
        )
        args.update(changes)
        return model.apply(**args)

    def submitted(self, model):
        return self.apply(model).record

    def test_initial_record_has_no_business_effect(self):
        self.assertEqual(Record(), Record("DRAFT", False, False, False, 0))

    def test_request_sets_request_only(self):
        record = self.submitted(self.model())
        self.assertEqual((record.request_recorded, record.receipt_recorded, record.stock_posted), (True, False, False))

    def test_request_never_implies_receipt_state(self):
        self.assertEqual(self.submitted(self.model()).state, "REQUEST_SUBMITTED")

    def test_request_never_implies_stock_posting(self):
        self.assertFalse(self.submitted(self.model()).stock_posted)

    def test_unknown_generic_save_rejected(self):
        self.assertEqual(self.apply(self.model(), action="Save").code, "UNSUPPORTED_ACTION")

    def test_unproved_approval_rejected(self):
        self.assertEqual(self.apply(self.model(), action="Approve").code, "UNSUPPORTED_ACTION")

    def test_unproved_cancel_rejected(self):
        self.assertEqual(self.apply(self.model(), action="Cancel").code, "UNSUPPORTED_ACTION")

    def test_unproved_delete_rejected(self):
        self.assertEqual(self.apply(self.model(), action="Delete").code, "UNSUPPORTED_ACTION")

    def test_non_synthetic_action_spec_rejected(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, synthetic_action_id="real.request"),))

    def test_missing_source_identity_rejected_at_registry_boundary(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, exact_source_identity=""),))

    def test_non_synthetic_source_identity_rejected(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, exact_source_identity="dbo.usp_Request"),))

    def test_string_effect_cannot_impersonate_enum(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, effect="REQUEST_ONLY"),))

    def test_effect_state_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, result_state="STOCK_POSTED"),))

    def test_duplicate_allowed_state_rejected(self):
        with self.assertRaises(ValueError):
            self.model((replace(REQUEST, allowed_from=("DRAFT", "DRAFT")),))

    def test_unverified_evidence_rejected(self):
        spec = replace(REQUEST, evidence_verified=False)
        self.assertFalse(self.apply(self.model((spec,))).allowed)

    def test_receipt_requires_separate_action_and_state(self):
        model = self.model((REQUEST, RECEIPT))
        submitted = self.submitted(model)
        received = self.apply(model, record=submitted, action="synthetic.receipt", operation="op2").record
        self.assertEqual((received.request_recorded, received.receipt_recorded, received.stock_posted), (True, True, False))

    def test_receipt_cannot_run_from_draft(self):
        self.assertEqual(self.apply(self.model((RECEIPT,)), action="synthetic.receipt").code, "STATE_CONFLICT")

    def test_post_requires_separate_action_and_state(self):
        model = self.model((REQUEST, RECEIPT, POST))
        submitted = self.submitted(model)
        received = self.apply(model, record=submitted, action="synthetic.receipt", operation="op2").record
        posted = self.apply(model, record=received, action="synthetic.post", operation="op3").record
        self.assertEqual((posted.request_recorded, posted.receipt_recorded, posted.stock_posted), (True, True, True))

    def test_post_cannot_run_from_request_state(self):
        model = self.model((REQUEST, POST))
        submitted = self.submitted(model)
        self.assertFalse(self.apply(model, record=submitted, action="synthetic.post", operation="op2").allowed)

    def test_stale_contract_revision_rejected(self):
        self.assertFalse(self.apply(self.model(), contract_revision=2).allowed)

    def test_boolean_contract_revision_rejected(self):
        self.assertEqual(self.apply(self.model(), contract_revision=True).code, "INVALID_REQUEST")

    def test_scope_generation_change_rejected(self):
        stale = Authority("user-a", "company-a", "warehouse-a", 2, 5)
        self.assertFalse(self.apply(self.model(), authority=stale).allowed)

    def test_permission_generation_change_rejected(self):
        stale = Authority("user-a", "company-a", "warehouse-a", 3, 4)
        self.assertFalse(self.apply(self.model(), authority=stale).allowed)

    def test_boolean_authority_generation_rejected(self):
        invalid = Authority("user-a", "company-a", "warehouse-a", True, 5)
        self.assertEqual(self.apply(self.model(), authority=invalid).code, "STALE_OR_UNAUTHORIZED")

    def test_expected_version_cas_rejected(self):
        self.assertFalse(self.apply(self.model(), expected_version=1).allowed)

    def test_boolean_expected_version_rejected(self):
        self.assertEqual(self.apply(self.model(), expected_version=False).code, "INVALID_REQUEST")

    def test_business_state_rechecked(self):
        self.assertFalse(self.apply(self.model(), business_state_ok=False).allowed)

    def test_truthy_business_state_rejected(self):
        self.assertEqual(self.apply(self.model(), business_state_ok="yes").code, "INVALID_REQUEST")

    def test_empty_operation_id_rejected(self):
        self.assertEqual(self.apply(self.model(), operation="").code, "INVALID_REQUEST")

    def test_empty_payload_rejected(self):
        self.assertEqual(self.apply(self.model(), payload={}).code, "INVALID_REQUEST")

    def test_non_string_payload_value_rejected(self):
        self.assertEqual(self.apply(self.model(), payload={"request": 7}).code, "INVALID_REQUEST")

    def test_incoherent_record_flags_rejected(self):
        invalid = Record("DRAFT", True, False, False, 0)
        self.assertEqual(self.apply(self.model(), record=invalid).code, "INVALID_REQUEST")

    def test_boolean_record_version_rejected(self):
        invalid = Record("DRAFT", False, False, False, False)
        self.assertEqual(self.apply(self.model(), record=invalid).code, "INVALID_REQUEST")

    def test_same_operation_reconciles_without_second_effect(self):
        model = self.model()
        first = self.apply(model)
        second = self.apply(model)
        self.assertEqual(first, second)
        self.assertEqual(len(model.operations), 1)

    def test_same_operation_changed_payload_rejected(self):
        model = self.model()
        self.apply(model, payload={"request": "a"})
        self.assertEqual(self.apply(model, payload={"request": "b"}).code, "IDEMPOTENCY_MISMATCH")

    def test_same_operation_changed_action_rejected(self):
        model = self.model((REQUEST, RECEIPT))
        submitted = self.apply(model, payload={"request": "a"}).record
        result = self.apply(model, record=submitted, action="synthetic.receipt", operation="op1", payload={"request": "a"})
        self.assertEqual(result.code, "IDEMPOTENCY_MISMATCH")

    def test_same_operation_changed_authority_rejected(self):
        model = self.model()
        self.apply(model)
        other = Authority("user-b", "company-a", "warehouse-a", 3, 5)
        self.assertEqual(self.apply(model, authority=other).code, "IDEMPOTENCY_MISMATCH")

    def test_same_operation_changed_precondition_rejected(self):
        model = self.model()
        submitted = self.apply(model).record
        self.assertEqual(self.apply(model, record=submitted).code, "IDEMPOTENCY_MISMATCH")

    def test_same_operation_changed_contract_rejected(self):
        model = self.model()
        self.apply(model)
        model.replace_spec(replace(REQUEST, contract_revision=2))
        self.assertEqual(self.apply(model, contract_revision=2).code, "IDEMPOTENCY_MISMATCH")

    def test_exact_retry_reconciles_after_current_authority_changes(self):
        model = self.model()
        first = self.apply(model)
        model.replace_authority(Authority("user-a", "company-a", "warehouse-a", 4, 5))
        self.assertEqual(self.apply(model), first)

    def test_semantic_spec_change_requires_new_revision(self):
        model = self.model()
        with self.assertRaises(ValueError):
            model.replace_spec(replace(REQUEST, exact_source_identity="synthetic:changed"))

    def test_registry_view_is_immutable(self):
        model = self.model()
        with self.assertRaises(TypeError):
            model.registry[REQUEST.synthetic_action_id] = replace(REQUEST, contract_revision=2)

    def test_operation_view_is_immutable(self):
        model = self.model()
        self.apply(model)
        with self.assertRaises(TypeError):
            model.operations["op2"] = model.operations["op1"]

    def test_authority_property_rejects_direct_assignment(self):
        model = self.model()
        with self.assertRaises(AttributeError):
            model.authority = AUTH

    def test_ambiguous_transport_requires_reconciliation(self):
        self.assertEqual(self.model().transport_failure(False), "OUTCOME_UNKNOWN_RECONCILE")

    def test_precommit_failure_is_not_retried_as_unknown(self):
        self.assertEqual(self.model().transport_failure(True), "FAILED_PRECOMMIT")

    def test_truthy_commit_exclusion_evidence_rejected(self):
        with self.assertRaises(ValueError):
            self.model().transport_failure("yes")


if __name__ == "__main__":
    unittest.main()
