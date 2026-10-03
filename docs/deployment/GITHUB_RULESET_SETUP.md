# Medcom ruleset and CI setup

Owner request, 2026-10-03: create a missing importable ruleset and the necessary CI files.
This isolated CI change is authorized directly; it does not take ownership of a scheduled
claim or publish the accumulated product repair proposals.

## Files and checks

- `.github/policies/medcom-main-ruleset.json`: GitHub repository branch ruleset import.
- `.github/workflows/backend.yml`: existing Linux backend/analyzers, frontend contracts,
  types/build, source checks, package verification, HTTPS Chromium E2E and provenance.
  Push coverage now includes worker and direct CI branches; PR checks remain unfiltered.
- `.github/workflows/ci-policy.yml`: ruleset/job consistency, guard regressions and a
  Windows .NET source-free restore/build/test job.
- `.github/scripts/verify_ci_policy.py` and `.github/requirements-ci.txt`: policy parser.

The required GitHub Actions contexts are `backend`, `ci-policy`, `backend-windows`.
Both `main` and `medcom-schedule-activation-20261002` require an up-to-date tested base,
one approving review, approval of the most recent push by someone else and resolved
review conversations. Stale reviews are dismissed. Force pushes and deletion are
blocked, with no bypass actors. Worker and immutable claim branches are not targeted.
An approval must come from an eligible GitHub identity other than the PR author;
an assistant comment posted through the author's account is not an independent approval.

## Installation order

1. Review this CI change and observe all three new-head check contexts. It is stacked
   on PR #46 to preserve the existing integration/package tooling; it does not merge
   PR #44/#46 or any product proposal automatically.
2. Integrate the CI changes into the active integration branch through reviewed PRs.
   Require current head/base CI and preserve all existing review/operation gates.
3. In repository **Settings → Rules → Rulesets → New ruleset → Import a ruleset**,
   select `medcom-main-ruleset.json`. Confirm enforcement is **Active**, the two branch
   targets and all three required check contexts. The file alone does not activate policy.
4. Re-read the effective rules and branch protection before any protected merge.
   If a rule/check is missing, do not treat policy installation as successful.

Do not import before the workflow changes reach the integration branch: otherwise the
new required contexts will correctly block old PRs which do not contain those workflows.
The historical branch-protection REST payload is a different format and must not be
imported as a ruleset. An integration tool must inspect effective ruleset policy as well
as classic protection; a classic-protection-only snapshot is insufficient.

GitHub schema reference: https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset

CI uses hosted runners, locked .NET/npm dependencies and synthetic/source-free tests.
Private SQL/Tools.dll runtime tests are excluded from public CI. Windows CI does not
prove target-server ACL/reparse, power-loss durability, SQL acceptance or production
readiness. No production secrets, raw ERP binaries or database dumps are uploaded.
