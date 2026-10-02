"""Synthetic A6 audit/trace model; never connect it to a production sink."""
from dataclasses import dataclass
from enum import Enum
from threading import RLock
import unicodedata


class Rejected(ValueError):
    pass


class Outcome(Enum):
    SUCCEEDED = "Succeeded"
    REJECTED = "Rejected"
    CONFLICT = "Conflict"
    UNKNOWN = "OutcomeUnknown"


@dataclass(frozen=True)
class Authority:
    principal: str
    scope: tuple[str, str, str, str]
    session_generation: int
    permission_generation: int
    support_allowed: bool = False


@dataclass(frozen=True)
class Operation:
    operation_id: str
    correlation_id: str
    principal: str
    scope: tuple[str, str, str, str]
    session_generation: int
    permission_generation: int
    screen: str
    action: str


@dataclass(frozen=True)
class AuditEvent:
    sequence: int
    correlation_id: str
    principal: str
    scope: tuple[str, str, str, str]
    screen: str
    action: str
    outcome: Outcome
    business_reference: str | None


@dataclass(frozen=True)
class TraceEvent:
    sequence: int
    correlation_id: str
    fields: tuple[tuple[str, object], ...]


def _integer(value, minimum=1):
    if type(value) is not int or value < minimum:
        raise Rejected("bounded integer required")
    return value


def _text(value, label, maximum=128):
    if (
        type(value) is not str
        or not value
        or value.strip() != value
        or len(value) > maximum
        or any(unicodedata.category(char) == "Cc" for char in value)
    ):
        raise Rejected(f"canonical safe {label} required")
    return value


def _scope(value):
    if type(value) is not tuple or len(value) != 4:
        raise Rejected("canonical audit scope required")
    return tuple(_text(part, "scope") for part in value)


def _authority(value):
    if type(value) is not Authority:
        raise Rejected("server authority required")
    principal = _text(value.principal, "principal")
    scope = _scope(value.scope)
    _integer(value.session_generation)
    _integer(value.permission_generation)
    if type(value.support_allowed) is not bool:
        raise Rejected("boolean support grant required")
    return Authority(
        principal,
        scope,
        value.session_generation,
        value.permission_generation,
        value.support_allowed,
    )


