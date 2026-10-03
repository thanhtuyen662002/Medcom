"""Synthetic A7 publish/rollback coordinator; no database or runtime I/O."""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Dict, Mapping, Optional


@dataclass(frozen=True)
class Candidate:
    version_id: str
    manifest_hash: str
    content_hash: str
    valid: bool
    compatible: bool
    complete_source_set: bool
    grants_authority: bool = False


@dataclass(frozen=True)
class Outcome:
    state: str
    current_version: Optional[str]
    post_commit_invalidation: bool = False


@dataclass(frozen=True)
class OperationRecord:
    kind: str
    target_id: str
    expected_current: Optional[str]
    expected_epoch: int
    outcome: Outcome


class ConfigPublicationStore:
    def __init__(self, *, publisher_epoch: int) -> None:
        if type(publisher_epoch) is not int or publisher_epoch < 1:
            raise ValueError("positive integer publisher epoch required")
        self._publisher_epoch = publisher_epoch
        self._current_version: Optional[str] = None
        self._versions: Dict[str, Candidate] = {}
        self._operations: Dict[str, OperationRecord] = {}

    @property
    def publisher_epoch(self) -> int:
        return self._publisher_epoch

    @property
    def current_version(self) -> Optional[str]:
        return self._current_version

    @property
    def versions(self) -> Mapping[str, Candidate]:
        return MappingProxyType(self._versions)

    @property
    def operations(self) -> Mapping[str, OperationRecord]:
        return MappingProxyType(self._operations)

    def stage(self, candidate: Candidate) -> Outcome:
        if not self._valid_candidate_shape(candidate):
            return Outcome("CANDIDATE_MALFORMED", self.current_version)
        existing = self._versions.get(candidate.version_id)
        if existing is not None and existing != candidate:
            return Outcome("VERSION_ID_CONFLICT", self.current_version)
        self._versions[candidate.version_id] = candidate
        if not candidate.complete_source_set:
            return Outcome("SOURCE_SET_INCOMPLETE", self.current_version)
        if not candidate.valid or not candidate.compatible or candidate.grants_authority:
            return Outcome("CANDIDATE_QUARANTINED", self.current_version)
        return Outcome("CANDIDATE_VALIDATED", self.current_version)

    def publish(self, *, operation_id: str, candidate_id: str, expected_current: Optional[str], expected_epoch: int) -> Outcome:
        malformed = self._validate_operation_shape(operation_id, candidate_id, expected_current, expected_epoch)
        if malformed:
            return malformed
        existing = self._reconcile(operation_id, "publish", candidate_id, expected_current, expected_epoch)
        if existing:
            return existing
        candidate = self._versions.get(candidate_id)
        if expected_epoch != self.publisher_epoch:
            result = Outcome("STALE_PUBLISHER_REJECTED", self.current_version)
        elif expected_current != self.current_version:
            result = Outcome("PUBLISH_CONFLICT", self.current_version)
        elif candidate is None or not self._activatable(candidate):
            result = Outcome("CANDIDATE_QUARANTINED", self.current_version)
        else:
            self._current_version = candidate.version_id
            result = Outcome("PUBLISHED_NEW", self.current_version, True)
        return self._record(operation_id, "publish", candidate_id, expected_current, expected_epoch, result)

    def rollback(self, *, operation_id: str, target_id: str, expected_current: Optional[str], expected_epoch: int) -> Outcome:
        malformed = self._validate_operation_shape(operation_id, target_id, expected_current, expected_epoch)
        if malformed:
            return malformed
        existing = self._reconcile(operation_id, "rollback", target_id, expected_current, expected_epoch)
        if existing:
            return existing
        target = self._versions.get(target_id)
        if expected_epoch != self.publisher_epoch:
            result = Outcome("STALE_PUBLISHER_REJECTED", self.current_version)
        elif expected_current != self.current_version:
            result = Outcome("ROLLBACK_CONFLICT", self.current_version)
        elif target is None or not self._activatable(target):
            result = Outcome("CANDIDATE_QUARANTINED", self.current_version)
        else:
            self._current_version = target.version_id
            result = Outcome("ROLLED_BACK_POINTER", self.current_version, True)
        return self._record(operation_id, "rollback", target_id, expected_current, expected_epoch, result)

    def rotate_publisher_epoch(self) -> None:
        self._publisher_epoch += 1

    @staticmethod
    def _activatable(candidate: Candidate) -> bool:
        return candidate.valid and candidate.compatible and candidate.complete_source_set and not candidate.grants_authority

    @staticmethod
    def _valid_candidate_shape(candidate: Candidate) -> bool:
        return isinstance(candidate, Candidate) and all(
            type(value) is str and bool(value)
            for value in (candidate.version_id, candidate.manifest_hash, candidate.content_hash)
        ) and all(
            type(value) is bool
            for value in (candidate.valid, candidate.compatible, candidate.complete_source_set, candidate.grants_authority)
        )

    def _validate_operation_shape(self, operation_id: str, target_id: str, expected_current: Optional[str], expected_epoch: int) -> Optional[Outcome]:
        if (
            type(operation_id) is not str
            or not operation_id
            or type(target_id) is not str
            or not target_id
            or (expected_current is not None and (type(expected_current) is not str or not expected_current))
            or type(expected_epoch) is not int
        ):
            return Outcome("REQUEST_MALFORMED", self.current_version)
        return None

    def _reconcile(self, operation_id: str, kind: str, target_id: str, expected_current: Optional[str], expected_epoch: int) -> Optional[Outcome]:
        record = self._operations.get(operation_id)
        if record is None:
            return None
        if (record.kind, record.target_id, record.expected_current, record.expected_epoch) == (kind, target_id, expected_current, expected_epoch):
            return record.outcome
        return Outcome("OPERATION_ID_CONFLICT", self.current_version)

    def _record(self, operation_id: str, kind: str, target_id: str, expected_current: Optional[str], expected_epoch: int, outcome: Outcome) -> Outcome:
        self._operations[operation_id] = OperationRecord(kind, target_id, expected_current, expected_epoch, outcome)
        return outcome
