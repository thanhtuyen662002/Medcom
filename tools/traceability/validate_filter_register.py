#!/usr/bin/env python3
"""Validate the bounded filter register against four sanitized evidence documents.

This checks retained document membership and provenance, not the unavailable raw
ERP archive, private field rows, current DB catalog, or runtime behavior.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import sys


REGISTER = "inventories/traceability/FILTER_FAMILY_TRACEABILITY_REGISTER.json"
SOURCES = {
    "filter_evidence": "docs/erp/FILTER_CONFIGURATION_EVIDENCE.md",
    "query_inventory": "docs/erp/DAT_FILTER_QUERY_INVENTORY.md",
    "bound_contracts": "inventories/traceability/PHASE1_BOUND_CONTRACTS.md",
    "closure_delta": "inventories/traceability/PHASE1_FILTER_CLOSURE_DELTA.md",
}
# Finite acceptance bounds, independently reconciled from the evidence tables.
# These do not describe individual private serialized field-row identities.
EXPECTED_COUNTS = {
    "families": 13, "paired_families": 11, "standalone_families": 2,
    "artifacts": 24, "serialized_rows": 600, "visible_rows": 526,
    "hidden_rows": 74, "literal_db_reference_names": 18,
    "alias_bearing_artifacts": 10,
}
EXCLUDED_SCOPES = {
    "all 232 DAT artifacts", "23 corroborated form identity members",
    "786 candidate-current RPX members", "234 backup RPX members",
    "18 Office template members", "full ERP-Web-DB catalog or runtime capability set",
}
UNKNOWN_OWNERS = {
    "FILTER-CATALOG-RESOLUTION": ("B2", 21, "BLOCKED"),
    "FILTER-GRAMMAR-PRECEDENCE": ("R3", 26, "UNKNOWN"),
    "FILTER-ALIAS-RESOLUTION": ("R3", 26, "UNKNOWN"),
    "FILTER-PERMISSION-SCOPE": ("B4", 23, "UNKNOWN"),
    "FILTER-API-READ-CONTRACT": ("B1", 20, "PROPOSED"),
}
# Version-1 safety boundaries are intentionally exact. A status field must not
# mask contradictory narrative claiming verified runtime behavior or safe writes.
INTERPRETATION_RULES = [
    "VERIFIED labels retain source ERP structure/reference evidence only; generation verifies exact durable table extraction.",
    "Web/API IDs and policy are proposed dispositions, not implemented routes, current ERP semantics or authorization.",
    "Current DB kind/schema/definition/field resolution remains pending B2; identifiers in ERP are not proof of DB object kind.",
    "No source field values, production filter values, raw SQL, secrets or new guide historical data rows are copied.",
    "UNKNOWN semantics can be bounded by owner/acceptance/blocked behavior, but missing artifact membership and dump-extractable catalog data cannot be hidden as UNKNOWN.",
]
BASELINE_BASIS = "existing authoritative-package evidence documents; raw archive not reinspected for this generation"
FORM_IDENTITY_SCOPE = "filter basename association; does not prove executable class, navigation, business caption or authorization"
MEMBER_EVIDENCE_SCOPE = "persisted filter metadata as recorded by authoritative-package analysis; not runtime execution"
LITERAL_EVIDENCE_SCOPE = "identifier occurs in persisted FieldID metadata recorded by ERP analysis"
ALIAS_POLICY = "Reject unresolved alias-prefixed fields; do not guess targets, expose a raw FieldID, or drop hidden criteria to force query execution"
DB_UNKNOWN_BOUNDARY = "UNKNOWN until sanitized B2 catalog/dependency join; existing independently verified anchor facts retain their own evidence level"
LITERAL_ACCEPTANCE = "Resolve exact current baseline schema/kind/stable object ID, requested fields and dependencies from sanitized catalog; retain unresolved/ambiguous results as blockers; no kind inferred from Tbl/View/name"
UNKNOWN_CONTRACTS = {
    "FILTER-CATALOG-RESOLUTION": (
        "All 18 literals resolve to catalog identity rows or explicit absent/ambiguous evidence with affected queries disabled; field types/keys/dependencies resolve; no invented view/table classification",
        "No raw literal name becomes an executable SQL identifier or endpoint",
    ),
    "FILTER-GRAMMAR-PRECEDENCE": (
        "Source/runtime evidence establishes Like escaping, empty values, both operator slots, boolean/date rules, AndOr grouping, STT and hidden-row semantics plus package/DB/company/role/user precedence; preserve all 600 private source rows in authorized verification",
        "No silent loss of hidden filters, malformed executable metadata, or source defaults",
    ),
    "FILTER-ALIAS-RESOLUTION": (
        "For each of the 10 alias-bearing artifacts, source/query evidence binds every A/B field to the exact authorized query projection; retain per-member unresolved mappings as quarantined",
        "No arbitrary A/B to table mapping and no query execution that depends on unresolved criteria",
    ),
    "FILTER-PERMISSION-SCOPE": (
        "Server derives effective user/company/branch/storehouse scope and tests allowed/denied/revoked/cross-scope queries; classify hidden criteria without making visibility equal authority",
        "No client scope expansion or security-filter omission",
    ),
    "FILTER-API-READ-CONTRACT": (
        "After B2/R3/B4 gates, schema-typed field/operator/value allowlists, deterministic stable sort/window, timeout, telemetry, cancel/race handling and representative legacy/Web result parity are evidenced",
        "No guessed endpoint, unsafe FieldID interpolation, generic CRUD or mutation implied by read-query design",
    ),
}
PILOT_OWNERS = {
    "AP_ApprovePurchaseRequestListFrm": ("F7", 34), "AP_OrderFrm": ("F8", 35),
    "AR_InvoiceRequestFrm": ("F5", 32), "IV_InboundRequestFrm": ("F9", 42),
}
PILOT_SCOPE = "pilot intent/menu/action verification and future slice; this register proves no mutation"
BUSINESS_CAPTION_UNKNOWN = "UNKNOWN current equivalence: historical guide says Yêu cầu xuất hóa đơn; planned pilot says Đề nghị bán hàng; F5 must resolve"
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
ARTIFACT = re.compile(r"(?P<family>[A-Za-z_][A-Za-z0-9_]*)_filter(?P<detail>_d)?\Z")


class ValidationError(ValueError):
    """A register or evidence invariant failed; callers must not claim PASS."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def typed_equal(actual, expected) -> bool:
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(typed_equal(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(typed_equal(a, e) for a, e in zip(actual, expected))
    return actual == expected


def same(actual, expected, context: str) -> None:
    # bool is an int subclass; it must not silently satisfy an integer count.
    require(typed_equal(actual, expected),
            f"{context}: expected {expected!r}, got {actual!r}")


def shape(value, required: set[str], context: str, optional=()) -> dict:
    require(isinstance(value, dict), f"{context}: expected object")
    missing = required - value.keys()
    extra = value.keys() - required - set(optional)
    require(not missing and not extra,
            f"{context}: missing keys {sorted(missing)}, unsupported keys {sorted(extra)}")
    return value


def unique_list(value, context: str) -> list:
    require(isinstance(value, list), f"{context}: expected list")
    require(all(isinstance(item, str) for item in value), f"{context}: expected string members")
    require(len(value) == len(set(value)), f"{context}: duplicate member")
    return value


def keyed(items, key: str, context: str) -> dict:
    require(isinstance(items, list), f"{context}: expected list")
    result = {}
    for item in items:
        require(isinstance(item, dict) and isinstance(item.get(key), str),
                f"{context}: missing string {key}")
        identity = item[key]
        require(identity not in result, f"{context}: duplicate {key} {identity}")
        result[identity] = item
    return result


def no_duplicate_json_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"JSON: duplicate object key {key}")
        result[key] = value
    return result


def table(lines: list[str], header: str, path: str) -> list[tuple[int, list[str]]]:
    locations = [i for i, line in enumerate(lines) if line.strip() == header]
    require(len(locations) == 1, f"{path}: missing or duplicate expected table header")
    start = locations[0]
    require(start + 1 < len(lines) and re.fullmatch(r"[| :\-]+", lines[start + 1]),
            f"{path}:{start + 2}: malformed Markdown table separator")
    width = len(header.strip("|").split("|"))
    rows = []
    for i in range(start + 2, len(lines)):
        line = lines[i].strip()
        if not line.startswith("|"):
            break
        require(line.endswith("|"), f"{path}:{i + 1}: unclosed table row")
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        require(len(cells) == width, f"{path}:{i + 1}: malformed table row width")
        rows.append((i + 1, cells))
    require(bool(rows), f"{path}: empty evidence table")
    return rows


def count_cell(text: str, context: str) -> int:
    require(bool(re.fullmatch(r"0|[1-9][0-9]*", text)), f"{context}: invalid count")
    return int(text)


def identifiers(text: str, context: str, none_label=None) -> list[str]:
    values = [] if text == none_label else [part.strip() for part in text.split(",")]
    require(all(IDENTIFIER.fullmatch(value) for value in values), f"{context}: invalid identifier")
    require(len(values) == len(set(values)), f"{context}: duplicate identifier")
    return sorted(values)


def source_rows(documents: dict) -> tuple[dict, dict]:
    """Extract expectations from retained tables, independently of the register."""
    path = SOURCES["filter_evidence"]
    rows = table(documents[path],
                 "| Stable ID | Rows | Visible | Hidden | Direct object/view identifiers observed in FieldID | Alias markers |",
                 path)
    reject_unparsed_rows(documents[path], rows, r"\|\s*ERP-CFG-", path)
    evidence = {}
    for line, cells in rows:
        stable_id, row_count, visible, hidden, names, aliases = cells
        require(stable_id.startswith("ERP-CFG-"), f"{path}:{line}: invalid stable ID")
        artifact = stable_id.removeprefix("ERP-CFG-")
        match = ARTIFACT.fullmatch(artifact)
        require(bool(match), f"{path}:{line}: unsupported artifact identity")
        require(stable_id not in evidence, f"{path}:{line}: duplicate source member {stable_id}")
        counts = [count_cell(c, f"{path}:{line}") for c in (row_count, visible, hidden)]
        require(counts[0] == counts[1] + counts[2], f"{path}:{line}: visibility count mismatch")
        evidence[stable_id] = {
            "artifact_basename": artifact, "family": match["family"],
            "detail": bool(match["detail"]), "serialized_rows": counts[0],
            "visible_rows": counts[1], "hidden_rows": counts[2],
            "literal_db_reference_names": identifiers(names, f"{path}:{line}"),
            "alias_markers": identifiers(aliases, f"{path}:{line}", "none observed"),
            "filter_line": line,
        }
        require(bool(evidence[stable_id]["literal_db_reference_names"]),
                f"{path}:{line}: omitted literal DB reference")
        require(set(evidence[stable_id]["alias_markers"]) <= {"A", "B"},
                f"{path}:{line}: unsupported alias marker")

    path = SOURCES["query_inventory"]
    query = {}
    rows = table(documents[path], "| Artifact | Rows | Hidden |", path)
    reject_unparsed_rows(documents[path], rows, r"\|\s*[A-Za-z_][A-Za-z0-9_]*_filter(?:_d)?\s*\|", path)
    for line, cells in rows:
        artifact, row_count, hidden = cells
        require(bool(ARTIFACT.fullmatch(artifact)), f"{path}:{line}: unsupported artifact identity")
        stable_id = "ERP-CFG-" + artifact
        require(stable_id not in query, f"{path}:{line}: duplicate source member {stable_id}")
        query[stable_id] = (count_cell(row_count, f"{path}:{line}"),
                            count_cell(hidden, f"{path}:{line}"), line)
    require(evidence.keys() == query.keys(), "source tables: omitted or extra artifact membership")
    for stable_id, row in evidence.items():
        require((row["serialized_rows"], row["hidden_rows"]) == query[stable_id][:2],
                f"source tables: inconsistent row counts for {stable_id}")
        row["query_line"] = query[stable_id][2]

    architecture = {}
    for role, header in (
        ("bound_contracts", "| ERP form/config | VERIFIED DB reference from DAT | API disposition | DB decision | Freshness |"),
        ("closure_delta", "| ERP form/config | VERIFIED DB reference from ERP DAT | Web/API disposition | Reuse decision | Freshness | Remaining gap |"),
    ):
        path = SOURCES[role]
        rows = table(documents[path], header, path)
        reject_unparsed_rows(documents[path], rows, r"\|\s*ERP-FRM-", path)
        for line, cells in rows:
            match = re.match(r"ERP-FRM-([A-Za-z_][A-Za-z0-9_]*) / ", cells[0])
            require(bool(match), f"{path}:{line}: unsupported family identity")
            family = match[1]
            require(family not in architecture, f"{path}:{line}: duplicate source family {family}")
            names = re.findall(r"DB-(?:TABLE|VIEW)-dbo\.([A-Za-z_][A-Za-z0-9_]*)", cells[1])
            require(names and len(names) == len(set(names)), f"{path}:{line}: missing/duplicate DB literals")
            purpose = re.search(r"typed [^;]+? query", cells[2])
            freshness = re.search(r"(?:≤|<=)([0-9]+)(?:[–-]([0-9]+))?s", cells[4])
            require(purpose and freshness, f"{path}:{line}: unrecognized proposed contract")
            same(cells[3], "FACADE", f"{path}:{line}: reuse decision")
            architecture[family] = {
                "path": path, "line": line, "names": sorted(names), "purpose": purpose[0],
                "seconds": int(freshness[1]),
                "upper_seconds": int(freshness[2]) if freshness[2] else None,
            }
    return evidence, architecture


def reject_unparsed_rows(lines, parsed_rows, pattern: str, path: str) -> None:
    """Do not silently ignore a duplicated inventory row outside its table."""
    parsed_lines = {line for line, _ in parsed_rows}
    candidate_lines = {index + 1 for index, line in enumerate(lines) if re.match(pattern, line.strip())}
    require(candidate_lines == parsed_lines, f"{path}: inventory rows outside the expected table")


def citations(actual, expected: list[dict], context: str) -> None:
    require(isinstance(actual, list), f"{context}: expected citation list")
    values = []
    for value in actual:
        shape(value, {"path", "line"}, context)
        require(type(value["line"]) is int and value["line"] > 0, f"{context}: invalid line")
        require(isinstance(value["path"], str), f"{context}: invalid path")
        values.append((value["path"], value["line"]))
    require(len(values) == len(set(values)), f"{context}: duplicate citation")
    require(set(values) == {(v["path"], v["line"]) for v in expected},
            f"{context}: citation does not point to the exact source row")


def validate(repo_root: Path, register_path: Path | None = None) -> dict:
    repo_root = Path(repo_root)
    register_path = register_path or repo_root / REGISTER
    try:
        register = json.loads(register_path.read_text(encoding="utf-8"),
                              object_pairs_hook=no_duplicate_json_keys)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f"register: cannot read valid UTF-8 JSON: {exc}") from exc
    shape(register, {"schema_version", "generated_on", "status", "baseline_attributed",
                     "extraction_sources", "coverage", "interpretation_rules", "families",
                     "literal_db_references", "bounded_unknown_register", "scope_audit"}, "register")
    same(register["schema_version"], 1, "schema_version")
    require(isinstance(register["generated_on"], str) and
            bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", register["generated_on"])), "generated_on: invalid date shape")
    try:
        date.fromisoformat(register["generated_on"])
    except ValueError as exc:
        raise ValidationError("generated_on: invalid calendar date") from exc
    same(register["status"], "COMPLETE_DURABLE_FILTER_SLICE_ONLY__GATE4_REMAINS_PARTIAL", "status")
    baseline = shape(register["baseline_attributed"], {"filename", "sha256", "attributed_directory", "basis"}, "baseline")
    same(baseline["filename"], "ERP_Medcom2026(4).zip", "baseline filename")
    same(baseline["attributed_directory"], "Layout/Medcom", "baseline attributed directory")
    same(baseline["basis"], BASELINE_BASIS, "baseline indirect evidence boundary")

    extraction = keyed(register["extraction_sources"], "role", "extraction_sources")
    require(extraction.keys() == SOURCES.keys(), "extraction_sources: expected exactly the four source roles")
    documents = {}
    for role, path in SOURCES.items():
        metadata = shape(extraction[role], {"role", "path", "sha256", "line_count"}, f"source {role}")
        same(metadata["path"], path, f"source {role} path")
        try:
            data = (repo_root / path).read_bytes()
            lines = data.decode("utf-8").splitlines()
        except (OSError, UnicodeError) as exc:
            raise ValidationError(f"source {path}: unavailable UTF-8 evidence: {exc}") from exc
        same(metadata["sha256"], hashlib.sha256(data).hexdigest(), f"source {path} sha256 drift")
        same(metadata["line_count"], len(lines), f"source {path} line_count drift")
        documents[path] = lines
    hashes = re.findall(r"SHA-256 `([0-9a-f]{64})`", "\n".join(documents[SOURCES["query_inventory"]]))
    require(len(hashes) == 1, "query inventory: missing/ambiguous attributed archive hash")
    same(baseline["sha256"], hashes[0], "baseline attributed archive hash")

    expected, architecture = source_rows(documents)
    grouped = defaultdict(list)
    reverse_literals = defaultdict(list)
    for stable_id, row in expected.items():
        grouped[row["family"]].append(stable_id)
        for name in row["literal_db_reference_names"]:
            reverse_literals[name].append(stable_id)
    require(grouped.keys() == architecture.keys(), "source architecture: omitted or extra family")
    paired = sum(len(members) == 2 for members in grouped.values())
    standalone = sum(len(members) == 1 for members in grouped.values())
    derived = {
        "families": len(grouped), "paired_families": paired, "standalone_families": standalone,
        "artifacts": len(expected), "literal_db_reference_names": len(reverse_literals),
        "alias_bearing_artifacts": sum(bool(row["alias_markers"]) for row in expected.values()),
        **{key: sum(row[key] for row in expected.values())
           for key in ("serialized_rows", "visible_rows", "hidden_rows")},
    }
    same(derived, EXPECTED_COUNTS, "source finite acceptance counts")
    coverage = shape(register["coverage"], set(EXPECTED_COUNTS) | {
        "members_exhaustive_for", "not_exhaustive_for", "gate2_closed", "trc_db_001_closed", "gate4_closed"}, "coverage")
    for key, value in derived.items():
        same(coverage[key], value, f"coverage {key}")
    same(coverage["members_exhaustive_for"], "24 members explicitly enumerated in both durable filter inventories", "coverage scope")
    require(set(unique_list(coverage["not_exhaustive_for"], "excluded scopes")) == EXCLUDED_SCOPES,
            "coverage: required non-exhaustive boundaries altered")
    for key in ("gate2_closed", "trc_db_001_closed", "gate4_closed"):
        same(coverage[key], False, f"coverage {key}")
    same(register["scope_audit"], "inventories/traceability/FILTER_TRACEABILITY_SCOPE_AUDIT.md", "scope_audit")
    require(set(unique_list(register["interpretation_rules"], "interpretation_rules")) == set(INTERPRETATION_RULES),
            "interpretation_rules: evidence boundaries altered")

    families = keyed(register["families"], "form_basename", "families")
    require(families.keys() == grouped.keys(), "families: omitted or extra source family")
    all_members = set()
    required_family_keys = {"family_id", "form_basename", "erp_form_candidate_id", "form_identity_scope",
        "pairing", "artifact_count", "serialized_rows", "visible_rows", "hidden_rows", "members",
        "literal_db_reference_names", "web_disposition", "api_disposition", "db_disposition",
        "freshness_policy_proposed", "bounded_unknowns", "architecture_source_citations"}
    required_member_keys = {"id", "artifact_basename", "family", "member_role", "serialized_rows", "visible_rows",
        "hidden_rows", "literal_db_reference_names", "alias_markers", "evidence_level", "evidence_scope",
        "source_citations", "alias_quarantine", "db_reference_resolution_status", "runtime_field_contract_status"}
    for name, family in families.items():
        context = f"family {name}"
        shape(family, required_family_keys, context, {"pilot_owner", "business_caption_status"})
        same(family["family_id"], "ERP-CFG-DAT-FilterFamily-" + name, context + " family_id")
        same(family["erp_form_candidate_id"], "ERP-FRM-" + name, context + " form candidate")
        same(family["form_identity_scope"], FORM_IDENTITY_SCOPE, context + " identity scope")
        ids = grouped[name]
        same(family["pairing"], "master/detail" if len(ids) == 2 else "standalone", context + " pairing")
        same(family["artifact_count"], len(ids), context + " artifact_count")
        for key in ("serialized_rows", "visible_rows", "hidden_rows"):
            same(family[key], sum(expected[identity][key] for identity in ids), context + " " + key)
        members = keyed(family["members"], "id", context + " members")
        require(members.keys() == set(ids), context + ": omitted or extra source member")
        require(not all_members.intersection(members), context + ": duplicate global member")
        all_members.update(members)
        for stable_id, member in members.items():
            mc = f"member {stable_id}"
            shape(member, required_member_keys, mc)
            row = expected[stable_id]
            for key in ("artifact_basename", "family", "serialized_rows", "visible_rows", "hidden_rows"):
                same(member[key], row[key], mc + " " + key)
            for key in ("literal_db_reference_names", "alias_markers"):
                require(sorted(unique_list(member[key], mc + " " + key)) == row[key], mc + ": altered " + key)
            role = "detail" if row["detail"] else ("master" if len(ids) == 2 else "standalone")
            same(member["member_role"], role, mc + " role")
            same(member["evidence_level"], "VERIFIED", mc + " evidence level")
            same(member["evidence_scope"], MEMBER_EVIDENCE_SCOPE, mc + " evidence_scope")
            citations(member["source_citations"], [
                {"path": SOURCES["filter_evidence"], "line": row["filter_line"]},
                {"path": SOURCES["query_inventory"], "line": row["query_line"]},
            ], mc)
            quarantine = shape(member["alias_quarantine"], {"required", "target_status", "target_mapping", "policy"}, mc + " alias_quarantine")
            has_alias = bool(row["alias_markers"])
            same(quarantine["required"], has_alias, mc + " alias quarantine required")
            same(quarantine["target_status"], "UNKNOWN" if has_alias else "no alias marker recorded", mc + " alias target_status")
            same(quarantine["target_mapping"], None, mc + " alias target_mapping")
            same(quarantine["policy"], ALIAS_POLICY, mc + " fail-closed alias policy")
            same(member["db_reference_resolution_status"], "PENDING_B2_CATALOG_JOIN", mc + " DB resolution")
            same(member["runtime_field_contract_status"], "UNKNOWN", mc + " runtime contract")
        names = sorted({literal for identity in ids for literal in expected[identity]["literal_db_reference_names"]})
        require(sorted(unique_list(family["literal_db_reference_names"], context + " DB literals")) == names,
                context + ": DB literal membership mismatch")
        require(names == architecture[name]["names"], context + ": architecture/source DB literal mismatch")
        citations(family["architecture_source_citations"], [{"path": architecture[name]["path"], "line": architecture[name]["line"]}], context)
        web = shape(family["web_disposition"], {"status", "capability_id", "family_capability_id_proposed", "preserve_master_detail_separation", "preserve_hidden_rows"}, context + " Web")
        for key, value in {"status": "PROPOSED_NOT_DEPLOYED", "capability_id": "WEB-FILTER-CONTRACT",
            "family_capability_id_proposed": "WEB-FILTER-FAMILY-" + name,
            "preserve_master_detail_separation": len(ids) == 2, "preserve_hidden_rows": True}.items():
            same(web[key], value, context + " Web " + key)
        api = shape(family["api_disposition"], {"status", "query_id_proposed", "purpose", "execution_model", "no_mutation_contract_inferred"}, context + " API")
        for key, value in {"status": "PROPOSED_NOT_IMPLEMENTED", "query_id_proposed": "API-QUERY-FILTER-" + name,
            "purpose": architecture[name]["purpose"], "execution_model": "server-owned typed compatibility facade",
            "no_mutation_contract_inferred": True}.items():
            same(api[key], value, context + " API " + key)
        db = shape(family["db_disposition"], {"status", "reuse_policy_proposed", "literal_references_are_not_execution_authority", "current_schema_kind_definition_and_field_resolution"}, context + " DB")
        for key, value in {"status": "B2_RESOLUTION_PENDING", "reuse_policy_proposed": "FACADE", "literal_references_are_not_execution_authority": True}.items():
            same(db[key], value, context + " DB " + key)
        same(db["current_schema_kind_definition_and_field_resolution"], DB_UNKNOWN_BOUNDARY, context + " DB UNKNOWN boundary")
        freshness = shape(family["freshness_policy_proposed"], {"mode", "target_seconds", "authoritative_scope_and_permissions_rechecked"}, context + " freshness", {"operational_acceptance_upper_seconds"})
        same(freshness["mode"], "SWR", context + " freshness mode")
        same(freshness["target_seconds"], architecture[name]["seconds"], context + " freshness target")
        same(freshness["authoritative_scope_and_permissions_rechecked"], "before protected query/action; exact legacy timing UNKNOWN", context + " freshness scope")
        if architecture[name]["upper_seconds"] is not None:
            same(freshness.get("operational_acceptance_upper_seconds"), architecture[name]["upper_seconds"], context + " freshness upper")
        else:
            require("operational_acceptance_upper_seconds" not in freshness, context + ": unsourced freshness upper")
        needed_unknowns = set(UNKNOWN_OWNERS) - {"FILTER-ALIAS-RESOLUTION"}
        if any(expected[identity]["alias_markers"] for identity in ids):
            needed_unknowns.add("FILTER-ALIAS-RESOLUTION")
        require(set(unique_list(family["bounded_unknowns"], context + " unknowns")) == needed_unknowns,
                context + ": omitted or extra UNKNOWN owner link")
        require(("pilot_owner" in family) == (name in PILOT_OWNERS), context + ": pilot owner membership mismatch")
        if name in PILOT_OWNERS:
            owner = shape(family["pilot_owner"], {"node", "issue", "scope"}, context + " pilot owner")
            node, issue = PILOT_OWNERS[name]
            same(owner, {"node": node, "issue": issue, "scope": PILOT_SCOPE}, context + " pilot owner")
        require(("business_caption_status" in family) == (name == "AR_InvoiceRequestFrm"), context + ": caption uncertainty membership mismatch")
        if "business_caption_status" in family:
            same(family["business_caption_status"], BUSINESS_CAPTION_UNKNOWN, context + " caption UNKNOWN")
    require(all_members == expected.keys(), "register: omitted source member")

    literals = keyed(register["literal_db_references"], "literal_name", "literal_db_references")
    require(literals.keys() == reverse_literals.keys(), "DB references: omitted or extra source literal")
    for name, literal in literals.items():
        context = "DB literal " + name
        shape(literal, {"literal_name", "evidence_level", "evidence_scope", "referenced_by_artifact_ids", "source_citations",
              "resolved_catalog_object_id", "schema_kind_column_and_dependency_resolution_status", "owner", "acceptance"}, context)
        require(set(unique_list(literal["referenced_by_artifact_ids"], context + " artifacts")) == set(reverse_literals[name]),
                context + ": altered reverse member links")
        citations(literal["source_citations"], [{"path": SOURCES["filter_evidence"], "line": expected[identity]["filter_line"]}
                  for identity in reverse_literals[name]], context)
        same(literal["evidence_level"], "VERIFIED", context + " evidence level")
        same(literal["evidence_scope"], LITERAL_EVIDENCE_SCOPE, context + " evidence scope")
        same(literal["resolved_catalog_object_id"], None, context + " unresolved catalog ID")
        same(literal["schema_kind_column_and_dependency_resolution_status"], "PENDING_B2", context + " resolution")
        same(literal["owner"], {"node": "B2", "issue": 21}, context + " owner")
        same(literal["acceptance"], LITERAL_ACCEPTANCE, context + " acceptance")

    unknowns = keyed(register["bounded_unknown_register"], "id", "bounded_unknown_register")
    require(unknowns.keys() == UNKNOWN_OWNERS.keys(), "UNKNOWN register: omitted or extra blocker")
    for identity, item in unknowns.items():
        shape(item, {"id", "owner", "status", "acceptance", "unsafe_behavior_blocked"}, identity, {"supporting_owner"})
        node, issue, status = UNKNOWN_OWNERS[identity]
        same(item["owner"], {"node": node, "issue": issue}, identity + " owner")
        same(item["status"], status, identity + " status")
        acceptance, blocked_behavior = UNKNOWN_CONTRACTS[identity]
        same(item["acceptance"], acceptance, identity + " acceptance")
        same(item["unsafe_behavior_blocked"], blocked_behavior, identity + " unsupported behavior")
        if identity == "FILTER-ALIAS-RESOLUTION":
            same(item.get("supporting_owner"), {"node": "B2", "issue": 21}, identity + " supporting owner")
        else:
            require("supporting_owner" not in item, identity + ": unexpected supporting owner")
    return {"status": "PASS_BOUNDED_SANITIZED_FILTER_SLICE", "coverage": derived,
            "limits": "No raw archive/600 private field-row identities/DB resolution/runtime verification; Gate 2/TRC-DB-001/Gate 4 remain open; not exhaustive 232 DAT or 786 RPX coverage."}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--register", type=Path, help="Alternative register JSON; evidence remains relative to --repo-root")
    args = parser.parse_args(argv)
    try:
        report = validate(args.repo_root, args.register)
    except (ValidationError, TypeError, KeyError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
