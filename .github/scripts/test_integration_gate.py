import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from integration_gate import evaluate, main

HEAD, BASE, MERGE = 'a' * 40, 'b' * 40, 'c' * 40


def candidate():
    return {
        'expected_head': HEAD, 'expected_base': BASE, 'current_base': BASE,
        'pr': {'state': 'open', 'draft': False, 'merged': False, 'mergeable': True,
               'head': {'sha': HEAD, 'repo': {'full_name': 'thanhtuyen662002/Medcom'}},
               'base': {'sha': BASE, 'ref': 'main',
                        'repo': {'full_name': 'thanhtuyen662002/Medcom'}},
               'merge_commit_sha': MERGE,
               'user': {'login': 'author'}},
        'protection': {'enforce_admins': {'enabled': True},
                       'allow_force_pushes': {'enabled': False},
                       'allow_deletions': {'enabled': False},
                       'required_conversation_resolution': {'enabled': True},
                       'required_pull_request_reviews': {
                           'required_approving_review_count': 1, 'dismiss_stale_reviews': True,
                           'require_last_push_approval': True},
                       'required_status_checks': {'strict': True, 'checks': [{'context': 'backend', 'app_id': 15368}]}},
        'tested_merge': {'format': 1, 'repository': 'thanhtuyen662002/Medcom',
                         'source': HEAD, 'base': BASE, 'sha': MERGE,
                         'run_id': '1234', 'event': 'pull_request',
                         'production_accepted': False},
        'checks': [{'name': 'backend', 'app': {'id': 15368}, 'head_sha': MERGE,
                    'details_url': 'https://github.com/thanhtuyen662002/Medcom/actions/runs/1234/job/12',
                    'status': 'completed', 'conclusion': 'success'}],
        'reviews': [{'id': 1, 'user': {'login': 'qa'}, 'state': 'APPROVED', 'commit_id': HEAD}],
        'independent_reviewers': ['qa'], 'review_threads_complete': True,
        'review_threads': [], 'server_expected_sha_supported': True,
    }


def ruleset_candidate():
    snapshot = candidate()
    snapshot['protection'] = None
    snapshot['ruleset_evidence'] = {
        'repository': 'thanhtuyen662002/Medcom',
        'ref': 'refs/heads/main', 'complete': True,
        'rulesets': [{
            'id': 24407230, 'source_type': 'Repository',
            'source': 'thanhtuyen662002/Medcom', 'target': 'branch',
            'enforcement': 'active', 'bypass_actors': [],
            'current_user_can_bypass': 'never',
            'conditions': {'ref_name': {'include': ['refs/heads/main'], 'exclude': []}},
            'rules': [
                {'type': 'deletion'}, {'type': 'non_fast_forward'},
                {'type': 'pull_request', 'parameters': {
                    'required_approving_review_count': 1,
                    'dismiss_stale_reviews_on_push': True,
                    'require_last_push_approval': True,
                    'require_code_owner_review': False,
                    'required_review_thread_resolution': True}},
                {'type': 'required_status_checks', 'parameters': {
                    'strict_required_status_checks_policy': True,
                    'do_not_enforce_on_create': False,
                    'required_status_checks': [{'context': 'backend', 'integration_id': 15368}]}}
            ]
        }]
    }
    return snapshot


