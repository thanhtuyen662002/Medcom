"""Synthetic reconciliation behavior tests; no DB/transaction execution."""
import threading
import unittest

from outcome_reconciliation_double import (
    OutcomeReconciliationDouble, Proof, Rejected, State,
)


class OutcomeReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.ledger = OutcomeReconciliationDouble("operation-1")

    def claim(self):
        return self.ledger.claim(1, "reconciler-a", 1)

    def resolve(self, proof):
        self.claim()
        return self.ledger.resolve(2, "reconciler-a", 1, proof)

    def test_initial_state_is_durable_unknown(self):
        snap = self.ledger.snapshot()
        self.assertEqual((snap.state, snap.version), (State.OUTCOME_UNKNOWN, 1))

    def test_claim_requires_exact_expected_version(self):
        for version in (2, True, 1.0, "1", 0):
            with self.subTest(version=version):
                with self.assertRaises(Rejected):
                    self.ledger.claim(version, "reconciler-a", 1)

    def test_claim_requires_canonical_owner_and_positive_epoch(self):
        for owner, epoch in (("", 1), (" owner", 1), (None, 1), ("owner", True), ("owner", 0)):
            with self.subTest(owner=owner, epoch=epoch):
                with self.assertRaises(Rejected):
                    self.ledger.claim(1, owner, epoch)

    def test_claim_advances_version_and_records_fence(self):
        snap = self.claim()
        self.assertEqual((snap.state, snap.version, snap.owner, snap.epoch),
                         (State.RECONCILING, 2, "reconciler-a", 1))

    def test_second_claim_cannot_take_over_reconciling_operation(self):
        self.claim()
        with self.assertRaises(Rejected):
            self.ledger.claim(2, "reconciler-b", 2)

    def test_stale_owner_cannot_resolve(self):
        self.claim()
        with self.assertRaises(Rejected):
            self.ledger.resolve(2, "reconciler-b", 1, Proof.COMPLETED)

    def test_stale_epoch_cannot_resolve(self):
        self.claim()
        for epoch in (2, True, 0):
            with self.subTest(epoch=epoch):
                with self.assertRaises(Rejected):
                    self.ledger.resolve(2, "reconciler-a", epoch, Proof.COMPLETED)

    def test_untyped_proof_cannot_resolve(self):
        self.claim()
        for proof in ("COMPLETED", None, True):
            with self.subTest(proof=proof):
                with self.assertRaises(Rejected):
                    self.ledger.resolve(2, "reconciler-a", 1, proof)

    def test_completed_proof_is_not_success_until_visibility_check(self):
        snap = self.resolve(Proof.COMPLETED)
        self.assertEqual(snap.state, State.RECONCILED_SUCCEEDED)
        self.assertNotEqual(snap.state, State.SUCCEEDED)

    def test_no_effect_proof_enables_only_explicit_retry_path(self):
        snap = self.resolve(Proof.NO_EFFECT_SAFE_TO_RETRY)
        self.assertEqual(snap.state, State.RECONCILED_FAILED_SAFE_TO_RETRY)

    def test_ambiguous_proof_requires_manual_intervention(self):
        snap = self.resolve(Proof.AMBIGUOUS)
        self.assertEqual(snap.state, State.MANUAL_INTERVENTION)

    def test_success_disclosure_requires_current_authorization(self):
        snap = self.resolve(Proof.COMPLETED)
        for authorized in (False, "true", 1, None):
            with self.subTest(authorized=authorized):
                with self.assertRaises(Rejected):
                    self.ledger.disclose_success(snap.version, authorized)

    def test_success_disclosure_advances_terminal_state(self):
        snap = self.resolve(Proof.COMPLETED)
        self.assertEqual(
            self.ledger.disclose_success(snap.version, True),
            "SYNTHETIC_SUCCESS_ONLY",
        )
        self.assertEqual(self.ledger.snapshot().state, State.SUCCEEDED)

    def test_unknown_cannot_disclose_success_or_retry(self):
        with self.assertRaises(Rejected):
            self.ledger.disclose_success(1, True)
        with self.assertRaises(Rejected):
            self.ledger.reserve_retry(1, True, "attempt-2")

    def test_retry_requires_current_authorization_and_fresh_attempt(self):
        snap = self.resolve(Proof.NO_EFFECT_SAFE_TO_RETRY)
        with self.assertRaises(Rejected):
            self.ledger.reserve_retry(snap.version, False, "attempt-2")
        with self.assertRaises(Rejected):
            self.ledger.reserve_retry(snap.version, True, "operation-1")

    def test_safe_retry_retains_lineage_and_reserves_once(self):
        snap = self.resolve(Proof.NO_EFFECT_SAFE_TO_RETRY)
        retry = self.ledger.reserve_retry(snap.version, True, "attempt-2")
        self.assertEqual((retry.state, retry.lineage),
                         (State.RESERVED, ("operation-1", "attempt-2")))
        with self.assertRaises(Rejected):
            self.ledger.reserve_retry(retry.version, True, "attempt-3")

    def test_snapshot_is_immutable(self):
        snap = self.ledger.snapshot()
        with self.assertRaises(AttributeError):
            snap.state = State.SUCCEEDED
        self.assertEqual(self.ledger.snapshot().state, State.OUTCOME_UNKNOWN)

    def test_concurrent_claim_allows_exactly_one_owner(self):
        barrier = threading.Barrier(2)
        outcomes = []

        def run(owner, epoch):
            barrier.wait()
            try:
                self.ledger.claim(1, owner, epoch)
                outcomes.append("claimed")
            except Rejected:
                outcomes.append("rejected")

        threads = [
            threading.Thread(target=run, args=("reconciler-a", 1)),
            threading.Thread(target=run, args=("reconciler-b", 2)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=2)
        self.assertEqual(sorted(outcomes), ["claimed", "rejected"])


if __name__ == "__main__":
    unittest.main()
