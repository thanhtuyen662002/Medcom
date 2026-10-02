"""Synthetic B3 command admission model; never invokes a handler or database."""

from dataclasses import dataclass
import hashlib
import json
import math
from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple


@dataclass(frozen=True)
class Authority:
    principal: str
    tenant: str
    company: str
    data_source: str
    scope_generation: int
    permission_generation: int


@dataclass(frozen=True)
class ActionSpec:
    action_id: str
    contract_version: int
    metadata_revision: int
    registry_revision: int
    payload_fields: Tuple[str, ...]
    payload_types: Mapping[str, str]
    readonly_fields: Tuple[str, ...]
    defaults: Mapping[str, Any]
    binding_verified: bool
    retired: bool = False


@dataclass(frozen=True)
class BrowserRequest:
    action_id: str
    contract_version: int
    metadata_revision_hint: int
    business_reference: str
    payload: Mapping[str, Any]
    idempotency_key: str
    correlation_id: str
    client_authority: Optional[Mapping[str, str]] = None


@dataclass(frozen=True)
class Envelope:
    action_id: str
    contract_version: int
    resolved_metadata_revision: int
    registry_revision: int
    authority: Authority
    business_reference: str
    payload: Mapping[str, Any]
    defaults: Mapping[str, Any]
    semantic_fingerprint: str
    idempotency_key: str
    correlation_id: str


@dataclass(frozen=True)
class Decision:
    allowed: bool
    code: str
    envelope: Optional[Envelope] = None


def _exact_positive_int(value: Any) -> bool:
    return type(value) is int and value > 0


def _nonempty_text(value: Any) -> bool:
    return type(value) is str and bool(value.strip())


def _freeze_json(value: Any) -> Any:
    """Validate a deterministic JSON value and return an immutable copy."""
    if value is None or type(value) in (bool, int, str):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError("non-finite numbers are not canonical JSON")
        return value
    if isinstance(value, Mapping):
        frozen = {}
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError("JSON object keys must be strings")
            frozen[key] = _freeze_json(item)
        return MappingProxyType(frozen)
    if type(value) in (list, tuple):
        return tuple(_freeze_json(item) for item in value)
    raise ValueError("value is not in the supported JSON contract")


def _thaw_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw_json(item) for key, item in value.items()}
    if type(value) is tuple:
        return [_thaw_json(item) for item in value]
    return value


def _matches_declared_type(value: Any, declared: str) -> bool:
    if declared == "string":
        return type(value) is str
    if declared == "integer":
        return type(value) is int
    if declared == "number":
        return type(value) in (int, float) and (type(value) is int or math.isfinite(value))
    if declared == "boolean":
        return type(value) is bool
    return False


