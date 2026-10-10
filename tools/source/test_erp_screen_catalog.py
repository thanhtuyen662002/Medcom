"""Finite source metadata / generated FE contracts. No private inputs or runtime claims."""
import json
import unittest
from pathlib import Path
import generate_erp_screen_contracts
import generate_erp_screen_handoff

ROOT = Path(__file__).resolve().parents[2]


class ErpScreenCatalogTests(unittest.TestCase):
    def test_finite_metadata_and_hashes(self):
        catalog = json.loads((ROOT / 'inventories/erp/20261010/six-screen-catalog.json').read_text(encoding='utf-8'))
        self.assertFalse(catalog['productionAccepted'])
        self.assertEqual(7, len(catalog['screens']))
        self.assertEqual(417, sum(len(fields) for s in catalog['screens'] for fields in s['fields'].values()))
        self.assertEqual(106, sum(len(s['lookups']) for s in catalog['screens']))
        self.assertEqual(67, len(catalog['modules']))
        self.assertEqual(15, len(catalog['defaultEvidence']))
        self.assertEqual(67, len({m['name'] for m in catalog['modules']}))
        for module in catalog['modules']:
            self.assertRegex(module['definitionSha256Utf16LE'], r'^[a-f0-9]{64}$')
            self.assertNotIn('definition', module)
        for screen in catalog['screens']:
            for section in screen['fields'].values():
                self.assertEqual(len(section), len({field['name'] for field in section}))
                for field in section:
                    if field['column'] in {'UserAutoID', 'DocumentID', 'PurchaseRequestID', 'BranchID', 'UserCreate', 'UserUpdate', 'StatusID', 'isLock'}:
                        self.assertFalse(field['writable'])
            for lookup in screen['lookups']:
                self.assertRegex(lookup['sourceSha256Utf16LE'], r'^[a-f0-9]{64}$')
                self.assertNotIn('Source', lookup)

    def test_generated_inputs_do_not_drift(self):
        self.assertEqual(generate_erp_screen_contracts.generate(), generate_erp_screen_contracts.OUTPUT.read_text(encoding='utf-8'))

    def test_generated_FE_appendix_does_not_drift(self):
        self.assertEqual(generate_erp_screen_handoff.generate(), generate_erp_screen_handoff.OUTPUT.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
