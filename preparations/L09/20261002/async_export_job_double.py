"""Synthetic R2J scope/fencing model; never renders, stores, or downloads data."""

from dataclasses import dataclass, replace
from enum import Enum
import hashlib
import json
import math
from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple


class JobState(str, Enum):
    ACCEPTED = "ACCEPTED"
    RUNNING = "RUNNING"
    READY = "READY"
    QUARANTINED = "QUARANTINED"


@dataclass(frozen=True)
class Authority:
    principal: str
    tenant: str
    company: str
    resources: Tuple[str, ...]
    permitted_fields: Tuple[str, ...]
    capability_generation: int
    scope_generation: int


@dataclass(frozen=True)
class ReportSpec:
    report_id: str
    contract_revision: int
    release_generation: int
    config_generation: int
    parameter_types: Mapping[str, str]
    projection: Tuple[str, ...]
    formats: Tuple[str, ...]
    evidence_verified: bool


@dataclass(frozen=True)
class BrowserRequest:
    report_id: str
    contract_revision: int
    parameters: Mapping[str, Any]
    requested_format: str
    idempotency_key: str
    correlation_id: str
    client_authority: Optional[Mapping[str, Any]] = None


@dataclass(frozen=True)
class Job:
    job_id: str
    state: JobState
    report_id: str
    contract_revision: int
    release_generation: int
    config_generation: int
    authority: Authority
    resources: Tuple[str, ...]
    projection: Tuple[str, ...]
    parameters: Mapping[str, Any]
    requested_format: str
    semantic_fingerprint: str
    worker_owner: Optional[str] = None
    worker_epoch: int = 0
    artifact_reference: Optional[str] = None


@dataclass(frozen=True)
class Decision:
    allowed: bool
    code: str
    job: Optional[Job] = None


def _text(value: Any) -> bool:
    return type(value) is str and bool(value.strip())


def _positive_int(value: Any) -> bool:
    return type(value) is int and value > 0


def _typed(value: Any, declared: str) -> bool:
    if declared == "string":
        return type(value) is str
    if declared == "integer":
        return type(value) is int
    if declared == "number":
        return type(value) in (int, float) and (type(value) is int or math.isfinite(value))
    if declared == "boolean":
        return type(value) is bool
    return False


