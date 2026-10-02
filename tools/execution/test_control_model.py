"""Independent synthetic counterexamples for the control reference model."""
import threading
import unittest
from dataclasses import replace

from control_model import ControlModel, Permit, Rejected, Resources


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.m = ControlModel({"main": "base-0", **{f"b{i}": f"h{i}" for i in range(1, 12)}})

    def head(self):
        return self.m.snapshot()["head"]

    def queue(self, i, resources=Resources(writer=True), paths=None):
        return self.m.enqueue(self.head(), f"req-{i}", f"L{i:02d}", f"run-{i}",
                              "main" if i == 1 else f"b{i}",
                              "base-0" if i == 1 else f"h{i}",
                              paths or (f"owned/{i}",), resources)

    def claim(self, i, resources=Resources(writer=True), paths=None):
        self.queue(i, resources, paths)
        return self.m.admit_next(self.head(), 0)

    def rejected_unchanged(self, fn):
        before = self.m.snapshot()
        with self.assertRaises(Rejected):
            fn()
        self.assertEqual(before, self.m.snapshot())

    def test_control_cas_contention_has_one_winner(self):
        # Both contenders capture the same full head before either enters lock.
        head = self.head()
        barrier = threading.Barrier(3)
        outcomes = []
        def attempt(i):
            barrier.wait()
            try:
                self.m.enqueue(head, f"req-{i}", f"L{i:02d}", f"run-{i}",
                               f"b{i}", f"h{i}", (f"owned/{i}",), Resources(writer=True))
                outcomes.append("won")
            except Rejected:
                outcomes.append("rejected")
        threads = [threading.Thread(target=attempt, args=(i,)) for i in (2, 3)]
        for t in threads:
            t.start()
        barrier.wait()
        for t in threads:
            t.join(timeout=3)
            self.assertFalse(t.is_alive())
        self.assertCountEqual(outcomes, ["won", "rejected"])
        self.assertEqual(len(self.m.snapshot()["queue"]), 1)

    def test_admission_and_resource_allocation_atomic_under_contention(self):
        self.queue(2, Resources(writer=True, heavy=True))
        self.queue(3, Resources(writer=True, heavy=True))
        head = self.head()
        barrier = threading.Barrier(3)
        outcomes = []
        def attempt():
            barrier.wait()
            try:
                outcomes.append(self.m.admit_next(head, 0))
            except Rejected:
                outcomes.append(None)
        threads = [threading.Thread(target=attempt) for _ in range(2)]
        for t in threads:
            t.start()
        barrier.wait()
        for t in threads:
            t.join(timeout=3)
            self.assertFalse(t.is_alive())
        self.assertEqual(sum(x is not None for x in outcomes), 1)
        self.assertEqual(len(self.m.snapshot()["leases"]), 1)
        self.rejected_unchanged(lambda: self.m.admit_next(self.head(), 0))

    def test_snapshot_cannot_mutate_internal_state(self):
        p = self.claim(2)
        view = self.m.snapshot()
        view["branches"]["b2"] = "forged"
        view["leases"].clear()
        view["queue"].append("forged")
        self.assertEqual(self.m.snapshot()["leases"]["L02"].permit, p)
        self.assertEqual(self.m.snapshot()["branches"]["b2"], "h2")

    def test_invalid_clock_or_untyped_resource_cannot_bypass_caps(self):
        for resources in (Resources(writer=-1), Resources(heavy=2), Resources(ci_paths=[]),
                          Resources(ci_paths=(1,))):
            self.rejected_unchanged(lambda resources=resources: self.queue(2, resources))
        p = self.claim(2)
        for now in (float("nan"), float("inf"), -1, True):
            self.rejected_unchanged(lambda now=now: self.m.heartbeat(self.head(), p, now))
            self.rejected_unchanged(lambda now=now: self.m.mutate_branch(
                self.head(), p, now, "h2", "new", ("owned/2/a",)))

    def test_constructor_rejects_nonfinite_or_boolean_clock_intervals(self):
        for field in ("ttl", "heartbeat_gap"):
            for value in (float("nan"), float("inf"), True, False, 0, -1, "600"):
                with self.assertRaises(ValueError):
                    ControlModel({"main": "base"}, **{field: value})

    def test_head_types_and_expiry_overflow_rejected_without_mutation(self):
        p = self.claim(2)
        for bad in (123, {"oid": "fake"}, True):
            self.rejected_unchanged(lambda bad=bad: self.m.mutate_branch(
                self.head(), p, 1, "h2", bad, ("owned/2/a",)))
            self.rejected_unchanged(lambda bad=bad: self.m.simulate_external_head(
                self.head(), "b2", bad))
        self.m = ControlModel({"main": "base-0", "b2": "h2"}, ttl=1e308)
        self.queue(2)
        self.rejected_unchanged(lambda: self.m.admit_next(self.head(), 1e308))

    def test_boolean_float_revision_or_epoch_cannot_impersonate_integer(self):
        self.queue(2)
        for fake in (True, 1.0):
            self.rejected_unchanged(lambda fake=fake: self.m.admit_next(fake, 0))
        p = self.m.admit_next(self.head(), 0)
        for fake in (True, 1.0):
            self.rejected_unchanged(lambda fake=fake: self.m.heartbeat(
                self.head(), replace(p, epoch=fake), 1))

    def test_owner_run_epoch_not_bypassed_by_fresh_head(self):
        p = self.claim(2)
        for bad in (replace(p, run="old-run"), replace(p, epoch=0), replace(p, lane="L03")):
            self.rejected_unchanged(lambda bad=bad: self.m.mutate_branch(
                self.head(), bad, 1, "h2", "new", ("owned/2/a",)))

    def test_expiry_does_not_grant_takeover(self):
        p = self.claim(2)
        self.rejected_unchanged(lambda: self.m.heartbeat(self.head(), p, 2700))
        self.rejected_unchanged(lambda: self.m.fence_expired(self.head(), "L02", 2700))
        self.rejected_unchanged(lambda: self.m.fence_expired(
            self.head(), "L02", 2700, quiescent_verified="false"))
        self.rejected_unchanged(lambda: self.queue(2))
        self.assertIn("L02", self.m.snapshot()["leases"])

    def test_fenced_stale_writer_rejected_after_rereading_new_head(self):
        old = self.claim(2)
        self.m.fence_expired(self.head(), "L02", 2700, quiescent_verified=True)
        self.queue(2)
        new = self.m.admit_next(self.head(), 2701)
        self.assertGreater(new.epoch, old.epoch)
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), old, 2702, "h2", "bad", ("owned/2/a",)))
        self.m.mutate_branch(self.head(), new, 2702, "h2", "good", ("owned/2/a",))

    def test_overdue_heartbeat_rejected_while_ttl_live(self):
        p = self.claim(2)
        self.rejected_unchanged(lambda: self.m.heartbeat(self.head(), p, 601))
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 601, "h2", "new", ("owned/2/a",)))

    def test_heartbeat_renews_ttl_and_rejects_backwards_clock(self):
        p = self.claim(2)
        self.m.heartbeat(self.head(), p, 600)
        lease = self.m.snapshot()["leases"]["L02"]
        self.assertEqual((lease.heartbeat_at, lease.expires_at), (600, 3300))
        self.rejected_unchanged(lambda: self.m.heartbeat(self.head(), p, 599))

    def test_path_conflict_does_not_treat_sibling_prefix_as_conflict(self):
        self.claim(2, paths=("src/a",))
        self.queue(3, paths=("src/a/child",))
        self.queue(4, paths=("src/ab",))
        p = self.m.admit_next(self.head(), 0)
        self.assertEqual(p.lane, "L04")
        self.assertEqual([r.lane for r in self.m.snapshot()["queue"]], ["L03"])

    def test_one_lane_and_one_branch_custody(self):
        self.claim(2)
        self.rejected_unchanged(lambda: self.queue(2))
        self.m.enqueue(self.head(), "duplicate-branch", "L03", "run-3", "b2", "h2",
                       ("owned/3",), Resources(writer=True))
        self.rejected_unchanged(lambda: self.m.admit_next(self.head(), 0))

    def test_lane_namespace_and_main_role_are_closed(self):
        for lane in ("L00", "L11", "admin", ""):
            self.rejected_unchanged(lambda lane=lane: self.m.enqueue(
                self.head(), "req-x", lane, "run-x", "b2", "h2",
                ("owned/x",), Resources(writer=True)))
        self.rejected_unchanged(lambda: self.m.enqueue(
            self.head(), "req-x", "L02", "run-x", "main", "base-0",
            ("owned/x",), Resources(writer=True)))

    def test_path_claims_reject_duplicates_and_nested_redundancy(self):
        for paths in (("src/a", "src/a"), ("src/a", "src/a/child")):
            self.rejected_unchanged(lambda paths=paths: self.queue(2, paths=paths))

    def test_exact_queued_cancellation_frees_lane(self):
        self.queue(2)
        self.m.cancel_request(self.head(), "req-2", "L02", "run-2")
        self.queue(2)
        self.assertEqual(len(self.m.snapshot()["queue"]), 1)

    def test_foreign_or_stale_run_cannot_cancel_queue(self):
        self.queue(2)
        for identity in (("req-2", "L02", "other-run"),
                         ("other-request", "L02", "run-2"),
                         ("req-2", "L03", "run-2")):
            self.rejected_unchanged(lambda identity=identity: self.m.cancel_request(
                self.head(), *identity))

    def test_queue_cancellation_cannot_revoke_active_lease(self):
        permit = self.claim(2)
        self.rejected_unchanged(lambda: self.m.cancel_request(
            self.head(), "req-2", "L02", "run-2"))
        self.assertEqual(self.m.snapshot()["leases"]["L02"].permit, permit)

    def test_writer_cap_and_oldest_compatible_request(self):
        leases = [self.claim(i) for i in range(2, 6)]
        self.queue(6)
        self.queue(7)
        self.rejected_unchanged(lambda: self.m.admit_next(self.head(), 0))
        self.m.release_quantum(self.head(), leases[0], 1)
        self.assertEqual(self.m.admit_next(self.head(), 1).lane, "L06")
        self.assertEqual(sum(l.resources.writer for l in self.m.snapshot()["leases"].values()), 4)

    def test_released_run_cannot_reacquire_before_waiter(self):
        p = self.claim(2)
        self.m.release_quantum(self.head(), p, 1)
        self.queue(3)
        self.rejected_unchanged(lambda: self.m.change_resources(
            self.head(), p, 2, Resources(writer=True)))
        self.assertEqual(self.m.admit_next(self.head(), 2).lane, "L03")

    def test_ci_per_lane_cap_and_disjoint_units(self):
        self.rejected_unchanged(lambda: self.queue(2, Resources(
            writer=True, ci_paths=("owned/2/a", "owned/2/b", "owned/2/c"))))
        self.rejected_unchanged(lambda: self.queue(2, Resources(
            writer=True, ci_paths=("owned/2/a", "owned/2/a/child"))))
        self.rejected_unchanged(lambda: self.queue(2, Resources(
            writer=True, ci_paths=("unowned/2",))))
        self.claim(2, Resources(writer=True, ci_paths=("owned/2/a", "owned/2/b")))

    def test_global_ci_cap_rolls_back_whole_bundle(self):
        self.claim(2, Resources(ci_paths=("owned/2/a", "owned/2/b")))
        self.claim(3, Resources(ci_paths=("owned/3/a", "owned/3/b")))
        p = self.claim(4, Resources())
        self.rejected_unchanged(lambda: self.m.change_resources(
            self.head(), p, 1, Resources(writer=True, heavy=True, ci_paths=("owned/4/a",))))
        self.assertEqual(self.m.snapshot()["leases"]["L04"].resources, Resources())

    def test_heavy_cap_rolls_back_writer_allocation(self):
        self.claim(2, Resources(heavy=True))
        p = self.claim(3, Resources())
        self.rejected_unchanged(lambda: self.m.change_resources(
            self.head(), p, 1, Resources(writer=True, heavy=True)))

    def test_retire_requires_ci_drain_and_lease_custody_survives_release(self):
        p = self.claim(2, Resources(writer=True, heavy=True, ci_paths=("owned/2/a",)))
        self.m.release_quantum(self.head(), p, 1)
        self.assertEqual(self.m.snapshot()["leases"]["L02"].resources,
                         Resources(ci_paths=("owned/2/a",)))
        self.rejected_unchanged(lambda: self.m.retire(self.head(), p, 2))
        self.m.change_resources(self.head(), p, 2, Resources())
        self.m.retire(self.head(), p, 3)
        self.assertNotIn("L02", self.m.snapshot()["leases"])

    def test_mutation_requires_owned_path_writer_and_exact_work_head(self):
        p = self.claim(2, Resources())
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 1, "h2", "new", ("owned/2/a",)))
        self.m.change_resources(self.head(), p, 1, Resources(writer=True))
        for path in ("owned/3/a", "owned/2/../3", "/owned/2/a"):
            self.rejected_unchanged(lambda path=path: self.m.mutate_branch(
                self.head(), p, 2, "h2", "new", (path,)))
        self.m.mutate_branch(self.head(), p, 2, "h2", "new", ("owned/2/a",))
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 3, "h2", "newer", ("owned/2/a",)))

    def test_branch_race_rejected_even_when_control_head_reread(self):
        p = self.claim(2)
        self.m.simulate_external_head(self.head(), "b2", "raced")
        self.rejected_unchanged(lambda: self.m.heartbeat(self.head(), p, 1))
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 1, "h2", "new", ("owned/2/a",)))
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 1, "raced", "new", ("owned/2/a",)))

    def integration_args(self):
        return dict(source_branch="b2", source_head="h2", base_head="base-0",
                    reviewed_head="h2", checked_source="h2", checked_base="base-0",
                    checks_passed=True, new_main_head="merge-1")

    def test_direct_main_write_denied_and_integration_requires_l01(self):
        p = self.claim(1, Resources())
        self.rejected_unchanged(lambda: self.m.mutate_branch(
            self.head(), p, 1, "base-0", "merge-1", ("owned/1/a",)))
        other = self.claim(2)
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), other, 1, **self.integration_args()))

    def test_integration_pins_review_checks_source_and_base(self):
        p = self.claim(1, Resources(writer=True))
        for field, value in (("reviewed_head", "old"), ("checked_source", "old"),
                             ("checked_base", "old"), ("checks_passed", False),
                             ("checks_passed", "false"), ("new_main_head", {"oid": "fake"})):
            args = self.integration_args()
            args[field] = value
            self.rejected_unchanged(lambda args=args: self.m.integrate(
                self.head(), p, 1, **args))
        self.m.integrate(self.head(), p, 1, **self.integration_args())
        self.assertEqual(self.m.snapshot()["branches"]["main"], "merge-1")

    def test_base_race_rejected_inside_integration_transaction(self):
        p = self.claim(1, Resources(writer=True))
        self.m.simulate_external_head(self.head(), "main", "base-raced")
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), p, 1, **self.integration_args()))

    def test_source_race_rejected_inside_integration_transaction(self):
        p = self.claim(1, Resources(writer=True))
        self.m.simulate_external_head(self.head(), "b2", "source-raced")
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), p, 1, **self.integration_args()))

    def test_integration_rejects_source_under_active_custody(self):
        source = self.claim(2, Resources())
        integrator = self.claim(1, Resources(writer=True))
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), integrator, 1, **self.integration_args()))
        self.m.retire(self.head(), source, 1)
        self.m.integrate(self.head(), integrator, 1, **self.integration_args())

    def test_integration_rejects_source_with_queued_writer(self):
        integrator = self.claim(1, Resources(writer=True))
        self.queue(2)
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), integrator, 1, **self.integration_args()))
        self.m.cancel_request(self.head(), "req-2", "L02", "run-2")
        self.m.integrate(self.head(), integrator, 1, **self.integration_args())

    def test_integration_rejects_source_equal_to_base(self):
        p = self.claim(1, Resources(writer=True))
        args = self.integration_args()
        args.update(source_branch="b2", source_head="base-0",
                    reviewed_head="base-0", checked_source="base-0")
        self.m.simulate_external_head(self.head(), "b2", "base-0")
        self.rejected_unchanged(lambda: self.m.integrate(self.head(), p, 1, **args))

    def test_integrator_cannot_mutate_without_writer_token(self):
        p = self.claim(1, Resources())
        self.rejected_unchanged(lambda: self.m.integrate(
            self.head(), p, 1, **self.integration_args()))
        self.m.change_resources(self.head(), p, 1, Resources(writer=True))
        self.m.integrate(self.head(), p, 1, **self.integration_args())


if __name__ == "__main__":
    unittest.main()
