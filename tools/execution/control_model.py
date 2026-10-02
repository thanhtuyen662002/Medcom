"""Synthetic, in-memory control protocol reference model; NOT a dispatcher.

No network, credentials, real leases, Git refs or admission releases are used.
One process lock deliberately assumes the serialization a real dispatcher must
prove across durable control state AND branch mutation. Passing these tests does
not demonstrate that GitHub or the available connector supplies that primitive.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, replace
from math import isfinite
from threading import RLock

LANES = frozenset({f"L{i:02d}" for i in range(1, 11)})


class Rejected(ValueError):
    """The entire attempted transition is rejected, without partial allocation."""


@dataclass(frozen=True)
class Resources:
    writer: bool = False
    ci_paths: tuple[str, ...] = ()
    heavy: bool = False


@dataclass(frozen=True)
class Request:
    request_id: str
    lane: str
    run: str
    branch: str
    branch_head: str
    paths: tuple[str, ...]
    resources: Resources
    age: int


@dataclass(frozen=True)
class Permit:
    lane: str
    run: str
    epoch: int


@dataclass(frozen=True)
class Lease:
    permit: Permit
    branch: str
    branch_head: str
    paths: tuple[str, ...]
    resources: Resources
    heartbeat_at: float
    expires_at: float


def overlaps(a: str, b: str) -> bool:
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def clean_paths(paths: tuple[str, ...]) -> None:
    if not isinstance(paths, tuple) or not paths or any(not isinstance(p, str) or not p or p.startswith("/") or "\\" in p
                        or any(s in ("", ".", "..") for s in p.split("/"))
                        for p in paths):
        raise Rejected("bounded canonical repository paths required")
    if len(set(paths)) != len(paths) or any(overlaps(a, b) for i, a in enumerate(paths)
                                             for b in paths[i + 1:]):
        raise Rejected("path claims must be unique and minimally non-overlapping")


def clock_ok(now):
    try:
        valid = not isinstance(now, bool) and isinstance(now, (int, float)) and isfinite(now) and now >= 0
    except OverflowError:
        valid = False
    if not valid:
        raise Rejected("finite nonnegative synthetic clock required")


class ControlModel:
    """Local-only serialized transitions, with an injectable synthetic clock.

    `head` is a monotonic synthetic whole-registry revision, not a Git OID.
    `run` is a caller-supplied fixture identity, not an authenticated identity.
    Every mutating public operation checks the expected whole-control head.
    Failed transitions do not advance the head or allocate resources.
    """

    def __init__(self, branches: dict[str, str], *, ttl=2700, heartbeat_gap=600):
        if any(isinstance(value, bool) or not isinstance(value, (int, float))
               or not isfinite(value) or value <= 0 for value in (ttl, heartbeat_gap)):
            raise ValueError("finite positive numeric clock intervals required")
        if not isinstance(branches, dict) or not all(isinstance(k, str) and k and isinstance(v, str) and v
                                                    for k, v in branches.items()):
            raise ValueError("explicit string synthetic branch/head map required")
        self._lock = RLock()
        self._head = 0
        self._age = 0
        self._branches = dict(branches)
        self._leases: dict[str, Lease] = {}
        self._epochs: dict[str, int] = {}
        self._queue: list[Request] = []
        self.ttl, self.heartbeat_gap = ttl, heartbeat_gap

    def snapshot(self):
        with self._lock:
            return deepcopy({"head": self._head, "branches": self._branches,
                             "leases": self._leases, "epochs": self._epochs,
                             "queue": self._queue})

    def _cas(self, expected):
        if type(expected) is not int or expected < 0 or expected != self._head:
            raise Rejected("whole control head changed")

    def _commit(self):
        self._head += 1
        return self._head

    def _expiry(self, now):
        clock_ok(now)
        future = now + self.ttl
        clock_ok(future)
        if future <= now:
            raise Rejected("lease expiry must advance finite clock")
        return future

    def _live(self, permit, now):
        clock_ok(now)
        if (not isinstance(permit, Permit) or type(permit.epoch) is not int
                or permit.epoch <= 0 or not isinstance(permit.lane, str)
                or not permit.lane or not isinstance(permit.run, str) or not permit.run):
            raise Rejected("typed owner/run/positive integer epoch required")
        lease = self._leases.get(permit.lane)
        if lease is None or lease.permit != permit:
            raise Rejected("owner/run/epoch fence rejected")
        if now < lease.heartbeat_at:
            raise Rejected("clock moved backwards")
        if now >= lease.expires_at:
            raise Rejected("lease TTL expired; expiry does not authorize takeover")
        if now - lease.heartbeat_at > self.heartbeat_gap:
            raise Rejected("heartbeat overdue")
        if self._branches.get(lease.branch) != lease.branch_head:
            raise Rejected("current custody branch head changed; owner recovery required")
        return lease

    def _bundle_ok(self, paths, resources):
        clean_paths(paths)
        if (not isinstance(resources, Resources) or type(resources.writer) is not bool
                or type(resources.heavy) is not bool or not isinstance(resources.ci_paths, tuple)):
            raise Rejected("typed boolean resource flags and tuple CI paths required")
        if len(resources.ci_paths) > 2:
            return False
        if resources.ci_paths:
            clean_paths(resources.ci_paths)
        if any(not any(c == p or c.startswith(p + "/") for p in paths)
               for c in resources.ci_paths):
            return False
        if any(overlaps(a, b) for i, a in enumerate(resources.ci_paths)
               for b in resources.ci_paths[i + 1:]):
            return False
        return True

    def _fits(self, lane, branch, paths, resources, *, replacing=False):
        if not self._bundle_ok(paths, resources):
            return False
        others = [x for k, x in self._leases.items() if not (replacing and k == lane)]
        if any(x.permit.lane == lane or x.branch == branch or
               any(overlaps(p, q) for p in paths for q in x.paths) for x in others):
            return False
        return (sum(x.resources.writer for x in others) + resources.writer <= 4
                and sum(len(x.resources.ci_paths) for x in others)
                + len(resources.ci_paths) <= 4
                and sum(x.resources.heavy for x in others) + resources.heavy <= 1)

    def enqueue(self, expected, request_id, lane, run, branch, branch_head,
                paths, resources):
        with self._lock:
            self._cas(expected)
            if not all(isinstance(value, str) and value
                       for value in (request_id, lane, run, branch, branch_head)):
                raise Rejected("explicit synthetic identity/head required")
            if lane not in LANES:
                raise Rejected("lane must be one of L01 through L10")
            if lane in self._leases or any(r.lane == lane or r.request_id == request_id
                                          for r in self._queue):
                raise Rejected("one active request or lease per lane")
            if branch == "main" and lane != "L01":
                raise Rejected("only integrator owns main")
            if self._branches.get(branch) != branch_head:
                raise Rejected("request branch head changed")
            if not self._bundle_ok(paths, resources):
                raise Rejected("invalid resource/path bundle")
            self._age += 1
            self._queue.append(Request(request_id, lane, run, branch, branch_head,
                                       paths, resources, self._age))
            return self._commit()

    def cancel_request(self, expected, request_id, lane, run):
        """Cancel only the caller's exact queued identity; never an active lease."""
        with self._lock:
            self._cas(expected)
            if not all(type(value) is str and value for value in (request_id, lane, run)):
                raise Rejected("exact queued request identity required")
            matches = [r for r in self._queue
                       if (r.request_id, r.lane, r.run) == (request_id, lane, run)]
            if len(matches) != 1:
                raise Rejected("queued request owner/run fence rejected")
            self._queue.remove(matches[0])
            return self._commit()

    def admit_next(self, expected, now):
        with self._lock:
            self._cas(expected)
            expiry = self._expiry(now)
            for r in sorted(self._queue, key=lambda x: x.age):
                if (self._branches.get(r.branch) != r.branch_head or
                        not self._fits(r.lane, r.branch, r.paths, r.resources)):
                    continue
                epoch = self._epochs.get(r.lane, 0) + 1
                permit = Permit(r.lane, r.run, epoch)
                self._leases[r.lane] = Lease(permit, r.branch, r.branch_head,
                                            r.paths, r.resources, now, expiry)
                self._epochs[r.lane] = epoch
                self._queue.remove(r)
                self._commit()
                return permit
            raise Rejected("no compatible waiting request")

    def heartbeat(self, expected, permit, now):
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            expiry = self._expiry(now)
            self._leases[permit.lane] = replace(lease, heartbeat_at=now,
                                                expires_at=expiry)
            return self._commit()

    def release_quantum(self, expected, permit, now):
        """Release writer/heavy capacity; retain lane/path custody and CI tokens."""
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            self._leases[permit.lane] = replace(
                lease, resources=replace(lease.resources, writer=False, heavy=False))
            return self._commit()

    def change_resources(self, expected, permit, now, resources):
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            if not self._fits(permit.lane, lease.branch, lease.paths, resources,
                              replacing=True):
                raise Rejected("resource transaction exceeds cap or conflicts")
            # Fairness: a finishing/released run cannot reacquire scarce capacity
            # ahead of an older compatible waiting request.
            increasing = (resources.writer > lease.resources.writer or
                          resources.heavy > lease.resources.heavy or
                          len(resources.ci_paths) > len(lease.resources.ci_paths))
            if increasing and any(self._fits(r.lane, r.branch, r.paths, r.resources)
                                  and self._branches.get(r.branch) == r.branch_head
                                  for r in self._queue):
                raise Rejected("compatible waiting request has priority")
            self._leases[permit.lane] = replace(lease, resources=resources)
            return self._commit()

    def retire(self, expected, permit, now):
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            if lease.resources.ci_paths:
                raise Rejected("CI must be drained before retiring custody")
            del self._leases[permit.lane]
            return self._commit()

    def fence_expired(self, expected, lane, now, *, quiescent_verified=False):
        """Synthetic owner decision only; model never infers real quiescence."""
        with self._lock:
            self._cas(expected)
            clock_ok(now)
            lease = self._leases.get(lane)
            if not lease or now < lease.expires_at or quiescent_verified is not True:
                raise Rejected("expired custody and explicit quiescence proof required")
            if lease.resources.ci_paths:
                raise Rejected("outstanding CI requires owner recovery")
            del self._leases[lane]
            self._epochs[lane] += 1
            return self._commit()

    def mutate_branch(self, expected, permit, now, branch_head, new_head, paths):
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            clean_paths(paths)
            if lease.branch == "main":
                raise Rejected("main requires integration source and base guard")
            if not lease.resources.writer:
                raise Rejected("no writer token")
            if any(not any(p == q or p.startswith(q + "/") for q in lease.paths)
                   for p in paths):
                raise Rejected("mutation outside owned paths")
            if not isinstance(new_head, str) or not new_head or new_head == branch_head:
                raise Rejected("explicit distinct synthetic resulting head required")
            if self._branches.get(lease.branch) != branch_head or lease.branch_head != branch_head:
                raise Rejected("whole work branch expected head changed")
            expiry = self._expiry(now)
            self._branches[lease.branch] = new_head
            self._leases[permit.lane] = replace(lease, branch_head=new_head,
                                                heartbeat_at=now, expires_at=expiry)
            return self._commit()

    def simulate_external_head(self, expected, branch, new_head):
        """Race injector, not an authorized writer or a real Git operation."""
        with self._lock:
            self._cas(expected)
            if not isinstance(branch, str) or branch not in self._branches or not isinstance(new_head, str) or not new_head:
                raise Rejected("known synthetic branch and head required")
            self._branches[branch] = new_head
            return self._commit()

    def integrate(self, expected, permit, now, *, source_branch, source_head,
                  base_head, reviewed_head, checked_source, checked_base,
                  checks_passed, new_main_head):
        with self._lock:
            self._cas(expected)
            lease = self._live(permit, now)
            if permit.lane != "L01" or lease.branch != "main":
                raise Rejected("only integrator main custody")
            if not lease.resources.writer:
                raise Rejected("integrator mutation requires writer token")
            if not all(isinstance(value, str) and value for value in
                       (source_branch, source_head, base_head, reviewed_head,
                        checked_source, checked_base, new_main_head)):
                raise Rejected("explicit string source/base/review/result heads required")
            if (source_branch == "main" or checks_passed is not True or
                    source_head == base_head or
                    reviewed_head != source_head or checked_source != source_head or
                    checked_base != base_head or not new_main_head or
                    new_main_head == base_head):
                raise Rejected("exact source review and source/base checks required")
            if (self._branches.get(source_branch) != source_head or
                    self._branches.get("main") != base_head or lease.branch_head != base_head):
                raise Rejected("source or base changed inside integration transaction")
            if (any(item.branch == source_branch for item in self._leases.values()) or
                    any(item.branch == source_branch for item in self._queue)):
                raise Rejected("source branch custody and queue must be fully drained")
            expiry = self._expiry(now)
            self._branches["main"] = new_main_head
            self._leases[permit.lane] = replace(lease, branch_head=new_main_head,
                                                heartbeat_at=now, expires_at=expiry)
            return self._commit()
