#!/usr/bin/env python3
"""Validate a worker PR against its immutable claim and trusted BASE registry.

A passing result is an advisory CI guard, not restricted-credential fencing.
"""
import argparse
import fnmatch
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path, PurePosixPath

BRANCH = re.compile(r"medcom-work/g45/(lead|platform|commands|frontend|pilots|operations)/([A-Z][0-9]{2})-([0-9a-f-]{36})\Z")


def validate(branch, registry, claim, paths, ancestors):
    errors = []
    match = BRANCH.fullmatch(branch)
    if not match:
        return ["invalid_worker_branch"]
    role, ticket_id, run = match.groups()
    try:
        if str(uuid.UUID(run)) != run:
            errors.append("invalid_run_uuid")
    except ValueError:
        errors.append("invalid_run_uuid")
    tickets = [t for t in registry.get("tickets", []) if t.get("ticket_id") == ticket_id and t.get("role") == role]
    if len(tickets) != 1:
        return errors + ["ticket_missing_or_ambiguous"]
    ticket = tickets[0]
    if ticket.get("status") not in ("ready", "active"):
        errors.append("ticket_not_admitted")
    for key, expected in {"goal": 45, "ticket_id": ticket_id, "role": role,
                          "run_uuid": run, "generation": ticket.get("generation"),
                          "allowed_paths": ticket.get("allowed_paths")}.items():
        if claim.get(key) != expected:
            errors.append("claim_mismatch:" + key)
    expected_claim = f"medcom-claims/g45/{role}/{ticket_id}"
    if ticket.get("claim_branch") != expected_claim:
        errors.append("claim_branch_mismatch")
    if claim.get("base_sha") not in ancestors:
        errors.append("claim_base_not_ancestor")
    allowed = ticket.get("allowed_paths", [])
    for path in paths:
        parts = PurePosixPath(path).parts
        if not parts or path.startswith("/") or ".." in parts or "\\" in path:
            errors.append("unsafe_path")
        elif path.startswith("docs/execution/claims/"):
            errors.append("immutable_claim_in_product_diff")
        elif not any(fnmatch.fnmatchcase(path, pattern) for pattern in allowed):
            errors.append("out_of_scope:" + path)
    return sorted(set(errors))


def git(*args):
    return subprocess.check_output(["git", *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    args = parser.parse_args()
    match = BRANCH.fullmatch(args.branch)
    if not match:
        raise SystemExit("Invalid worker branch")
    role, ticket, _ = match.groups()
    registry = json.loads(git("show", args.base + ":docs/execution/production-tickets.json"))
    ref = f"refs/heads/medcom-claims/g45/{role}/{ticket}"
    # Do not create/update any remote ref. Fetch the exact immutable claim read-only.
    git("fetch", "--no-tags", "origin", ref)
    claim = json.loads(git("show", "FETCH_HEAD:docs/execution/claims/" + ticket + ".json"))
    # --no-renames exposes both deletion and addition, preventing path-rename bypass.
    paths = git("diff", "--name-only", "--no-renames", "-z", args.base + "..." + args.head).decode().split("\0")
    ancestors = git("rev-list", args.head).decode().splitlines()
    errors = validate(args.branch, registry, claim, [p for p in paths if p], ancestors)
    print(json.dumps({"scope": "FAIL" if errors else "PASS", "reasons": errors,
                      "credential_fencing": "not_proven"}, indent=2))
    return bool(errors)


if __name__ == "__main__":
    sys.exit(main())
