from copy import deepcopy
import json
from pathlib import Path
import unittest

from audit_api_data import audit, load_source_tables

ROOT = Path(__file__).resolve().parents[2]


class ApiDataAuditTests(unittest.TestCase):
    def setUp(self):
        self.api = json.loads((ROOT / "docs/backend/medcom-openapi.json").read_text(encoding="utf-8"))
        self.mapping = json.loads((ROOT / "docs/backend/document-field-contract.json").read_text(encoding="utf-8"))
        self.tables = load_source_tables(self.mapping)

    def test_every_current_route_and_all_source_columns_are_reconciled_without_a_runtime_attestation(self):
        result = audit(self.api, self.mapping, self.tables)
        self.assertEqual(119, result["registered_operations"])
        self.assertEqual(118, result["complete_source_columns"])
        self.assertEqual(417, result["erp_screen_source_columns"])
        self.assertEqual(14, sum(o["category"] == "erp-full-source-fields" for o in result["operations"]))
        self.assertEqual(12, sum(o["category"] == "full-source-fields" for o in result["operations"]))
        self.assertEqual(8, sum(o["category"] == "business-provider-unavailable" for o in result["operations"]))
        self.assertFalse(result["production_accepted"])
        self.assertEqual("NOT_RUN", result["actual_SQL_rows"])

    def test_each_ERP_form_full_header_cannot_silently_become_optional(self):
        result = audit(self.api, self.mapping, self.tables)
        for module in result["erp_modules"]:
            api = deepcopy(self.api)
            schema = api["components"]["schemas"]["Erp_" + module.replace('-', '_') + "_header_fields"]
            schema["required"].pop()
            with self.subTest(module=module), self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
                audit(api, self.mapping, self.tables)

    def test_unknown_source_set_is_not_silently_replaced_with_an_old_or_live_catalog(self):
        mapping = deepcopy(self.mapping)
        mapping["sourceSet"] = "unverified-source"
        with self.assertRaisesRegex(ValueError, "Unknown source set"):
            load_source_tables(mapping)

    def test_each_new_live_inbound_column_is_required_on_every_applicable_route(self):
        for name, field in [("InboundRequestHeaderFields", "linkId"), ("InboundRequestLineFields", "parentId")]:
            api = deepcopy(self.api)
            api["components"]["schemas"][name]["required"].remove(field)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
                audit(api, self.mapping, self.tables)

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
        for schema_name in ["purchaseordersLegacySummary", "purchaseordersV2Summary"]:
            api = deepcopy(self.api)
            api["components"]["schemas"][schema_name]["required"].remove("purchaseOrderHeader")
            with self.subTest(schema=schema_name), self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
                audit(api, self.mapping, self.tables)

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
        for path in ["/api/documents/purchase-orders", "/api/v2/documents/purchase-orders"]:
            for attribute, value in [("x-medcom-data-projection", "summary"),
                                     ("x-medcom-full-data-path", "/api/v2/documents/inbound-requests")]:
                api = deepcopy(self.api)
                api["paths"][path]["get"][attribute] = value
                with self.subTest(path=path, attribute=attribute), self.assertRaisesRegex(ValueError, "Full route projection mismatch"):
                    audit(api, self.mapping, self.tables)


if __name__ == "__main__":
    unittest.main()
