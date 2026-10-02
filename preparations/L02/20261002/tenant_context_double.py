"""Synthetic A2 tenant/data-source context model; never connect it to a DB."""
from dataclasses import dataclass
from threading import RLock


class Rejected(ValueError):
    pass


def _text(value, label):
    if type(value) is not str or not value or value.strip() != value:
        raise Rejected(f"canonical {label} required")
    return value


def _generation(value):
    if type(value) is not int or value < 1:
        raise Rejected("positive integer generation required")
    return value


@dataclass(frozen=True, order=True)
class Scope:
    tenant: str
    company: str
    data_source: str


@dataclass(frozen=True)
class Ticket:
    principal: str
    scope: Scope
    generation: int
    kind: str
    membership_generation: int


class TenantContextDouble:
    """Serialized server-authoritative mapping and generation fence.

    This adapter-independent fake deliberately does not model credentials,
    connection strings, actual pool disposal, legacy login or business data.
    """

    KINDS = frozenset(("connection", "cache", "job", "hub", "result"))

    def __init__(self, mappings, memberships):
        self._lock = RLock()
        self._mappings = {}
        self._memberships = {}
        self._membership_generations = {}
        if type(mappings) is not tuple or not mappings:
            raise Rejected("non-empty immutable mapping tuple required")
        for tenant, company, data_source, generation in mappings:
            key = (_text(tenant, "tenant"), _text(company, "company"))
            scope = Scope(key[0], key[1], _text(data_source, "data source"))
            if key in self._mappings:
                raise Rejected("ambiguous tenant/company mapping")
            self._mappings[key] = (scope, _generation(generation))
        if type(memberships) is not tuple or not memberships:
            raise Rejected("non-empty immutable membership tuple required")
        for principal, tenant, company in memberships:
            principal = _text(principal, "principal")
            key = (_text(tenant, "tenant"), _text(company, "company"))
            if key not in self._mappings:
                raise Rejected("membership without authoritative mapping")
            if key in self._memberships.get(principal, set()):
                raise Rejected("duplicate membership")
            self._memberships.setdefault(principal, set()).add(key)
            self._membership_generations.setdefault(principal, 1)

    def _resolve_locked(self, principal, tenant, company):
        principal = _text(principal, "principal")
        key = (_text(tenant, "tenant"), _text(company, "company"))
        if key not in self._memberships.get(principal, set()):
            raise Rejected("server membership denies scope")
        scope, generation = self._mappings[key]
        return principal, scope, generation

    def resolve(self, principal, tenant, company):
        """Return only the server-selected scope and mapping generation."""
        with self._lock:
            _, scope, generation = self._resolve_locked(principal, tenant, company)
            return scope, generation

    def issue(self, kind, principal, tenant, company):
        with self._lock:
            if type(kind) is not str or kind not in self.KINDS:
                raise Rejected("allow-listed resource kind required")
            principal, scope, generation = self._resolve_locked(principal, tenant, company)
            return Ticket(
                principal,
                scope,
                generation,
                kind,
                self._membership_generations[principal],
            )

    def authorize(self, ticket, principal, tenant, company, kind):
        """Recheck principal, scope, kind and current generation at use time."""
        with self._lock:
            if type(ticket) is not Ticket or type(kind) is not str or kind not in self.KINDS:
                raise Rejected("well-formed resource ticket required")
            principal, scope, generation = self._resolve_locked(principal, tenant, company)
            expected = Ticket(
                principal,
                scope,
                generation,
                kind,
                self._membership_generations[principal],
            )
            if (
                type(ticket.generation) is not int
                or type(ticket.membership_generation) is not int
                or ticket != expected
            ):
                raise Rejected("stale or cross-scope resource")
            return scope

    def replace_memberships(self, principal, expected_generation, scopes):
        """Control-plane CAS that fences resources after membership change."""
        with self._lock:
            principal = _text(principal, "principal")
            _generation(expected_generation)
            if principal not in self._membership_generations:
                raise Rejected("authoritative principal not found")
            if expected_generation != self._membership_generations[principal]:
                raise Rejected("stale membership generation")
            if type(scopes) is not tuple:
                raise Rejected("immutable membership tuple required")
            replacement = set()
            for scope in scopes:
                if type(scope) is not tuple or len(scope) != 2:
                    raise Rejected("tenant/company membership required")
                key = (_text(scope[0], "tenant"), _text(scope[1], "company"))
                if key not in self._mappings:
                    raise Rejected("membership without authoritative mapping")
                if key in replacement:
                    raise Rejected("duplicate membership")
                replacement.add(key)
            if replacement == self._memberships.get(principal, set()):
                raise Rejected("membership change must change scope set")
            self._memberships[principal] = replacement
            self._membership_generations[principal] += 1
            return self._membership_generations[principal]

    def replace_mapping(self, tenant, company, expected_generation, data_source):
        """Test-harness control-plane CAS; not a user-facing product action."""
        with self._lock:
            key = (_text(tenant, "tenant"), _text(company, "company"))
            if key not in self._mappings:
                raise Rejected("authoritative mapping not found")
            scope, generation = self._mappings[key]
            _generation(expected_generation)
            data_source = _text(data_source, "data source")
            if expected_generation != generation:
                raise Rejected("stale mapping generation")
            if data_source == scope.data_source:
                raise Rejected("mapping change must change data source")
            replacement = Scope(scope.tenant, scope.company, data_source)
            self._mappings[key] = (replacement, generation + 1)
            return replacement, generation + 1

    def snapshot(self):
        """Expose immutable sanitized identities, never a mutable backing map."""
        with self._lock:
            return tuple(sorted(self._mappings.values()))
