import json
import unittest
from schema_evolution import ROOT, CHANGES, nullable


class SchemaEvolutionTests(unittest.TestCase):
    def test_three_overrides_match_the_current_metadata_audit_exactly(self):
        audit = json.loads((ROOT / "inventories/backend/20261019/object-nullability-audit.json").read_text(encoding="utf-8"))
        self.assertEqual(19, len(audit["modules"]))
        self.assertEqual(6, sum(not m["schemaMatches"] for m in audit["modules"]))
        observed = {(d["table"], d["column"]) for d in audit["deltas"]}
        # Later reviewed changes cite their own evidence; the 19/10 audit covers exactly the rest.
        self.assertEqual({key for key, change in CHANGES.items() if "evidence" not in change}, observed)
        self.assertEqual(3, len(observed))
        for delta in audit["deltas"]:
            with self.subTest(table=delta["table"]):
                self.assertEqual(["nullable"], delta["reasons"])
                self.assertEqual("varchar", delta["actual"]["Type"])
                self.assertEqual(100, delta["actual"]["MaxLength"])
                self.assertFalse(delta["actual"]["Computed"])
                self.assertFalse(delta["actual"]["Identity"])
                self.assertEqual(delta["actual"]["Nullable"], nullable(delta["table"], delta["column"], delta["expected"]["nullable"]))
        self.assertFalse(audit["productionDataWrites"])
        self.assertTrue(audit["rolledBack"])

    def test_later_overrides_cite_the_deployed_ERP_technical_note(self):
        later = {key: change for key, change in CHANGES.items() if "evidence" in change}
        self.assertEqual({("AP_PurchaseRequestTbl", "RateExchange"), ("AP_PurchaseRequestDetailTbl", "UnitPrice")}, set(later))
        for (table, column), change in later.items():
            with self.subTest(column=column):
                note = (ROOT / change["evidence"]).read_text(encoding="utf-8")
                self.assertIn(f"`{table}.{column}` cho phép NULL", note)
                self.assertTrue(nullable(table, column, False))

    def test_unreviewed_fields_and_wrong_baselines_cannot_inherit_an_override(self):
        self.assertFalse(nullable("CF_ObjectTbl", "ObjectID", False))
        self.assertFalse(nullable("AP_OrderTbl", "DocumentID", False))
        with self.assertRaisesRegex(ValueError, "baseline mismatch"):
            nullable("AP_OrderTbl", "ObjectID", True)
