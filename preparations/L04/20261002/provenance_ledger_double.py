"""Synthetic T1 provenance ledger; no binary or runtime is accessed."""

from dataclasses import dataclass, replace
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Tuple


class State(str, Enum):
    UNKNOWN = "UNKNOWN"
    VERIFIED = "VERIFIED"
    MISMATCH = "MISMATCH"


CHAIN = (
    "source_archive",
    "source_project",
    "reproducible_build",
    "binary_match",
    "current_deployment",
)


@dataclass(frozen=True)
class Evidence:
    kind: str
    state: State
    subject: str
    digest: str
    evidence_ref: str
    reviewer: str


@dataclass(frozen=True)
class Ledger:
    version: int
    binary_fingerprint: str
    assembly_name: str
    links: Mapping[str, State]
    evidence: Tuple[Evidence, ...] = ()

    def __post_init__(self) -> None:
        if (
            type(self.version) is not int
            or self.version < 0
            or type(self.evidence) is not tuple
            or self.version != len(self.evidence)
        ):
            raise ValueError("ledger version must equal immutable evidence history")
        if (
            type(self.binary_fingerprint) is not str
            or len(self.binary_fingerprint) != 64
            or any(ch not in "0123456789ABCDEF" for ch in self.binary_fingerprint)
            or self.assembly_name != "Tools"
        ):
            raise ValueError("exact observed Tools SHA-256 identity required")
        if (
            not isinstance(self.links, Mapping)
            or set(self.links) != set(CHAIN)
            or any(type(state) is not State for state in self.links.values())
        ):
            raise ValueError("complete typed provenance chain required")
        if any(not self._valid_evidence(item) for item in self.evidence):
            raise ValueError("complete typed evidence history required")
        replayed = {key: State.UNKNOWN for key in CHAIN}
        for item in self.evidence:
            position = CHAIN.index(item.kind)
            if item.state is State.VERIFIED and any(
                replayed[upstream] is not State.VERIFIED
                for upstream in CHAIN[:position]
            ):
                raise ValueError("evidence history verifies links out of order")
            for downstream in CHAIN[position + 1 :]:
                replayed[downstream] = State.UNKNOWN
            replayed[item.kind] = item.state
        if replayed != dict(self.links):
            raise ValueError("link state must be derived from evidence history")
        object.__setattr__(self, "links", MappingProxyType(dict(self.links)))
        object.__setattr__(self, "evidence", tuple(self.evidence))

    @staticmethod
    def new(binary_fingerprint: str, assembly_name: str = "Tools") -> "Ledger":
        return Ledger(0, binary_fingerprint, assembly_name, {k: State.UNKNOWN for k in CHAIN})

    def record(
        self,
        *,
        expected_version: int,
        link: str,
        state: State,
        evidence: Evidence,
    ) -> "Ledger":
        if type(expected_version) is not int or expected_version != self.version:
            raise ValueError("stale ledger version")
        if type(link) is not str or link not in CHAIN or type(state) is not State:
            raise ValueError("typed provenance transition required")
        if (
            type(evidence) is not Evidence
            or evidence.kind != link
            or evidence.state is not state
        ):
            raise ValueError("evidence/link mismatch")
        if not self._valid_evidence(evidence):
            raise ValueError("complete sanitized evidence identity required")
        if evidence in self.evidence:
            raise ValueError("evidence observation cannot be replayed")
        position = CHAIN.index(link)
        if state == State.VERIFIED and any(self.links[p] != State.VERIFIED for p in CHAIN[:position]):
            raise ValueError("provenance links must be verified in order")
        updated = dict(self.links)
        for downstream in CHAIN[position + 1 :]:
            updated[downstream] = State.UNKNOWN
        updated[link] = state
        return replace(self, version=self.version + 1, links=updated, evidence=self.evidence + (evidence,))

    def binding_allowed(self) -> bool:
        return all(self.links[k] == State.VERIFIED for k in CHAIN)

    def assert_binary_reference(self, name: str, fingerprint: str | None = None) -> str:
        if type(name) is not str or (fingerprint is not None and type(fingerprint) is not str):
            raise ValueError("typed binary identity required")
        if name in {"Tool.dll", "Tools.dll", "Tools"}:
            if fingerprint is not None and fingerprint != self.binary_fingerprint:
                raise ValueError("shorthand cannot identify a different binary")
            return self.binary_fingerprint
        if not fingerprint:
            raise ValueError("a distinct binary requires its own exact fingerprint")
        raise ValueError("unreviewed second binary identity")

    @staticmethod
    def _valid_evidence(evidence: Evidence) -> bool:
        fields = (
            evidence.subject,
            evidence.evidence_ref,
            evidence.reviewer,
        )
        return (
            type(evidence) is Evidence
            and evidence.kind in CHAIN
            and type(evidence.state) is State
            and type(evidence.digest) is str
            and len(evidence.digest) == 64
            and all(character in "0123456789ABCDEF" for character in evidence.digest)
            and all(
                type(value) is str
                and bool(value)
                and value.strip() == value
                and not any(ord(character) < 32 or ord(character) == 127 for character in value)
                for value in fields
            )
        )