class CommandAdmission:
    DENIED = Decision(False, "unsupported_action")
    _PAYLOAD_TYPES = frozenset({"string", "integer", "number", "boolean"})

    def __init__(self, registry: Mapping[str, ActionSpec], authority: Authority) -> None:
        self._authority = self._validated_authority(authority)
        self._registry = {}
        for key, spec in registry.items():
            normalized = self._validated_spec(spec)
            if key != normalized.action_id or key in self._registry:
                raise ValueError("registry key must uniquely equal action_id")
            self._registry[key] = normalized

    @property
    def registry(self) -> Mapping[str, ActionSpec]:
        return MappingProxyType(self._registry)

    @property
    def authority(self) -> Authority:
        return self._authority

    def replace_authority(self, authority: Authority) -> None:
        self._authority = self._validated_authority(authority)

    def replace_spec(self, spec: ActionSpec) -> None:
        normalized = self._validated_spec(spec)
        previous = self._registry.get(normalized.action_id)
        if previous is None:
            raise ValueError("cannot add an unreviewed action at runtime")
        if normalized != previous and normalized.registry_revision <= previous.registry_revision:
            raise ValueError("semantic changes require a higher registry revision")
        self._registry[normalized.action_id] = normalized

    @staticmethod
    def _validated_authority(authority: Authority) -> Authority:
        if type(authority) is not Authority:
            raise ValueError("authority must use the reviewed type")
        if not all(_nonempty_text(value) for value in (authority.principal, authority.tenant, authority.company, authority.data_source)):
            raise ValueError("authority identities must be non-empty strings")
        if not _exact_positive_int(authority.scope_generation) or not _exact_positive_int(authority.permission_generation):
            raise ValueError("authority generations must be positive integers")
        return authority

    @classmethod
    def _validated_spec(cls, spec: ActionSpec) -> ActionSpec:
        if type(spec) is not ActionSpec or not _nonempty_text(spec.action_id):
            raise ValueError("action spec identity is invalid")
        if not all(_exact_positive_int(value) for value in (spec.contract_version, spec.metadata_revision, spec.registry_revision)):
            raise ValueError("spec revisions must be positive integers")
        if type(spec.binding_verified) is not bool or type(spec.retired) is not bool:
            raise ValueError("spec lifecycle flags must be booleans")
        if type(spec.payload_fields) is not tuple or type(spec.readonly_fields) is not tuple:
            raise ValueError("field declarations must be tuples")
        if not all(_nonempty_text(field) for field in (*spec.payload_fields, *spec.readonly_fields)):
            raise ValueError("field names must be non-empty strings")
        if len(set(spec.payload_fields)) != len(spec.payload_fields) or len(set(spec.readonly_fields)) != len(spec.readonly_fields):
            raise ValueError("field declarations must be unique")
        if set(spec.payload_fields).intersection(spec.readonly_fields):
            raise ValueError("browser payload and readonly fields must be disjoint")
        if not isinstance(spec.payload_types, Mapping) or set(spec.payload_types) != set(spec.payload_fields):
            raise ValueError("every payload field requires exactly one type")
        if any(type(name) is not str or type(declared) is not str or declared not in cls._PAYLOAD_TYPES for name, declared in spec.payload_types.items()):
            raise ValueError("payload type declaration is unsupported")
        defaults = _freeze_json(spec.defaults)
        if not isinstance(defaults, Mapping):
            raise ValueError("defaults must be a JSON object")
        return ActionSpec(
            spec.action_id,
            spec.contract_version,
            spec.metadata_revision,
            spec.registry_revision,
            tuple(spec.payload_fields),
            MappingProxyType(dict(spec.payload_types)),
            tuple(spec.readonly_fields),
            defaults,
            spec.binding_verified,
            spec.retired,
        )

    @staticmethod
    def _valid_flags(reference_owned: Any, business_state_ok: Any) -> bool:
        return type(reference_owned) is bool and type(business_state_ok) is bool

    @staticmethod
    def _valid_payload(spec: ActionSpec, payload: Any) -> bool:
        if not isinstance(payload, Mapping) or set(payload) != set(spec.payload_fields):
            return False
        if any(type(field) is not str for field in payload):
            return False
        try:
            _freeze_json(payload)
        except ValueError:
            return False
        return all(_matches_declared_type(payload[field], spec.payload_types[field]) for field in spec.payload_fields)

    @staticmethod
    def _fingerprint(spec: ActionSpec, authority: Authority, business_reference: str, payload: Mapping[str, Any]) -> str:
        canonical = {
            "action": spec.action_id,
            "contract": spec.contract_version,
            "metadata_revision": spec.metadata_revision,
            "registry_revision": spec.registry_revision,
            "scope": [authority.tenant, authority.company, authority.data_source],
            "scope_generation": authority.scope_generation,
            "permission_generation": authority.permission_generation,
            "principal": authority.principal,
            "business_reference": business_reference,
            "payload": _thaw_json(payload),
            "defaults": _thaw_json(spec.defaults),
        }
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        return hashlib.sha256(encoded).hexdigest()

    def admit(self, request: BrowserRequest, *, reference_owned: bool, business_state_ok: bool) -> Decision:
        if type(request) is not BrowserRequest or not self._valid_flags(reference_owned, business_state_ok):
            return self.DENIED
        if not _nonempty_text(request.action_id):
            return self.DENIED
        spec = self._registry.get(request.action_id)
        if spec is None or spec.retired or not spec.binding_verified:
            return self.DENIED
        if request.client_authority is not None:
            return self.DENIED
        if type(request.contract_version) is not int or type(request.metadata_revision_hint) is not int:
            return self.DENIED
        if request.contract_version != spec.contract_version or request.metadata_revision_hint != spec.metadata_revision:
            return self.DENIED
        if not self._valid_payload(spec, request.payload):
            return self.DENIED
        if not all(_nonempty_text(value) for value in (request.business_reference, request.idempotency_key, request.correlation_id)):
            return self.DENIED
        if not reference_owned or not business_state_ok:
            return self.DENIED
        payload = _freeze_json(request.payload)
        fingerprint = self._fingerprint(spec, self._authority, request.business_reference, payload)
        envelope = Envelope(
            spec.action_id,
            spec.contract_version,
            spec.metadata_revision,
            spec.registry_revision,
            self._authority,
            request.business_reference,
            payload,
            spec.defaults,
            fingerprint,
            request.idempotency_key,
            request.correlation_id,
        )
        return Decision(True, "admitted", envelope)

    def dispatch(self, envelope: Envelope, *, reference_owned: bool, business_state_ok: bool) -> Decision:
        if type(envelope) is not Envelope or not self._valid_flags(reference_owned, business_state_ok):
            return self.DENIED
        if not _nonempty_text(envelope.action_id):
            return self.DENIED
        spec = self._registry.get(envelope.action_id)
        if spec is None or spec.retired or not spec.binding_verified:
            return self.DENIED
        if not all(type(value) is int for value in (envelope.contract_version, envelope.resolved_metadata_revision, envelope.registry_revision)):
            return self.DENIED
        if type(envelope.authority) is not Authority or not isinstance(envelope.defaults, Mapping):
            return self.DENIED
        try:
            defaults = _freeze_json(envelope.defaults)
        except ValueError:
            return self.DENIED
        if (
            spec.contract_version != envelope.contract_version
            or spec.metadata_revision != envelope.resolved_metadata_revision
            or spec.registry_revision != envelope.registry_revision
            or self._authority != envelope.authority
            or not self._valid_payload(spec, envelope.payload)
            or _thaw_json(spec.defaults) != _thaw_json(defaults)
            or not all(_nonempty_text(value) for value in (envelope.business_reference, envelope.idempotency_key, envelope.correlation_id))
        ):
            return self.DENIED
        expected = self._fingerprint(spec, self._authority, envelope.business_reference, envelope.payload)
        if type(envelope.semantic_fingerprint) is not str or envelope.semantic_fingerprint != expected:
            return self.DENIED
        if not reference_owned or not business_state_ok:
            return self.DENIED
        return Decision(True, "admitted_to_handler", envelope)

    @staticmethod
    def ambiguous_transport_after_dispatch(commit_excluded: bool) -> str:
        if type(commit_excluded) is not bool:
            raise ValueError("commit exclusion evidence must be boolean")
        return "FAILED_PRECOMMIT" if commit_excluded else "OUTCOME_UNKNOWN"
