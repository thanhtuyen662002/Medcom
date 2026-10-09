import importlib.util
import pathlib
import json
import urllib.parse
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("verify_backend_api", ROOT / "tools/deploy/verify_backend_api.py")
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class BackendContractVerifierTests(unittest.TestCase):
    def test_origins_reject_credentials_cleartext_cross_origin_paths_and_query(self):
        for value in ["http://example.test", "https://user:secret@example.test", "https://example.test/path",
                      "https://example.test?q=x", "https://example.test#fragment", "https://example.test:bad", "https://example.test "]:
            with self.subTest(value=value), self.assertRaises(API.Failure):
                API.origin(value)
        self.assertEqual("https://example.test:443", API.origin("https://example.test:443/"))

    def test_redirects_are_rejected_before_a_credential_bearing_request_can_move(self):
        with self.assertRaisesRegex(API.Failure, "redirect_rejected"):
            API.NoRedirect().redirect_request(None, None, 307, "redirect", {}, "https://other.test")

    def test_no_business_post_can_reach_the_network(self):
        with self.assertRaisesRegex(API.Failure, "business_post_prohibited"):
            API.Client("https://example.test").request("/api/purchase-requests/save", {})

    def test_field_check_preserves_explicit_null_decimal_strings_and_finite_zero_negative_floats(self):
        fields = [{"jsonPath": "data.fields.amount", "jsonType": "string", "nullable": True, "format": "decimal-string"},
                  {"jsonPath": "data.fields.rate", "jsonType": "number", "nullable": False},
                  {"jsonPath": "data.fields.flag", "jsonType": "boolean", "nullable": True}]
        for rate in (0, -0.125):
            API.object_fields({"amount": "999999999999999999.12", "rate": rate, "flag": None}, fields)
        API.object_fields({"amount": None, "rate": 0, "flag": False}, fields)
        for value in [{"rate": 0, "flag": None}, {"amount": None, "rate": float("nan"), "flag": None},
                      {"amount": 1, "rate": 0, "flag": None}, {"amount": "1e2", "rate": 0, "flag": None},
                      {"amount": None, "rate": True, "flag": None}, {"amount": None, "rate": None, "flag": None},
                      {"amount": None, "rate": 0, "flag": None, "extra": "private"}]:
            with self.subTest(value=value), self.assertRaises(API.Failure):
                API.object_fields(value, fields)

    def test_wall_clock_values_require_milliseconds_and_no_inferred_offset(self):
        fields = [{"jsonPath": "header.date", "jsonType": "string", "nullable": False, "format": "sql-datetime-without-timezone"}]
        API.object_fields({"date": "2026-10-10T01:02:03.000"}, fields)
        for value in ["2026-10-10", "2026-10-10T01:02:03Z", "2026-10-10T01:02:03.000+07:00"]:
            with self.assertRaises(API.Failure):
                API.object_fields({"date": value}, fields)

    def test_invalid_json_and_nonfinite_extensions_do_not_enter_a_report(self):
        for value in [b'{"value":NaN}', b'{"value":Infinity}', b'not json']:
            with self.assertRaises(API.Failure):
                API.json_value(value)

    def test_authenticated_verifier_observes_all_fields_retires_its_session_and_exports_no_rows_or_credentials(self):
        class FakeClient:
            base = "https://example.test"
            calls = []

            def request(self, path, body=None, token=None):
                self.calls.append((path, body is not None))
                if path == "/health/live": return 200, {"status": "healthy"}
                if path == "/health/ready": return 503, {"status": "not_ready", "checks": []}
                if path == API.CONTRACT: return 200, {"openapi": "3.1.1", "paths": {str(n): {"get": {}} for n in range(34)}, "x-medcom-business-release": "not-admitted"}
                if path == "/api/auth/csrf": return 200, {"token": "PRIVATE_TOKEN_SENTINEL"}
                if path == "/api/auth/login": return 200, {"capabilities": [kind + ".read" for kind in API.MODULES]}
                if path == "/api/auth/logout": return 204, None
                parsed = urllib.parse.urlsplit(path)
                query = urllib.parse.parse_qs(parsed.query)
                if parsed.path == "/api/documents/query-contract":
                    kind = query["kind"][0]
                    return 200, {"version": 2, "kind": kind, "listPath": API.MODULES[kind][0], "maximumPage": 1000,
                                 "maximumPageSize": 50 if kind == "purchase-requests" else 100,
                                 "dateColumn": "PurchaseDate" if kind == "purchase-requests" else "DocumentDate",
                                 "identifierColumn": "PurchaseRequestID" if kind == "purchase-requests" else "DocumentID",
                                 "sortFields": ["documentDate", "documentId", "statusId"],
                                 "defaultSortBy": "documentDate", "defaultSortDirection": "desc",
                                 "minimumDate": "1753-01-01", "maximumDate": "9999-12-31", "dateFormat": "yyyy-MM-dd",
                                 "dateToInclusive": True, "nullableDatesIncludedWithoutBounds": kind == "purchase-requests",
                                 "statusColumn": "StatusID"}
                if parsed.path == "/api/documents/field-contract":
                    kind = query["kind"][0]
                    _, h, l = API.MODULES[kind]
                    def fields(count, prefix, list_prefix=None):
                        return [{"jsonPath": prefix + ".f" + str(n), "listJsonPath": list_prefix + ".f" + str(n) if list_prefix else None,
                                 "jsonType": "string", "nullable": True} for n in range(count)]
                    return 200, {"contractVersion": 2, "kind": kind, "header": {"fields": fields(h, "document.header", "rows[].fields")},
                                 "lines": {"fields": fields(l, "lines[].fields")}}
                kind = next(k for k, (url, _, _) in API.MODULES.items() if parsed.path.startswith(url))
                _, h, l = API.MODULES[kind]
                header = {"f" + str(n): "PRIVATE_FIELD_SENTINEL" if n == 0 else None for n in range(h)}
                if parsed.path.endswith("/detail"):
                    return 200, {"document": {"header": header}, "lines": [{"fields": {"f" + str(n): None for n in range(l)}}], "hasMore": False}
                page = {"rows": [{"documentId": "PRIVATE_DOCUMENT_SENTINEL", "fields": header}], "hasMore": False}
                return 200, {"scopeKey": "PRIVATE_SCOPE_SENTINEL", "data": page} if kind == "purchase-requests" else page

        client = FakeClient()
        report = API.run(client, "PRIVATE_USER_SENTINEL", "PRIVATE_PASSWORD_SENTINEL")
        self.assertEqual("AUTHENTICATED_READS_VERIFIED", report["status"])
        self.assertTrue(report["own_session_retired"])
        self.assertEqual(116, sum(v["header_fields"] + v["line_fields"] for v in report["modules"].values()))
        self.assertTrue(all(v["query_contract_verified"] for v in report["modules"].values()))
        self.assertTrue(all(v["server_order_requested"] == "documentId_asc" for v in report["modules"].values()))
        self.assertEqual(3, len([p for p, _ in client.calls if "sortBy=documentId&sortDirection=asc" in p]))
        self.assertNotIn("PRIVATE_", json.dumps(report))
        self.assertEqual(["/api/auth/login", "/api/auth/logout"], [p for p, post in client.calls if post])

    def test_unqualified_query_metadata_is_rejected_before_any_ERP_row_read(self):
        class MissingMetadata:
            def request(self, path):
                self.path = path
                return 200, {"version": 2, "kind": "purchase-orders", "listPath": "/private"}
        client = MissingMetadata()
        with self.assertRaisesRegex(API.Failure, "query_contract_mismatch"):
            API.verify_module(client, "purchase-orders")
        self.assertEqual("/api/documents/query-contract?kind=purchase-orders", client.path)


if __name__ == "__main__":
    unittest.main()
