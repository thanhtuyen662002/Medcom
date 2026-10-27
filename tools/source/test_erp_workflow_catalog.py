"""Validate finite workflow metadata and generated public contracts."""
import json
import unittest
from pathlib import Path
import generate_erp_workflow_contracts as generator

ROOT = Path(__file__).resolve().parents[2]

class WorkflowCatalogTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads(generator.SOURCE.read_text(encoding='utf-8'))

    def test_finite_sources_and_no_runtime_acceptance_claim(self):
        c = self.catalog
        self.assertFalse(c['productionAccepted'])
        self.assertFalse(c['businessWritesPerformed'])
        self.assertEqual(18, len(c['screens']))  # + inbound-warehouse, inbound-sa/tech/pm, inbound-bld (2026-10-26), inbound-costs (2026-10-27)
        self.assertEqual(43, sum(len(s['buttons']) for s in c['screens']))
        self.assertEqual(1565, sum(len(fs) for s in c['screens'] for fs in s['fields'].values()))
        self.assertEqual(206, sum(len(s['lookups']) for s in c['screens']))
        self.assertEqual(45, len(c['modules']))
        self.assertEqual(22, len(c['defaultEvidence']))
        self.assertEqual(5, len(c['expressions']))
        self.assertEqual(2, len(c['gridActions']))
        for m in c['modules']:
            self.assertRegex(m['definitionSha256Utf16LE'], r'^[a-f0-9]{64}$')
            self.assertNotIn('definition', m)
        for s in c['screens']:
            for lookup in s['lookups']:
                self.assertNotIn('Source', lookup)
            for fs in s['fields'].values():
                self.assertEqual(len(fs), len({f['name'] for f in fs}))
                for f in fs:
                    if f.get('virtual') or f['column'] in ['UserAutoID','DocumentID','BatchID','StatusID','UserCreate','UserUpdate','isLock']:
                        self.assertFalse(f['writable'])

    def test_row_projection_does_not_join_every_sibling_of_document(self):
        for s in self.catalog['screens']:
            for section, join in s.get('readJoins', {}).items():
                if join['view'] in ['IV_InternalTransferBatchDetailView','IV_InternalTransferBatchAssetView','IV_InternalTransferBatchLogView']:
                    self.assertEqual('UserAutoID', join['sourceKey'])
                    self.assertEqual('UserAutoID', join['targetKey'])

    def test_generated_inputs_match_reviewed_finite_catalog(self):
        self.assertEqual(generator.generate(), generator.OUTPUT.read_text(encoding='utf-8'))

if __name__ == '__main__':
    unittest.main()
