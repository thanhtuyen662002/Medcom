# L04 legacy-runtime preparation — 2026-10-02

This local handoff contains six meaningful preparation units for T1/#19 and B4/#23: provenance separation, a controlled future runtime protocol, session-isolation fault cases, an effective-scope matrix, an adapter/bridge decision gate, and a startup-DDL launch gate. All references pin merged main `f9197185b624a8c3f74c99e48a69550b5a7c2a73` and sanitized repository evidence.

The package now makes the following fail-closed properties machine-checkable:

- the exact sanitized binary identity is separate from five still-`UNKNOWN` source/build/deployment links;
- runtime preparation pins target identity, network egress, schema fingerprints and a kill switch before any future load;
- 16 session-isolation cases cover process, child-process, environment/config, temporary-file/named-object and credential-lifecycle bleed;
- 16 effective-scope cases cover route/data/action/export boundaries, cache generations, download tokens, delayed work and denial side channels;
- the adapter decision starts at `BLOCKED_UNKNOWN`, has three reviewed terminal choices, prohibits automatic fallback and returns to blocked on provenance/isolation drift.
- the startup-DDL launch gate remains `BLOCKED_NOT_RUN` until all 12 source, target, schema, monitoring, kill-switch, redaction and independent-review requirements are verified; unexpected DDL stops the run and requires target destruction/rebuild without claiming rollback.

`validate_preparation.py` validates all six units against exact Git objects on merged main. `test_preparation.py` adds one positive run and thirteen negative mutations covering false durability/execution, source or binary drift, evidence promotion, dropped cases, weakened adapter fallback and premature startup admission.

Live readback at preparation time:

- `main` is `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.
- Draft #44 is the L01 activation/bootstrap Draft at remote head `8cea825ab9f8169e5dfe4543b7d315972f13971a`; it is not an L04 lease.
- T1/#19 is open with `waiting_source_and_runtime` and L04 ownership.
- B4/#23 is open with `waiting_dependencies`; L04 does not edit it.

The current run did not receive dispatcher fencing, a lane lease or writer token. These files are local preparation only and are not durable GitHub progress. No binary/source archive was materialized, no legacy method was executed, no Windows runtime or database was contacted, and no CI/product check ran.

The Tool metadata evidence refers to one assembly named `Tools`; project text often uses “Tool.dll” as shorthand. The preparation never manufactures a second binary identity. `VerifyUserPass`, permission-shaped methods/fields and mutable Connector properties are static signatures, not verified login/session/precedence behavior.

The next safe transition is an L01-reviewed handoff. Runtime work requires approved source/binary pairing, private dependencies/licenses, an identified disposable Windows/database environment, startup DDL review, and synthetic users. Until sharing is proved, use one serialized dedicated worker context per authenticated ERP session. Keep T1, B4, TRC-DB-001 and exhaustive traceability open.

## New provenance-ledger behavior preparation

`provenance_ledger_double.py`, `test_provenance_ledger_double.py` and
[T1_PROVENANCE_LEDGER_DOUBLE.md](T1_PROVENANCE_LEDGER_DOUBLE.md) add one
substantive fail-closed behavior model. Thirty-five tests keep all five
source/build/deployment links `UNKNOWN` until ordered evidence is supplied,
reject malformed identities, untyped/stale promotion and unreviewed
second-binary identities, freeze link state against external mutation, and
invalidate downstream conclusions after any upstream re-observation. Link
state is now replay-derived from typed immutable evidence events: direct
constructor forgery, version/history mismatch, transition/evidence mismatch,
noncanonical digest/structured fields and exact event replay all fail closed. This is
preparation only; it does not load the
observed assembly or prove any legacy/runtime behavior.
