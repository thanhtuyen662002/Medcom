"""Synthetic B5 OutcomeUnknown reconciliation model; no DB or dispatch."""
from dataclasses import dataclass
from enum import Enum
from threading import RLock


class Rejected(ValueError):
    pass


class State(Enum):
    OUTCOME_UNKNOWN = "OUTCOME_UNKNOWN"
    RECONCILING = "RECONCILING"
    RECONCILED_SUCCEEDED = "RECONCILED_SUCCEEDED"
    RECONCILED_FAILED_SAFE_TO_RETRY = "RECONCILED_FAILED_SAFE_TO_RETRY"
    MANUAL_INTERVENTION = "MANUAL_INTERVENTION"
    SUCCEEDED = "SUCCEEDED"
    RESERVED = "RESERVED"


class Proof(Enum):
    COMPLETED = "authoritative_action_specific_completion"
    NO_EFFECT_SAFE_TO_RETRY = "authoritative_no_effect_and_retry_safe"
    AMBIGUOUS = "ambiguous_or_inconsistent"


@dataclass(frozen=True)
class Snapshot:
    operation: str
    state: State
    version: int
    owner: str | None
    epoch: int
    lineage: tuple[str, ...]


def _text(value, label):
    if type(value) is not str or not value or value.strip() != value:
        raise Rejected(f"canonical {label} required")
    return value


def _positive_int(value, label):
    if type(value) is not int or value < 1:
        raise Rejected(f"positive integer {label} required")
    return value


class OutcomeReconciliationDouble:
    """CAS/fenced reconciliation of one already-unknown synthetic operation."""

    def __init__(self, operation):
        self._lock = RLock()
        self._operation = _text(operation, "operation")
        self._state = State.OUTCOME_UNKNOWN
        self._version = 1
        self._owner = None
        self._epoch = 0
        self._lineage = (self._operation,)

    def snapshot(self):
        with self._lock:
            return Snapshot(
                self._operation, self._state, self._version,
                self._owner, self._epoch, self._lineage,
            )

    def _cas(self, expected_version):
        _positive_int(expected_version, "expected version")
        if expected_version != self._version:
            raise Rejected("stale state version")

    def claim(self, expected_version, owner, epoch):
        with self._lock:
            self._cas(expected_version)
            owner = _text(owner, "reconciler owner")
            _positive_int(epoch, "reconciler epoch")
            if self._state is not State.OUTCOME_UNKNOWN or epoch <= self._epoch:
                raise Rejected("unknown state and newer fenced epoch required")
            self._state = State.RECONCILING
            self._owner = owner
            self._epoch = epoch
            self._version += 1
            return self.snapshot()

    def resolve(self, expected_version, owner, epoch, proof):
        with self._lock:
            self._cas(expected_version)
            if self._state is not State.RECONCILING:
                raise Rejected("operation is not reconciling")
            if _text(owner, "reconciler owner") != self._owner:
                raise Rejected("reconciler owner mismatch")
            _positive_int(epoch, "reconciler epoch")
            if epoch != self._epoch or type(proof) is not Proof:
                raise Rejected("stale epoch or invalid proof")
            self._state = {
                Proof.COMPLETED: State.RECONCILED_SUCCEEDED,
                Proof.NO_EFFECT_SAFE_TO_RETRY: State.RECONCILED_FAILED_SAFE_TO_RETRY,
                Proof.AMBIGUOUS: State.MANUAL_INTERVENTION,
            }[proof]
            self._version += 1
            return self.snapshot()

    def disclose_success(self, expected_version, currently_authorized):
        with self._lock:
            self._cas(expected_version)
            if type(currently_authorized) is not bool or currently_authorized is not True:
                raise Rejected("current authorization required")
            if self._state is not State.RECONCILED_SUCCEEDED:
                raise Rejected("authoritative completion proof required")
            self._state = State.SUCCEEDED
            self._version += 1
            return "SYNTHETIC_SUCCESS_ONLY"

    def reserve_retry(self, expected_version, currently_authorized, attempt):
        with self._lock:
            self._cas(expected_version)
            attempt = _text(attempt, "attempt")
            if type(currently_authorized) is not bool or currently_authorized is not True:
                raise Rejected("current retry authorization required")
            if self._state is not State.RECONCILED_FAILED_SAFE_TO_RETRY:
                raise Rejected("safe-to-retry proof required")
            if attempt in self._lineage:
                raise Rejected("fresh attempt identity required")
            self._lineage += (attempt,)
            self._state = State.RESERVED
            self._owner = None
            self._version += 1
            return self.snapshot()
