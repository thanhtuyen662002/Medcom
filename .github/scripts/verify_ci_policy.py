#!/usr/bin/env python3
"""Check the importable ruleset against mandatory CI jobs, without changing GitHub."""
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def main():
    policy = json.loads((ROOT / '.github/policies/medcom-main-ruleset.json').read_text())
    if (policy.get('target') != 'branch' or policy.get('enforcement') != 'active'
            or policy.get('bypass_actors') != []):
        raise SystemExit('Ruleset must protect branches without bypass actors')
    refs = policy['conditions']['ref_name']
    if (set(refs['include']) != {'refs/heads/main', 'refs/heads/medcom-schedule-activation-20261002'}
            or refs['exclude'] != []):
        raise SystemExit('Unexpected protected branches')
    rules = {rule['type']: rule for rule in policy['rules']}
    if len(rules) != len(policy['rules']) or set(rules) != {
            'deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'}:
        raise SystemExit('Missing, duplicate or unexpected rules')
    reviews = rules['pull_request']['parameters']
    if (type(reviews.get('required_approving_review_count')) is not int
            or reviews['required_approving_review_count'] != 0
            or any(reviews.get(key) is not False for key in (
                'dismiss_stale_reviews_on_push', 'require_last_push_approval',
                'require_code_owner_review', 'require_extra_approval_for_unattributed_changes'))
            or reviews.get('required_reviewers') != []
            or reviews.get('required_review_thread_resolution') is not True):
        raise SystemExit('Owner sole-executor policy requires zero approvals and resolved conversations')
    checks = rules['required_status_checks']['parameters']
    contexts = [check['context'] for check in checks['required_status_checks']]
    if (set(contexts) != {'backend', 'ci-policy', 'backend-windows'} or len(contexts) != 3
            or checks['strict_required_status_checks_policy'] is not True
            or checks['do_not_enforce_on_create'] is not False
            or any(check.get('integration_id') != 15368 for check in checks['required_status_checks'])):
        raise SystemExit('Required checks must bind to GitHub Actions and current base')
    observed = []
    for path in sorted((ROOT / '.github/workflows').glob('*.yml')):
        workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
        required = [(key, job) for key, job in workflow['jobs'].items()
                    if job.get('name', key) in contexts]
        if not required:
            continue
        events = workflow['on']
        if not {'push', 'pull_request', 'workflow_dispatch'} <= set(events):
            raise SystemExit(f'{path.name}: missing required CI trigger')
        for event in ('push', 'pull_request'):
            trigger = events[event]
            if isinstance(trigger, dict) and any(key in trigger for key in (
                    'paths', 'paths-ignore', 'branches-ignore')):
                raise SystemExit(f'{path.name}: required checks must not be path-filtered')
        if workflow.get('permissions') != {'contents': 'read'}:
            raise SystemExit(f'{path.name}: use read-only workflow permissions')
        for key, job in required:
            if 'if' in job or 'continue-on-error' in job:
                raise SystemExit(f'{path.name}: required jobs must run and fail honestly')
            observed.append(job.get('name', key))
    if sorted(observed) != sorted(contexts):
        raise SystemExit('Ruleset contexts do not match unique unconditional CI jobs')
    print('Ruleset/CI policy PASS: backend, ci-policy, backend-windows; no server policy changed.')


if __name__ == '__main__':
    main()
