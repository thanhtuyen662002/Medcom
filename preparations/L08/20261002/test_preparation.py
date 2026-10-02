import json,tempfile,unittest
from pathlib import Path
from validate_preparation import validate,FILES
REPO=Path(__file__).resolve().parents[3];SRC=Path(__file__).resolve().parent
class T(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.p=Path(self.t.name)
  for n in FILES:(self.p/n).write_text((SRC/n).read_text())
 def tearDown(self):self.t.cleanup()
 def bad(self,n,fn):
  p=self.p/n;d=json.loads(p.read_text());fn(d);p.write_text(json.dumps(d))
  with self.assertRaises(ValueError):validate(REPO,self.p)
 def test_baseline(self):self.assertEqual(validate(REPO,self.p)['cases'],60)
 def test_false_publish(self):self.bad('F5_PILOT_EVIDENCE_GATE.json',lambda d:d.update(artifact_status='published'))
 def test_false_eligibility(self):self.bad('F6_PILOT_EVIDENCE_GATE.json',lambda d:d.update(eligible_to_code=True))
 def test_source_hash(self):self.bad('F7_PILOT_EVIDENCE_GATE.json',lambda d:d['source_contracts'][0].update(sha256='0'*64))
 def test_case_removed(self):self.bad('F8_PILOT_EVIDENCE_GATE.json',lambda d:d['cases'].pop())
 def test_mock_boundary_removed(self):self.bad('F9_PILOT_EVIDENCE_GATE.json',lambda d:d.update(limits=[]))
 def test_inbound_receipt_inference(self):self.bad('F9_PILOT_EVIDENCE_GATE.json',lambda d:d['forbidden_inferences'].remove('request entry never implies receipt'))
 def test_internal_transfer_candidate_removed(self):self.bad('F6_PILOT_EVIDENCE_GATE.json',lambda d:d.update(observed_candidates=[]))
 def test_approval_gate_removed(self):self.bad('F7_PILOT_EVIDENCE_GATE.json',lambda d:d.update(dependency_gates=[]))
 def test_ap_order_read_write_boundary_removed(self):self.bad('F8_PILOT_EVIDENCE_GATE.json',lambda d:d['forbidden_inferences'].remove('F4 read surface does not authorize F8 mutations'))
 def test_sales_execution_claim(self):self.bad('F5_PILOT_EVIDENCE_GATE.json',lambda d:d.update(execution_status='PASS'))
if __name__=='__main__':unittest.main()
