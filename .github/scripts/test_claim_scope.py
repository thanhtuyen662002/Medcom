import copy
import unittest
from claim_scope import validate

RUN = 'bee09e89-5d53-41cb-8db6-89df576de9f8'
BRANCH = 'medcom-work/g45/frontend/F01-' + RUN
BASE = 'a' * 40


def fixture():
    paths = ['src/frontend/components/grid/*', 'src/frontend/components/document-list.tsx']
    ticket = {'ticket_id': 'F01', 'role': 'frontend', 'generation': 1, 'status': 'ready',
              'allowed_paths': paths, 'claim_branch': 'medcom-claims/g45/frontend/F01'}
    claim = {'goal': 45, 'ticket_id': 'F01', 'role': 'frontend', 'generation': 1,
             'run_uuid': RUN, 'allowed_paths': paths, 'base_sha': BASE}
    return {'tickets': [ticket]}, claim


class ClaimScopeTests(unittest.TestCase):
    def test_nested_allowed_paths(self):
        r, c = fixture()
        self.assertEqual([], validate(BRANCH, r, c, ['src/frontend/components/grid/a/b.tsx'], [BASE]))

    def test_shared_paths_and_prefix_lookalikes_denied(self):
        r, c = fixture()
        for path in ['src/frontend/lib/api.ts', '.github/workflows/backend.yml',
                     'src/frontend/components/grid-evil/a.tsx', 'AGENTS.md']:
            self.assertIn('out_of_scope:' + path, validate(BRANCH, r, c, [path], [BASE]))

    def test_run_generation_role_or_scope_mismatch(self):
        r, c = fixture()
        for key, value in [('run_uuid', '00000000-0000-0000-0000-000000000000'),
                           ('generation', 2), ('role', 'lead'), ('allowed_paths', ['*']), ('goal', 46)]:
            bad = copy.deepcopy(c); bad[key] = value
            self.assertIn('claim_mismatch:' + key, validate(BRANCH, r, bad, [], [BASE]))

    def test_no_ticket_revoked_ticket_or_duplicate_ticket(self):
        r, c = fixture(); r['tickets'][0]['status'] = 'revoked'
        self.assertIn('ticket_not_admitted', validate(BRANCH, r, c, [], [BASE]))
        r['tickets'].append(copy.deepcopy(r['tickets'][0]))
        self.assertIn('ticket_missing_or_ambiguous', validate(BRANCH, r, c, [], [BASE]))
        self.assertIn('ticket_missing_or_ambiguous', validate(BRANCH, {'tickets': []}, c, [], [BASE]))

    def test_claim_cannot_be_product_content(self):
        r, c = fixture()
        self.assertIn('immutable_claim_in_product_diff', validate(BRANCH, r, c, ['docs/execution/claims/F01.json'], [BASE]))

    def test_paths_cannot_escape(self):
        r, c = fixture()
        for path in ['/root/file', 'src/frontend/components/grid/../../lib/api.ts', 'src\\grid\\x.ts']:
            self.assertIn('unsafe_path', validate(BRANCH, r, c, [path], [BASE]))

    def test_claim_base_must_be_source_ancestor(self):
        r, c = fixture()
        self.assertIn('claim_base_not_ancestor', validate(BRANCH, r, c, [], ['b' * 40]))

    def test_claim_reference_must_be_canonical(self):
        r, c = fixture(); r['tickets'][0]['claim_branch'] = 'mutable-claim'
        self.assertIn('claim_branch_mismatch', validate(BRANCH, r, c, [], [BASE]))

    def test_arbitrary_or_bad_uuid_branch(self):
        r, c = fixture()
        self.assertEqual(['invalid_worker_branch'], validate('main', r, c, [], [BASE]))
        branch = BRANCH.replace(RUN, 'z' * 36)
        self.assertEqual(['invalid_worker_branch'], validate(branch, r, c, [], [BASE]))


if __name__ == '__main__':
    unittest.main()
