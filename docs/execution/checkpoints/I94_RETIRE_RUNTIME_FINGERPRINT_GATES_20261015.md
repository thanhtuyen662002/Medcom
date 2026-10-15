# I94 — retire runtime fingerprint gates

Owner direction 2026-10-15: disable fingerprints that block FE development and create/update/delete after FE/BE updates. This newer direct instruction supersedes earlier owner requirements to pin runtime schema/source/config hashes. It does not remove account/branch/action permissions, document state/concurrency, transaction, journal/idempotency or dedicated database identity checks.

Base `a2a61cb7f77f5e4f9e02b69b7023bf455fad8c37` (PR #160); both main workflows passed: `38681042130`, `38681042249`. New isolated interactive branch after clean source/main tree equality; no takeover of a scheduled claim. BE only; no FE/schedule/production DB/config/deployment mutation.

Evidence: `ErpWriteRuntime.VerifyAsync` hashes every non-system database object; `ErpWriteStartup.Read` requires SchemaFingerprint; `SqlErpScreenCommands.JournalBinding` compares the installed catalog hash with the compiled catalog; the screen reader/effects/number allocator call strict source/form hash checks. Source paths are under `src/backend/Medcom.Infrastructure/Erp`, plus `src/backend/Medcom.Api/ErpWriteStartup.cs`. Existing catalog provenance remains in `docs/SOURCE_BASELINE.md`, `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`, `inventories/erp/20261010` and `20261011`. No new raw-archive verification is claimed.

Scope: remove runtime hash gates and stale-fingerprint startup requirements; tolerate additive/physical-order schema changes while checking required typed fields; retain explicit diagnostic/source audit tools; update tests/operator handoff. Validation, exact-head integration and deployment: PENDING. Goal #45 remains open.
