"""Behavior tests of the synthetic model; no .NET/HTTP/Tool/DB execution."""
import math
import threading
import unittest
from session_double import Rejected, SessionDouble, Ticket, Traffic

SCOPE = ("synthetic-user", "synthetic-company", "synthetic-variant")
SCOPE_2 = ("synthetic-user", "company-2", "synthetic-variant")


class SessionAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.session = SessionDouble(SCOPE, allowed_scopes=(SCOPE, SCOPE_2))
        self.ticket = self.session.ticket(0)

    def test_default_deadline_exact_boundary(self):
        self.assertEqual(self.session.reveal_result(86399, self.ticket), "SYNTHETIC_RESULT_ONLY")
        with self.assertRaises(Rejected):
            self.session.reveal_result(86400, self.ticket)

    def test_all_background_kinds_never_extend_idle_even_if_accepted_flag_is_true(self):
        for kind in (Traffic.POLL, Traffic.SWR, Traffic.SIGNALR, Traffic.PASSIVE_TAB):
            with self.subTest(kind=kind):
                s = SessionDouble(SCOPE, idle_minutes=1, warning_seconds=10)
                t = s.ticket(0)
                s.traffic(59, t, kind, True)
                with self.assertRaises(Rejected):
                    s.reveal_result(60, t)

    def test_accepted_meaningful_activity_extends_idle(self):
        self.session.traffic(86399, self.ticket, Traffic.USER_ACCEPTED, True)
        self.session.reveal_result(172798, self.ticket)
        with self.assertRaises(Rejected):
            self.session.reveal_result(172799, self.ticket)

    def test_rejected_user_activity_does_not_extend(self):
        self.session.traffic(86399, self.ticket, Traffic.USER_ACCEPTED, False)
        with self.assertRaises(Rejected):
            self.session.reveal_result(86400, self.ticket)

    def test_continue_before_expiry_is_meaningful(self):
        self.session.continue_session(86399, self.ticket, True, True)
        self.session.reveal_result(86400, self.ticket)

    def test_continue_at_or_after_expiry_cannot_resurrect(self):
        for now in (86400, 86401):
            with self.subTest(now=now):
                s = SessionDouble(SCOPE)
                t = s.ticket(0)
                with self.assertRaises(Rejected):
                    s.continue_session(now, t, True, True)
                with self.assertRaises(Rejected):
                    s.ticket(now)

    def test_continue_rejects_untrusted_boolean_and_csrf_inputs(self):
        for csrf, accepted in ((False, True), (True, False), ("true", True), (True, 1)):
            with self.subTest(csrf=csrf, accepted=accepted):
                with self.assertRaises(Rejected):
                    self.session.continue_session(86399, self.ticket, csrf, accepted)
        with self.assertRaises(Rejected):
            self.session.reveal_result(86400, self.ticket)

    def test_logout_fences_other_tabs_and_late_results(self):
        self.session.logout(10, self.ticket, True)
        with self.assertRaises(Rejected):
            self.session.reveal_result(11, self.ticket)
        with self.assertRaises(Rejected):
            self.session.traffic(11, self.ticket, Traffic.USER_ACCEPTED, True)

    def test_logout_csrf_denial_keeps_session_but_does_not_refresh(self):
        with self.assertRaises(Rejected):
            self.session.logout(86399, self.ticket, False)
        with self.assertRaises(Rejected):
            self.session.reveal_result(86400, self.ticket)

    def test_company_switch_fences_old_ticket_without_extending_idle(self):
        new = self.session.switch_scope(86399, self.ticket, SCOPE_2, True, True)
        with self.assertRaises(Rejected):
            self.session.reveal_result(86399, self.ticket)
        self.session.reveal_result(86399, new)
        with self.assertRaises(Rejected):
            self.session.reveal_result(86400, new)

    def test_principal_switch_is_not_reauthentication(self):
        with self.assertRaises(Rejected):
            self.session.switch_scope(10, self.ticket, ("other-user", SCOPE[1], SCOPE[2]), True, True)
        self.session.reveal_result(10, self.ticket)

    def test_same_principal_cannot_select_unlisted_company(self):
        with self.assertRaises(Rejected):
            self.session.switch_scope(
                10,
                self.ticket,
                (SCOPE[0], "attacker-company", SCOPE[2]),
                True,
                True,
            )
        self.session.reveal_result(10, self.ticket)

    def test_authorized_scope_registry_is_immutable_and_canonical(self):
        mutable = [SCOPE, SCOPE_2]
        with self.assertRaises(Rejected):
            SessionDouble(SCOPE, allowed_scopes=mutable)
        with self.assertRaises(Rejected):
            SessionDouble(SCOPE, allowed_scopes=(SCOPE, SCOPE))
        with self.assertRaises(Rejected):
            SessionDouble(
                SCOPE,
                allowed_scopes=(SCOPE, (SCOPE[0], " company-2", SCOPE[2])),
            )
        with self.assertRaises(Rejected):
            SessionDouble(SCOPE, allowed_scopes=(SCOPE, ("other-user", "c", "v")))

    def test_warning_interval_cannot_cover_entire_idle_window(self):
        for warning in (60, 61):
            with self.subTest(warning=warning):
                with self.assertRaises(Rejected):
                    SessionDouble(SCOPE, idle_minutes=1, warning_seconds=warning)

    def test_expired_policy_extension_does_not_revive(self):
        self.session.replace_policy(86400, 2880, 2)
        with self.assertRaises(Rejected):
            self.session.ticket(86400)

    def test_shorter_policy_expires_immediately_if_already_idle(self):
        self.session.replace_policy(61, 1, 2)
        with self.assertRaises(Rejected):
            self.session.ticket(61)

    def test_policy_stale_revision_cannot_overwrite_current(self):
        self.session.replace_policy(10, 1, 2)
        with self.assertRaises(Rejected):
            self.session.replace_policy(10, 1440, 2)
        with self.assertRaises(Rejected):
            self.session.ticket(60)

    def test_warning_is_observation_and_never_activity(self):
        self.assertFalse(self.session.warning(86099))
        self.assertTrue(self.session.warning(86100))
        self.assertFalse(self.session.warning(86400))
        with self.assertRaises(Rejected):
            self.session.ticket(86400)

    def test_malformed_clock_or_policy_values_rejected(self):
        for value in (True, 1.0, math.nan, math.inf, -1, "10"):
            with self.subTest(value=value):
                with self.assertRaises(Rejected):
                    SessionDouble(SCOPE, now=value)
                with self.assertRaises(Rejected):
                    self.session.reveal_result(value, self.ticket)
        for value in (True, 0, -1, 1.0):
            with self.assertRaises(Rejected):
                SessionDouble(SCOPE, idle_minutes=value)

    def test_clock_rollback_and_bool_generation_rejected(self):
        self.session.reveal_result(20, self.ticket)
        with self.assertRaises(Rejected):
            self.session.traffic(19, self.ticket, Traffic.USER_ACCEPTED, True)
        with self.assertRaises(Rejected):
            self.session.reveal_result(20, Ticket(SCOPE, True))

    def test_concurrent_continue_and_logout_always_end_revoked(self):
        barrier = threading.Barrier(2)
        errors = []
        def call(operation):
            barrier.wait()
            try:
                operation()
            except Rejected:
                pass  # Continue loses if logout serialized first.
            except Exception as e:
                errors.append(e)
        a = threading.Thread(target=call, args=(lambda: self.session.continue_session(10, self.ticket, True, True),))
        b = threading.Thread(target=call, args=(lambda: self.session.logout(10, self.ticket, True),))
        a.start(); b.start(); a.join(timeout=2); b.join(timeout=2)
        self.assertFalse(a.is_alive() or b.is_alive())
        self.assertEqual(errors, [])
        with self.assertRaises(Rejected):
            self.session.ticket(10)


if __name__ == "__main__":
    unittest.main()
