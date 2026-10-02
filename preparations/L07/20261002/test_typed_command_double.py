#!/usr/bin/env python3
import math
from dataclasses import replace
import unittest

from typed_command_double import ActionSpec, Authority, BrowserRequest, CommandAdmission


AUTH = Authority("user-a", "tenant-a", "company-a", "datasource-a", 5, 7)
SPEC = ActionSpec(
    "orders.approve",
    2,
    11,
    19,
    ("order_id", "comment"),
    {"order_id": "string", "comment": "string"},
    ("approved_by",),
    {"mode": "reviewed-default"},
    True,
)


def req(**changes):
    values = dict(
        action_id="orders.approve",
        contract_version=2,
        metadata_revision_hint=11,
        business_reference="order-1",
        payload={"order_id": "order-1", "comment": "ok"},
        idempotency_key="idem-1",
        correlation_id="corr-1",
    )
    values.update(changes)
    return BrowserRequest(**values)


class TypedCommandDoubleTests(unittest.TestCase):
    def admission(self, spec=SPEC, authority=AUTH):
        return CommandAdmission({spec.action_id: spec}, authority)

    def envelope(self, admission=None):
        admission = admission or self.admission()
        return admission.admit(req(), reference_owned=True, business_state_ok=True).envelope

    def test_valid_request_admitted(self):
        self.assertTrue(self.admission().admit(req(), reference_owned=True, business_state_ok=True).allowed)

    def test_raw_handler_name_rejected(self):
        self.assertFalse(self.admission().admit(req(action_id="dbo.usp_Approve"), reference_owned=True, business_state_ok=True).allowed)

    def test_unknown_action_rejected(self):
        self.assertFalse(self.admission().admit(req(action_id="unknown"), reference_owned=True, business_state_ok=True).allowed)

    def test_unhashable_action_id_rejected_without_lookup_error(self):
        self.assertFalse(self.admission().admit(req(action_id=[]), reference_owned=True, business_state_ok=True).allowed)

    def test_contract_version_mismatch_rejected(self):
        self.assertFalse(self.admission().admit(req(contract_version=3), reference_owned=True, business_state_ok=True).allowed)

    def test_metadata_hint_mismatch_rejected(self):
        self.assertFalse(self.admission().admit(req(metadata_revision_hint=10), reference_owned=True, business_state_ok=True).allowed)

    def test_boolean_revision_cannot_impersonate_integer(self):
        spec = replace(SPEC, contract_version=1)
        self.assertFalse(self.admission(spec).admit(req(contract_version=True), reference_owned=True, business_state_ok=True).allowed)

    def test_extra_payload_field_rejected(self):
        payload = {"order_id": "order-1", "comment": "ok", "admin": True}
        self.assertFalse(self.admission().admit(req(payload=payload), reference_owned=True, business_state_ok=True).allowed)

    def test_missing_payload_field_rejected(self):
        self.assertFalse(self.admission().admit(req(payload={"order_id": "order-1"}), reference_owned=True, business_state_ok=True).allowed)

    def test_readonly_field_rejected(self):
        payload = {"order_id": "order-1", "approved_by": "user-a"}
        self.assertFalse(self.admission().admit(req(payload=payload), reference_owned=True, business_state_ok=True).allowed)

    def test_wrong_payload_scalar_type_rejected(self):
        payload = {"order_id": 7, "comment": "ok"}
        self.assertFalse(self.admission().admit(req(payload=payload), reference_owned=True, business_state_ok=True).allowed)

    def test_nonfinite_number_rejected(self):
        numeric = replace(SPEC, payload_types={"order_id": "string", "comment": "number"})
        payload = {"order_id": "order-1", "comment": math.nan}
        self.assertFalse(self.admission(numeric).admit(req(payload=payload), reference_owned=True, business_state_ok=True).allowed)

    def test_client_authority_rejected(self):
        self.assertFalse(self.admission().admit(req(client_authority={"company": "company-b"}), reference_owned=True, business_state_ok=True).allowed)

    def test_empty_client_authority_is_still_rejected(self):
        self.assertFalse(self.admission().admit(req(client_authority={}), reference_owned=True, business_state_ok=True).allowed)

    def test_foreign_reference_rejected(self):
        self.assertFalse(self.admission().admit(req(), reference_owned=False, business_state_ok=True).allowed)

    def test_changed_business_state_rejected(self):
        self.assertFalse(self.admission().admit(req(), reference_owned=True, business_state_ok=False).allowed)

    def test_truthy_nonboolean_admission_flags_rejected(self):
        self.assertFalse(self.admission().admit(req(), reference_owned="yes", business_state_ok=True).allowed)

    def test_non_string_identifiers_rejected(self):
        self.assertFalse(self.admission().admit(req(idempotency_key=7), reference_owned=True, business_state_ok=True).allowed)

    def test_blank_business_reference_rejected(self):
        self.assertFalse(self.admission().admit(req(business_reference="  "), reference_owned=True, business_state_ok=True).allowed)

    def test_unverified_binding_rejected(self):
        spec = replace(SPEC, binding_verified=False)
        self.assertFalse(self.admission(spec).admit(req(), reference_owned=True, business_state_ok=True).allowed)

    def test_retired_action_rejected(self):
        spec = replace(SPEC, retired=True)
        self.assertFalse(self.admission(spec).admit(req(), reference_owned=True, business_state_ok=True).allowed)

    def test_server_derives_authority_defaults_and_fingerprint(self):
        envelope = self.envelope()
        self.assertEqual(envelope.authority, AUTH)
        self.assertEqual(envelope.defaults, SPEC.defaults)
        self.assertEqual(len(envelope.semantic_fingerprint), 64)

    def test_same_semantics_have_same_fingerprint(self):
        a = self.admission()
        one = self.envelope(a)
        two = a.admit(req(correlation_id="corr-2", idempotency_key="idem-2"), reference_owned=True, business_state_ok=True).envelope
        self.assertEqual(one.semantic_fingerprint, two.semantic_fingerprint)

    def test_payload_change_changes_fingerprint(self):
        a = self.admission()
        one = self.envelope(a)
        two = a.admit(req(payload={"order_id": "order-1", "comment": "changed"}), reference_owned=True, business_state_ok=True).envelope
        self.assertNotEqual(one.semantic_fingerprint, two.semantic_fingerprint)

    def test_business_reference_changes_fingerprint(self):
        a = self.admission()
        one = self.envelope(a)
        two = a.admit(req(business_reference="order-2"), reference_owned=True, business_state_ok=True).envelope
        self.assertNotEqual(one.semantic_fingerprint, two.semantic_fingerprint)

    def test_registry_revision_change_blocks_dispatch(self):
        a = self.admission()
        envelope = self.envelope(a)
        a.replace_spec(replace(SPEC, registry_revision=20))
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_semantic_spec_change_requires_new_registry_revision(self):
        a = self.admission()
        with self.assertRaises(ValueError):
            a.replace_spec(replace(SPEC, defaults={"mode": "changed"}))

    def test_registry_view_rejects_direct_mutation(self):
        a = self.admission()
        with self.assertRaises(TypeError):
            a.registry[SPEC.action_id] = replace(SPEC, registry_revision=20)

    def test_authority_generation_change_blocks_dispatch(self):
        a = self.admission()
        envelope = self.envelope(a)
        a.replace_authority(Authority("user-a", "tenant-a", "company-a", "datasource-a", 6, 7))
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_authority_property_rejects_direct_assignment(self):
        a = self.admission()
        with self.assertRaises(AttributeError):
            a.authority = AUTH

    def test_boolean_authority_generation_rejected(self):
        with self.assertRaises(ValueError):
            self.admission(authority=Authority("user-a", "tenant-a", "company-a", "datasource-a", True, 7))

    def test_source_defaults_are_defensively_copied(self):
        defaults = {"mode": "reviewed-default"}
        a = self.admission(replace(SPEC, defaults=defaults))
        defaults["mode"] = "tampered"
        self.assertEqual(self.envelope(a).defaults["mode"], "reviewed-default")

    def test_envelope_payload_is_immutable(self):
        envelope = self.envelope()
        with self.assertRaises(TypeError):
            envelope.payload["comment"] = "tampered"

    def test_business_state_rechecked_at_dispatch(self):
        a = self.admission()
        self.assertFalse(a.dispatch(self.envelope(a), reference_owned=True, business_state_ok=False).allowed)

    def test_truthy_nonboolean_dispatch_flags_rejected(self):
        a = self.admission()
        self.assertFalse(a.dispatch(self.envelope(a), reference_owned=True, business_state_ok="yes").allowed)

    def test_tampered_fingerprint_blocks_dispatch(self):
        a = self.admission()
        envelope = replace(self.envelope(a), semantic_fingerprint="0" * 64)
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_tampered_defaults_block_dispatch(self):
        a = self.admission()
        envelope = replace(self.envelope(a), defaults={"mode": "tampered"})
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_tampered_metadata_revision_blocks_dispatch(self):
        a = self.admission()
        envelope = replace(self.envelope(a), resolved_metadata_revision=12)
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_boolean_dispatch_revision_cannot_impersonate_integer(self):
        spec = replace(SPEC, contract_version=1)
        a = self.admission(spec)
        envelope = replace(a.admit(req(contract_version=1), reference_owned=True, business_state_ok=True).envelope, contract_version=True)
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_malformed_defaults_rejected_without_dispatch_error(self):
        a = self.admission()
        envelope = replace(self.envelope(a), defaults=None)
        self.assertFalse(a.dispatch(envelope, reference_owned=True, business_state_ok=True).allowed)

    def test_ambiguous_transport_becomes_outcome_unknown(self):
        self.assertEqual(self.admission().ambiguous_transport_after_dispatch(False), "OUTCOME_UNKNOWN")

    def test_proved_precommit_failure_is_not_outcome_unknown(self):
        self.assertEqual(self.admission().ambiguous_transport_after_dispatch(True), "FAILED_PRECOMMIT")

    def test_truthy_commit_exclusion_evidence_rejected(self):
        with self.assertRaises(ValueError):
            self.admission().ambiguous_transport_after_dispatch("yes")


if __name__ == "__main__":
    unittest.main()
