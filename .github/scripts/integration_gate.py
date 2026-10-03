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
LOGIN = re.compile(r"(?=.{1,39}\Z)[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9]))*\Z")
EXPECTED_REPOSITORY = "thanhtuyen662002/Medcom"
MAX_SNAPSHOT_BYTES = 2 * 1024 ** 2
GITHUB_ACTIONS_JOB = re.compile(
    r"https://github\.com/([^/\s]+)/([^/\s]+)/actions/runs/([0-9]+)/job/[0-9]+(?:\?[^\s]*)?\Z"
)


def _mapping(value, errors):
    if isinstance(value, dict):
        return value
    errors.append("snapshot_structure_invalid")
    return {}


def _login(value):
    """Return GitHub's case-insensitive identity key or None for malformed input."""
    if not isinstance(value, str) or not LOGIN.fullmatch(value):
        return None
    return value.casefold()


def _actions_job_for_run(value, run_id, repository):
    if not isinstance(value, str):
        return False
    match = GITHUB_ACTIONS_JOB.fullmatch(value)
    if match is None or not isinstance(repository, str):
        return False
    url_repository = f"{match.group(1)}/{match.group(2)}"
    return (url_repository.casefold() == repository.casefold()
            and match.group(3) == run_id)


def _ruleset_protection(snapshot, errors):
    """Translate one fully read exact-ref repository ruleset, never install policy.

    The snapshot collector must fetch the complete ruleset list and each detail
    from GitHub immediately before evaluation. Unsupported composition, wildcard
    selection or reviewer semantics remain blocked rather than approximated.
    """
    evidence = snapshot.get("ruleset_evidence")
    pr = snapshot.get("pr", {})
    branch = pr.get("base", {}).get("ref") if isinstance(pr, dict) and isinstance(pr.get("base"), dict) else None
    def invalid():
        errors.append("ruleset_evidence_invalid")
        return {}
    if (not isinstance(evidence, dict) or evidence.get("complete") is not True
            or evidence.get("repository") != EXPECTED_REPOSITORY
            or evidence.get("ref") != "refs/heads/" + str(branch)):
        return invalid()
    entries = evidence.get("rulesets")
    if not isinstance(entries, list) or len(entries) != 1 or not isinstance(entries[0], dict):
        return invalid()
    entry = entries[0]
    if (type(entry.get("id")) is not int or entry["id"] <= 0
            or entry.get("source_type") != "Repository"
            or entry.get("source") != EXPECTED_REPOSITORY
            or entry.get("target") != "branch" or entry.get("enforcement") != "active"
            or entry.get("bypass_actors") != [] or entry.get("current_user_can_bypass") != "never"):
        return invalid()
    conditions = entry.get("conditions")
    refs = conditions.get("ref_name") if isinstance(conditions, dict) else None
    if (not isinstance(refs, dict) or refs.get("exclude") != []
            or not isinstance(refs.get("include"), list)
            or evidence["ref"] not in refs["include"]
            or any(not isinstance(ref, str) or not ref.startswith("refs/heads/")
                   or any(char in ref for char in "*?[]") for ref in refs["include"])):
        return invalid()
    rules = entry.get("rules")
    if (not isinstance(rules, list) or len(rules) != 4
            or any(not isinstance(rule, dict) or not isinstance(rule.get("type"), str) for rule in rules)):
        return invalid()
    by_type = {rule["type"]: rule for rule in rules}
    if set(by_type) != {"deletion", "non_fast_forward", "pull_request", "required_status_checks"}:
        return invalid()
    review = by_type["pull_request"].get("parameters")
    status = by_type["required_status_checks"].get("parameters")
    if (not isinstance(review, dict) or not isinstance(status, dict)
            or type(review.get("required_approving_review_count")) is not int
            or review["required_approving_review_count"] < 1
            or review.get("dismiss_stale_reviews_on_push") is not True
            or review.get("require_last_push_approval") is not True
            or review.get("required_review_thread_resolution") is not True
            or review.get("require_code_owner_review") is not False
            or review.get("required_reviewers", []) != []
            or status.get("strict_required_status_checks_policy") is not True
            or status.get("do_not_enforce_on_create") is not False):
        return invalid()
    checks = status.get("required_status_checks")
    if (not isinstance(checks, list) or not checks
            or any(not isinstance(check, dict) or not isinstance(check.get("context"), str)
                   or not check["context"] or check["context"] != check["context"].strip()
                   or type(check.get("integration_id")) is not int or check["integration_id"] <= 0
                   for check in checks)):
        return invalid()
    return {
        "enforce_admins": {"enabled": True},
        "allow_force_pushes": {"enabled": False}, "allow_deletions": {"enabled": False},
        "required_conversation_resolution": {"enabled": True},
        "required_pull_request_reviews": {
            "required_approving_review_count": review["required_approving_review_count"],
            "dismiss_stale_reviews": True, "require_last_push_approval": True},
        "required_status_checks": {"strict": True, "checks": [
            {"context": check["context"], "app_id": check["integration_id"]} for check in checks]},
    }


