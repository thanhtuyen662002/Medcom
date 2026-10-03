"""Synthetic B1 query-planning boundary; never emits or executes SQL."""

from dataclasses import dataclass
from decimal import Decimal
import math
from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple


@dataclass(frozen=True)
class Filter:
    field: str
    operator: str
    value_type: str
    value: Any


@dataclass(frozen=True)
class Sort:
    field: str
    descending: bool = False


@dataclass(frozen=True)
class ServerScope:
    tenant: str
    company: str
    data_source: str
    principal: str


@dataclass(frozen=True)
class QuerySpec:
    query_id: str
    revision: int
    catalog_generation: int
    shape_fingerprint: str
    filters: Mapping[str, Tuple[Tuple[str, str], ...]]
    sort_fields: Tuple[str, ...]
    stable_identity: str
    max_page_size: int
    read_only: bool = True
    null_semantics: str = "nulls_last; null_equals_only_null"


@dataclass(frozen=True)
class Request:
    query_id: str
    revision: int
    catalog_generation: int
    shape_fingerprint: str
    filters: Tuple[Filter, ...] = ()
    sorts: Tuple[Sort, ...] = ()
    page: int = 0
    page_size: int = 50
    client_authority: Optional[Mapping[str, str]] = None


@dataclass(frozen=True)
class Plan:
    query_id: str
    scope: ServerScope
    filters: Tuple[Filter, ...]
    sorts: Tuple[Sort, ...]
    page: int
    page_size: int
    consistency_token: str
    timeout_seconds: int
    cancellation_required: bool
    null_semantics: str


@dataclass(frozen=True)
class Denial:
    code: str = "unsupported_query"


class QueryPlanner:
    def __init__(self, registry: Mapping[str, QuerySpec], *, timeout_seconds: int = 30) -> None:
        if type(timeout_seconds) is not int or timeout_seconds < 1:
            raise ValueError("positive integer timeout required")
        normalized = {}
        for key, spec in registry.items():
            if type(key) is not str or not key or not isinstance(spec, QuerySpec) or key != spec.query_id:
                raise ValueError("registry key must match a nonempty query ID")
            if (
                type(spec.revision) is not int
                or spec.revision < 1
                or type(spec.catalog_generation) is not int
                or spec.catalog_generation < 1
                or type(spec.max_page_size) is not int
                or spec.max_page_size < 1
                or type(spec.read_only) is not bool
                or type(spec.shape_fingerprint) is not str
                or not spec.shape_fingerprint
                or type(spec.stable_identity) is not str
                or not spec.stable_identity
                or type(spec.null_semantics) is not str
                or not spec.null_semantics
            ):
                raise ValueError("invalid query specification scalars")
            sort_fields = tuple(spec.sort_fields)
            if (
                len(sort_fields) != len(set(sort_fields))
                or any(type(field) is not str or not field for field in sort_fields)
                or spec.stable_identity not in sort_fields
            ):
                raise ValueError("invalid query sort specification")
            filters = {}
            for field, rules in spec.filters.items():
                frozen_rules = tuple(rules)
                if (
                    type(field) is not str
                    or not field
                    or not frozen_rules
                    or any(
                        not isinstance(rule, tuple)
                        or len(rule) != 2
                        or any(type(part) is not str or not part for part in rule)
                        for rule in frozen_rules
                    )
                ):
                    raise ValueError("invalid query filter specification")
                filters[field] = frozen_rules
            normalized[key] = QuerySpec(
                spec.query_id,
                spec.revision,
                spec.catalog_generation,
                spec.shape_fingerprint,
                MappingProxyType(filters),
                sort_fields,
                spec.stable_identity,
                spec.max_page_size,
                spec.read_only,
                spec.null_semantics,
            )
        self.registry = MappingProxyType(normalized)
        self.timeout_seconds = timeout_seconds

    def plan(self, request: Request, *, scope: ServerScope, data_version: str) -> Plan | Denial:
        if not isinstance(request, Request) or not self._valid_scope(scope) or type(data_version) is not str or not data_version:
            return Denial()
        if (
            type(request.query_id) is not str
            or not request.query_id
            or type(request.revision) is not int
            or type(request.catalog_generation) is not int
            or type(request.shape_fingerprint) is not str
            or type(request.page) is not int
            or type(request.page_size) is not int
        ):
            return Denial()
        spec = self.registry.get(request.query_id)
        if spec is None or not spec.read_only:
            return Denial()
        if (
            request.revision != spec.revision
            or request.catalog_generation != spec.catalog_generation
            or request.shape_fingerprint != spec.shape_fingerprint
        ):
            return Denial()
        if request.page < 0 or request.page > 2_147_483_647:
            return Denial()
        if request.page_size < 1 or request.page_size > spec.max_page_size:
            return Denial()
        if not self._filters_allowed(spec, request.filters):
            return Denial()
        if (
            any(not isinstance(sort, Sort) or type(sort.descending) is not bool or sort.field not in spec.sort_fields for sort in request.sorts)
            or len({sort.field for sort in request.sorts}) != len(request.sorts)
        ):
            return Denial()
        sorts = request.sorts
        if not any(sort.field == spec.stable_identity for sort in sorts):
            sorts += (Sort(spec.stable_identity),)
        return Plan(
            request.query_id,
            scope,
            request.filters,
            sorts,
            request.page,
            request.page_size,
            data_version,
            self.timeout_seconds,
            True,
            spec.null_semantics,
        )

    @staticmethod
    def safe_error(correlation_id: str) -> Mapping[str, str]:
        if type(correlation_id) is not str or not correlation_id:
            raise ValueError("correlation ID required")
        return {"code": "query_failed", "correlation_id": correlation_id}

    @staticmethod
    def _filters_allowed(spec: QuerySpec, filters: Tuple[Filter, ...]) -> bool:
        for item in filters:
            if not isinstance(item, Filter):
                return False
            allowed = spec.filters.get(item.field)
            if (
                allowed is None
                or (item.operator, item.value_type) not in allowed
                or not QueryPlanner._value_matches(item.value_type, item.value)
            ):
                return False
        return True

    @staticmethod
    def _valid_scope(scope: ServerScope) -> bool:
        return isinstance(scope, ServerScope) and all(
            type(value) is str and bool(value)
            for value in (scope.tenant, scope.company, scope.data_source, scope.principal)
        )

    @staticmethod
    def _value_matches(value_type: str, value: Any) -> bool:
        if value_type == "string":
            return type(value) is str
        if value_type == "integer":
            return type(value) is int
        if value_type == "boolean":
            return type(value) is bool
        if value_type == "decimal":
            if type(value) not in (int, float, Decimal):
                return False
            return value.is_finite() if isinstance(value, Decimal) else math.isfinite(value)
        return False
