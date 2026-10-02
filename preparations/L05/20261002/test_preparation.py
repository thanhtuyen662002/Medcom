import copy,json,tempfile,unittest
from pathlib import Path
from validate_preparation import validate,FILES
REPO=Path(__file__).resolve().parents[3]
SRC=Path(__file__).resolve().parent
class ValidationTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.p=Path(self.t.name)
  for n in FILES:(self.p/n).write_text((SRC/n).read_text())
 def tearDown(self):self.t.cleanup()
 def mutate(self,name,fn):
  p=self.p/name;d=json.loads(p.read_text());fn(d);p.write_text(json.dumps(d))
 def bad(self,name,fn):
  self.mutate(name,fn)
  with self.assertRaises(ValueError):validate(REPO,self.p)
 def test_baseline(self):self.assertEqual(validate(REPO,self.p)['units'],7)
 def test_false_durable(self):self.bad('A5_SY_REUSE_GAP_MATRIX.json',lambda d:d.update(artifact_status='published'))
 def test_source_hash(self):self.bad('R3_DAT_SOURCE_PRECEDENCE_REGISTER.json',lambda d:d['source_contracts'][0].update(sha256='0'*64))
 def test_gap_promotion(self):self.bad('A5_SY_REUSE_GAP_MATRIX.json',lambda d:next(x for x in d['capabilities'] if x['id']=='CAP-SYNC').update(disposition='CREATE TABLE NOW'))
 def test_legacy_precedence_promotion(self):self.bad('R3_DAT_SOURCE_PRECEDENCE_REGISTER.json',lambda d:d.update(legacy_precedence='packaged < DB < user'))
 def test_duplicate_compiler_case(self):self.bad('A7_COMPILER_ADVERSARIAL_FIXTURES.json',lambda d:d['cases'][1].update(id=d['cases'][0]['id']))
 def test_compiler_run_claim(self):self.bad('A7_COMPILER_ADVERSARIAL_FIXTURES.json',lambda d:d.update(execution_status='passed'))
 def test_definition_case_omission(self):self.bad('A7_SCREEN_DEFINITION_FIXTURES.json',lambda d:d['fixtures'].pop())
 def test_sync_case_omission(self):self.bad('A7_SYNC_ROLLBACK_STATE_MACHINE.json',lambda d:d['cases'].pop())
 def test_sy_object_duplication(self):self.bad('A5_SY_REUSE_GAP_MATRIX.json',lambda d:d['verified_object_presence'].__setitem__(1,d['verified_object_presence'][0]))
 def test_writer_boundary_removed(self):self.bad('A7_SCREEN_DEFINITION_FIXTURES.json',lambda d:d.update(limits=[]))
 def test_reconciliation_check_omission(self):self.bad('A5_SY_REUSE_GAP_MATRIX.json',lambda d:d['reconciliation_acceptance'].pop())
 def test_precedence_conflict_omission(self):self.bad('R3_DAT_SOURCE_PRECEDENCE_REGISTER.json',lambda d:d['precedence_conflict_cases'].pop())
 def test_xxe_case_omission(self):self.bad('A7_COMPILER_ADVERSARIAL_FIXTURES.json',lambda d:d['cases'].__setitem__(15,dict(d['cases'][15],input='ordinary XML')))
 def test_stale_publisher_state_omission(self):self.bad('A7_SYNC_ROLLBACK_STATE_MACHINE.json',lambda d:d['states'].remove('STALE_PUBLISHER_REJECTED'))
 def test_definition_execution_promotion(self):self.bad('A7_SCREEN_DEFINITION_FIXTURES.json',lambda d:d.update(execution_status='PASS'))
 def test_writeback_enablement(self):self.bad('R3_LEGACY_WRITEBACK_GATE.json',lambda d:d.update(writeback_authorized=True))
 def test_writeback_requirement_omission(self):self.bad('R3_LEGACY_WRITEBACK_GATE.json',lambda d:d['requirements'].pop())
 def test_writeback_evidence_promotion(self):self.bad('R3_LEGACY_WRITEBACK_GATE.json',lambda d:d['requirements'][0].update(state='VERIFIED'))
 def test_dat_execution_enablement(self):self.bad('R3_DAT_EXECUTION_ADMISSION_GATE.json',lambda d:d.update(execution_authorized=True))
 def test_dat_execution_requirement_omission(self):self.bad('R3_DAT_EXECUTION_ADMISSION_GATE.json',lambda d:d['requirements'].pop())
 def test_dat_execution_evidence_promotion(self):self.bad('R3_DAT_EXECUTION_ADMISSION_GATE.json',lambda d:d['requirements'][0].update(state='VERIFIED'))
if __name__=='__main__':unittest.main()
