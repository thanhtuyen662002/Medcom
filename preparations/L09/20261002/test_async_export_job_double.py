#!/usr/bin/env python3
from dataclasses import replace
import math
import unittest

from async_export_job_double import AsyncExportJobs, Authority, BrowserRequest, JobState, ReportSpec


AUTH = Authority("user-a", "tenant-a", "company-a", ("branch-a", "branch-b"), ("id", "amount"), 5, 7)
SPEC = ReportSpec("synthetic.report.inbound", 2, 3, 4, {"document_id": "integer"}, ("id", "amount"), ("csv", "pdf"), True)


def request(**changes):
    values = dict(report_id=SPEC.report_id, contract_revision=2, parameters={"document_id": 10}, requested_format="csv", idempotency_key="idem-1", correlation_id="corr-1")
    values.update(changes)
    return BrowserRequest(**values)


class AsyncExportJobDoubleTests(unittest.TestCase):
    def model(self, spec=SPEC):
        return AsyncExportJobs({spec.report_id: spec})

    def accepted(self, model=None, authority=AUTH, req=None):
        model = model or self.model()
        return model, model.reserve(req or request(), authority).job

    def running(self, model=None, authority=AUTH):
        model, job = self.accepted(model, authority)
        return model, model.dispatch(job.job_id, authority, worker_owner="worker-a", worker_epoch=1).job

    def ready(self, model=None, authority=AUTH):
        model, job = self.running(model, authority)
        return model, model.complete(job.job_id, worker_owner="worker-a", worker_epoch=1, artifact_reference="synthetic:artifact-1", restore_frontier_aligned=True).job

    def test_registered_typed_request_is_accepted(self):
        self.assertEqual(self.accepted()[1].state, JobState.ACCEPTED)

    def test_dynamic_report_path_is_rejected(self):
        self.assertEqual(self.model().reserve(request(report_id="../../report.rpx"), AUTH).code, "UNSUPPORTED_REPORT")

    def test_client_authority_is_rejected_even_when_empty(self):
        self.assertEqual(self.model().reserve(request(client_authority={}), AUTH).code, "INVALID_REQUEST")

    def test_boolean_contract_revision_is_rejected(self):
        self.assertEqual(self.model().reserve(request(contract_revision=True), AUTH).code, "INVALID_REQUEST")

    def test_unknown_format_is_rejected(self):
        self.assertEqual(self.model().reserve(request(requested_format="exe"), AUTH).code, "CONTRACT_MISMATCH")

    def test_missing_parameter_is_rejected(self):
        self.assertEqual(self.model().reserve(request(parameters={}), AUTH).code, "INVALID_PARAMETERS")

    def test_boolean_cannot_impersonate_integer_parameter(self):
        self.assertEqual(self.model().reserve(request(parameters={"document_id": True}), AUTH).code, "INVALID_PARAMETERS")

    def test_nonfinite_number_parameter_is_rejected(self):
        spec = replace(SPEC, parameter_types={"document_id": "number"})
        self.assertEqual(self.model(spec).reserve(request(parameters={"document_id": math.nan}), AUTH).code, "INVALID_PARAMETERS")

    def test_empty_projection_after_authorization_is_denied(self):
        authority = replace(AUTH, permitted_fields=("secret",))
        self.assertEqual(self.model().reserve(request(), authority).code, "NOT_FOUND_OR_NOT_AUTHORIZED")

    def test_exact_idempotent_retry_reconciles(self):
        model = self.model()
        first = model.reserve(request(), AUTH)
        second = model.reserve(request(correlation_id="corr-2"), AUTH)
        self.assertEqual((second.code, second.job.job_id), ("RECONCILED", first.job.job_id))

    def test_changed_parameter_under_same_key_is_rejected(self):
        model = self.model(); model.reserve(request(), AUTH)
        self.assertEqual(model.reserve(request(parameters={"document_id": 11}), AUTH).code, "IDEMPOTENCY_MISMATCH")

    def test_changed_scope_under_same_key_is_rejected(self):
        model = self.model(); model.reserve(request(), AUTH)
        self.assertEqual(model.reserve(request(), replace(AUTH, resources=("branch-a",))).code, "IDEMPOTENCY_MISMATCH")

    def test_registry_view_is_immutable(self):
        model = self.model()
        with self.assertRaises(TypeError): model.registry[SPEC.report_id] = SPEC

    def test_job_view_is_immutable(self):
        model, job = self.accepted()
        with self.assertRaises(TypeError): model.jobs[job.job_id] = job

    def test_semantic_spec_change_requires_higher_fence(self):
        model = self.model()
        with self.assertRaises(ValueError): model.replace_spec(replace(SPEC, projection=("id",)))

    def test_dispatch_accepts_explicit_narrowing(self):
        model, job = self.accepted()
        narrow = replace(AUTH, resources=("branch-a",), permitted_fields=("id",), capability_generation=6, scope_generation=8)
        dispatched = model.dispatch(job.job_id, narrow, worker_owner="worker-a", worker_epoch=1)
        self.assertEqual((dispatched.job.resources, dispatched.job.projection), (("branch-a",), ("id",)))

    def test_dispatch_rejects_scope_widening(self):
        narrow = replace(AUTH, resources=("branch-a",))
        model, job = self.accepted(authority=narrow)
        self.assertEqual(model.dispatch(job.job_id, AUTH, worker_owner="worker-a", worker_epoch=1).code, "FENCED")

    def test_dispatch_rejects_field_widening(self):
        narrow = replace(AUTH, permitted_fields=("id",))
        model, job = self.accepted(authority=narrow)
        self.assertEqual(model.dispatch(job.job_id, AUTH, worker_owner="worker-a", worker_epoch=1).code, "FENCED")

    def test_dispatch_rejects_revoked_principal(self):
        model, job = self.accepted()
        self.assertEqual(model.dispatch(job.job_id, replace(AUTH, principal="user-b"), worker_owner="worker-a", worker_epoch=1).code, "FENCED")

    def test_dispatch_rejects_stale_generation(self):
        model, job = self.accepted()
        stale = replace(AUTH, capability_generation=4)
        self.assertEqual(model.dispatch(job.job_id, stale, worker_owner="worker-a", worker_epoch=1).code, "FENCED")

    def test_dispatch_rejects_release_drift(self):
        model, job = self.accepted()
        model.replace_spec(replace(SPEC, release_generation=4))
        self.assertEqual(model.dispatch(job.job_id, AUTH, worker_owner="worker-a", worker_epoch=1).code, "FENCED")

    def test_dispatch_rejects_boolean_worker_epoch(self):
        model, job = self.accepted()
        self.assertEqual(model.dispatch(job.job_id, AUTH, worker_owner="worker-a", worker_epoch=True).code, "INVALID_REQUEST")

    def test_second_dispatch_is_fenced(self):
        model, job = self.running()
        self.assertEqual(model.dispatch(job.job_id, AUTH, worker_owner="worker-b", worker_epoch=2).code, "FENCED")

    def test_wrong_worker_cannot_complete(self):
        model, job = self.running()
        result = model.complete(job.job_id, worker_owner="worker-b", worker_epoch=1, artifact_reference="synthetic:a", restore_frontier_aligned=True)
        self.assertEqual(result.code, "FENCED")

    def test_stale_worker_epoch_cannot_complete(self):
        model, job = self.running()
        result = model.complete(job.job_id, worker_owner="worker-a", worker_epoch=2, artifact_reference="synthetic:a", restore_frontier_aligned=True)
        self.assertEqual(result.code, "FENCED")

    def test_aligned_frontier_can_mark_ready(self):
        self.assertEqual(self.ready()[1].state, JobState.READY)

    def test_unknown_restore_frontier_quarantines_artifact(self):
        model, job = self.running()
        result = model.complete(job.job_id, worker_owner="worker-a", worker_epoch=1, artifact_reference="synthetic:a", restore_frontier_aligned=False)
        self.assertEqual((result.code, result.job.state, result.job.artifact_reference), ("QUARANTINED", JobState.QUARANTINED, None))

    def test_truthy_restore_evidence_is_rejected(self):
        model, job = self.running()
        result = model.complete(job.job_id, worker_owner="worker-a", worker_epoch=1, artifact_reference="synthetic:a", restore_frontier_aligned="yes")
        self.assertEqual(result.code, "INVALID_REQUEST")

    def test_foreign_status_matches_unknown_job_denial(self):
        model, job = self.accepted()
        foreign = replace(AUTH, tenant="tenant-b")
        self.assertEqual(model.status(job.job_id, foreign).code, model.status("missing", AUTH).code)

    def test_possession_of_job_id_is_not_download_authority(self):
        model, job = self.ready()
        foreign = replace(AUTH, principal="user-b")
        self.assertEqual(model.download(job.job_id, foreign).code, "NOT_FOUND_OR_NOT_AUTHORIZED")

    def test_revoked_field_visibility_blocks_download(self):
        model, job = self.ready()
        revoked = replace(AUTH, permitted_fields=("id",), capability_generation=6)
        self.assertEqual(model.download(job.job_id, revoked).code, "NOT_FOUND_OR_NOT_AUTHORIZED")

    def test_ready_job_download_requires_current_authority(self):
        model, job = self.ready()
        self.assertEqual(model.download(job.job_id, AUTH).code, "DOWNLOAD_AUTHORIZED")

    def test_running_job_is_not_downloadable(self):
        model, job = self.running()
        self.assertEqual(model.download(job.job_id, AUTH).code, "NOT_FOUND_OR_NOT_AUTHORIZED")


if __name__ == "__main__": unittest.main()
