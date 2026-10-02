import copy
import unittest
from integration_gate import evaluate

HEAD, BASE, MERGE = 'a' * 40, 'b' * 40, 'c' * 40


def candidate():
    return {
        'expected_head': HEAD, 'expected_base': BASE, 'current_base': BASE,
        'pr': {'state': 'open', 'draft': False, 'merged': False, 'mergeable': True,
               'head': {'sha': HEAD}, 'base': {'sha': BASE}, 'merge_commit_sha': MERGE,
               'user': {'login': 'author'}},
        'protection': {'enforce_admins': {'enabled': True},
                       'required_pull_request_reviews': {
                           'required_approving_review_count': 1, 'dismiss_stale_reviews': True,
                           'require_last_push_approval': True},
                       'required_status_checks': {'strict': True, 'checks': [{'context': 'backend', 'app_id': 15368}]}},
        'tested_merge': {'source': HEAD, 'base': BASE, 'sha': MERGE, 'run_id': '1234', 'event': 'pull_request'},
        'checks': [{'name': 'backend', 'app': {'id': 15368}, 'head_sha': HEAD,
                    'details_url': 'https://github.com/o/r/actions/runs/1234/job/12',
                    'status': 'completed', 'conclusion': 'success'}],
        'reviews': [{'id': 1, 'user': {'login': 'qa'}, 'state': 'APPROVED', 'commit_id': HEAD}],
        'independent_reviewers': ['qa'], 'review_threads_complete': True,
        'review_threads': [], 'server_expected_sha_supported': True,
    }


class IntegrationGateTests(unittest.TestCase):
    def assert_blocked(self, snapshot, reason):
        result = evaluate(snapshot)
        self.assertEqual('BLOCKED', result['decision'])
        self.assertIn(reason, result['reasons'])

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
        s = candidate(); s['checks'][0]['head_sha'] = BASE
        self.assert_blocked(s, 'required_check_not_success:backend')

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

    def test_old_review_author_review_or_not_independent(self):
        for field, value in [('commit_id', BASE), ('user', {'login': 'author'})]:
            s = candidate(); s['reviews'][0][field] = value
            self.assert_blocked(s, 'exact_head_independent_review_missing')
        s = candidate(); s['independent_reviewers'] = []
        self.assert_blocked(s, 'exact_head_independent_review_missing')

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

    def test_tested_pair_must_match(self):
        for key in ['source', 'base', 'sha', 'run_id', 'event']:
            s = candidate(); s['tested_merge'][key] = 'd' * 40
            self.assert_blocked(s, 'tested_source_base_missing')

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


if __name__ == '__main__':
    unittest.main()
