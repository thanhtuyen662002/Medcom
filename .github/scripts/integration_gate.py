#!/usr/bin/env python3
"""Read-only integration preflight. No merge endpoint or credential fencing claim.

Input is a fresh API snapshot; GO means preflight passed, never an atomic merge
reservation. The actual merger must enforce the expected source SHA and protected
current base server-side. Unknown/unreadable protection always blocks.
"""
import argparse
import json
import re
import sys
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}\Z")


def evaluate(snapshot):
    errors = []
    pr = snapshot.get("pr", {})
    source, base = snapshot.get("expected_head"), snapshot.get("expected_base")
    if not isinstance(source, str) or not SHA.fullmatch(source):
        errors.append("invalid_expected_head")
    if not isinstance(base, str) or not SHA.fullmatch(base):
        errors.append("invalid_expected_base")
    if source == base:
        errors.append("empty_candidate")
    if pr.get("state") != "open" or pr.get("draft") is not False or pr.get("merged") is not False:
        errors.append("pr_not_ready")
    if pr.get("head", {}).get("sha") != source:
        errors.append("source_changed")
    if pr.get("base", {}).get("sha") != base or snapshot.get("current_base") != base:
        errors.append("base_changed")
    if pr.get("mergeable") is not True:
        errors.append("mergeability_unknown_or_conflict")
    protection = snapshot.get("protection")
    if not isinstance(protection, dict):
        errors.append("protection_unreadable")
        protection = {}
    if protection.get("enforce_admins", {}).get("enabled") is not True:
        errors.append("admin_bypass_not_excluded")
    review_policy = protection.get("required_pull_request_reviews") or {}
    if review_policy.get("required_approving_review_count", 0) < 1:
        errors.append("required_review_not_enforced")
    if review_policy.get("dismiss_stale_reviews") is not True:
        errors.append("stale_review_protection_missing")
    if review_policy.get("require_last_push_approval") is not True:
        errors.append("last_push_independent_approval_missing")
    if review_policy.get("bypass_pull_request_allowances", {}).get("users") or review_policy.get("bypass_pull_request_allowances", {}).get("teams") or review_policy.get("bypass_pull_request_allowances", {}).get("apps"):
        errors.append("review_bypass_allowance")
    status_policy = protection.get("required_status_checks") or {}
    if status_policy.get("strict") is not True:
        errors.append("current_base_checks_not_enforced")
    required = status_policy.get("checks") or []
    if not required or any(not c.get("context") or not isinstance(c.get("app_id"), int) or c["app_id"] <= 0 for c in required):
        errors.append("required_check_identity_missing")
    # Checks must belong to the current tested merge candidate, not an old green head.
    tested = snapshot.get("tested_merge") or {}
    if (tested.get("source") != source or tested.get("base") != base
            or tested.get("sha") != pr.get("merge_commit_sha")
            or tested.get("event") != "pull_request"
            or not isinstance(tested.get("run_id"), str) or not tested["run_id"].isdigit()
            or not isinstance(tested.get("sha"), str) or not SHA.fullmatch(tested["sha"])):
        errors.append("tested_source_base_missing")
    checks = snapshot.get("checks", [])
    for item in required:
        candidates = [c for c in checks if c.get("name") == item.get("context")
                      and c.get("app", {}).get("id") == item.get("app_id")
                      and c.get("head_sha") == source
                      and re.search(r"/actions/runs/" + re.escape(str(tested.get("run_id"))) + r"/", c.get("details_url", ""))]
        # Reject ambiguous duplicate contexts rather than pick a convenient green.
        if len(candidates) != 1 or candidates[0].get("status") != "completed" or candidates[0].get("conclusion") != "success":
            errors.append("required_check_not_success:" + str(item.get("context")))
    author = pr.get("user", {}).get("login")
    latest = {}
    for review in sorted(snapshot.get("reviews", []), key=lambda r: r.get("id", 0)):
        user = review.get("user", {}).get("login")
        # COMMENTED does not revoke a previous approval; DISMISSED does.
        if user and review.get("state") != "COMMENTED":
            latest[user] = review
    independent = snapshot.get("independent_reviewers", [])
    approvals = [r for user, r in latest.items() if user != author and user in independent
                 and r.get("state") == "APPROVED" and r.get("commit_id") == source]
    if any(r.get("state") == "CHANGES_REQUESTED" for r in latest.values()):
        errors.append("changes_requested")
    if len(approvals) < max(1, review_policy.get("required_approving_review_count", 0)):
        errors.append("exact_head_independent_review_missing")
    if snapshot.get("review_threads_complete") is not True or any(t.get("isResolved") is not True for t in snapshot.get("review_threads", [])):
        errors.append("review_threads_unresolved_or_unknown")
    if snapshot.get("server_expected_sha_supported") is not True:
        errors.append("atomic_expected_head_gate_missing")
    return {"decision": "BLOCKED" if errors else "PREFLIGHT_PASS", "reasons": sorted(set(errors)),
            "expected_head": source, "expected_base": base,
            "atomic_reservation": False, "dispatcher_fencing": "not_proven"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    try:
        result = evaluate(json.loads(args.snapshot.read_text()))
    except (ValueError, TypeError, KeyError, OSError):
        result = {"decision": "BLOCKED", "reasons": ["invalid_or_incomplete_snapshot"]}
    print(json.dumps(result, indent=2))
    return 0 if result["decision"] == "PREFLIGHT_PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
