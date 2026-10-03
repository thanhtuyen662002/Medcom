#!/usr/bin/env python3
import unittest

from query_freshness_double import QueryFreshnessCoordinator

GEN = (1, 2, 3)
KEY = ("tenant-a", "company-a", "user-a", "orders.list", "filter-a", 7)

class QueryFreshnessDoubleTests(unittest.TestCase):
    def coordinator(self): return QueryFreshnessCoordinator(generation=GEN)

    def test_authoritative_result_accepted(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertTrue(c.receive(t,completed_ms=140,authoritative_version="v1",authoritative_as_of_ms=130).accepted)
    def test_reverse_order_old_result_rejected(self):
        c=self.coordinator();old=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.start(view_id="grid",cache_key=KEY,started_ms=110)
        self.assertEqual(c.receive(old,completed_ms=150,authoritative_version="v1").reason,"superseded")
    def test_latest_result_wins(self):
        c=self.coordinator();c.start(view_id="grid",cache_key=KEY,started_ms=100);latest=c.start(view_id="grid",cache_key=KEY,started_ms=110)
        self.assertTrue(c.receive(latest,completed_ms=150,authoritative_version="v2",authoritative_as_of_ms=145).accepted)
    def test_company_generation_change_rejects_old_result(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.change_generation((2,2,3))
        self.assertEqual(c.receive(t,completed_ms=150,authoritative_version="v1").reason,"generation_changed")
    def test_permission_generation_change_rejects_old_result(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.change_generation((1,3,3))
        self.assertFalse(c.receive(t,completed_ms=150,authoritative_version="v1").accepted)
    def test_session_generation_change_rejects_old_result(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.change_generation((1,2,4))
        self.assertFalse(c.receive(t,completed_ms=150,authoritative_version="v1").accepted)
    def test_data_age_uses_authoritative_as_of_not_request_latency(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=10100,authoritative_version="v1",authoritative_as_of_ms=10000).data_age_ms,100)
    def test_transport_connected_is_only_hint(self):
        self.assertEqual(self.coordinator().event_hint(transport_connected=True),"schedule_authoritative_revalidation")
    def test_transport_disconnected_is_also_hint(self):
        self.assertEqual(self.coordinator().event_hint(transport_connected=False),"schedule_authoritative_revalidation")
    def test_missing_authoritative_version_rejected(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=150,authoritative_version=None).reason,"missing_authoritative_version")
    def test_not_modified_requires_scoped_cached_version(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=150,authoritative_version="v1",not_modified=True).reason,"unverified_not_modified")
    def test_not_modified_accepts_exact_scoped_cached_version(self):
        c=self.coordinator();first=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.receive(first,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=110);second=c.start(view_id="grid",cache_key=KEY,started_ms=200)
        self.assertTrue(c.receive(second,completed_ms=220,authoritative_version="v1",not_modified=True).accepted)
    def test_not_modified_rejects_version_mismatch(self):
        c=self.coordinator();first=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.receive(first,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=110);second=c.start(view_id="grid",cache_key=KEY,started_ms=200)
        self.assertFalse(c.receive(second,completed_ms=220,authoritative_version="v2",not_modified=True).accepted)
    def test_cross_scope_cache_key_does_not_reuse_version(self):
        c=self.coordinator();first=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.receive(first,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=110);other=("tenant-a","company-b","user-a","orders.list","filter-a",7);second=c.start(view_id="grid",cache_key=other,started_ms=200)
        self.assertFalse(c.receive(second,completed_ms=220,authoritative_version="v1",not_modified=True).accepted)
    def test_cursor_bound_to_ticket_generation(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100,cursor="cursor-a")
        self.assertTrue(c.cursor_allowed(t,cursor="cursor-a"))
    def test_cursor_replay_after_generation_change_denied(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100,cursor="cursor-a")
        c.change_generation((2,2,3));self.assertFalse(c.cursor_allowed(t,cursor="cursor-a"))
    def test_cursor_substitution_denied(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100,cursor="cursor-a")
        self.assertFalse(c.cursor_allowed(t,cursor="cursor-b"))
    def test_passive_refresh_does_not_count_as_activity(self):
        c=self.coordinator()
        for trigger in ("poll","swr","signalr","focus_revalidation"): self.assertFalse(c.counts_as_user_activity(trigger))
    def test_explicit_refresh_counts_as_activity(self):
        self.assertTrue(self.coordinator().counts_as_user_activity("explicit_refresh"))
    def test_invalid_clock_rejected(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=99,authoritative_version="v1").reason,"invalid_clock")

    def test_generation_change_purges_cached_version(self):
        c=self.coordinator();first=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.receive(first,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=110);c.change_generation((1,3,3));second=c.start(view_id="grid",cache_key=KEY,started_ms=200)
        self.assertEqual(c.receive(second,completed_ms=220,authoritative_version="v1",not_modified=True).reason,"unverified_not_modified")

    def test_not_modified_preserves_authoritative_data_age(self):
        c=self.coordinator();first=c.start(view_id="grid",cache_key=KEY,started_ms=100);c.receive(first,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=110);second=c.start(view_id="grid",cache_key=KEY,started_ms=200)
        self.assertEqual(c.receive(second,completed_ms=220,authoritative_version="v1",not_modified=True).data_age_ms,110)

    def test_full_reread_requires_authoritative_as_of(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=120,authoritative_version="v1").reason,"missing_authoritative_as_of")

    def test_future_authoritative_as_of_is_rejected(self):
        c=self.coordinator();t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=120,authoritative_version="v1",authoritative_as_of_ms=121).reason,"invalid_data_clock")

    def test_boolean_clocks_are_rejected(self):
        c=self.coordinator()
        with self.assertRaises(ValueError): c.start(view_id="grid",cache_key=KEY,started_ms=True)
        t=c.start(view_id="grid",cache_key=KEY,started_ms=100)
        self.assertEqual(c.receive(t,completed_ms=True,authoritative_version="v1",authoritative_as_of_ms=1).reason,"malformed_response")

    def test_generation_shape_and_boolean_component_are_rejected(self):
        with self.assertRaises(ValueError): QueryFreshnessCoordinator(generation=(1,2))
        with self.assertRaises(ValueError): QueryFreshnessCoordinator(generation=(1,2,True))

    def test_cache_key_requires_exact_typed_scope_and_revision(self):
        c=self.coordinator()
        with self.assertRaises(ValueError): c.start(view_id="grid",cache_key=("tenant-a","","user-a","orders.list","filter-a",7),started_ms=100)
        with self.assertRaises(ValueError): c.start(view_id="grid",cache_key=("tenant-a","company-a","user-a","orders.list","filter-a",True),started_ms=100)

if __name__ == "__main__": unittest.main()