class IntegrationGateTests(unittest.TestCase):
    def sole_executor_candidate(self):
        s = ruleset_candidate()
        s['pr']['user']['login'] = 'thanhtuyen662002'
        review = s['ruleset_evidence']['rulesets'][0]['rules'][2]['parameters']
        review.update(required_approving_review_count=0,
                      dismiss_stale_reviews_on_push=False,
                      require_last_push_approval=False)
        s['reviews'] = []
        s['independent_reviewers'] = []
        return s

    def test_owner_sole_executor_policy_needs_no_fabricated_review(self):
        self.assertEqual('PREFLIGHT_PASS', evaluate(self.sole_executor_candidate())['decision'])

    def test_zero_approval_requires_exact_live_ruleset_and_owner(self):
        s = self.sole_executor_candidate()
        s['pr']['user']['login'] = 'other'
        self.assert_blocked(s, 'sole_executor_policy_invalid')
        s = candidate()
        s['protection']['required_pull_request_reviews'].update(
            required_approving_review_count=0, dismiss_stale_reviews=False,
            require_last_push_approval=False, require_code_owner_reviews=False)
        s['pr']['user']['login'] = 'thanhtuyen662002'
        self.assert_blocked(s, 'sole_executor_policy_invalid')

    def test_sole_executor_still_requires_ci_base_threads_and_custody(self):
        for field, value, reason in [
            ('current_base', HEAD, 'base_changed'),
            ('checks', [], 'required_check_not_success:backend'),
            ('review_threads', [{'isResolved': False}], 'review_threads_unresolved_or_unknown')
        ]:
            s = self.sole_executor_candidate(); s[field] = value
            self.assert_blocked(s, reason)
        s = self.sole_executor_candidate()
        s['reviews'] = [{'id': 3, 'user': {'login': 'qa'},
                         'state': 'CHANGES_REQUESTED', 'commit_id': HEAD}]
        self.assert_blocked(s, 'changes_requested')

    def assert_blocked(self, snapshot, reason):
        result = evaluate(snapshot)
        self.assertEqual('BLOCKED', result['decision'])
        self.assertIn(reason, result['reasons'])

    def test_distinct_workflow_runs_require_each_exact_checkout_receipt(self):
        s = candidate()
        s['tested_workflow_runs'] = [copy.deepcopy(s['tested_merge']), copy.deepcopy(s['tested_merge'])]
        s['tested_workflow_runs'][1]['run_id'] = '5678'
        s['checks'][0]['head_sha'] = HEAD
        for name, job_id in (('backend-windows', 13), ('ci-policy', 14)):
            s['protection']['required_status_checks']['checks'].append({'context': name, 'app_id': 15368})
            s['checks'].append({'name': name, 'app': {'id': 15368}, 'head_sha': HEAD,
                'details_url': f'https://github.com/thanhtuyen662002/Medcom/actions/runs/5678/job/{job_id}',
                'status': 'completed', 'conclusion': 'success'})
        self.assertEqual('PREFLIGHT_PASS', evaluate(s)['decision'])
        for key, value in (('base', 'd' * 40), ('source', 'd' * 40),
                           ('sha', 'd' * 40), ('event', 'push'), ('production_accepted', True)):
            with self.subTest(key=key):
                changed = copy.deepcopy(s); changed['tested_workflow_runs'][1][key] = value
                self.assert_blocked(changed, 'tested_workflow_receipts_invalid')
        changed = copy.deepcopy(s); changed['tested_workflow_runs'].pop()
        self.assert_blocked(changed, 'required_check_not_success:backend-windows')
        changed = copy.deepcopy(s); changed['tested_workflow_runs'].append(copy.deepcopy(changed['tested_workflow_runs'][0]))
        self.assert_blocked(changed, 'tested_workflow_receipts_invalid')
        for value in (None, {}, [True], []):
            changed = copy.deepcopy(s); changed['tested_workflow_runs'] = value
            self.assert_blocked(changed, 'tested_workflow_receipts_invalid')
        changed = copy.deepcopy(s); changed['checks'][1]['head_sha'] = MERGE
        self.assert_blocked(changed, 'required_check_not_success:backend-windows')

    def test_only_exact_protected_medcom_integration_ref_is_admitted(self):
        s = ruleset_candidate()
        s['pr']['base']['ref'] = 'medcom-schedule-activation-20261002'
        s['ruleset_evidence']['ref'] = 'refs/heads/medcom-schedule-activation-20261002'
        s['ruleset_evidence']['rulesets'][0]['conditions']['ref_name']['include'] = [s['ruleset_evidence']['ref']]
        self.assertEqual('PREFLIGHT_PASS', evaluate(s)['decision'])
        changed = copy.deepcopy(s); changed.pop('ruleset_evidence'); changed['protection'] = candidate()['protection']
        self.assert_blocked(changed, 'integration_ref_policy_evidence_missing')
        changed = copy.deepcopy(s); changed['ruleset_evidence']['ref'] = 'refs/heads/main'
        self.assert_blocked(changed, 'ruleset_evidence_invalid')
        changed = copy.deepcopy(s); changed['pr']['base']['ref'] = 'integration-shadow'
        changed['ruleset_evidence']['ref'] = 'refs/heads/integration-shadow'
        changed['ruleset_evidence']['rulesets'][0]['conditions']['ref_name']['include'] = [changed['ruleset_evidence']['ref']]
        self.assert_blocked(changed, 'base_branch_mismatch')

    def test_active_exact_branch_ruleset_can_supply_policy_evidence(self):
        result = evaluate(ruleset_candidate())
        self.assertEqual('PREFLIGHT_PASS', result['decision'])
        self.assertFalse(result['atomic_reservation'])
        self.assertEqual('not_proven', result['dispatcher_fencing'])

    def test_ruleset_evidence_requires_complete_exact_repository_and_ref(self):
        for key, value in (('complete', False), ('repository', 'attacker/other'),
                           ('ref', 'refs/heads/shadow')):
            with self.subTest(key=key):
                s = ruleset_candidate(); s['ruleset_evidence'][key] = value
                self.assert_blocked(s, 'ruleset_evidence_invalid')
        for key, value in (('source', 'attacker/other'), ('source_type', 'Organization'),
                           ('target', 'tag'), ('enforcement', 'evaluate'), ('id', True)):
            with self.subTest(key=key):
                s = ruleset_candidate(); s['ruleset_evidence']['rulesets'][0][key] = value
                self.assert_blocked(s, 'ruleset_evidence_invalid')
        for include, exclude in ((['refs/heads/*'], []), (['refs/heads/main'], ['refs/heads/main'])):
            s = ruleset_candidate()
            s['ruleset_evidence']['rulesets'][0]['conditions']['ref_name'] = {
                'include': include, 'exclude': exclude}
            self.assert_blocked(s, 'ruleset_evidence_invalid')

    def test_ruleset_bypass_and_partial_multiple_policy_evidence_block(self):
        for key, value in (('bypass_actors', [{'actor_id': 1, 'bypass_mode': 'always'}]),
                           ('current_user_can_bypass', 'always'), ('bypass_actors', None)):
            with self.subTest(key=key):
                s = ruleset_candidate(); s['ruleset_evidence']['rulesets'][0][key] = value
                self.assert_blocked(s, 'ruleset_evidence_invalid')
        for rulesets in ([], [None], [ruleset_candidate()['ruleset_evidence']['rulesets'][0]] * 2):
            s = ruleset_candidate(); s['ruleset_evidence']['rulesets'] = rulesets
            self.assert_blocked(s, 'ruleset_evidence_invalid')
        s = ruleset_candidate(); s['protection'] = candidate()['protection']
        self.assert_blocked(s, 'multiple_policy_sources_unsupported')

    def test_ruleset_translation_preserves_review_and_check_requirements(self):
        s = ruleset_candidate()
        s['ruleset_evidence']['rulesets'][0]['rules'][2]['parameters']['required_approving_review_count'] = 2
        self.assert_blocked(s, 'exact_head_independent_review_missing')
        s = ruleset_candidate()
        s['ruleset_evidence']['rulesets'][0]['rules'][3]['parameters']['required_status_checks'].append(
            {'context': 'backend-windows', 'integration_id': 15368})
        self.assert_blocked(s, 'required_check_not_success:backend-windows')
        s = ruleset_candidate(); s['reviews'] = []
        self.assert_blocked(s, 'exact_head_independent_review_missing')
        s = ruleset_candidate(); s['checks'][0]['head_sha'] = HEAD
        self.assert_blocked(s, 'required_check_not_success:backend')

    def test_weakened_or_unsupported_ruleset_parameters_fail_closed(self):
        for rule_index, key, value in (
            (2, 'required_approving_review_count', True),
            (2, 'required_approving_review_count', 0),
            (2, 'dismiss_stale_reviews_on_push', False),
            (2, 'require_last_push_approval', False),
            (2, 'required_review_thread_resolution', False),
            (2, 'require_code_owner_review', True),
            (2, 'required_reviewers', [{'team_id': 1}]),
            (3, 'strict_required_status_checks_policy', False),
            (3, 'do_not_enforce_on_create', True),
            (3, 'required_status_checks', [{'context': 'backend', 'integration_id': True}]),
            (3, 'required_status_checks', [{'context': 'backend', 'integration_id': None}]),
        ):
            with self.subTest(key=key, value=value):
                s = ruleset_candidate()
                s['ruleset_evidence']['rulesets'][0]['rules'][rule_index]['parameters'][key] = value
                self.assert_blocked(s, 'ruleset_evidence_invalid')
        for rules in ([{'type': 'deletion'}], [{'type': 'deletion'}] * 2, [True]):
            s = ruleset_candidate(); s['ruleset_evidence']['rulesets'][0]['rules'] = rules
            self.assert_blocked(s, 'ruleset_evidence_invalid')

    def test_complete_fixture_is_only_preflight(self):
        result = evaluate(candidate())
        self.assertEqual('PREFLIGHT_PASS', result['decision'])
        self.assertFalse(result['atomic_reservation'])
        self.assertEqual('not_proven', result['dispatcher_fencing'])

    def test_unreadable_protection(self):
        s = candidate(); s['protection'] = None
        self.assert_blocked(s, 'protection_unreadable')

    def test_head_and_base_drift(self):
        for key, reason in [('head', 'source_changed'), ('base', 'base_changed')]:
            s = candidate(); s['pr'][key]['sha'] = 'd' * 40
            self.assert_blocked(s, reason)
        s = candidate(); s['current_base'] = 'd' * 40
        self.assert_blocked(s, 'base_changed')

    def test_old_green_source_does_not_prove_current_merge(self):
        s = candidate(); s['checks'][0]['head_sha'] = HEAD
        self.assert_blocked(s, 'required_check_not_success:backend')

    def test_required_check_is_bound_to_tested_merge_not_source_head(self):
        s = candidate()
        self.assertEqual('PREFLIGHT_PASS', evaluate(s)['decision'])
        s['checks'][0]['head_sha'] = HEAD
        self.assert_blocked(s, 'required_check_not_success:backend')

    def test_check_job_url_is_bound_to_medcom_repository(self):
        s = candidate()
        s['checks'][0]['details_url'] = (
            'https://github.com/attacker/other/actions/runs/1234/job/12'
        )
        self.assert_blocked(s, 'required_check_not_success:backend')
        s = candidate(); s['pr']['base']['repo']['full_name'] = 'attacker/other'
        self.assert_blocked(s, 'repository_identity_missing')

    def test_pr_head_repository_and_base_branch_are_pinned(self):
        s = candidate(); s['pr']['head']['repo']['full_name'] = 'attacker/Medcom'
        self.assert_blocked(s, 'head_repository_mismatch')
        s = candidate(); s['pr']['base']['ref'] = 'integration-shadow'
        self.assert_blocked(s, 'base_branch_mismatch')

    def test_pending_failed_skipped_neutral_checks(self):
        for conclusion in [None, 'failure', 'skipped', 'neutral', 'cancelled']:
            s = candidate(); s['checks'][0]['conclusion'] = conclusion
            self.assert_blocked(s, 'required_check_not_success:backend')
        s = candidate(); s['checks'][0]['status'] = 'in_progress'
        self.assert_blocked(s, 'required_check_not_success:backend')

    def test_forged_or_duplicate_check_context(self):
        s = candidate(); s['checks'][0]['app']['id'] = 10
        self.assert_blocked(s, 'required_check_not_success:backend')
        s = candidate(); s['checks'].append(copy.deepcopy(s['checks'][0]))
        self.assert_blocked(s, 'required_check_not_success:backend')

    def test_empty_unpinned_required_checks(self):
        for checks in [[], [{'context': 'backend', 'app_id': -1}], [{'context': 'backend'}]]:
            s = candidate(); s['protection']['required_status_checks']['checks'] = checks
            self.assert_blocked(s, 'required_check_identity_missing')

    def test_duplicate_required_check_identity_is_not_counted_twice(self):
        s = candidate()
        required = s['protection']['required_status_checks']['checks']
        required.append(copy.deepcopy(required[0]))
        self.assert_blocked(s, 'required_check_identity_missing')

    def test_boolean_policy_counts_and_app_ids_do_not_pass_as_integers(self):
        s = candidate()
        policy = s['protection']['required_pull_request_reviews']
        policy['required_approving_review_count'] = True
        s['protection']['required_status_checks']['checks'][0]['app_id'] = True
        s['checks'][0]['app']['id'] = True
        self.assert_blocked(s, 'required_review_policy_invalid')
        self.assert_blocked(s, 'required_check_identity_missing')

    def test_old_review_author_review_or_not_independent(self):
        for field, value in [('commit_id', BASE), ('user', {'login': 'author'})]:
            s = candidate(); s['reviews'][0][field] = value
            self.assert_blocked(s, 'exact_head_independent_review_missing')
        s = candidate(); s['independent_reviewers'] = []
        self.assert_blocked(s, 'exact_head_independent_review_missing')

    def test_incomplete_author_or_reviewer_identity_blocks(self):
        s = candidate(); s['pr']['user'] = {}
        self.assert_blocked(s, 'pr_author_identity_missing')
        s = candidate(); s['independent_reviewers'] = 'qa'
        self.assert_blocked(s, 'independent_reviewer_set_invalid')
        s = candidate(); s['independent_reviewers'] = ['qa', 'qa']
        self.assert_blocked(s, 'independent_reviewer_set_invalid')

    def test_login_identity_is_case_insensitive_and_cannot_self_review(self):
        s = candidate()
        s['pr']['user']['login'] = 'Author'
        s['reviews'][0]['user']['login'] = 'author'
        s['independent_reviewers'] = ['author']
        self.assert_blocked(s, 'independent_reviewer_set_invalid')
        self.assert_blocked(s, 'exact_head_independent_review_missing')

    def test_case_variants_cannot_count_as_two_independent_reviewers(self):
        s = candidate()
        s['protection']['required_pull_request_reviews']['required_approving_review_count'] = 2
        s['independent_reviewers'] = ['qa', 'QA']
        s['reviews'].append({
            'id': 2, 'user': {'login': 'QA'}, 'state': 'APPROVED', 'commit_id': HEAD
        })
        self.assert_blocked(s, 'independent_reviewer_set_invalid')
        self.assert_blocked(s, 'exact_head_independent_review_missing')

    def test_noncanonical_github_logins_cannot_supply_review_identity(self):
        for login in ('qa@evil', '-qa', 'qa-', 'qa--reviewer', 'qa\u200breviewer'):
            with self.subTest(login=repr(login)):
                s = candidate()
                s['independent_reviewers'] = [login]
                s['reviews'][0]['user']['login'] = login
                self.assert_blocked(s, 'independent_reviewer_set_invalid')

    def test_review_dismissal_and_changes_requested(self):
        for state in ['DISMISSED', 'CHANGES_REQUESTED']:
            s = candidate(); s['reviews'].append({'id': 2, 'user': {'login': 'qa'}, 'state': state, 'commit_id': HEAD})
            self.assert_blocked(s, 'exact_head_independent_review_missing')
        s = candidate(); s['reviews'].append({'id': 3, 'user': {'login': 'other'}, 'state': 'CHANGES_REQUESTED', 'commit_id': HEAD})
        self.assert_blocked(s, 'changes_requested')

    def test_comment_does_not_dismiss_approval(self):
        s = candidate(); s['reviews'].append({'id': 2, 'user': {'login': 'qa'}, 'state': 'COMMENTED', 'commit_id': HEAD})
        self.assertEqual('PREFLIGHT_PASS', evaluate(s)['decision'])

    def test_threads_missing_unresolved_or_unknown(self):
        for complete, threads in [(False, []), (True, [{'isResolved': False}]), (True, [{}])]:
            s = candidate(); s.update(review_threads_complete=complete, review_threads=threads)
            self.assert_blocked(s, 'review_threads_unresolved_or_unknown')

    def test_no_atomic_expected_sha_support(self):
        s = candidate(); s['server_expected_sha_supported'] = False
        self.assert_blocked(s, 'atomic_expected_head_gate_missing')

    def test_force_delete_and_conversation_policy_fail_closed(self):
        for key, enabled, reason in [
            ('allow_force_pushes', True, 'force_push_denial_missing'),
            ('allow_deletions', True, 'branch_deletion_denial_missing'),
            ('required_conversation_resolution', False, 'conversation_resolution_not_enforced'),
        ]:
            for value in [{'enabled': enabled}, {}]:
                s = candidate(); s['protection'][key] = value
                self.assert_blocked(s, reason)
            s = candidate(); del s['protection'][key]
            self.assert_blocked(s, reason)

    def test_tested_pair_must_match(self):
        for key in ['source', 'base', 'sha', 'run_id', 'event']:
            s = candidate(); s['tested_merge'][key] = 'd' * 40
            self.assert_blocked(s, 'tested_source_base_missing')

    def test_tested_receipt_schema_repository_and_release_flag_are_pinned(self):
        for key, value in (
            ('format', 2),
            ('repository', 'attacker/other'),
            ('production_accepted', True),
        ):
            with self.subTest(key=key):
                s = candidate(); s['tested_merge'][key] = value
                self.assert_blocked(s, 'tested_receipt_invalid')

    def test_not_ready_empty_invalid_candidates(self):
        for key, value in [('draft', True), ('state', 'closed'), ('merged', True)]:
            s = candidate(); s['pr'][key] = value
            self.assert_blocked(s, 'pr_not_ready')
        s = candidate(); s['expected_head'] = BASE
        self.assert_blocked(s, 'empty_candidate')
        s = candidate(); s['expected_head'] = 'main'
        self.assert_blocked(s, 'invalid_expected_head')

    def test_policy_cannot_be_weakened(self):
        s = candidate(); s['protection']['enforce_admins']['enabled'] = False
        self.assert_blocked(s, 'admin_bypass_not_excluded')
        for key, reason in [('dismiss_stale_reviews', 'stale_review_protection_missing'),
                            ('require_last_push_approval', 'last_push_independent_approval_missing')]:
            s = candidate(); s['protection']['required_pull_request_reviews'][key] = False
            self.assert_blocked(s, reason)
        s = candidate(); s['protection']['required_status_checks']['strict'] = False
        self.assert_blocked(s, 'current_base_checks_not_enforced')
        s = candidate(); s['protection']['required_pull_request_reviews']['bypass_pull_request_allowances'] = {'users': ['admin']}
        self.assert_blocked(s, 'review_bypass_allowance')

    def test_malformed_bypass_allowances_fail_closed(self):
        s = candidate()
        s['protection']['required_pull_request_reviews']['bypass_pull_request_allowances'] = True
        self.assert_blocked(s, 'review_policy_unreadable')

    def test_malformed_nested_snapshot_is_structured_blocked_not_exception(self):
        mutations = [
            lambda s: s['pr'].__setitem__('head', True),
            lambda s: s['protection'].__setitem__('enforce_admins', True),
            lambda s: s['protection'].__setitem__('required_status_checks', True),
            lambda s: s['checks'][0].__setitem__('app', True),
            lambda s: s['reviews'][0].__setitem__('user', True),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                s = candidate(); mutate(s)
                self.assert_blocked(s, 'snapshot_structure_invalid')

    def test_required_check_context_must_be_a_canonical_string(self):
        for value in (['backend'], {'name': 'backend'}, ' backend'):
            with self.subTest(value=value):
                s = candidate()
                s['protection']['required_status_checks']['checks'][0]['context'] = value
                self.assert_blocked(s, 'required_check_identity_missing')

    def test_check_details_url_must_be_canonical_github_actions_job(self):
        for value in (
            True,
            'https://attacker.invalid/actions/runs/1234/job/12',
            'https://github.com/o/r/actions/runs/1234',
            'https://github.com/o/r/actions/runs/9999/job/12',
        ):
            with self.subTest(value=value):
                s = candidate(); s['checks'][0]['details_url'] = value
                self.assert_blocked(s, 'required_check_not_success:backend')

    def test_cli_rejects_oversized_snapshot_before_json_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            path.write_text(json.dumps(candidate()) + ' ' * (2 * 1024 * 1024),
                            encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(1, main([str(path)]))
            result = json.loads(output.getvalue())
            self.assertEqual('BLOCKED', result['decision'])
            self.assertEqual(['invalid_or_incomplete_snapshot'], result['reasons'])


if __name__ == '__main__':
    unittest.main()
