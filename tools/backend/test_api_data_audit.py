from copy import deepcopy
import json
from pathlib import Path
import unittest

from audit_api_data import audit, load_source_tables, at_schema

ROOT = Path(__file__).resolve().parents[2]


class ApiDataAuditTests(unittest.TestCase):
    def response(self, api, path, member):
        body = api["paths"][path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        return at_schema(api, body, member)
    def setUp(self):
        self.api = json.loads((ROOT / "docs/backend/medcom-openapi.json").read_text(encoding="utf-8"))
        self.mapping = json.loads((ROOT / "docs/backend/document-field-contract.json").read_text(encoding="utf-8"))
        self.tables = load_source_tables(self.mapping)

    def test_every_current_route_and_all_source_columns_are_reconciled_without_a_runtime_attestation(self):
        result = audit(self.api, self.mapping, self.tables)
        self.assertEqual(361, result["registered_operations"])
        self.assertEqual(118, result["complete_source_columns"])
        self.assertEqual(1871, result["erp_screen_source_columns"])
        self.assertEqual(48, sum(o["category"] == "erp-full-source-fields" for o in result["operations"]))
        self.assertEqual(12, sum(o["category"] == "full-source-fields" for o in result["operations"]))
        self.assertEqual(8, sum(o["category"] == "business-provider-unavailable" for o in result["operations"]))
        self.assertFalse(result["production_accepted"])
        self.assertEqual("NOT_RUN", result["actual_SQL_rows"])

    def test_each_ERP_form_full_header_cannot_silently_become_optional(self):
        result = audit(self.api, self.mapping, self.tables)
        for module in result["erp_modules"]:
            api = deepcopy(self.api)
            schema = self.response(api, "/api/erp/" + module + "/detail", "data.header")
            schema["required"].remove(next(k for k,v in schema["properties"].items() if "x-medcom-source-column" in v))
            with self.subTest(module=module), self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
                audit(api, self.mapping, self.tables)

    def test_unknown_source_set_is_not_silently_replaced_with_an_old_or_live_catalog(self):
        mapping = deepcopy(self.mapping)
        mapping["sourceSet"] = "unverified-source"
        with self.assertRaisesRegex(ValueError, "Unknown source set"):
            load_source_tables(mapping)

    def test_current_nullable_object_must_not_revert_to_the_historical_nonnullable_wire_contract(self):
        for module in ("purchase-requests", "purchase-approvals", "purchase-orders", "sales-orders", "sales-order-pm", "sales-order-sa"):
            api = deepcopy(self.api)
            schema = self.response(api, "/api/erp/" + module + "/detail", "data.header.objectId")
            schema["anyOf"] = [{"type": "string"}]
            with self.subTest(module=module), self.assertRaisesRegex(ValueError, "ERP wire nullability mismatch"):
                audit(api, self.mapping, self.tables)

    def test_each_new_live_inbound_column_is_required_on_every_applicable_route(self):
        for member, field in [("document", "linkId"), ("inboundRequestLines[]", "parentId")]:
            api = deepcopy(self.api)
            self.response(api, "/api/documents/inbound-requests/detail", member)["required"].remove(field)
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
        for path in ["/api/documents/purchase-orders", "/api/v2/documents/purchase-orders"]:
            api = deepcopy(self.api)
            self.response(api, path, "rows[]")["required"].remove("objectId")
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Optional or omitted full field"):
                audit(api, self.mapping, self.tables)

    def test_lost_nullability_or_wrong_source_type_cannot_pass(self):
        for nullable in (False, True):
            api = deepcopy(self.api)
            field = self.response(api, "/api/documents/purchase-orders/detail", "document.memo")
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

    def test_duplicate_record_wrapper_is_rejected_on_the_served_schema(self):
        api = deepcopy(self.api)
        self.response(api, "/api/erp/purchase-orders/detail", "data.lines.rows[]")["properties"]["fields"] = {"type": "object"}
        with self.assertRaisesRegex(ValueError, "Duplicate business record wrapper"):
            audit(api, self.mapping, self.tables)

    def test_hidden_business_column_cannot_be_reintroduced_as_an_optional_response_field(self):
        api = deepcopy(self.api)
        self.response(api, "/api/erp/internal-transfer-warehouse-out/detail", "data.lines.rows[]")["properties"]["techNotes"] = {"type": "string"}
        with self.assertRaisesRegex(ValueError, "ERP hidden column leaked"):
            audit(api, self.mapping, self.tables)


if __name__ == "__main__":
    unittest.main()