class AsyncExportJobs:
    DENIED = Decision(False, "NOT_FOUND_OR_NOT_AUTHORIZED")
    _TYPES = frozenset({"string", "integer", "number", "boolean"})

    def __init__(self, registry: Mapping[str, ReportSpec]) -> None:
        self._registry: dict[str, ReportSpec] = {}
        for key, spec in registry.items():
            normalized = self._validated_spec(spec)
            if key != normalized.report_id or key in self._registry:
                raise ValueError("registry key must uniquely equal report_id")
            self._registry[key] = normalized
        self._jobs: dict[str, Job] = {}
        self._idempotency: dict[str, tuple[str, str]] = {}
        self._next_job = 1

    @property
    def registry(self) -> Mapping[str, ReportSpec]:
        return MappingProxyType(self._registry)

    @property
    def jobs(self) -> Mapping[str, Job]:
        return MappingProxyType(self._jobs)

    def replace_spec(self, spec: ReportSpec) -> None:
        normalized = self._validated_spec(spec)
        previous = self._registry.get(normalized.report_id)
        if previous is None:
            raise ValueError("cannot add an unreviewed report at runtime")
        old_fence = (previous.contract_revision, previous.release_generation, previous.config_generation)
        new_fence = (normalized.contract_revision, normalized.release_generation, normalized.config_generation)
        if normalized != previous and new_fence <= old_fence:
            raise ValueError("semantic changes require a higher reviewed fence")
        self._registry[normalized.report_id] = normalized

    @classmethod
    def _validated_spec(cls, spec: ReportSpec) -> ReportSpec:
        if type(spec) is not ReportSpec or not _text(spec.report_id) or not spec.report_id.startswith("synthetic.report."):
            raise ValueError("report identity must remain explicitly synthetic")
        if not all(_positive_int(value) for value in (spec.contract_revision, spec.release_generation, spec.config_generation)):
            raise ValueError("report fences must be positive integers")
        if type(spec.evidence_verified) is not bool:
            raise ValueError("evidence flag must be boolean")
        if not isinstance(spec.parameter_types, Mapping) or not spec.parameter_types:
            raise ValueError("typed parameters are required")
        if any(not _text(key) or type(value) is not str or value not in cls._TYPES for key, value in spec.parameter_types.items()):
            raise ValueError("parameter type declaration is invalid")
        for values in (spec.projection, spec.formats):
            if type(values) is not tuple or not values or any(not _text(value) for value in values) or len(set(values)) != len(values):
                raise ValueError("projection and formats must be non-empty unique tuples")
        return ReportSpec(
            spec.report_id,
            spec.contract_revision,
            spec.release_generation,
            spec.config_generation,
            MappingProxyType(dict(spec.parameter_types)),
            tuple(spec.projection),
            tuple(spec.formats),
            spec.evidence_verified,
        )

    @staticmethod
    def _valid_authority(authority: Any) -> bool:
        return (
            type(authority) is Authority
            and all(_text(value) for value in (authority.principal, authority.tenant, authority.company))
            and type(authority.resources) is tuple
            and type(authority.permitted_fields) is tuple
            and bool(authority.resources)
            and bool(authority.permitted_fields)
            and all(_text(value) for value in (*authority.resources, *authority.permitted_fields))
            and len(set(authority.resources)) == len(authority.resources)
            and len(set(authority.permitted_fields)) == len(authority.permitted_fields)
            and _positive_int(authority.capability_generation)
            and _positive_int(authority.scope_generation)
        )

    @staticmethod
    def _valid_parameters(spec: ReportSpec, parameters: Any) -> bool:
        if not isinstance(parameters, Mapping) or set(parameters) != set(spec.parameter_types):
            return False
        if any(type(key) is not str for key in parameters):
            return False
        return all(_typed(parameters[key], spec.parameter_types[key]) for key in spec.parameter_types)

    @staticmethod
    def _fingerprint(spec: ReportSpec, authority: Authority, request: BrowserRequest, projection: Tuple[str, ...]) -> str:
        canonical = {
            "report": spec.report_id,
            "contract": spec.contract_revision,
            "release": spec.release_generation,
            "config": spec.config_generation,
            "principal": authority.principal,
            "tenant": authority.tenant,
            "company": authority.company,
            "resources": sorted(authority.resources),
            "projection": sorted(projection),
            "parameters": dict(request.parameters),
            "format": request.requested_format,
            "capability_generation": authority.capability_generation,
            "scope_generation": authority.scope_generation,
        }
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        return hashlib.sha256(encoded).hexdigest()

    def reserve(self, request: BrowserRequest, authority: Authority) -> Decision:
        if type(request) is not BrowserRequest or not self._valid_authority(authority):
            return Decision(False, "INVALID_REQUEST")
        if not _text(request.report_id) or not _text(request.requested_format) or not _text(request.idempotency_key) or not _text(request.correlation_id):
            return Decision(False, "INVALID_REQUEST")
        if type(request.contract_revision) is not int or request.client_authority is not None:
            return Decision(False, "INVALID_REQUEST")
        spec = self._registry.get(request.report_id)
        if spec is None or not spec.evidence_verified:
            return Decision(False, "UNSUPPORTED_REPORT")
        if request.contract_revision != spec.contract_revision or request.requested_format not in spec.formats:
            return Decision(False, "CONTRACT_MISMATCH")
        if not self._valid_parameters(spec, request.parameters):
            return Decision(False, "INVALID_PARAMETERS")
        projection = tuple(field for field in spec.projection if field in authority.permitted_fields)
        if not projection:
            return self.DENIED
        fingerprint = self._fingerprint(spec, authority, request, projection)
        prior = self._idempotency.get(request.idempotency_key)
        if prior is not None:
            return Decision(True, "RECONCILED", self._jobs[prior[1]]) if prior[0] == fingerprint else Decision(False, "IDEMPOTENCY_MISMATCH")
        job_id = f"synthetic-job-{self._next_job}"
        self._next_job += 1
        frozen_parameters = MappingProxyType(dict(request.parameters))
        job = Job(
            job_id,
            JobState.ACCEPTED,
            spec.report_id,
            spec.contract_revision,
            spec.release_generation,
            spec.config_generation,
            authority,
            tuple(authority.resources),
            projection,
            frozen_parameters,
            request.requested_format,
            fingerprint,
        )
        self._jobs[job_id] = job
        self._idempotency[request.idempotency_key] = (fingerprint, job_id)
        return Decision(True, "ACCEPTED", job)

    @staticmethod
    def _same_identity(job: Job, authority: Authority) -> bool:
        return (
            AsyncExportJobs._valid_authority(authority)
            and authority.principal == job.authority.principal
            and authority.tenant == job.authority.tenant
            and authority.company == job.authority.company
        )

    @classmethod
    def _can_narrow_for_dispatch(cls, job: Job, authority: Authority) -> bool:
        return (
            cls._same_identity(job, authority)
            and set(authority.resources).issubset(job.resources)
            and set(authority.permitted_fields).issubset(job.projection)
            and authority.capability_generation >= job.authority.capability_generation
            and authority.scope_generation >= job.authority.scope_generation
        )

    def dispatch(self, job_id: str, authority: Authority, *, worker_owner: str, worker_epoch: int) -> Decision:
        if not _text(job_id) or not _text(worker_owner) or not _positive_int(worker_epoch):
            return Decision(False, "INVALID_REQUEST")
        job = self._jobs.get(job_id)
        if job is None:
            return self.DENIED
        spec = self._registry.get(job.report_id)
        if spec is None or not spec.evidence_verified:
            return Decision(False, "FENCED")
        if (spec.contract_revision, spec.release_generation, spec.config_generation) != (job.contract_revision, job.release_generation, job.config_generation):
            return Decision(False, "FENCED")
        if job.state is not JobState.ACCEPTED or worker_epoch <= job.worker_epoch or not self._can_narrow_for_dispatch(job, authority):
            return Decision(False, "FENCED")
        narrowed_projection = tuple(field for field in job.projection if field in authority.permitted_fields)
        running = replace(
            job,
            state=JobState.RUNNING,
            authority=authority,
            resources=tuple(authority.resources),
            projection=narrowed_projection,
            worker_owner=worker_owner,
            worker_epoch=worker_epoch,
        )
        self._jobs[job_id] = running
        return Decision(True, "DISPATCHED", running)

    def complete(self, job_id: str, *, worker_owner: str, worker_epoch: int, artifact_reference: str, restore_frontier_aligned: bool) -> Decision:
        if not _text(job_id) or not _text(worker_owner) or not _positive_int(worker_epoch) or not _text(artifact_reference) or type(restore_frontier_aligned) is not bool:
            return Decision(False, "INVALID_REQUEST")
        job = self._jobs.get(job_id)
        if job is None:
            return self.DENIED
        if job.state is not JobState.RUNNING or job.worker_owner != worker_owner or job.worker_epoch != worker_epoch:
            return Decision(False, "FENCED")
        terminal = replace(
            job,
            state=JobState.READY if restore_frontier_aligned else JobState.QUARANTINED,
            artifact_reference=artifact_reference if restore_frontier_aligned else None,
        )
        self._jobs[job_id] = terminal
        return Decision(restore_frontier_aligned, "READY" if restore_frontier_aligned else "QUARANTINED", terminal)

    @classmethod
    def _can_view(cls, job: Job, authority: Authority) -> bool:
        return (
            cls._same_identity(job, authority)
            and set(job.resources).issubset(authority.resources)
            and set(job.projection).issubset(authority.permitted_fields)
            and authority.capability_generation >= job.authority.capability_generation
            and authority.scope_generation >= job.authority.scope_generation
        )

    def status(self, job_id: str, authority: Authority) -> Decision:
        job = self._jobs.get(job_id) if _text(job_id) else None
        if job is None or not self._can_view(job, authority):
            return self.DENIED
        return Decision(True, "VISIBLE", job)

    def download(self, job_id: str, authority: Authority) -> Decision:
        visible = self.status(job_id, authority)
        if not visible.allowed or visible.job.state is not JobState.READY or not visible.job.artifact_reference:
            return self.DENIED
        return Decision(True, "DOWNLOAD_AUTHORIZED", visible.job)
