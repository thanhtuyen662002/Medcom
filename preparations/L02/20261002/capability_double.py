"""Adapter-independent A4 capability model for local preparation only.

This module intentionally models server-authoritative decisions without any
legacy, HTTP, SQL, or production integration.
"""

from dataclasses import dataclass
import re
from threading import RLock
from typing import FrozenSet, Mapping, Optional, Tuple


Scope = Tuple[str, str, str, str]


@dataclass(frozen=True)
class RequestContext:
    principal: str
    session_generation: int
    permission_generation: int
    scope_generation: int
    active: bool = True


@dataclass(frozen=True)
class Decision:
    allowed: bool
    public_code: str
    effective_scope: Optional[Scope] = None


@dataclass(frozen=True)
class ArtifactGrant:
    artifact_id: str
    principal: str
    action_id: str
    scope: Scope
    session_generation: int
    permission_generation: int
    scope_generation: int


class CapabilityAuthority:
    """Small fail-closed reference model for A4 acceptance tests."""

    _DENIED = Decision(False, "not_available")
    _SURFACES = frozenset(("route", "query", "mutation", "export", "config"))
    _OPAQUE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")

    def __init__(
        self,
        *,
        principal: str,
        scope: Scope,
        grants: FrozenSet[Tuple[str, str]],
    ) -> None:
        self._lock = RLock()
        self.principal = self._text(principal)
        self.scope = self._scope(scope)
        self.grants = self._grants(grants)
        self.session_generation = 1
        self.permission_generation = 1
        self.scope_generation = 1

    def context(self, *, active: bool = True) -> RequestContext:
        with self._lock:
            if type(active) is not bool:
                raise ValueError("boolean active state required")
            return RequestContext(
                self.principal,
                self.session_generation,
                self.permission_generation,
                self.scope_generation,
                active,
            )

    def authorize(
        self,
        context: RequestContext,
        *,
        surface: str,
        action_id: str,
        client_scope: Optional[Mapping[str, str]] = None,
        business_state_ok: bool = True,
    ) -> Decision:
        with self._lock:
            if not self._current(context):
                return self._DENIED
            if not self._valid_action(surface, action_id):
                return self._DENIED
            if (surface, action_id) not in self.grants:
                return self._DENIED
            if type(business_state_ok) is not bool or not business_state_ok:
                return self._DENIED
            if client_scope is not None and not self._within_server_scope(client_scope):
                return self._DENIED
            return Decision(True, "allowed", self.scope)

    def register_artifact(
        self, context: RequestContext, *, artifact_id: str, action_id: str
    ) -> Optional[ArtifactGrant]:
        with self._lock:
            if not self._opaque_id(artifact_id):
                return None
            decision = self.authorize(
                context, surface="export", action_id=action_id
            )
            if not decision.allowed:
                return None
            return ArtifactGrant(
                artifact_id,
                context.principal,
                action_id,
                self.scope,
                context.session_generation,
                context.permission_generation,
                context.scope_generation,
            )

    def authorize_download(
        self, context: RequestContext, artifact: ArtifactGrant
    ) -> Decision:
        with self._lock:
            if not self._current(context) or type(artifact) is not ArtifactGrant:
                return self._DENIED
            if not self._opaque_id(artifact.artifact_id):
                return self._DENIED
            if artifact.principal != context.principal or artifact.scope != self.scope:
                return self._DENIED
            if any(
                type(value) is not int
                for value in (
                    artifact.session_generation,
                    artifact.permission_generation,
                    artifact.scope_generation,
                )
            ):
                return self._DENIED
            if (
                artifact.session_generation,
                artifact.permission_generation,
                artifact.scope_generation,
            ) != (
                context.session_generation,
                context.permission_generation,
                context.scope_generation,
            ):
                return self._DENIED
            return self.authorize(
                context, surface="export", action_id=artifact.action_id
            )

    def revoke(self, *, grants: FrozenSet[Tuple[str, str]]) -> None:
        with self._lock:
            replacement = self._grants(grants)
            if replacement == self.grants:
                raise ValueError("grant change must change authority")
            self.grants = replacement
            self.permission_generation += 1

    def switch_scope(self, scope: Scope) -> None:
        with self._lock:
            replacement = self._scope(scope)
            if replacement == self.scope:
                raise ValueError("scope change must change authority")
            self.scope = replacement
            self.scope_generation += 1

    def rotate_session(self) -> None:
        with self._lock:
            self.session_generation += 1

    def _current(self, context: RequestContext) -> bool:
        return (
            type(context) is RequestContext
            and type(context.active) is bool
            and context.active
            and type(context.session_generation) is int
            and type(context.permission_generation) is int
            and type(context.scope_generation) is int
            and context.principal == self.principal
            and context.session_generation == self.session_generation
            and context.permission_generation == self.permission_generation
            and context.scope_generation == self.scope_generation
        )

    def _within_server_scope(self, requested: Mapping[str, str]) -> bool:
        names = ("tenant", "company", "branch", "storehouse")
        if type(requested) is not dict or not requested:
            return False
        if not set(requested).issubset(names):
            return False
        if any(type(value) is not str or not value or value.strip() != value for value in requested.values()):
            return False
        authoritative = dict(zip(names, self.scope))
        return all(authoritative.get(key) == value for key, value in requested.items())

    @classmethod
    def _text(cls, value: str) -> str:
        if type(value) is not str or not value or value.strip() != value:
            raise ValueError("canonical identifier required")
        return value

    @classmethod
    def _scope(cls, value: Scope) -> Scope:
        if type(value) is not tuple or len(value) != 4:
            raise ValueError("canonical server scope required")
        return tuple(cls._text(part) for part in value)

    @classmethod
    def _valid_action(cls, surface: str, action_id: str) -> bool:
        return (
            type(surface) is str
            and surface in cls._SURFACES
            and type(action_id) is str
            and bool(action_id)
            and action_id.strip() == action_id
        )

    @classmethod
    def _grants(cls, value):
        if type(value) is not frozenset:
            raise ValueError("immutable grant set required")
        if any(
            type(grant) is not tuple
            or len(grant) != 2
            or not cls._valid_action(grant[0], grant[1])
            for grant in value
        ):
            raise ValueError("canonical allow-listed grants required")
        return value

    @classmethod
    def _opaque_id(cls, value) -> bool:
        return type(value) is str and cls._OPAQUE_ID.fullmatch(value) is not None