def evaluate(snapshot):
    errors = []
    if not isinstance(snapshot, dict):
        return {"decision": "BLOCKED", "reasons": ["snapshot_structure_invalid"],
                "expected_head": None, "expected_base": None,
                "atomic_reservation": False, "dispatcher_fencing": "not_proven"}
    pr = _mapping(snapshot.get("pr", {}), errors)
    pr_head = _mapping(pr.get("head", {}), errors)
    pr_head_repo = _mapping(pr_head.get("repo", {}), errors)
    pr_base = _mapping(pr.get("base", {}), errors)
    pr_base_repo = _mapping(pr_base.get("repo", {}), errors)
    repository = pr_base_repo.get("full_name")
    if (not isinstance(repository, str)
            or repository.casefold() != EXPECTED_REPOSITORY.casefold()):
        errors.append("repository_identity_missing")
    head_repository = pr_head_repo.get("full_name")
    if (not isinstance(head_repository, str)
            or head_repository.casefold() != EXPECTED_REPOSITORY.casefold()):
        errors.append("head_repository_mismatch")
    base_ref = pr_base.get("ref")
    if base_ref not in {"main", "medcom-schedule-activation-20261002"}:
        errors.append("base_branch_mismatch")
    elif (base_ref == "medcom-schedule-activation-20261002"
          and "ruleset_evidence" not in snapshot):
        # The integration branch is protected by the repository ruleset, not
        # by a separately fetched legacy branch-protection document.
        errors.append("integration_ref_policy_evidence_missing")
    source, base = snapshot.get("expected_head"), snapshot.get("expected_base")
    if not isinstance(source, str) or not SHA.fullmatch(source):
        errors.append("invalid_expected_head")
    if not isinstance(base, str) or not SHA.fullmatch(base):
        errors.append("invalid_expected_base")
    if source == base:
        errors.append("empty_candidate")
    if pr.get("state") != "open" or pr.get("draft") is not False or pr.get("merged") is not False:
        errors.append("pr_not_ready")
    if pr_head.get("sha") != source:
        errors.append("source_changed")
    if pr_base.get("sha") != base or snapshot.get("current_base") != base:
        errors.append("base_changed")
    if pr.get("mergeable") is not True:
        errors.append("mergeability_unknown_or_conflict")
    protection_value = snapshot.get("protection")
    if "ruleset_evidence" in snapshot:
        if protection_value is not None:
            errors.append("multiple_policy_sources_unsupported")
        protection_value = _ruleset_protection(snapshot, errors)
    if not isinstance(protection_value, dict):
        errors.append("protection_unreadable")
    protection = _mapping(protection_value, errors)
    enforce_admins = _mapping(protection.get("enforce_admins", {}), errors)
    force_pushes = _mapping(protection.get("allow_force_pushes", {}), errors)
    deletions = _mapping(protection.get("allow_deletions", {}), errors)
    conversation = _mapping(protection.get("required_conversation_resolution", {}), errors)
    if enforce_admins.get("enabled") is not True:
        errors.append("admin_bypass_not_excluded")
    if force_pushes.get("enabled") is not False:
        errors.append("force_push_denial_missing")
    if deletions.get("enabled") is not False:
        errors.append("branch_deletion_denial_missing")
    if conversation.get("enabled") is not True:
        errors.append("conversation_resolution_not_enforced")
    review_policy = protection.get("required_pull_request_reviews") or {}
    if not isinstance(review_policy, dict):
        errors.append("review_policy_unreadable")
        review_policy = {}
    required_approvals = review_policy.get("required_approving_review_count", 0)
    if type(required_approvals) is not int:
        errors.append("required_review_policy_invalid")
        required_approvals = 1
    elif required_approvals < 1:
        errors.append("required_review_not_enforced")
    if review_policy.get("dismiss_stale_reviews") is not True:
        errors.append("stale_review_protection_missing")
    if review_policy.get("require_last_push_approval") is not True:
        errors.append("last_push_independent_approval_missing")
    allowances = review_policy.get("bypass_pull_request_allowances", {})
    if not isinstance(allowances, dict):
        errors.append("review_policy_unreadable")
        allowances = {}
    for key in ("users", "teams", "apps"):
        value = allowances.get(key, [])
        if not isinstance(value, list):
            errors.append("review_policy_unreadable")
        elif value:
            errors.append("review_bypass_allowance")
    status_policy = _mapping(protection.get("required_status_checks") or {}, errors)
    if status_policy.get("strict") is not True:
        errors.append("current_base_checks_not_enforced")
    required = status_policy.get("checks") or []
    if not isinstance(required, list):
        required = []
    if not required or any(not isinstance(c, dict)
                           or not isinstance(c.get("context"), str)
                           or not c["context"] or c["context"] != c["context"].strip()
                           or type(c.get("app_id")) is not int or c["app_id"] <= 0
                           for c in required):
        errors.append("required_check_identity_missing")
        required = [c for c in required if isinstance(c, dict)
                    and isinstance(c.get("context"), str) and c["context"]
                    and c["context"] == c["context"].strip()
                    and type(c.get("app_id")) is int and c["app_id"] > 0]
    identities = [(c.get("context"), c.get("app_id")) for c in required]
    if len(identities) != len(set(identities)):
        errors.append("required_check_identity_missing")
    # Checks must belong to the current tested merge candidate, not an old green head.
    tested = _mapping(snapshot.get("tested_merge") or {}, errors)
    if (type(tested.get("format")) is not int or tested.get("format") != 1
            or not isinstance(tested.get("repository"), str)
            or not isinstance(repository, str)
            or tested.get("repository", "").casefold() != repository.casefold()
            or tested.get("production_accepted") is not False):
        errors.append("tested_receipt_invalid")
    if (tested.get("source") != source or tested.get("base") != base
            or tested.get("sha") != pr.get("merge_commit_sha")
            or tested.get("event") != "pull_request"
            or not isinstance(tested.get("run_id"), str) or not tested["run_id"].isdigit()
            or not isinstance(tested.get("sha"), str) or not SHA.fullmatch(tested["sha"])):
        errors.append("tested_source_base_missing")

    # GitHub attaches pull-request check runs to the source SHA even when the
    # workflow checks out and tests the virtual merge.  Bind each distinct run
    # to an explicit receipt for the exact source/base/checkout tuple.  Retain
    # the single-run legacy shape only for checks attached to the tested merge.
    explicit_workflow_receipts = "tested_workflow_runs" in snapshot
    raw_workflow_receipts = snapshot.get("tested_workflow_runs")
    if explicit_workflow_receipts:
        workflow_receipts = raw_workflow_receipts if isinstance(raw_workflow_receipts, list) else []
        if not isinstance(raw_workflow_receipts, list) or not workflow_receipts:
            errors.append("tested_workflow_receipts_invalid")
    else:
        workflow_receipts = [tested]
    valid_workflow_receipts = []
    for receipt in workflow_receipts:
        if (not isinstance(receipt, dict)
                or type(receipt.get("format")) is not int or receipt.get("format") != 1
                or not isinstance(receipt.get("repository"), str)
                or not isinstance(repository, str)
                or receipt.get("repository", "").casefold() != repository.casefold()
                or receipt.get("source") != source or receipt.get("base") != base
                or receipt.get("sha") != pr.get("merge_commit_sha")
                or receipt.get("event") != "pull_request"
                or receipt.get("production_accepted") is not False
                or not isinstance(receipt.get("run_id"), str)
                or not receipt.get("run_id", "").isdigit()):
            if explicit_workflow_receipts:
                errors.append("tested_workflow_receipts_invalid")
            continue
        valid_workflow_receipts.append(receipt)
    workflow_run_ids = [receipt["run_id"] for receipt in valid_workflow_receipts]
    if (explicit_workflow_receipts
            and (len(valid_workflow_receipts) != len(workflow_receipts)
                 or len(workflow_run_ids) != len(set(workflow_run_ids)))):
        errors.append("tested_workflow_receipts_invalid")
    checks = snapshot.get("checks", [])
    if not isinstance(checks, list) or any(not isinstance(c, dict) for c in checks):
        errors.append("checks_unreadable")
        checks = []
    normalized_checks = []
    for check in checks:
        app = check.get("app", {})
        if (not isinstance(app, dict) or type(app.get("id")) is not int
                or app["id"] <= 0):
            errors.append("snapshot_structure_invalid")
            continue
        normalized_checks.append(check)
    checks = normalized_checks
    used_workflow_runs = set()
    for item in required:
        candidates = [c for c in checks if c.get("name") == item.get("context")
                      and c.get("app", {}).get("id") == item.get("app_id")
                      and c.get("head_sha") == (source if explicit_workflow_receipts
                                                else tested.get("sha"))
                      and any(_actions_job_for_run(
                          c.get("details_url"), receipt.get("run_id"), repository)
                              for receipt in valid_workflow_receipts)]
        # Reject ambiguous duplicate contexts rather than pick a convenient green.
        if len(candidates) != 1 or candidates[0].get("status") != "completed" or candidates[0].get("conclusion") != "success":
            errors.append("required_check_not_success:" + str(item.get("context")))
        elif explicit_workflow_receipts:
            used_workflow_runs.update(
                receipt["run_id"] for receipt in valid_workflow_receipts
                if _actions_job_for_run(candidates[0].get("details_url"), receipt["run_id"], repository)
            )
    if explicit_workflow_receipts and set(workflow_run_ids) != used_workflow_runs:
        errors.append("tested_workflow_receipts_invalid")
    pr_user = _mapping(pr.get("user", {}), errors)
    author = _login(pr_user.get("login"))
    if author is None:
        errors.append("pr_author_identity_missing")
    independent_raw = snapshot.get("independent_reviewers", [])
    independent = (
        [_login(user) for user in independent_raw]
        if isinstance(independent_raw, list) else []
    )
    if (not isinstance(independent_raw, list)
            or any(user is None for user in independent)
            or len(independent) != len(set(independent))
            or author in independent):
        errors.append("independent_reviewer_set_invalid")
        independent = []
    reviews = snapshot.get("reviews", [])
    if not isinstance(reviews, list) or any(not isinstance(r, dict) for r in reviews):
        errors.append("reviews_unreadable")
        reviews = []
    review_ids = [r.get("id") for r in reviews]
    if (any(type(review_id) is not int or review_id <= 0 for review_id in review_ids)
            or len(review_ids) != len(set(review_ids))):
        errors.append("reviews_unreadable")
        reviews = []
    latest = {}
    for review in sorted(reviews, key=lambda r: r.get("id", 0)):
        review_user = review.get("user", {})
        if not isinstance(review_user, dict):
            errors.append("snapshot_structure_invalid")
            errors.append("reviews_unreadable")
            continue
        user = _login(review_user.get("login"))
        if user is None or not isinstance(review.get("state"), str):
            errors.append("reviews_unreadable")
            continue
        # COMMENTED does not revoke a previous approval; DISMISSED does.
        if user and review.get("state") != "COMMENTED":
            latest[user] = review
    approvals = [r for user, r in latest.items() if user != author and user in independent
                 and r.get("state") == "APPROVED" and r.get("commit_id") == source]
    if any(r.get("state") == "CHANGES_REQUESTED" for r in latest.values()):
        errors.append("changes_requested")
    if len(approvals) < max(1, required_approvals):
        errors.append("exact_head_independent_review_missing")
    review_threads = snapshot.get("review_threads", [])
    if not isinstance(review_threads, list) or any(not isinstance(t, dict) for t in review_threads):
        review_threads = []
        errors.append("review_threads_unresolved_or_unknown")
    if snapshot.get("review_threads_complete") is not True or any(t.get("isResolved") is not True for t in review_threads):
        errors.append("review_threads_unresolved_or_unknown")
    if snapshot.get("server_expected_sha_supported") is not True:
        errors.append("atomic_expected_head_gate_missing")
    return {"decision": "BLOCKED" if errors else "PREFLIGHT_PASS", "reasons": sorted(set(errors)),
            "expected_head": source, "expected_base": base,
            "atomic_reservation": False, "dispatcher_fencing": "not_proven"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.snapshot.stat().st_size > MAX_SNAPSHOT_BYTES:
            raise ValueError("snapshot_too_large")
        result = evaluate(json.loads(args.snapshot.read_text()))
    except (ValueError, TypeError, KeyError, OSError):
        result = {"decision": "BLOCKED", "reasons": ["invalid_or_incomplete_snapshot"]}
    print(json.dumps(result, indent=2))
    return 0 if result["decision"] == "PREFLIGHT_PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
