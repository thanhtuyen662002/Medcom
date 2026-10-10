from copy import deepcopy
import json
from pathlib import Path
import unittest

from audit_api_data import audit

ROOT = Path(__file__).resolve().parents[2]


class ApiDataAuditTests(unittest.TestCase):
    def setUp(self):
        self.api = json.loads((ROOT / "docs/backend/medcom-openapi.json").read_text(encoding="utf-8"))
        self.mapping = json.loads((ROOT / "docs/backend/document-field-contract.json").read_text(encoding="utf-8"))
        self.tables = [obj for file in (ROOT / "inventories/source/20261002").glob("table-*.json")
                       for obj in json.loads(file.read_text(encoding="utf-8"))["objects"]]

    def test_every_current_route_and_all_source_columns_are_reconciled_without_a_runtime_attestation(self):
        result = audit(self.api, self.mapping, self.tables)
        self.assertEqual(34, result["registered_operations"])
        self.assertEqual(116, result["complete_source_columns"])
        self.assertEqual(8, sum(o["category"] == "business-provider-unavailable" for o in result["operations"]))
        self.assertFalse(result["production_accepted"])
        self.assertEqual("NOT_RUN", result["actual_SQL_rows"])

    def test_missing_or_duplicate_source_column_cannot_be_hidden_by_a_self_consistent_count(self):
        for duplicate in (False, True):
            mapping = deepcopy(self.mapping)
            fields = mapping["kinds"]["inbound-requests"]["lines"]["fields"]
            fields.pop()
            if duplicate:
                fields.append(deepcopy(fields[0]))
            with self.subTest(duplicate=duplicate), self.assertRaisesRegex(ValueError, "Missing/extra/duplicate"):
                audit(self.api, mapping, self.tables)

    def test_optional_full_header_cannot_be_advertised_as_complete(self):
        schema = self.api["components"]["schemas"]["purchaseordersV2Summary"]
        schema["required"].remove("purchaseOrderHeader")
        with self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
            audit(self.api, self.mapping, self.tables)

    def test_lost_nullability_or_wrong_source_type_cannot_pass(self):
        for nullable in (False, True):
            api = deepcopy(self.api)
            field = api["components"]["schemas"]["PurchaseOrderHeaderFields"]["properties"]["memo"]
            if nullable:
                field["anyOf"] = [{"type": "string"}]
            else:
                field["x-medcom-sql-type"] = "nvarchar(1)"
            with self.subTest(nullable=nullable), self.assertRaises(ValueError):
                audit(api, self.mapping, self.tables)

    def test_summary_payload_or_wrong_full_route_cannot_be_labeled_full(self):
        for attribute, value in [("x-medcom-data-projection", "summary"),
                                 ("x-medcom-full-data-path", "/api/v2/documents/inbound-requests")]:
            api = deepcopy(self.api)
            api["paths"]["/api/v2/documents/purchase-orders"]["get"][attribute] = value
            with self.subTest(attribute=attribute), self.assertRaisesRegex(ValueError, "Full route projection mismatch"):
                audit(api, self.mapping, self.tables)


if __name__ == "__main__":
    unittest.main()
