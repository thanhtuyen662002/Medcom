#!/usr/bin/env python3
import unittest

from capability_double import ArtifactGrant, CapabilityAuthority, RequestContext


SCOPE = ("tenant-a", "company-a", "branch-a", "store-a")
GRANTS = frozenset(
    {
        ("route", "orders.read"),
        ("query", "orders.read"),
        ("mutation", "orders.approve"),
        ("export", "orders.export"),
        ("config", "quicknav.admin"),
    }
)


class CapabilityDoubleTests(unittest.TestCase):
    def authority(self, grants=GRANTS):
        return CapabilityAuthority(principal="user-a", scope=SCOPE, grants=grants)

    def test_direct_route_without_grant_denied(self):
        a = self.authority(frozenset())
        self.assertFalse(a.authorize(a.context(), surface="route", action_id="orders.read").allowed)

    def test_hidden_menu_does_not_remove_server_grant(self):
        a = self.authority()
        self.assertTrue(a.authorize(a.context(), surface="route", action_id="orders.read").allowed)

    def test_route_grant_does_not_imply_query_grant(self):
        a = self.authority(frozenset({("route", "orders.read")}))
        self.assertFalse(a.authorize(a.context(), surface="query", action_id="orders.read").allowed)

    def test_query_uses_authoritative_scope(self):
        a = self.authority()
        d = a.authorize(a.context(), surface="query", action_id="orders.read")
        self.assertEqual(d.effective_scope, SCOPE)

    def test_client_scope_widening_denied(self):
        a = self.authority()
        d = a.authorize(a.context(), surface="query", action_id="orders.read", client_scope={"company": "company-b"})
        self.assertFalse(d.allowed)

    def test_partial_matching_scope_is_allowed_but_server_scope_wins(self):
        a = self.authority()
        d = a.authorize(a.context(), surface="query", action_id="orders.read", client_scope={"branch": "branch-a"})
        self.assertEqual(d.effective_scope, SCOPE)

    def test_denials_have_uniform_public_shape(self):
        a = self.authority(frozenset())
        missing = a.authorize(a.context(), surface="query", action_id="missing")
        widened = a.authorize(a.context(), surface="query", action_id="orders.read", client_scope={"tenant": "other"})
        self.assertEqual(missing, widened)

    def test_mutation_revalidates_business_state(self):
        a = self.authority()
        d = a.authorize(a.context(), surface="mutation", action_id="orders.approve", business_state_ok=False)
        self.assertFalse(d.allowed)

    def test_permission_revoke_fences_existing_context(self):
        a = self.authority(); old = a.context(); a.revoke(grants=frozenset())
        self.assertFalse(a.authorize(old, surface="route", action_id="orders.read").allowed)

    def test_lost_invalidation_hint_does_not_preserve_authority(self):
        a = self.authority(); old = a.context()
        # Change authority without removing the query grant. Even if a client
        # misses the notification, the old permission generation must fail.
        a.revoke(grants=GRANTS - {("config", "quicknav.admin")})
        self.assertFalse(a.authorize(old, surface="query", action_id="orders.read").allowed)
        self.assertTrue(a.authorize(a.context(), surface="query", action_id="orders.read").allowed)

    def test_current_export_artifact_can_be_downloaded(self):
        a = self.authority(); ctx = a.context(); artifact = a.register_artifact(ctx, artifact_id="artifact-1", action_id="orders.export")
        self.assertIsNotNone(artifact)
        self.assertTrue(a.authorize_download(ctx, artifact).allowed)

    def test_role_revoke_blocks_old_export_artifact(self):
        a = self.authority(); old = a.context(); artifact = a.register_artifact(old, artifact_id="artifact-1", action_id="orders.export"); a.revoke(grants=frozenset())
        self.assertFalse(a.authorize_download(old, artifact).allowed)

    def test_other_principal_cannot_reuse_artifact(self):
        a = self.authority(); ctx = a.context(); artifact = a.register_artifact(ctx, artifact_id="artifact-1", action_id="orders.export")
        impostor = type(ctx)("user-b", ctx.session_generation, ctx.permission_generation, ctx.scope_generation)
        self.assertFalse(a.authorize_download(impostor, artifact).allowed)

    def test_scope_switch_fences_old_result(self):
        a = self.authority(); old = a.context(); a.switch_scope(("tenant-a", "company-b", "branch-b", "store-b"))
        self.assertFalse(a.authorize(old, surface="query", action_id="orders.read").allowed)

    def test_session_rotation_fences_old_tab(self):
        a = self.authority(); old = a.context(); a.rotate_session()
        self.assertFalse(a.authorize(old, surface="route", action_id="orders.read").allowed)

    def test_inactive_session_denied(self):
        a = self.authority()
        self.assertFalse(a.authorize(a.context(active=False), surface="route", action_id="orders.read").allowed)

    def test_nonadmin_config_mutation_denied(self):
        a = self.authority(GRANTS - {("config", "quicknav.admin")})
        self.assertFalse(a.authorize(a.context(), surface="config", action_id="quicknav.admin").allowed)

    def test_admin_config_grant_is_explicit(self):
        a = self.authority()
        self.assertTrue(a.authorize(a.context(), surface="config", action_id="quicknav.admin").allowed)

    def test_bool_generations_and_nonboolean_active_are_denied(self):
        a = self.authority()
        current = a.context()
        for context in (
            RequestContext(current.principal, True, 1, 1, True),
            RequestContext(current.principal, 1, True, 1, True),
            RequestContext(current.principal, 1, 1, True, True),
            RequestContext(current.principal, 1, 1, 1, 1),
        ):
            with self.subTest(context=context):
                self.assertFalse(
                    a.authorize(context, surface="route", action_id="orders.read").allowed
                )

    def test_nonboolean_business_state_is_denied(self):
        a = self.authority()
        for state in (1, "true", None):
            with self.subTest(state=state):
                self.assertFalse(
                    a.authorize(
                        a.context(),
                        surface="mutation",
                        action_id="orders.approve",
                        business_state_ok=state,
                    ).allowed
                )

    def test_unknown_empty_or_malformed_client_scope_is_denied(self):
        a = self.authority()
        for scope in ({}, {"unknown": None}, {"company": " company-a"}, [("company", "company-a")]):
            with self.subTest(scope=scope):
                self.assertFalse(
                    a.authorize(
                        a.context(),
                        surface="query",
                        action_id="orders.read",
                        client_scope=scope,
                    ).allowed
                )

    def test_grant_storage_rejects_mutable_or_malformed_sets(self):
        with self.assertRaises(ValueError):
            CapabilityAuthority(principal="user-a", scope=SCOPE, grants=set(GRANTS))
        with self.assertRaises(ValueError):
            self.authority(frozenset({("unknown", "orders.read")}))
        a = self.authority()
        with self.assertRaises(ValueError):
            a.revoke(grants=set())

    def test_artifact_identifier_is_opaque_and_forged_bool_generation_denied(self):
        a = self.authority()
        ctx = a.context()
        for artifact_id in ("../report.csv", "/tmp/report", "", True):
            with self.subTest(artifact_id=artifact_id):
                self.assertIsNone(
                    a.register_artifact(
                        ctx, artifact_id=artifact_id, action_id="orders.export"
                    )
                )
        forged = ArtifactGrant(
            "artifact-1",
            ctx.principal,
            "orders.export",
            SCOPE,
            True,
            ctx.permission_generation,
            ctx.scope_generation,
        )
        self.assertFalse(a.authorize_download(ctx, forged).allowed)

    def test_noop_revoke_and_scope_switch_do_not_rotate_generations(self):
        a = self.authority()
        with self.assertRaises(ValueError):
            a.revoke(grants=GRANTS)
        with self.assertRaises(ValueError):
            a.switch_scope(SCOPE)
        self.assertEqual(a.context(), RequestContext("user-a", 1, 1, 1, True))


if __name__ == "__main__":
    unittest.main()