class AuditTraceDouble:
    """Serialized reference model separating durable audit from diagnostics."""

    TRACE_FIELDS = frozenset(
        (
            "route",
            "handler",
            "logical_contract",
            "duration_ms",
            "retry_state",
            "error_fingerprint",
        )
    )

    def __init__(self, authorities, trace_window_limit=20):
        if type(authorities) is not tuple or not authorities:
            raise Rejected("non-empty immutable authority tuple required")
        self._lock = RLock()
        self._trace_window_limit = _integer(trace_window_limit)
        self._authorities = {}
        for candidate in authorities:
            candidate = _authority(candidate)
            if candidate.principal in self._authorities:
                raise Rejected("duplicate principal authority")
            self._authorities[candidate.principal] = candidate
        self._counter = 0
        self._sequence = 0
        self._operations = {}
        self._outcomes = {}
        self._audits = []
        self._traces = []

    def _current(self, authority):
        authority = _authority(authority)
        if self._authorities.get(authority.principal) != authority:
            raise Rejected("stale or foreign authority")
        return authority

    def issue(self, authority, screen, action, client_reference=None):
        with self._lock:
            authority = self._current(authority)
            screen = _text(screen, "screen")
            action = _text(action, "action")
            if client_reference is not None:
                _text(client_reference, "client reference")
            self._counter += 1
            operation_id = f"op-{self._counter:06d}"
            correlation_id = f"corr-{self._counter:06d}"
            operation = Operation(
                operation_id,
                correlation_id,
                authority.principal,
                authority.scope,
                authority.session_generation,
                authority.permission_generation,
                screen,
                action,
            )
            self._operations[operation_id] = operation
            return operation

    def record_outcome(
        self,
        operation,
        outcome,
        *,
        business_reference=None,
        trace=None,
        trace_sink_available=True,
    ):
        with self._lock:
            operation = self._registered(operation)
            if operation.operation_id in self._outcomes:
                raise Rejected("operation outcome already recorded")
            if type(outcome) is not Outcome:
                raise Rejected("typed outcome required")
            if business_reference is not None:
                business_reference = _text(
                    business_reference, "business reference"
                )
            if type(trace_sink_available) is not bool:
                raise Rejected("boolean trace sink state required")
            safe_trace = self._safe_trace(trace) if trace is not None else None
            self._sequence += 1
            event = AuditEvent(
                self._sequence,
                operation.correlation_id,
                operation.principal,
                operation.scope,
                operation.screen,
                operation.action,
                outcome,
                business_reference,
            )
            self._audits.append(event)
            self._outcomes[operation.operation_id] = outcome
            if safe_trace is not None and trace_sink_available:
                self._traces.append(
                    TraceEvent(self._sequence, operation.correlation_id, safe_trace)
                )
            return event

    def reconcile_unknown(self, operation, outcome, business_reference=None):
        with self._lock:
            operation = self._registered(operation)
            if self._outcomes.get(operation.operation_id) is not Outcome.UNKNOWN:
                raise Rejected("only unknown outcome can reconcile")
            if outcome not in (Outcome.SUCCEEDED, Outcome.REJECTED, Outcome.CONFLICT):
                raise Rejected("terminal reconciled outcome required")
            if business_reference is not None:
                business_reference = _text(
                    business_reference, "business reference"
                )
            self._sequence += 1
            event = AuditEvent(
                self._sequence,
                operation.correlation_id,
                operation.principal,
                operation.scope,
                operation.screen,
                operation.action,
                outcome,
                business_reference,
            )
            self._audits.append(event)
            self._outcomes[operation.operation_id] = outcome
            return event

    def authorize_retry(self, operation):
        with self._lock:
            operation = self._registered(operation)
            if self._outcomes.get(operation.operation_id) is Outcome.UNKNOWN:
                raise Rejected("unknown completion requires reconciliation")
            raise Rejected("recorded operation identity cannot be replayed")

    def replace_authority(self, current, replacement):
        with self._lock:
            current = self._current(current)
            replacement = _authority(replacement)
            if replacement.principal != current.principal:
                raise Rejected("principal ownership cannot transfer")
            if replacement == current:
                raise Rejected("authority change required")
            if (
                replacement.session_generation < current.session_generation
                or replacement.permission_generation < current.permission_generation
            ):
                raise Rejected("authority generation cannot regress")
            self._authorities[current.principal] = replacement
            return replacement

    def support_query(
        self, authority, correlation_id, scope, start_sequence, end_sequence
    ):
        with self._lock:
            authority = self._current(authority)
            correlation_id = _text(correlation_id, "correlation")
            scope = _scope(scope)
            start_sequence = _integer(start_sequence)
            end_sequence = _integer(end_sequence)
            if (
                not authority.support_allowed
                or scope != authority.scope
                or end_sequence < start_sequence
                or end_sequence - start_sequence + 1 > self._trace_window_limit
            ):
                raise Rejected("bounded scoped support authorization required")
            audits = tuple(
                event
                for event in self._audits
                if event.correlation_id == correlation_id
                and event.scope == scope
                and start_sequence <= event.sequence <= end_sequence
            )
            traces = tuple(
                event
                for event in self._traces
                if event.correlation_id == correlation_id
                and start_sequence <= event.sequence <= end_sequence
            )
            return audits, traces

    def snapshot(self):
        with self._lock:
            return tuple(self._audits), tuple(self._traces)

    def _registered(self, operation):
        if (
            type(operation) is not Operation
            or self._operations.get(operation.operation_id) != operation
        ):
            raise Rejected("registered operation required")
        if any(
            type(value) is not int
            for value in (
                operation.session_generation,
                operation.permission_generation,
            )
        ):
            raise Rejected("integer operation generations required")
        return operation

    def _safe_trace(self, trace):
        if type(trace) is not dict or not trace or not set(trace).issubset(self.TRACE_FIELDS):
            raise Rejected("allow-listed structured trace required")
        safe = []
        for key, value in trace.items():
            if key == "duration_ms":
                if type(value) is not int or value < 0:
                    raise Rejected("non-negative integer duration required")
            else:
                value = _text(value, key)
            safe.append((key, value))
        return tuple(sorted(safe))
