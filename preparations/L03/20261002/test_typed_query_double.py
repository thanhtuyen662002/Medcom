#!/usr/bin/env python3
import unittest
from decimal import Decimal

from typed_query_double import Denial, Filter, QueryPlanner, QuerySpec, Request, ServerScope, Sort


SPEC = QuerySpec(
    query_id="orders.list",
    revision=3,
    catalog_generation=7,
    shape_fingerprint="shape-v3",
    filters={"status": (("eq", "string"),), "amount": (("gte", "decimal"),)},
    sort_fields=("status", "amount", "order_id"),
    stable_identity="order_id",
    max_page_size=200,
)
SCOPE = ServerScope("tenant-a", "company-a", "datasource-a", "user-a")


def request(**changes):
    values = dict(query_id="orders.list", revision=3, catalog_generation=7, shape_fingerprint="shape-v3")
    values.update(changes)
    return Request(**values)


class TypedQueryDoubleTests(unittest.TestCase):
    def planner(self, spec=SPEC):
        return QueryPlanner({spec.query_id: spec})

    def test_registered_query_plans(self):
        self.assertNotIsInstance(self.planner().plan(request(), scope=SCOPE, data_version="v1"), Denial)

    def test_raw_sql_identifier_is_denied(self):
        result = self.planner().plan(request(query_id="SELECT * FROM Orders"), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_unregistered_query_is_denied(self):
        self.assertEqual(self.planner().plan(request(query_id="unknown"), scope=SCOPE, data_version="v1"), Denial())

    def test_client_authority_cannot_replace_server_scope(self):
        result = self.planner().plan(request(client_authority={"company": "company-b"}), scope=SCOPE, data_version="v1")
        self.assertEqual(result.scope, SCOPE)

    def test_unknown_filter_field_denied(self):
        result = self.planner().plan(request(filters=(Filter("secret", "eq", "string", "x"),)), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_unknown_filter_operator_denied(self):
        result = self.planner().plan(request(filters=(Filter("status", "contains_sql", "string", "x"),)), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_filter_type_mismatch_denied(self):
        result = self.planner().plan(request(filters=(Filter("amount", "gte", "string", "1"),)), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_one_bad_filter_rejects_entire_request(self):
        filters = (Filter("status", "eq", "string", "open"), Filter("secret", "eq", "string", "x"))
        self.assertEqual(self.planner().plan(request(filters=filters), scope=SCOPE, data_version="v1"), Denial())

    def test_hidden_sort_field_denied(self):
        self.assertEqual(self.planner().plan(request(sorts=(Sort("secret"),)), scope=SCOPE, data_version="v1"), Denial())

    def test_negative_page_denied(self):
        self.assertEqual(self.planner().plan(request(page=-1), scope=SCOPE, data_version="v1"), Denial())

    def test_page_overflow_denied(self):
        self.assertEqual(self.planner().plan(request(page=2_147_483_648), scope=SCOPE, data_version="v1"), Denial())

    def test_page_size_max_plus_one_denied(self):
        self.assertEqual(self.planner().plan(request(page_size=201), scope=SCOPE, data_version="v1"), Denial())

    def test_zero_page_size_denied(self):
        self.assertEqual(self.planner().plan(request(page_size=0), scope=SCOPE, data_version="v1"), Denial())

    def test_stable_tie_breaker_appended(self):
        result = self.planner().plan(request(sorts=(Sort("status"),)), scope=SCOPE, data_version="v1")
        self.assertEqual(result.sorts, (Sort("status"), Sort("order_id")))

    def test_stale_query_revision_denied(self):
        self.assertEqual(self.planner().plan(request(revision=2), scope=SCOPE, data_version="v1"), Denial())

    def test_stale_catalog_generation_denied(self):
        self.assertEqual(self.planner().plan(request(catalog_generation=6), scope=SCOPE, data_version="v1"), Denial())

    def test_shape_mismatch_denied(self):
        self.assertEqual(self.planner().plan(request(shape_fingerprint="other"), scope=SCOPE, data_version="v1"), Denial())

    def test_plan_declares_consistency_timeout_cancellation_and_null_semantics(self):
        result = self.planner().plan(request(), scope=SCOPE, data_version="snapshot-17")
        self.assertEqual(result.consistency_token, "snapshot-17")
        self.assertEqual(result.timeout_seconds, 30)
        self.assertTrue(result.cancellation_required)
        self.assertEqual(result.null_semantics, SPEC.null_semantics)

    def test_mutation_capable_registration_denied(self):
        write_spec = QuerySpec(**{**SPEC.__dict__, "read_only": False})
        self.assertEqual(self.planner(write_spec).plan(request(), scope=SCOPE, data_version="v1"), Denial())

    def test_safe_error_exposes_only_code_and_correlation(self):
        self.assertEqual(self.planner().safe_error("corr-1"), {"code": "query_failed", "correlation_id": "corr-1"})

    def test_boolean_page_and_page_size_are_denied(self):
        self.assertEqual(self.planner().plan(request(page=True), scope=SCOPE, data_version="v1"), Denial())
        self.assertEqual(self.planner().plan(request(page_size=True), scope=SCOPE, data_version="v1"), Denial())

    def test_boolean_revision_cannot_impersonate_integer_one(self):
        spec = QuerySpec(**{**SPEC.__dict__, "revision": 1})
        self.assertEqual(self.planner(spec).plan(request(revision=True), scope=SCOPE, data_version="v1"), Denial())

    def test_declared_decimal_rejects_bool_string_and_nonfinite_values(self):
        for value in (True, "1", float("nan"), float("inf"), Decimal("NaN")):
            result = self.planner().plan(
                request(filters=(Filter("amount", "gte", "decimal", value),)),
                scope=SCOPE,
                data_version="v1",
            )
            self.assertEqual(result, Denial())

    def test_declared_decimal_accepts_finite_numeric_values(self):
        for value in (1, 1.5, Decimal("1.25")):
            result = self.planner().plan(
                request(filters=(Filter("amount", "gte", "decimal", value),)),
                scope=SCOPE,
                data_version="v1",
            )
            self.assertNotIsInstance(result, Denial)

    def test_declared_string_rejects_non_string_value(self):
        result = self.planner().plan(
            request(filters=(Filter("status", "eq", "string", 1),)),
            scope=SCOPE,
            data_version="v1",
        )
        self.assertEqual(result, Denial())

    def test_sort_direction_must_be_boolean(self):
        result = self.planner().plan(request(sorts=(Sort("status", descending="yes"),)), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_duplicate_sort_field_is_denied(self):
        result = self.planner().plan(request(sorts=(Sort("status"), Sort("status", True))), scope=SCOPE, data_version="v1")
        self.assertEqual(result, Denial())

    def test_empty_scope_or_data_version_is_denied(self):
        self.assertEqual(
            self.planner().plan(request(), scope=ServerScope("tenant-a", "", "datasource-a", "user-a"), data_version="v1"),
            Denial(),
        )
        self.assertEqual(self.planner().plan(request(), scope=SCOPE, data_version=""), Denial())

    def test_invalid_registry_identity_and_stable_sort_are_rejected(self):
        with self.assertRaises(ValueError):
            QueryPlanner({"other": SPEC})
        with self.assertRaises(ValueError):
            self.planner(QuerySpec(**{**SPEC.__dict__, "stable_identity": "missing"}))

    def test_invalid_timeout_and_boolean_correlation_are_rejected(self):
        with self.assertRaises(ValueError):
            QueryPlanner({SPEC.query_id: SPEC}, timeout_seconds=True)
        with self.assertRaises(ValueError):
            self.planner().safe_error(True)

    def test_registry_is_defensively_copied(self):
        registry = {SPEC.query_id: SPEC}
        planner = QueryPlanner(registry)
        registry.clear()
        self.assertNotIsInstance(planner.plan(request(), scope=SCOPE, data_version="v1"), Denial)


if __name__ == "__main__":
    unittest.main()
