"""Behavior tests for the synthetic A2 model; no DB/network/runtime calls."""
import unittest

from tenant_context_double import Rejected, Scope, TenantContextDouble, Ticket


MAPPINGS = (
    ("tenant-a", "company-a", "source-a", 4),
    ("tenant-b", "company-b", "source-b", 9),
    ("tenant-a", "company-c", "source-c", 2),
)
MEMBERSHIPS = (
    ("user-a", "tenant-a", "company-a"),
    ("user-c", "tenant-a", "company-a"),
    ("user-a", "tenant-a", "company-c"),
    ("user-b", "tenant-b", "company-b"),
)


class TenantContextAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.context = TenantContextDouble(MAPPINGS, MEMBERSHIPS)

    def test_server_resolves_data_source_without_client_profile_input(self):
        scope, generation = self.context.resolve("user-a", "tenant-a", "company-a")
        self.assertEqual(scope, Scope("tenant-a", "company-a", "source-a"))
        self.assertEqual(generation, 4)

    def test_unknown_or_foreign_membership_is_denied(self):
        for principal, tenant, company in (
            ("user-a", "tenant-b", "company-b"),
            ("user-b", "tenant-a", "company-a"),
            ("unknown", "tenant-a", "company-a"),
        ):
            with self.subTest(principal=principal, tenant=tenant, company=company):
                with self.assertRaises(Rejected):
                    self.context.resolve(principal, tenant, company)

    def test_all_scope_bearing_resource_kinds_are_bound(self):
        for kind in sorted(TenantContextDouble.KINDS):
            with self.subTest(kind=kind):
                ticket = self.context.issue(kind, "user-a", "tenant-a", "company-a")
                self.assertEqual(
                    self.context.authorize(ticket, "user-a", "tenant-a", "company-a", kind),
                    Scope("tenant-a", "company-a", "source-a"),
                )

    def test_resource_kind_cannot_be_relabelled(self):
        ticket = self.context.issue("cache", "user-a", "tenant-a", "company-a")
        with self.assertRaises(Rejected):
            self.context.authorize(ticket, "user-a", "tenant-a", "company-a", "result")

    def test_unknown_resource_kind_is_denied(self):
        for kind in ("sql", "profile", "", None, True):
            with self.subTest(kind=kind):
                with self.assertRaises(Rejected):
                    self.context.issue(kind, "user-a", "tenant-a", "company-a")

    def test_same_business_identifier_never_changes_scope_identity(self):
        a = self.context.issue("cache", "user-a", "tenant-a", "company-a")
        b = self.context.issue("cache", "user-b", "tenant-b", "company-b")
        synthetic_record_id = 7
        self.assertEqual(synthetic_record_id, 7)
        self.assertNotEqual((a.scope, a.generation), (b.scope, b.generation))
        with self.assertRaises(Rejected):
            self.context.authorize(a, "user-b", "tenant-b", "company-b", "cache")

    def test_same_company_scope_does_not_transfer_between_principals(self):
        ticket = self.context.issue("job", "user-a", "tenant-a", "company-a")
        forged = Ticket(
            "user-c",
            ticket.scope,
            ticket.generation,
            ticket.kind,
            ticket.membership_generation,
        )
        with self.assertRaises(Rejected):
            self.context.authorize(ticket, "user-c", "tenant-a", "company-a", "job")
        with self.assertRaises(Rejected):
            self.context.authorize(forged, "user-a", "tenant-a", "company-a", "job")

    def test_mapping_change_fences_every_old_resource_kind(self):
        tickets = [
            self.context.issue(kind, "user-a", "tenant-a", "company-a")
            for kind in sorted(TenantContextDouble.KINDS)
        ]
        scope, generation = self.context.replace_mapping(
            "tenant-a", "company-a", 4, "source-a-next"
        )
        self.assertEqual((scope.data_source, generation), ("source-a-next", 5))
        for ticket in tickets:
            with self.subTest(kind=ticket.kind):
                with self.assertRaises(Rejected):
                    self.context.authorize(
                        ticket, "user-a", "tenant-a", "company-a", ticket.kind
                    )

    def test_new_resource_uses_new_mapping_and_generation(self):
        self.context.replace_mapping("tenant-a", "company-a", 4, "source-a-next")
        ticket = self.context.issue("connection", "user-a", "tenant-a", "company-a")
        self.assertEqual(ticket.scope.data_source, "source-a-next")
        self.assertEqual(ticket.generation, 5)

    def test_stale_mapping_cas_cannot_overwrite_new_mapping(self):
        self.context.replace_mapping("tenant-a", "company-a", 4, "source-a-next")
        with self.assertRaises(Rejected):
            self.context.replace_mapping("tenant-a", "company-a", 4, "source-old")
        scope, generation = self.context.resolve("user-a", "tenant-a", "company-a")
        self.assertEqual((scope.data_source, generation), ("source-a-next", 5))

    def test_same_mapping_does_not_advance_generation(self):
        with self.assertRaises(Rejected):
            self.context.replace_mapping("tenant-a", "company-a", 4, "source-a")
        self.assertEqual(self.context.resolve("user-a", "tenant-a", "company-a")[1], 4)

    def test_job_is_reauthorized_at_execution_time(self):
        job = self.context.issue("job", "user-a", "tenant-a", "company-a")
        self.context.replace_mapping("tenant-a", "company-a", 4, "source-a-next")
        with self.assertRaises(Rejected):
            self.context.authorize(job, "user-a", "tenant-a", "company-a", "job")

    def test_late_result_from_previous_company_is_denied(self):
        result = self.context.issue("result", "user-a", "tenant-a", "company-a")
        with self.assertRaises(Rejected):
            self.context.authorize(result, "user-a", "tenant-a", "company-c", "result")

    def test_hub_ticket_cannot_be_reused_by_foreign_scope(self):
        hub = self.context.issue("hub", "user-a", "tenant-a", "company-a")
        with self.assertRaises(Rejected):
            self.context.authorize(hub, "user-b", "tenant-b", "company-b", "hub")

    def test_boolean_and_non_integer_generations_are_rejected(self):
        for generation in (True, 4.0, "4", 0, -1):
            with self.subTest(generation=generation):
                with self.assertRaises(Rejected):
                    TenantContextDouble(
                        (("tenant-a", "company-a", "source-a", generation),),
                        (("user-a", "tenant-a", "company-a"),),
                    )
                with self.assertRaises(Rejected):
                    self.context.replace_mapping(
                        "tenant-a", "company-a", generation, "source-next"
                    )

    def test_ambiguous_mapping_and_orphan_membership_are_rejected(self):
        with self.assertRaises(Rejected):
            TenantContextDouble(
                (("tenant-a", "company-a", "source-a", 1),
                 ("tenant-a", "company-a", "source-b", 2)),
                (("user-a", "tenant-a", "company-a"),),
            )
        with self.assertRaises(Rejected):
            TenantContextDouble(
                (("tenant-a", "company-a", "source-a", 1),),
                (("user-a", "tenant-a", "company-missing"),),
            )

    def test_noncanonical_identifiers_are_rejected(self):
        for value in ("", " tenant-a", "tenant-a ", None, True):
            with self.subTest(value=value):
                with self.assertRaises(Rejected):
                    self.context.resolve("user-a", value, "company-a")

    def test_snapshot_is_immutable_and_detached_from_backing_state(self):
        before = self.context.snapshot()
        self.assertIsInstance(before, tuple)
        with self.assertRaises(AttributeError):
            before[0][0].data_source = "poisoned"
        self.context.replace_mapping("tenant-a", "company-a", 4, "source-a-next")
        self.assertNotEqual(before, self.context.snapshot())
        self.assertEqual(before[0][0].data_source, "source-a")

    def test_membership_revoke_fences_all_old_resource_kinds(self):
        tickets = [
            self.context.issue(kind, "user-a", "tenant-a", "company-a")
            for kind in sorted(TenantContextDouble.KINDS)
        ]
        self.assertEqual(
            self.context.replace_memberships(
                "user-a", 1, (("tenant-a", "company-c"),)
            ),
            2,
        )
        for ticket in tickets:
            with self.subTest(kind=ticket.kind):
                with self.assertRaises(Rejected):
                    self.context.authorize(
                        ticket, "user-a", "tenant-a", "company-a", ticket.kind
                    )

    def test_regrant_does_not_revive_pre_revoke_ticket(self):
        old = self.context.issue("result", "user-a", "tenant-a", "company-a")
        self.context.replace_memberships(
            "user-a", 1, (("tenant-a", "company-c"),)
        )
        self.context.replace_memberships(
            "user-a",
            2,
            (("tenant-a", "company-a"), ("tenant-a", "company-c")),
        )
        with self.assertRaises(Rejected):
            self.context.authorize(
                old, "user-a", "tenant-a", "company-a", "result"
            )
        fresh = self.context.issue("result", "user-a", "tenant-a", "company-a")
        self.assertEqual(fresh.membership_generation, 3)

    def test_membership_cas_rejects_stale_bool_duplicate_and_unknown_scope(self):
        with self.assertRaises(Rejected):
            self.context.replace_memberships("user-a", True, ())
        with self.assertRaises(Rejected):
            self.context.replace_memberships(
                "user-a",
                1,
                (("tenant-a", "company-a"), ("tenant-a", "company-a")),
            )
        with self.assertRaises(Rejected):
            self.context.replace_memberships(
                "user-a", 1, (("tenant-a", "company-missing"),)
            )
        self.context.replace_memberships("user-a", 1, ())
        with self.assertRaises(Rejected):
            self.context.replace_memberships("user-a", 1, ())

    def test_duplicate_initial_membership_is_rejected(self):
        with self.assertRaises(Rejected):
            TenantContextDouble(
                (("tenant-a", "company-a", "source-a", 1),),
                (
                    ("user-a", "tenant-a", "company-a"),
                    ("user-a", "tenant-a", "company-a"),
                ),
            )


if __name__ == "__main__":
    unittest.main()
