"""Synthetic F2 query freshness coordinator; no network or product runtime."""

from dataclasses import dataclass
from typing import Optional, Tuple

Generation = Tuple[int, int, int]
CacheKey = Tuple[str, str, str, str, str, int]

@dataclass(frozen=True)
class Ticket:
    view_id: str
    sequence: int
    generation: Generation
    cache_key: CacheKey
    cursor: Optional[str]
    started_ms: int

@dataclass(frozen=True)
class Result:
    accepted: bool
    reason: str
    data_version: Optional[str] = None
    data_age_ms: Optional[int] = None

class QueryFreshnessCoordinator:
    def __init__(self, *, generation: Generation) -> None:
        if not self._valid_generation(generation):
            raise ValueError("typed three-part generation required")
        self.generation = generation
        self._sequence = 0
        self._latest_by_view: dict[str, int] = {}
        self._cache_entries: dict[CacheKey, tuple[str, int]] = {}

    def start(self, *, view_id: str, cache_key: CacheKey, started_ms: int, cursor: Optional[str] = None) -> Ticket:
        if type(view_id) is not str or not view_id or not self._valid_cache_key(cache_key):
            raise ValueError("typed view and scoped cache key required")
        if type(started_ms) is not int or started_ms < 0 or (cursor is not None and (type(cursor) is not str or not cursor)):
            raise ValueError("typed request clock and cursor required")
        self._sequence += 1
        self._latest_by_view[view_id] = self._sequence
        return Ticket(view_id, self._sequence, self.generation, cache_key, cursor, started_ms)

    def receive(
        self,
        ticket: Ticket,
        *,
        completed_ms: int,
        authoritative_version: Optional[str],
        authoritative_as_of_ms: Optional[int] = None,
        not_modified: bool = False,
    ) -> Result:
        if not isinstance(ticket, Ticket) or type(completed_ms) is not int or type(not_modified) is not bool:
            return Result(False, "malformed_response")
        if ticket.generation != self.generation:
            return Result(False, "generation_changed")
        if self._latest_by_view.get(ticket.view_id) != ticket.sequence:
            return Result(False, "superseded")
        if completed_ms < ticket.started_ms:
            return Result(False, "invalid_clock")
        if not_modified:
            cached = self._cache_entries.get(ticket.cache_key)
            if cached is None or authoritative_version != cached[0]:
                return Result(False, "unverified_not_modified")
            if cached[1] > completed_ms:
                return Result(False, "invalid_data_clock")
            return Result(True, "authoritative_not_modified", cached[0], completed_ms - cached[1])
        if type(authoritative_version) is not str or not authoritative_version:
            return Result(False, "missing_authoritative_version")
        if type(authoritative_as_of_ms) is not int:
            return Result(False, "missing_authoritative_as_of")
        if authoritative_as_of_ms < 0 or authoritative_as_of_ms > completed_ms:
            return Result(False, "invalid_data_clock")
        self._cache_entries[ticket.cache_key] = (authoritative_version, authoritative_as_of_ms)
        return Result(True, "authoritative_reread", authoritative_version, completed_ms - authoritative_as_of_ms)

    def change_generation(self, generation: Generation) -> None:
        if not self._valid_generation(generation):
            raise ValueError("typed three-part generation required")
        self.generation = generation
        self._latest_by_view.clear()
        self._cache_entries.clear()

    @staticmethod
    def event_hint(*, transport_connected: bool) -> str:
        del transport_connected
        return "schedule_authoritative_revalidation"

    def cursor_allowed(self, ticket: Ticket, *, cursor: str) -> bool:
        return (
            isinstance(ticket, Ticket)
            and type(cursor) is str
            and bool(cursor)
            and ticket.cursor == cursor
            and ticket.generation == self.generation
        )

    @staticmethod
    def counts_as_user_activity(trigger: str) -> bool:
        return trigger in {"click", "keyboard", "touch", "explicit_refresh"}

    @staticmethod
    def _valid_generation(generation: Generation) -> bool:
        return (
            type(generation) is tuple
            and len(generation) == 3
            and all(type(value) is int and value >= 0 for value in generation)
        )

    @staticmethod
    def _valid_cache_key(cache_key: CacheKey) -> bool:
        return (
            type(cache_key) is tuple
            and len(cache_key) == 6
            and all(type(value) is str and bool(value) for value in cache_key[:5])
            and type(cache_key[5]) is int
            and cache_key[5] >= 1
        )
