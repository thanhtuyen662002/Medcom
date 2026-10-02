"""Failure tests against isolated copies of actual sanitized evidence documents."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from validate_filter_register import REGISTER, SOURCES, ValidationError, validate


REPO = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("validate_filter_register.py")


class FilterRegisterValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name)
        for relative in [REGISTER, *SOURCES.values()]:
            target = self.repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((REPO / relative).read_bytes())
        self.register_path = self.repo / REGISTER
        self.register = json.loads(self.register_path.read_text(encoding="utf-8"))
        # Choose a member from the source document, not from the output under test.
        source_lines = (self.repo / SOURCES["filter_evidence"]).read_text(encoding="utf-8").splitlines()
        first_row = next(line for line in source_lines if line.startswith("| ERP-CFG-"))
        self.source_id = first_row.split("|")[1].strip()
        self.source_line = source_lines.index(first_row) + 1

    def write_register(self):
        self.register_path.write_text(json.dumps(self.register, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def member(self, identity=None):
        identity = identity or self.source_id
        return next(member for family in self.register["families"] for member in family["members"] if member["id"] == identity)

    def family(self):
        return next(family for family in self.register["families"] if any(member["id"] == self.source_id for member in family["members"]))

    def rejected(self, message):
        self.write_register()
        with self.assertRaisesRegex(ValidationError, message):
            validate(self.repo)

    def refresh_recorded_hash(self, role):
        """Allow a changed source to reach membership/parser checks in a test."""
        metadata = next(source for source in self.register["extraction_sources"] if source["role"] == role)
        data = (self.repo / SOURCES[role]).read_bytes()
        metadata["sha256"] = hashlib.sha256(data).hexdigest()
        metadata["line_count"] = len(data.decode("utf-8").splitlines())

    def test_current_document_membership_and_counts_pass(self):
        report = validate(self.repo)
        source_rows = [line for line in (self.repo / SOURCES["filter_evidence"]).read_text(encoding="utf-8").splitlines()
                       if line.startswith("| ERP-CFG-")]
        independently_counted_rows = sum(int(line.split("|")[2].strip()) for line in source_rows)
        self.assertEqual(report["coverage"]["artifacts"], len(source_rows))
        self.assertEqual(report["coverage"]["serialized_rows"], independently_counted_rows)
        self.assertIn("not exhaustive 232 DAT or 786 RPX", report["limits"])

    def test_omitted_family_fails_even_if_claimed_total_is_unchanged(self):
        self.register["families"].remove(self.family())
        self.rejected("omitted or extra source family")

    def test_omitted_member_fails_with_self_consistent_family_totals(self):
        family = self.family()
        removed = self.member()
        family["members"].remove(removed)
        family["artifact_count"] -= 1
        for key in ("serialized_rows", "visible_rows", "hidden_rows"):
            family[key] -= removed[key]
        self.rejected("artifact_count")

    def test_omitted_member_fails_if_summary_counts_are_left_untouched(self):
        self.family()["members"].remove(self.member())
        self.rejected("omitted or extra source member")

    def test_duplicate_member_fails(self):
        self.family()["members"].append(deepcopy(self.member()))
        self.rejected("duplicate id")

    def test_duplicate_family_fails(self):
        self.register["families"].append(deepcopy(self.family()))
        self.rejected("duplicate form_basename")

    def test_changed_per_member_row_count_fails_despite_same_family_total(self):
        family = self.family()
        family["members"][0]["serialized_rows"] += 1
        family["members"][1]["serialized_rows"] -= 1
        self.rejected("serialized_rows")

    def test_forged_top_count_fails(self):
        self.register["coverage"]["serialized_rows"] = 599
        self.rejected("coverage serialized_rows")

    def test_boolean_does_not_satisfy_integer_schema_version(self):
        self.register["schema_version"] = True
        self.rejected("schema_version")

    def test_invalid_calendar_date_is_rejected(self):
        self.register["generated_on"] = "2026-02-30"
        self.rejected("invalid calendar date")

    def test_source_byte_drift_fails(self):
        path = self.repo / SOURCES["bound_contracts"]
        path.write_bytes(path.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValidationError, "sha256 drift"):
            validate(self.repo)

    def test_forged_recorded_source_hash_fails(self):
        self.register["extraction_sources"][0]["sha256"] = "0" * 64
        self.rejected("sha256 drift")

    def test_forged_source_line_count_fails(self):
        self.register["extraction_sources"][0]["line_count"] -= 1
        self.rejected("line_count drift")

    def test_omitted_member_from_both_documents_cannot_be_waived_by_new_hashes(self):
        artifact = self.source_id.removeprefix("ERP-CFG-")
        for role, prefix in (("filter_evidence", self.source_id), ("query_inventory", artifact)):
            path = self.repo / SOURCES[role]
            lines = path.read_text(encoding="utf-8").splitlines()
            path.write_text("\n".join(line for line in lines if not line.startswith("| " + prefix + " |")) + "\n", encoding="utf-8")
            self.refresh_recorded_hash(role)
        self.rejected("source finite acceptance counts")

    def test_duplicate_source_row_rejected_even_after_hash_refresh(self):
        path = self.repo / SOURCES["filter_evidence"]
        lines = path.read_text(encoding="utf-8").splitlines()
        lines.insert(self.source_line, lines[self.source_line - 1])
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.refresh_recorded_hash("filter_evidence")
        self.rejected("duplicate source member")

    def test_duplicate_source_row_outside_table_is_not_silently_ignored(self):
        path = self.repo / SOURCES["filter_evidence"]
        lines = path.read_text(encoding="utf-8").splitlines()
        lines.extend(["", lines[self.source_line - 1]])
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.refresh_recorded_hash("filter_evidence")
        self.rejected("inventory rows outside the expected table")

    def test_literal_reference_tampering_fails(self):
        self.member()["literal_db_reference_names"] = self.family()["members"][1]["literal_db_reference_names"]
        self.rejected("altered literal_db_reference_names")

    def test_alias_membership_tampering_fails(self):
        self.member()["alias_markers"] = ["A"]
        self.rejected("altered alias_markers")

    def test_member_citation_must_match_source_row_not_just_document(self):
        self.member()["source_citations"][0]["line"] += 1
        self.rejected("citation does not point to the exact source row")

    def test_architecture_citation_must_match_family_row(self):
        self.family()["architecture_source_citations"][0]["line"] += 1
        self.rejected("citation does not point to the exact source row")

    def test_reverse_literal_orphan_link_fails(self):
        literal = next(item for item in self.register["literal_db_references"] if self.source_id in item["referenced_by_artifact_ids"])
        literal["referenced_by_artifact_ids"] = []
        self.rejected("altered reverse member links")

    def test_omitted_literal_fails(self):
        self.register["literal_db_references"].pop()
        self.rejected("omitted or extra source literal")

    def test_runtime_unknown_cannot_be_promoted(self):
        self.member()["runtime_field_contract_status"] = "VERIFIED"
        self.rejected("runtime contract")

    def test_alias_target_cannot_be_guessed(self):
        alias_member = next(member for family in self.register["families"] for member in family["members"] if member["alias_markers"])
        alias_member["alias_quarantine"]["target_mapping"] = alias_member["literal_db_reference_names"][0]
        self.rejected("alias target_mapping")

    def test_api_proposal_cannot_be_promoted_to_implementation(self):
        self.family()["api_disposition"]["status"] = "IMPLEMENTED"
        self.rejected("API status")

    def test_db_literal_cannot_be_promoted_to_resolved_catalog_object(self):
        self.register["literal_db_references"][0]["resolved_catalog_object_id"] = "resolved"
        self.rejected("unresolved catalog ID")

    def test_closed_coverage_gate_is_rejected(self):
        self.register["coverage"]["gate4_closed"] = True
        self.rejected("coverage gate4_closed")

    def test_non_exhaustive_population_warning_cannot_be_omitted(self):
        self.register["coverage"]["not_exhaustive_for"].remove("all 232 DAT artifacts")
        self.rejected("non-exhaustive boundaries altered")

    def test_blocker_owner_cannot_be_omitted(self):
        self.register["bounded_unknown_register"].pop()
        self.rejected("omitted or extra blocker")

    def test_member_schema_rejects_extra_field(self):
        self.member()["executable_sql"] = "unsupported"
        self.rejected("unsupported keys")

    def test_interpretation_boundaries_cannot_be_replaced_by_arbitrary_text(self):
        self.register["interpretation_rules"] = [str(index) for index in range(5)]
        self.rejected("evidence boundaries altered")

    def test_evidence_scope_cannot_claim_verified_runtime(self):
        self.member()["evidence_scope"] = "VERIFIED runtime behavior and complete DB semantics"
        self.rejected("evidence_scope")

    def test_negated_alias_policy_is_rejected(self):
        self.member()["alias_quarantine"]["policy"] = "Do not Reject unresolved alias-prefixed fields; execute guessed targets."
        self.rejected("fail-closed alias policy")

    def test_unknown_acceptance_cannot_claim_no_verification_required(self):
        self.register["bounded_unknown_register"][0]["acceptance"] = "No verification required; all aliases already resolved"
        self.rejected("acceptance")

    def test_unknown_blocked_behavior_cannot_authorize_unresolved_execution(self):
        self.register["bounded_unknown_register"][0]["unsafe_behavior_blocked"] = "Nothing; unresolved aliases may execute."
        self.rejected("unsupported behavior")

    def test_baseline_basis_must_be_string(self):
        self.register["baseline_attributed"]["basis"] = ["raw archive not reinspected"]
        self.rejected("baseline indirect evidence boundary")

    def test_nested_owner_issue_must_be_integer(self):
        self.register["bounded_unknown_register"][0]["owner"]["issue"] = 21.0
        self.rejected("owner")

    def test_omitted_pilot_owner_is_rejected(self):
        del self.family()["pilot_owner"]
        self.rejected("pilot owner membership mismatch")

    def test_duplicate_json_object_key_is_rejected(self):
        data = self.register_path.read_text(encoding="utf-8")
        self.register_path.write_text(data.replace('"schema_version": 1,', '"schema_version": 1, "schema_version": 1,', 1), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "duplicate object key"):
            validate(self.repo)

    def test_cli_returns_nonzero_without_pass_output_on_tampering(self):
        self.register["coverage"]["artifacts"] = 23
        self.write_register()
        result = subprocess.run([sys.executable, str(SCRIPT), "--repo-root", str(self.repo)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("FAIL:", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
