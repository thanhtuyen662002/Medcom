import json,tempfile,unittest
from pathlib import Path
from validate_preparation import validate,FILES
REPO=Path('/workspace/scratch/80dc5431be34/Medcom');SRC=Path(__file__).resolve().parent
class T(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.p=Path(self.t.name)
  for n in FILES:(self.p/n).write_text((SRC/n).read_text())
 def tearDown(self):self.t.cleanup()
 def bad(self,n,fn):
  p=self.p/n;d=json.loads(p.read_text());fn(d);p.write_text(json.dumps(d))
  with self.assertRaises(ValueError):validate(REPO,self.p)
 def test_baseline(self):self.assertEqual(validate(REPO,self.p)['cases_or_sections'],87)
 def test_false_publish(self):self.bad('B3_TYPED_COMMAND_ENVELOPE_FIXTURES.json',lambda d:d.update(artifact_status='published'))
 def test_source_hash(self):self.bad('B5_OUTCOME_UNKNOWN_STATE_MACHINE.json',lambda d:d['source_contracts'][0].update(sha256='0'*64))
 def test_dynamic_envelope(self):self.bad('B3_TYPED_COMMAND_ENVELOPE_FIXTURES.json',lambda d:d['conceptual_envelope'].pop())
 def test_audit_claim(self):self.bad('B3_TRANSACTION_EFFECT_AUDIT_TEMPLATE.json',lambda d:d.update(completion_status='command_audited'))
 def test_dedupe_domain(self):self.bad('B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json',lambda d:d['dedupe_domain'].remove('stable_principal'))
 def test_idem_run_claim(self):self.bad('B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json',lambda d:d.update(execution_status='passed'))
 def test_unknown_case_removed(self):self.bad('B5_OUTCOME_UNKNOWN_STATE_MACHINE.json',lambda d:d['cases'].pop())
 def test_unknown_purge_rule_removed(self):self.bad('B5_OUTCOME_UNKNOWN_STATE_MACHINE.json',lambda d:d['invariants'].pop(1))
 def test_hotspot_bound_as_pilot(self):self.bad('B5_CONCURRENCY_LOCK_FAULT_FIXTURES.json',lambda d:d.update(hotspot_boundary='verified current pilot binding'))
 def test_concurrency_case_removed(self):self.bad('B5_CONCURRENCY_LOCK_FAULT_FIXTURES.json',lambda d:d['cases'].pop())
 def test_fingerprint_added_to_lookup(self):self.bad('B5_IDEMPOTENCY_FINGERPRINT_FIXTURES.json',lambda d:d['ledger_lookup_key'].append('semantic_request_fingerprint'))
 def test_metadata_revision_made_client_authority(self):self.bad('B3_TYPED_COMMAND_ENVELOPE_FIXTURES.json',lambda d:d['authority_split']['server_must_derive'].remove('resolved_server_metadata_revision'))
 def test_completion_promoted_at_core_commit(self):self.bad('B3_TRANSACTION_EFFECT_AUDIT_TEMPLATE.json',lambda d:d['completion_model'][1].update(success_allowed=True))
 def test_transition_removed(self):self.bad('B5_OUTCOME_UNKNOWN_STATE_MACHINE.json',lambda d:d['transitions'].pop())
 def test_first_commit_case_removed(self):self.bad('B5_CONCURRENCY_LOCK_FAULT_FIXTURES.json',lambda d:d['cases'].pop())
 def test_retention_gate_enablement(self):self.bad('B5_LEDGER_RETENTION_RESTORE_GATE.json',lambda d:d.update(purge_or_dispatch_authorized=True))
 def test_retention_requirement_removed(self):self.bad('B5_LEDGER_RETENTION_RESTORE_GATE.json',lambda d:d['requirements'].pop())
 def test_retention_evidence_promotion(self):self.bad('B5_LEDGER_RETENTION_RESTORE_GATE.json',lambda d:d['requirements'][0].update(state='VERIFIED'))
if __name__=='__main__':unittest.main()
