"""Synthetic A3 acceptance model; no authentication provider or legacy adapter."""
from dataclasses import dataclass
from enum import Enum
from threading import RLock


class Rejected(ValueError):
    pass


class Traffic(Enum):
    USER_ACCEPTED = "accepted_meaningful_user_interaction"
    POLL = "poll"
    SWR = "swr"
    SIGNALR = "signalr"
    PASSIVE_TAB = "passive_tab"


@dataclass(frozen=True)
class Ticket:
    scope: tuple[str, str, str]
    generation: int


def integer(value, minimum=0):
    if type(value) is not int or value < minimum:
        raise Rejected("integer server value required")
    return value


class SessionDouble:
    """Serialized fake server clock/store. Never wire this to HTTP or production.

    Proposed race policy: evaluate the old deadline before policy replacement;
    a shorter new policy can expire immediately. Reauthentication is external.
    A warning interval is fixture input, not a claimed Medcom requirement.
    """
    def __init__(
        self,
        scope,
        now=0,
        idle_minutes=1440,
        warning_seconds=300,
        allowed_scopes=None,
    ):
        self._lock = RLock()
        self._scope = self._checked_scope(scope)
        if allowed_scopes is None:
            allowed_scopes = (self._scope,)
        if type(allowed_scopes) is not tuple or not allowed_scopes:
            raise Rejected("non-empty immutable authorized scope tuple required")
        checked = tuple(self._checked_scope(candidate) for candidate in allowed_scopes)
        if len(set(checked)) != len(checked) or self._scope not in checked:
            raise Rejected("unique authorized scopes including current scope required")
        if any(candidate[0] != self._scope[0] for candidate in checked):
            raise Rejected("authorized scopes must retain principal")
        self._allowed_scopes = frozenset(checked)
        self._clock = integer(now)
        self._last_activity = now
        self._idle_seconds = integer(idle_minutes, 1) * 60
        self._warning_seconds = integer(warning_seconds)
        if self._warning_seconds >= self._idle_seconds:
            raise Rejected("warning interval must be shorter than idle interval")
        self._generation = 1
        self._policy_revision = 1
        self._active = True

    @staticmethod
    def _checked_scope(scope):
        if (
            type(scope) is not tuple
            or len(scope) != 3
            or any(
                type(x) is not str or not x or x.strip() != x
                for x in scope
            )
        ):
            raise Rejected("synthetic principal/company/variant scope required")
        return scope

    def _invalidate(self):
        if self._active:
            self._active = False
            self._generation += 1

    def _advance(self, now):
        integer(now)
        if now < self._clock:
            raise Rejected("server clock rollback")
        self._clock = now
        if now >= self._last_activity + self._idle_seconds:
            self._invalidate()

    def _authorize(self, now, ticket):
        self._advance(now)
        if not self._active or type(ticket) is not Ticket or type(ticket.generation) is not int or ticket != Ticket(self._scope, self._generation):
            raise Rejected("inactive or stale scope/generation")

    def ticket(self, now):
        with self._lock:
            self._advance(now)
            if not self._active:
                raise Rejected("inactive session")
            return Ticket(self._scope, self._generation)

    def traffic(self, now, ticket, kind, accepted=False):
        with self._lock:
            if type(kind) is not Traffic or type(accepted) is not bool:
                raise Rejected("server-classified traffic required")
            self._authorize(now, ticket)
            if kind is Traffic.USER_ACCEPTED and accepted:
                self._last_activity = now

    def continue_session(self, now, ticket, csrf_valid, accepted):
        with self._lock:
            self._authorize(now, ticket)
            if csrf_valid is not True or accepted is not True:
                raise Rejected("accepted CSRF-protected Continue required")
            self._last_activity = now

    def logout(self, now, ticket, csrf_valid):
        with self._lock:
            self._authorize(now, ticket)
            if csrf_valid is not True:
                raise Rejected("CSRF-protected logout required")
            self._invalidate()

    def switch_scope(self, now, ticket, scope, csrf_valid, accepted):
        with self._lock:
            target = self._checked_scope(scope)
            self._authorize(now, ticket)
            if (
                csrf_valid is not True
                or accepted is not True
                or target not in self._allowed_scopes
            ):
                raise Rejected("server-authorized scope switch required")
            self._scope = target
            self._generation += 1
            # A scope change fences old work; it does not itself advance idle.
            return Ticket(self._scope, self._generation)

    def replace_policy(self, now, idle_minutes, revision):
        with self._lock:
            seconds = integer(idle_minutes, 1) * 60
            integer(revision, 1)
            if revision <= self._policy_revision:
                raise Rejected("stale policy revision")
            self._advance(now)
            self._idle_seconds = seconds
            self._policy_revision = revision
            self._advance(now)

    def reveal_result(self, now, ticket):
        with self._lock:
            self._authorize(now, ticket)
            return "SYNTHETIC_RESULT_ONLY"

    def warning(self, now):
        with self._lock:
            self._advance(now)
            return self._active and self._last_activity + self._idle_seconds - now <= self._warning_seconds
