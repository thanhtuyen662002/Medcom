"""Behavior tests for the synthetic A6 model; no external sink is used."""
import unittest

from audit_trace_double import (
    AuditTraceDouble,
    Authority,
    Operation,
    Outcome,
    Rejected,
)


SCOPE = ("tenant-a", "company-a", "branch-a", "store-a")
OTHER_SCOPE = ("tenant-b", "company-b", "branch-b", "store-b")
USER = Authority("user-a", SCOPE, 1, 1, False)
SUPPORT = Authority("support-a", SCOPE, 1, 1, True)
FOREIGN_SUPPORT = Authority("support-b", OTHER_SCOPE, 1, 1, True)


class AuditTraceDoubleTests(unittest.TestCase):
    def setUp(self):
        self.model = AuditTraceDouble((USER, SUPPORT, FOREIGN_SUPPORT), 4)
        self.operation = self.model.issue(
            USER, "orders", "orders.approve", "client-note"
        )

    def safe_trace(self):
        return {
            "route": "/orders",
            "handler": "ApproveOrder",
            "logical_contract": "Orders.Approve.v1",
            "duration_ms": 12,
            "retry_state": "first-attempt",
            "error_fingerprint": "none",
        }

    def test_server_issues_operation_and_correlation_identity(self):
        self.assertEqual(self.operation.operation_id, "op-000001")
        self.assertEqual(self.operation.correlation_id, "corr-000001")
        second = self.model.issue(USER, "orders", "orders.read", "corr-000001")
        self.assertEqual(second.correlation_id, "corr-000002")

    def test_stale_or_foreign_authority_cannot_issue(self):
        for authority in (
            Authority("user-a", SCOPE, 1, 2, False),
            Authority("unknown", SCOPE, 1, 1, False),
        ):
            with self.subTest(authority=authority):
                with self.assertRaises(Rejected):
                    self.model.issue(authority, "orders", "orders.read")

    def test_bool_generations_and_support_grant_are_rejected(self):
        for authority in (
            Authority("user-x", SCOPE, True, 1, False),
            Authority("user-x", SCOPE, 1, True, False),
            Authority("user-x", SCOPE, 1, 1, 1),
        ):
            with self.subTest(authority=authority):
                with self.assertRaises(Rejected):
                    AuditTraceDouble((authority,))

    def test_audit_and_trace_are_separate_immutable_records(self):
        event = self.model.record_outcome(
            self.operation,
            Outcome.SUCCEEDED,
            business_reference="synthetic-order-7",
            trace=self.safe_trace(),
        )
        audits, traces = self.model.snapshot()
        self.assertEqual(audits, (event,))
        self.assertEqual(len(traces), 1)
        self.assertNotEqual(type(audits[0]), type(traces[0]))
        with self.assertRaises(AttributeError):
            audits[0].action = "poisoned"

    def test_trace_failure_does_not_change_authoritative_outcome(self):
        event = self.model.record_outcome(
            self.operation,
            Outcome.SUCCEEDED,
            trace=self.safe_trace(),
            trace_sink_available=False,
        )
        audits, traces = self.model.snapshot()
        self.assertIs(event.outcome, Outcome.SUCCEEDED)
        self.assertEqual(len(audits), 1)
        self.assertEqual(traces, ())

    def test_secret_payload_and_unknown_trace_fields_are_rejected(self):
        for trace in (
            {"token": "SYNTHETIC_CANARY"},
            {"connection_string": "SYNTHETIC_CANARY"},
            {"raw_payload": "SYNTHETIC_CANARY"},
            {"route": "/ok", "unknown": "x"},
        ):
            with self.subTest(trace=trace):
                with self.assertRaises(Rejected):
                    self.model.record_outcome(
                        self.operation, Outcome.REJECTED, trace=trace
                    )

    def test_control_characters_cannot_forge_structured_records(self):
        for value in ("orders\nforged", "orders\rforged", "orders\tforged"):
            with self.subTest(value=value):
                with self.assertRaises(Rejected):
                    self.model.issue(USER, value, "orders.read")

    def test_outcome_type_and_sink_state_are_strict(self):
        with self.assertRaises(Rejected):
            self.model.record_outcome(self.operation, "Succeeded")
        with self.assertRaises(Rejected):
            self.model.record_outcome(
                self.operation,
                Outcome.SUCCEEDED,
                trace_sink_available=1,
            )

    def test_unknown_completion_cannot_be_replayed(self):
        self.model.record_outcome(self.operation, Outcome.UNKNOWN)
        with self.assertRaises(Rejected):
            self.model.authorize_retry(self.operation)
        with self.assertRaises(Rejected):
            self.model.record_outcome(self.operation, Outcome.SUCCEEDED)

    def test_unknown_completion_reconciles_once_to_terminal_outcome(self):
        self.model.record_outcome(self.operation, Outcome.UNKNOWN)
        event = self.model.reconcile_unknown(
            self.operation, Outcome.SUCCEEDED, "synthetic-order-7"
        )
        self.assertIs(event.outcome, Outcome.SUCCEEDED)
        with self.assertRaises(Rejected):
            self.model.reconcile_unknown(self.operation, Outcome.REJECTED)

    def test_nonunknown_outcome_cannot_enter_reconciliation_path(self):
        self.model.record_outcome(self.operation, Outcome.REJECTED)
        with self.assertRaises(Rejected):
            self.model.reconcile_unknown(self.operation, Outcome.SUCCEEDED)

    def test_correlation_alone_never_grants_support_access(self):
        self.model.record_outcome(self.operation, Outcome.REJECTED)
        with self.assertRaises(Rejected):
            self.model.support_query(
                USER, self.operation.correlation_id, SCOPE, 1, 1
            )

    def test_support_access_is_scope_limited_and_bounded(self):
        self.model.record_outcome(
            self.operation, Outcome.REJECTED, trace=self.safe_trace()
        )
        audits, traces = self.model.support_query(
            SUPPORT, self.operation.correlation_id, SCOPE, 1, 1
        )
        self.assertEqual((len(audits), len(traces)), (1, 1))
        with self.assertRaises(Rejected):
            self.model.support_query(
                FOREIGN_SUPPORT, self.operation.correlation_id, SCOPE, 1, 1
            )
        with self.assertRaises(Rejected):
            self.model.support_query(
                SUPPORT, self.operation.correlation_id, SCOPE, 1, 5
            )

    def test_support_permission_revoke_fences_old_context(self):
        replacement = Authority("support-a", SCOPE, 1, 2, False)
        self.model.replace_authority(SUPPORT, replacement)
        with self.assertRaises(Rejected):
            self.model.support_query(
                SUPPORT, self.operation.correlation_id, SCOPE, 1, 1
            )

    def test_authority_generation_cannot_regress_or_transfer_principal(self):
        with self.assertRaises(Rejected):
            self.model.replace_authority(
                SUPPORT, Authority("support-a", SCOPE, 0, 1, True)
            )
        with self.assertRaises(Rejected):
            self.model.replace_authority(
                SUPPORT, Authority("other", SCOPE, 1, 2, True)
            )

    def test_forged_operation_is_rejected(self):
        forged = Operation(
            self.operation.operation_id,
            self.operation.correlation_id,
            self.operation.principal,
            self.operation.scope,
            True,
            self.operation.permission_generation,
            self.operation.screen,
            self.operation.action,
        )
        with self.assertRaises(Rejected):
            self.model.record_outcome(forged, Outcome.REJECTED)


if __name__ == "__main__":
    unittest.main()
