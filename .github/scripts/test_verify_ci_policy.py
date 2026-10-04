import contextlib
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import verify_ci_policy


class RepositoryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(verify_ci_policy.ROOT / '.github/workflows', self.root / '.github/workflows')
        self.path = self.root / '.github/policies/medcom-main-ruleset.json'
        self.path.parent.mkdir()
        self.policy = json.loads((verify_ci_policy.ROOT / '.github/policies/medcom-main-ruleset.json').read_text())

    def verify(self):
        self.path.write_text(json.dumps(self.policy))
        with patch.object(verify_ci_policy, 'ROOT', self.root), contextlib.redirect_stdout(io.StringIO()):
            verify_ci_policy.main()

    def parameters(self, kind):
        return next(rule['parameters'] for rule in self.policy['rules'] if rule['type'] == kind)

    def test_current_owner_policy_matches_unconditional_required_ci(self):
        self.verify()

    def test_approval_requirements_or_implicit_boolean_counts_are_rejected(self):
        original = json.dumps(self.policy)
        for key, value in [('required_approving_review_count', 1),
                           ('required_approving_review_count', False),
                           ('require_last_push_approval', True),
                           ('dismiss_stale_reviews_on_push', True),
                           ('require_code_owner_review', True),
                           ('require_extra_approval_for_unattributed_changes', True),
                           ('required_reviewers', ['other'])]:
            with self.subTest(key=key, value=value):
                self.policy = json.loads(original)
                self.parameters('pull_request')[key] = value
                with self.assertRaises(SystemExit):
                    self.verify()

    def test_strict_ci_and_conversation_protection_cannot_be_relaxed(self):
        original = json.dumps(self.policy)
        for kind, key, value in [
            ('pull_request', 'required_review_thread_resolution', False),
            ('required_status_checks', 'strict_required_status_checks_policy', False),
            ('required_status_checks', 'do_not_enforce_on_create', True),
            ('required_status_checks', 'required_status_checks', [])
        ]:
            with self.subTest(key=key):
                self.policy = json.loads(original)
                self.parameters(kind)[key] = value
                with self.assertRaises(SystemExit):
                    self.verify()

    def test_bypass_actor_cannot_replace_ci_or_owner_policy(self):
        self.policy['bypass_actors'] = [{'actor_id': 1, 'actor_type': 'RepositoryRole', 'bypass_mode': 'always'}]
        with self.assertRaises(SystemExit):
            self.verify()


if __name__ == '__main__':
    unittest.main()
