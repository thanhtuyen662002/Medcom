#!/usr/bin/env python3
"""Independent L10 reproductions for the local L09 R2J executable double."""

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "preparations/L09/20261002"))

from async_export_job_double import (  # noqa: E402
    AsyncExportJobs,
    Authority,
    BrowserRequest,
    JobState,
    ReportSpec,
)


AUTH = Authority("user-a", "tenant-a", "company-a", ("branch-a",), ("id",), 5, 7)
SPEC = ReportSpec("synthetic.report.qa", 2, 3, 4, {"document_id": "integer"}, ("id",), ("csv",), True)
REQUEST = BrowserRequest(SPEC.report_id, 2, {"document_id": 10}, "csv", "idem-qa", "corr-qa")


def running():
    model = AsyncExportJobs({SPEC.report_id: SPEC})
    job = model.reserve(REQUEST, AUTH).job
    dispatched = model.dispatch(job.job_id, AUTH, worker_owner="worker-a", worker_epoch=1)
    assert dispatched.allowed
    return model, dispatched.job


def reproduce():
    findings = []

    model, job = running()
    model.replace_spec(replace(SPEC, config_generation=5, evidence_verified=False))
    result = model.complete(job.job_id, worker_owner="worker-a", worker_epoch=1,
                            artifact_reference="synthetic:artifact", restore_frontier_aligned=True)
    assert result.allowed and result.job.state is JobState.READY
    findings.append({"id": "QX-R2J-01", "observed": "READY_AFTER_REGISTRY_AND_EVIDENCE_DRIFT"})

    model = AsyncExportJobs({SPEC.report_id: SPEC})
    job = model.reserve(REQUEST, AUTH).job
    result = model.dispatch(job.job_id, AUTH, worker_owner="self-asserted-worker", worker_epoch=999)
    assert result.allowed
    findings.append({"id": "QX-R2J-02", "observed": "SELF_ASSERTED_WORKER_LEASE_ACCEPTED"})

    model, job = running()
    result = model.complete(job.job_id, worker_owner="worker-a", worker_epoch=1,
                            artifact_reference="../../foreign-artifact", restore_frontier_aligned=True)
    assert result.allowed and result.job.artifact_reference == "../../foreign-artifact"
    findings.append({"id": "QX-R2J-03", "observed": "UNSCOPED_ARTIFACT_REFERENCE_ACCEPTED"})

    model = AsyncExportJobs({SPEC.report_id: SPEC})
    model.replace_spec(replace(SPEC, release_generation=4, config_generation=1))
    assert model.registry[SPEC.report_id].config_generation == 1
    findings.append({"id": "QX-R2J-04", "observed": "INDEPENDENT_CONFIG_GENERATION_REGRESSION_ACCEPTED"})

    model = AsyncExportJobs({SPEC.report_id: SPEC})
    assert not hasattr(model, "cancel") and "CANCELLED" not in {state.value for state in JobState}
    findings.append({"id": "QX-R2J-05", "observed": "NO_CANCEL_OR_KILL_SWITCH_FENCE"})

    return {"status": "REPRODUCED_FAIL_OPEN_DESIGN_DEFECTS", "count": len(findings), "findings": findings}


if __name__ == "__main__":
    print(json.dumps(reproduce(), indent=2))
