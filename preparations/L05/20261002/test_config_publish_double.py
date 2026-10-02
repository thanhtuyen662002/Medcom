#!/usr/bin/env python3
import unittest

from config_publish_double import Candidate, ConfigPublicationStore


def candidate(version="v1", **changes):
    values = dict(version_id=version, manifest_hash=f"manifest-{version}", content_hash=f"content-{version}", valid=True, compatible=True, complete_source_set=True)
    values.update(changes)
    return Candidate(**values)


class ConfigPublishDoubleTests(unittest.TestCase):
    def store(self): return ConfigPublicationStore(publisher_epoch=7)

    def test_valid_candidate_stages(self):
        self.assertEqual(self.store().stage(candidate()).state, "CANDIDATE_VALIDATED")
    def test_invalid_candidate_quarantined(self):
        self.assertEqual(self.store().stage(candidate(valid=False)).state, "CANDIDATE_QUARANTINED")
    def test_incompatible_candidate_quarantined(self):
        self.assertEqual(self.store().stage(candidate(compatible=False)).state, "CANDIDATE_QUARANTINED")
    def test_incomplete_manifest_rejected(self):
        self.assertEqual(self.store().stage(candidate(complete_source_set=False)).state, "SOURCE_SET_INCOMPLETE")
    def test_configuration_cannot_grant_authority(self):
        self.assertEqual(self.store().stage(candidate(grants_authority=True)).state, "CANDIDATE_QUARANTINED")
    def test_same_version_id_with_different_bytes_conflicts(self):
        s=self.store();s.stage(candidate());self.assertEqual(s.stage(candidate(content_hash="other")).state,"VERSION_ID_CONFLICT")
    def test_publish_uses_expected_pointer(self):
        s=self.store();s.stage(candidate());r=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual((r.state,r.current_version),("PUBLISHED_NEW","v1"))
    def test_publish_sets_post_commit_invalidation(self):
        s=self.store();s.stage(candidate());r=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertTrue(r.post_commit_invalidation)
    def test_stale_pointer_conflicts(self):
        s=self.store();s.stage(candidate());s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7);s.stage(candidate("v2"))
        self.assertEqual(s.publish(operation_id="op2",candidate_id="v2",expected_current=None,expected_epoch=7).state,"PUBLISH_CONFLICT")
    def test_stale_publisher_epoch_rejected(self):
        s=self.store();s.stage(candidate());s.rotate_publisher_epoch()
        self.assertEqual(s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7).state,"STALE_PUBLISHER_REJECTED")
    def test_missing_candidate_cannot_publish(self):
        self.assertEqual(self.store().publish(operation_id="op1",candidate_id="missing",expected_current=None,expected_epoch=7).state,"CANDIDATE_QUARANTINED")
    def test_lost_ack_reuses_recorded_outcome(self):
        s=self.store();s.stage(candidate());first=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7);second=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual(first,second)
    def test_lost_ack_does_not_create_second_version(self):
        s=self.store();s.stage(candidate());s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7);s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual(list(s.versions),["v1"])
    def test_rollback_changes_pointer_only(self):
        s=self.store();s.stage(candidate("v1"));s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7);s.stage(candidate("v2"));s.publish(operation_id="op2",candidate_id="v2",expected_current="v1",expected_epoch=7);r=s.rollback(operation_id="op3",target_id="v1",expected_current="v2",expected_epoch=7)
        self.assertEqual((r.state,s.current_version),("ROLLED_BACK_POINTER","v1"));self.assertEqual(set(s.versions),{"v1","v2"})
    def test_rollback_stale_pointer_conflicts(self):
        s=self.store();s.stage(candidate("v1"));s.stage(candidate("v2"));s.publish(operation_id="op1",candidate_id="v2",expected_current=None,expected_epoch=7)
        self.assertEqual(s.rollback(operation_id="op2",target_id="v1",expected_current="v1",expected_epoch=7).state,"ROLLBACK_CONFLICT")
    def test_rollback_stale_epoch_rejected(self):
        s=self.store();s.stage(candidate("v1"));s.rotate_publisher_epoch()
        self.assertEqual(s.rollback(operation_id="op1",target_id="v1",expected_current=None,expected_epoch=7).state,"STALE_PUBLISHER_REJECTED")
    def test_rollback_to_invalid_version_denied(self):
        s=self.store();s.stage(candidate("v1",valid=False))
        self.assertEqual(s.rollback(operation_id="op1",target_id="v1",expected_current=None,expected_epoch=7).state,"CANDIDATE_QUARANTINED")
    def test_rollback_lost_ack_reconciles(self):
        s=self.store();s.stage(candidate("v1"));s.stage(candidate("v2"));s.publish(operation_id="op1",candidate_id="v2",expected_current=None,expected_epoch=7);first=s.rollback(operation_id="op2",target_id="v1",expected_current="v2",expected_epoch=7);second=s.rollback(operation_id="op2",target_id="v1",expected_current="v2",expected_epoch=7)
        self.assertEqual(first,second)
    def test_quarantine_never_moves_pointer(self):
        s=self.store();s.stage(candidate("bad",valid=False));s.publish(operation_id="op1",candidate_id="bad",expected_current=None,expected_epoch=7)
        self.assertIsNone(s.current_version)
    def test_timestamp_is_not_part_of_conflict_authority(self):
        s=self.store();s.stage(candidate());self.assertFalse(hasattr(s,"timestamp"))

    def test_candidate_identity_and_flags_are_typed(self):
        s=self.store()
        for item in (candidate(version=""), candidate(manifest_hash=""), candidate(content_hash=""), candidate(valid=1)):
            self.assertEqual(s.stage(item).state,"CANDIDATE_MALFORMED")
        self.assertEqual(dict(s.versions),{})

    def test_publisher_epoch_requires_positive_exact_integer(self):
        for value in (True,0,-1,"7"):
            with self.assertRaises(ValueError): ConfigPublicationStore(publisher_epoch=value)

    def test_boolean_expected_epoch_is_malformed(self):
        s=self.store();s.stage(candidate())
        self.assertEqual(s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=True).state,"REQUEST_MALFORMED")

    def test_empty_operation_or_target_identity_is_malformed(self):
        s=self.store()
        self.assertEqual(s.publish(operation_id="",candidate_id="v1",expected_current=None,expected_epoch=7).state,"REQUEST_MALFORMED")
        self.assertEqual(s.publish(operation_id="op1",candidate_id="",expected_current=None,expected_epoch=7).state,"REQUEST_MALFORMED")

    def test_operation_id_cannot_be_reused_for_different_candidate(self):
        s=self.store();s.stage(candidate("v1"));s.stage(candidate("v2"));s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual(s.publish(operation_id="op1",candidate_id="v2",expected_current="v1",expected_epoch=7).state,"OPERATION_ID_CONFLICT")

    def test_operation_id_cannot_cross_publish_and_rollback(self):
        s=self.store();s.stage(candidate("v1"));s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual(s.rollback(operation_id="op1",target_id="v1",expected_current="v1",expected_epoch=7).state,"OPERATION_ID_CONFLICT")

    def test_failed_decision_is_stable_for_exact_retry(self):
        s=self.store();first=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7);s.stage(candidate("v1"));second=s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        self.assertEqual(first,second);self.assertEqual(first.state,"CANDIDATE_QUARANTINED");self.assertIsNone(s.current_version)

    def test_failed_operation_id_cannot_change_semantics(self):
        s=self.store();s.publish(operation_id="op1",candidate_id="missing",expected_current=None,expected_epoch=7);s.stage(candidate("v1"))
        self.assertEqual(s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7).state,"OPERATION_ID_CONFLICT")

    def test_version_and_operation_views_are_read_only(self):
        s=self.store();s.stage(candidate())
        with self.assertRaises(TypeError): s.versions["v2"]=candidate("v2")
        s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7)
        with self.assertRaises(TypeError): s.operations["op2"]=s.operations["op1"]

    def test_current_pointer_has_no_external_setter(self):
        s=self.store()
        with self.assertRaises(AttributeError): s.current_version="forged"

    def test_epoch_rotation_fences_old_requests(self):
        s=self.store();s.stage(candidate());s.rotate_publisher_epoch()
        self.assertEqual(s.publisher_epoch,8)
        self.assertEqual(s.publish(operation_id="op1",candidate_id="v1",expected_current=None,expected_epoch=7).state,"STALE_PUBLISHER_REJECTED")

if __name__ == "__main__": unittest.main()
