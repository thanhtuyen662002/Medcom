"""Synthetic F9 action/effect separation; no real pilot binding or mutation."""

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple


class Effect(str, Enum):
    REQUEST = "REQUEST_ONLY"
    RECEIPT = "RECEIPT_ONLY"
    STOCK_POSTING = "STOCK_POSTING_ONLY"


@dataclass(frozen=True)
class ActionSpec:
    synthetic_action_id: str
    effect: Effect
    allowed_from: Tuple[str, ...]
    result_state: str
    contract_revision: int
    exact_source_identity: str
    evidence_verified: bool


@dataclass(frozen=True)
class Authority:
    principal: str
    company: str
    warehouse: str
    scope_generation: int
    permission_generation: int


@dataclass(frozen=True)
class Record:
    state: str = "DRAFT"
    request_recorded: bool = False
    receipt_recorded: bool = False
    stock_posted: bool = False
    version: int = 0


@dataclass(frozen=True)
class Outcome:
    allowed: bool
    code: str
    record: Record
    operation_id: Optional[str] = None


def _nonempty_text(value: Any) -> bool:
    return type(value) is str and bool(value.strip())


def _positive_int(value: Any) -> bool:
    return type(value) is int and value > 0


class InboundRequestModel:
    _TRANSITIONS = {
        Effect.REQUEST: (("DRAFT",), "REQUEST_SUBMITTED"),
        Effect.RECEIPT: (("REQUEST_SUBMITTED",), "RECEIPT_RECORDED"),
        Effect.STOCK_POSTING: (("RECEIPT_RECORDED",), "STOCK_POSTED"),
    }
    _RECORD_SHAPES = {
        "DRAFT": (False, False, False),
        "REQUEST_SUBMITTED": (True, False, False),
        "RECEIPT_RECORDED": (True, True, False),
        "STOCK_POSTED": (True, True, True),
    }

    def __init__(self, registry: Mapping[str, ActionSpec], authority: Authority) -> None:
        self._authority = self._validated_authority(authority)
        self._registry: dict[str, ActionSpec] = {}
        for key, spec in registry.items():
            normalized = self._validated_spec(spec)
            if key != normalized.synthetic_action_id or key in self._registry:
                raise ValueError("registry key must uniquely equal synthetic_action_id")
            self._registry[key] = normalized
        self._operations: dict[str, tuple[str, Outcome]] = {}

    @property
    def registry(self) -> Mapping[str, ActionSpec]:
        return MappingProxyType(self._registry)

    @property
    def authority(self) -> Authority:
        return self._authority

    @property
    def operations(self) -> Mapping[str, tuple[str, Outcome]]:
        return MappingProxyType(self._operations)

    def replace_authority(self, authority: Authority) -> None:
        self._authority = self._validated_authority(authority)

    def replace_spec(self, spec: ActionSpec) -> None:
        normalized = self._validated_spec(spec)
        previous = self._registry.get(normalized.synthetic_action_id)
        if previous is None:
            raise ValueError("cannot add an unreviewed action at runtime")
        if normalized != previous and normalized.contract_revision <= previous.contract_revision:
            raise ValueError("semantic changes require a higher contract revision")
        self._registry[normalized.synthetic_action_id] = normalized

    @staticmethod
    def _validated_authority(authority: Authority) -> Authority:
        if type(authority) is not Authority:
            raise ValueError("authority must use the reviewed type")
        if not all(_nonempty_text(value) for value in (authority.principal, authority.company, authority.warehouse)):
            raise ValueError("authority identities must be non-empty strings")
        if not _positive_int(authority.scope_generation) or not _positive_int(authority.permission_generation):
            raise ValueError("authority generations must be positive integers")
        return authority

    @classmethod
    def _validated_spec(cls, spec: ActionSpec) -> ActionSpec:
        if type(spec) is not ActionSpec or not _nonempty_text(spec.synthetic_action_id) or not spec.synthetic_action_id.startswith("synthetic."):
            raise ValueError("only explicit synthetic action identities are accepted")
        if type(spec.effect) is not Effect:
            raise ValueError("effect must use the reviewed enum")
        if type(spec.allowed_from) is not tuple or any(not _nonempty_text(state) for state in spec.allowed_from):
            raise ValueError("allowed_from must be a tuple of states")
        if len(set(spec.allowed_from)) != len(spec.allowed_from) or not _nonempty_text(spec.result_state):
            raise ValueError("state declarations must be non-empty and unique")
        if (spec.allowed_from, spec.result_state) != cls._TRANSITIONS[spec.effect]:
            raise ValueError("effect and state transition do not match the bounded model")
        if not _positive_int(spec.contract_revision):
            raise ValueError("contract revision must be a positive integer")
        if not _nonempty_text(spec.exact_source_identity) or not spec.exact_source_identity.startswith("synthetic:"):
            raise ValueError("source identity must remain explicitly synthetic")
        if type(spec.evidence_verified) is not bool:
            raise ValueError("evidence flag must be boolean")
        return ActionSpec(
            spec.synthetic_action_id,
            spec.effect,
            tuple(spec.allowed_from),
            spec.result_state,
            spec.contract_revision,
            spec.exact_source_identity,
            spec.evidence_verified,
        )

    @classmethod
    def _valid_record(cls, record: Any) -> bool:
        if type(record) is not Record or type(record.version) is not int or record.version < 0:
            return False
        if any(type(flag) is not bool for flag in (record.request_recorded, record.receipt_recorded, record.stock_posted)):
            return False
        return cls._RECORD_SHAPES.get(record.state) == (
            record.request_recorded,
            record.receipt_recorded,
            record.stock_posted,
        )

    @staticmethod
    def _valid_payload(payload: Any) -> bool:
        return (
            isinstance(payload, Mapping)
            and bool(payload)
            and all(_nonempty_text(key) and _nonempty_text(value) for key, value in payload.items())
        )

    @staticmethod
    def _deny(code: str, record: Any) -> Outcome:
        return Outcome(False, code, record if type(record) is Record else Record())

    @staticmethod
    def _fingerprint(
        spec: ActionSpec,
        authority: Authority,
        record: Record,
        expected_version: int,
        payload: Mapping[str, str],
    ) -> str:
        canonical = {
            "action": spec.synthetic_action_id,
            "effect": spec.effect.value,
            "contract_revision": spec.contract_revision,
            "source_identity": spec.exact_source_identity,
            "authority": {
                "principal": authority.principal,
                "company": authority.company,
                "warehouse": authority.warehouse,
                "scope_generation": authority.scope_generation,
                "permission_generation": authority.permission_generation,
            },
            "precondition": {
                "state": record.state,
                "version": expected_version,
                "request_recorded": record.request_recorded,
                "receipt_recorded": record.receipt_recorded,
                "stock_posted": record.stock_posted,
            },
            "payload": dict(payload),
        }
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        return hashlib.sha256(encoded).hexdigest()

    def apply(
        self,
        *,
        action_id: str,
        contract_revision: int,
        authority: Authority,
        record: Record,
        expected_version: int,
        operation_id: str,
        payload: Mapping[str, str],
        business_state_ok: bool,
    ) -> Outcome:
        if not _nonempty_text(action_id) or not _nonempty_text(operation_id):
            return self._deny("INVALID_REQUEST", record)
        if type(contract_revision) is not int or type(expected_version) is not int or type(business_state_ok) is not bool:
            return self._deny("INVALID_REQUEST", record)
        if not self._valid_record(record) or not self._valid_payload(payload):
            return self._deny("INVALID_REQUEST", record)
        try:
            self._validated_authority(authority)
        except ValueError:
            return self._deny("STALE_OR_UNAUTHORIZED", record)
        spec = self._registry.get(action_id)
        if spec is None or not spec.evidence_verified:
            return self._deny("UNSUPPORTED_ACTION", record)
        fingerprint = self._fingerprint(spec, authority, record, expected_version, payload)
        prior = self._operations.get(operation_id)
        if prior is not None:
            return prior[1] if prior[0] == fingerprint else self._deny("IDEMPOTENCY_MISMATCH", record)
        if contract_revision != spec.contract_revision or authority != self._authority:
            return self._deny("STALE_OR_UNAUTHORIZED", record)
        if record.version != expected_version or record.state not in spec.allowed_from or not business_state_ok:
            return self._deny("STATE_CONFLICT", record)
        updated = Record(
            state=spec.result_state,
            request_recorded=record.request_recorded or spec.effect == Effect.REQUEST,
            receipt_recorded=record.receipt_recorded or spec.effect == Effect.RECEIPT,
            stock_posted=record.stock_posted or spec.effect == Effect.STOCK_POSTING,
            version=record.version + 1,
        )
        if not self._valid_record(updated):
            return self._deny("INVALID_TRANSITION", record)
        result = Outcome(True, "APPLIED_SYNTHETIC_EFFECT", updated, operation_id)
        self._operations[operation_id] = (fingerprint, result)
        return result

    @staticmethod
    def transport_failure(commit_excluded: bool) -> str:
        if type(commit_excluded) is not bool:
            raise ValueError("commit exclusion evidence must be boolean")
        return "FAILED_PRECOMMIT" if commit_excluded else "OUTCOME_UNKNOWN_RECONCILE"
