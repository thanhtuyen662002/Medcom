#!/usr/bin/env python3
import hashlib
import unittest

from provenance_ledger_double import CHAIN, Evidence, Ledger, State


FINGERPRINT = "AA8910F3BA244FC405CCAD2D322D142D40F938BE3DA94277CCD8D0814082DD61"


def ev(kind: str, state: State = State.VERIFIED, suffix: str = "1") -> Evidence:
    digest = hashlib.sha256(f"{kind}:{state.value}:{suffix}".encode()).hexdigest().upper()
    return Evidence(
        kind,
        state,
        f"subject:{kind}",
        digest,
        f"evidence:{kind}:{suffix}",
        "reviewer-a",
    )


class ProvenanceLedgerTests(unittest.TestCase):
    def test_new_ledger_keeps_all_links_unknown(self):
        ledger = Ledger.new(FINGERPRINT)
        self.assertEqual(set(ledger.links.values()), {State.UNKNOWN})

    def test_binary_metadata_does_not_allow_binding(self):
        self.assertFalse(Ledger.new(FINGERPRINT).binding_allowed())

    def test_wrong_assembly_name_rejected(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT, "Tool")

    def test_tool_dll_is_only_shorthand(self):
        ledger = Ledger.new(FINGERPRINT)
        self.assertEqual(ledger.assert_binary_reference("Tool.dll"), FINGERPRINT)

    def test_tools_dll_resolves_same_identity(self):
        ledger = Ledger.new(FINGERPRINT)
        self.assertEqual(ledger.assert_binary_reference("Tools.dll"), FINGERPRINT)

    def test_shorthand_cannot_supply_different_fingerprint(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).assert_binary_reference("Tool.dll", "other")

    def test_unreviewed_second_binary_rejected(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).assert_binary_reference("Other.dll", "sha256:other")

    def test_distinct_name_without_fingerprint_rejected(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).assert_binary_reference("Other.dll")

    def test_out_of_order_verification_rejected(self):
        ledger = Ledger.new(FINGERPRINT)
        with self.assertRaises(ValueError): ledger.record(expected_version=0, link="binary_match", state=State.VERIFIED, evidence=ev("binary_match"))

    def test_stale_version_rejected(self):
        ledger = Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.VERIFIED, evidence=ev("source_archive"))
        with self.assertRaises(ValueError): ledger.record(expected_version=0, link="source_project", state=State.VERIFIED, evidence=ev("source_project"))

    def test_evidence_kind_must_match_link(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.VERIFIED, evidence=ev("source_project"))

    def test_empty_evidence_identity_rejected(self):
        bad = Evidence("source_archive", State.VERIFIED, "", "0" * 64, "ref", "reviewer")
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.VERIFIED, evidence=bad)

    def test_unknown_observation_does_not_advance_binding(self):
        ledger = Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.UNKNOWN, evidence=ev("source_archive", State.UNKNOWN))
        self.assertFalse(ledger.binding_allowed())

    def test_mismatch_does_not_advance_binding(self):
        ledger = Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.MISMATCH, evidence=ev("source_archive", State.MISMATCH))
        self.assertFalse(ledger.binding_allowed())

    def test_complete_ordered_chain_allows_candidate_binding(self):
        ledger = Ledger.new(FINGERPRINT)
        for link in CHAIN:
            ledger = ledger.record(expected_version=ledger.version, link=link, state=State.VERIFIED, evidence=ev(link))
        self.assertTrue(ledger.binding_allowed())

    def test_partial_chain_remains_blocked(self):
        ledger = Ledger.new(FINGERPRINT)
        for link in CHAIN[:-1]:
            ledger = ledger.record(expected_version=ledger.version, link=link, state=State.VERIFIED, evidence=ev(link))
        self.assertFalse(ledger.binding_allowed())

    def test_mismatch_resets_downstream_links(self):
        ledger = Ledger.new(FINGERPRINT)
        for link in CHAIN:
            ledger = ledger.record(expected_version=ledger.version, link=link, state=State.VERIFIED, evidence=ev(link))
        ledger = ledger.record(expected_version=ledger.version, link="source_project", state=State.MISMATCH, evidence=ev("source_project", State.MISMATCH, "2"))
        self.assertEqual([ledger.links[k] for k in CHAIN[2:]], [State.UNKNOWN] * 3)

    def test_evidence_is_append_only(self):
        ledger = Ledger.new(FINGERPRINT)
        first = ledger.record(expected_version=0, link="source_archive", state=State.VERIFIED, evidence=ev("source_archive"))
        second = first.record(expected_version=1, link="source_project", state=State.VERIFIED, evidence=ev("source_project"))
        self.assertEqual(len(first.evidence), 1)
        self.assertEqual(len(second.evidence), 2)

    def test_fingerprint_requires_exact_uppercase_sha256_shape(self):
        for bad in (True, "short", FINGERPRINT.lower(), FINGERPRINT[:-1] + "G"):
            with self.assertRaises(ValueError): Ledger.new(bad)

    def test_boolean_expected_version_is_rejected(self):
        with self.assertRaises(ValueError):
            Ledger.new(FINGERPRINT).record(expected_version=False, link="source_archive", state=State.VERIFIED, evidence=ev("source_archive"))

    def test_string_cannot_impersonate_state_enum(self):
        with self.assertRaises(ValueError):
            Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state="VERIFIED", evidence=ev("source_archive"))

    def test_direct_constructor_cannot_omit_chain_link(self):
        links = {k: State.UNKNOWN for k in CHAIN[:-1]}
        with self.assertRaises(ValueError): Ledger(0, FINGERPRINT, "Tools", links)

    def test_direct_constructor_rejects_untyped_link_state(self):
        links = {k: State.UNKNOWN for k in CHAIN}
        links["source_archive"] = "UNKNOWN"
        with self.assertRaises(ValueError): Ledger(0, FINGERPRINT, "Tools", links)

    def test_links_are_immutable_after_construction(self):
        ledger = Ledger.new(FINGERPRINT)
        with self.assertRaises(TypeError): ledger.links["source_archive"] = State.VERIFIED
        self.assertFalse(ledger.binding_allowed())

    def test_unknown_update_resets_verified_downstream(self):
        ledger = Ledger.new(FINGERPRINT)
        for link in CHAIN:
            ledger = ledger.record(expected_version=ledger.version, link=link, state=State.VERIFIED, evidence=ev(link))
        ledger = ledger.record(expected_version=ledger.version, link="source_project", state=State.UNKNOWN, evidence=ev("source_project", State.UNKNOWN, "2"))
        self.assertEqual([ledger.links[k] for k in CHAIN[2:]], [State.UNKNOWN] * 3)

    def test_reverification_of_upstream_requires_downstream_reverification(self):
        ledger = Ledger.new(FINGERPRINT)
        for link in CHAIN:
            ledger = ledger.record(expected_version=ledger.version, link=link, state=State.VERIFIED, evidence=ev(link))
        ledger = ledger.record(expected_version=ledger.version, link="source_project", state=State.VERIFIED, evidence=ev("source_project", State.VERIFIED, "2"))
        self.assertEqual([ledger.links[k] for k in CHAIN[2:]], [State.UNKNOWN] * 3)
        self.assertFalse(ledger.binding_allowed())

    def test_evidence_fields_require_exact_strings(self):
        bad = Evidence("source_archive", State.VERIFIED, True, "0" * 64, "ref", "reviewer")
        with self.assertRaises(ValueError):
            Ledger.new(FINGERPRINT).record(expected_version=0, link="source_archive", state=State.VERIFIED, evidence=bad)

    def test_binary_reference_identity_requires_strings(self):
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).assert_binary_reference(True)
        with self.assertRaises(ValueError): Ledger.new(FINGERPRINT).assert_binary_reference("Tools.dll", True)

    def test_direct_constructor_cannot_fabricate_verified_chain_without_history(self):
        links = {key: State.VERIFIED for key in CHAIN}
        with self.assertRaises(ValueError):
            Ledger(0, FINGERPRINT, "Tools", links)

    def test_version_must_equal_immutable_event_history(self):
        evidence = (ev("source_archive"),)
        links = {key: State.UNKNOWN for key in CHAIN}
        links["source_archive"] = State.VERIFIED
        with self.assertRaises(ValueError):
            Ledger(0, FINGERPRINT, "Tools", links, evidence)
        with self.assertRaises(ValueError):
            Ledger(1, FINGERPRINT, "Tools", links, list(evidence))

    def test_direct_history_replay_rejects_out_of_order_verification(self):
        links = {key: State.UNKNOWN for key in CHAIN}
        links["binary_match"] = State.VERIFIED
        with self.assertRaises(ValueError):
            Ledger(1, FINGERPRINT, "Tools", links, (ev("binary_match"),))

    def test_evidence_state_must_match_transition(self):
        with self.assertRaises(ValueError):
            Ledger.new(FINGERPRINT).record(
                expected_version=0,
                link="source_archive",
                state=State.MISMATCH,
                evidence=ev("source_archive", State.VERIFIED),
            )

    def test_evidence_digest_requires_exact_uppercase_sha256_shape(self):
        for digest in ("short", "a" * 64, "G" * 64, True):
            bad = Evidence(
                "source_archive",
                State.VERIFIED,
                "subject",
                digest,
                "ref",
                "reviewer",
            )
            with self.subTest(digest=digest):
                with self.assertRaises(ValueError):
                    Ledger.new(FINGERPRINT).record(
                        expected_version=0,
                        link="source_archive",
                        state=State.VERIFIED,
                        evidence=bad,
                    )

    def test_evidence_identity_rejects_whitespace_and_control_characters(self):
        for subject in (" subject", "subject ", "subject\nforged", ""):
            bad = Evidence(
                "source_archive",
                State.VERIFIED,
                subject,
                "0" * 64,
                "ref",
                "reviewer",
            )
            with self.subTest(subject=subject):
                with self.assertRaises(ValueError):
                    Ledger.new(FINGERPRINT).record(
                        expected_version=0,
                        link="source_archive",
                        state=State.VERIFIED,
                        evidence=bad,
                    )

    def test_exact_evidence_observation_cannot_be_replayed(self):
        observation = ev("source_archive")
        ledger = Ledger.new(FINGERPRINT).record(
            expected_version=0,
            link="source_archive",
            state=State.VERIFIED,
            evidence=observation,
        )
        with self.assertRaises(ValueError):
            ledger.record(
                expected_version=1,
                link="source_archive",
                state=State.VERIFIED,
                evidence=observation,
            )


if __name__ == "__main__":
    unittest.main()
