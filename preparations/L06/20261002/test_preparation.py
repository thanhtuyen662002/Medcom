import json,tempfile,unittest
from pathlib import Path
from validate_preparation import validate,FILES
REPO=Path(__file__).resolve().parents[3];SRC=Path(__file__).resolve().parent
class T(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)
  for n in FILES:(self.p/n).write_text((SRC/n).read_text())
 def tearDown(self):self.tmp.cleanup()
 def bad(self,n,fn):
  p=self.p/n;d=json.loads(p.read_text());fn(d);p.write_text(json.dumps(d))
  with self.assertRaises(ValueError):validate(REPO,self.p)
 def test_baseline(self):self.assertEqual(validate(REPO,self.p)['cases'],93)
 def test_false_publish(self):self.bad('F1_AUTHORIZED_SHELL_MOBILE_FIXTURES.json',lambda d:d.update(artifact_status='published'))
 def test_hash_drift(self):self.bad('F2_QUERY_RACE_FRESHNESS_FIXTURES.json',lambda d:d['source_contracts'][0].update(sha256='0'*64))
 def test_duplicate_case(self):self.bad('F3_FORM_SESSION_RECOVERY_FIXTURES.json',lambda d:d['cases'][1].update(id=d['cases'][0]['id']))
 def test_grid_smaller_fixture(self):self.bad('F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json',lambda d:d['dataset_contract'].update(rows=100))
 def test_product_run_claim(self):self.bad('F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json',lambda d:d.update(execution_status='passed'))
 def test_query_case_removed(self):self.bad('F2_QUERY_RACE_FRESHNESS_FIXTURES.json',lambda d:d['cases'].pop())
 def test_mutation_allowed(self):self.bad('F4_READ_ONLY_PILOT_SURFACE_FIXTURES.json',lambda d:d['surfaces'][0]['allowed_ui'].append('save'))
 def test_binding_gate_removed(self):self.bad('F4_READ_ONLY_PILOT_SURFACE_FIXTURES.json',lambda d:d['surfaces'][1].update(required_before_binding=[]))
 def test_shell_writer_boundary_removed(self):self.bad('F1_AUTHORIZED_SHELL_MOBILE_FIXTURES.json',lambda d:d.update(limits=[]))
 def test_form_run_claim(self):self.bad('F3_FORM_SESSION_RECOVERY_FIXTURES.json',lambda d:d.update(execution_status='green'))
 def test_exact_100k_rejected(self):self.bad('F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json',lambda d:d['dataset_contract'].update(fixture_rows=100000))
 def test_wrong_local_budget_rejected(self):self.bad('F2_GRID_ACCESSIBILITY_STRESS_FIXTURES.json',lambda d:d['performance_budget'].update(local_interaction_p95_ms_max=50))
 def test_frontend_acceptance_source_removed(self):self.bad('F1_AUTHORIZED_SHELL_MOBILE_FIXTURES.json',lambda d:d['source_contracts'].__setitem__(slice(None),[x for x in d['source_contracts'] if x['path']!='docs/web/PHASE2_FRONTEND_ACCEPTANCE.md']))
 def test_mock_guard_removed(self):self.bad('F4_READ_ONLY_PILOT_SURFACE_FIXTURES.json',lambda d:d['cases'].pop())
 def test_query_scope_cache_case_removed(self):self.bad('F2_QUERY_RACE_FRESHNESS_FIXTURES.json',lambda d:d['cases'].__setitem__(11,dict(d['cases'][11],expected='reuse cached data')))
 def test_draft_storage_enablement(self):self.bad('F3_DRAFT_STORAGE_GATE.json',lambda d:d.update(persistent_storage_authorized=True))
 def test_draft_requirement_removed(self):self.bad('F3_DRAFT_STORAGE_GATE.json',lambda d:d['requirements'].pop())
 def test_draft_evidence_promotion(self):self.bad('F3_DRAFT_STORAGE_GATE.json',lambda d:d['requirements'][0].update(state='VERIFIED'))
if __name__=='__main__':unittest.main()
