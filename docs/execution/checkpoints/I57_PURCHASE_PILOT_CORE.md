# I57 — Bounded existing-purchase pilot core

Status: local candidate; no runtime activation or production acceptance.

## Admission and evidence

- Base: `ef20fa7e1268f0b2d2b903de29ee9da879d5567b`.
- Root admission: PR #109, control `8279e00152c7c96851bc30dd4632918af5f5f5c0`, tree `83ce7d1caf2dce3f2edb4de4b413e023c2b0dea7`.
- The immutable ten-path marker is `docs/execution/direct-runs/I57.json`. Nine paths are mutable. Root is the sole publisher.
- All five existing mutable source files were checked against their exact Git blob IDs at the pinned base before editing. This preparation does not reopen or claim independent verification of the raw ERP/DB archives.

The separately verified live/archived `SY_FrmCfg` setting is form `AP_PurposeRequestListFrm`, key `LYS1`, control `CommandButtonCtl`. Its C4 body fingerprint is `EB074027ABDA63FF4A68E6936C0C4E870035A4589F5C927AE806AB437ABECC64` over 246 UTF-16LE bytes, source lines 299451–299453. The verified effect is StatusID=2 and isLock=1 selected by PurchaseRequestID; P1 binds that field. The technical parity artifact fingerprint is `588ffe764b55d915759f7ed2c96925705d63708a216d4610b6808d7100aae1ef`.

The values SaveContinue/Reload are observed settings, not proof of their consumer roles/order or transaction behavior. Native configuration also mentions state 4; this pilot deliberately retains the Web writer's stricter unlocked state-1 prerequisite. The distinct `CommandButtonCtl_1` conversion into order tables is excluded. No SQL text is changed or copied from the private source.

The owner previously reported installation of the two purchase control tables and verified their schema/control row and binding. The SQL artifact's historical UNAPPLIED comment does not mean the target tables are currently absent. Fresh exact-build/target revalidation is still a separate runtime prerequisite.

## Separate authorization basis

`PurchaseRequestPilotAuthorization` is a sealed immutable server-composition input identifying one server/database, binding, tenant/company, actor, branch, existing document, approval reference and UTC write interval of at most eight hours. A reference identifies the owner's approval; the type cannot prove the truth of that external approval. No endpoint, configuration binder or launcher constructs it.

`ForOwnerAuthorizedPilot`, `CreatePilotCommands`, `CreatePilotAuthorityReader` and `AddOwnerAuthorizedPurchaseRequestPilotCommands` name this experimental route explicitly. The normal production constructors, `CreateCommands`, `CreateAuthorityReader`, dormant registration and `RuntimeAccepted` retain their production meaning. A pilot factory always has no production acceptance and cannot activate dormant production registration. A production factory cannot be relabelled as a pilot.

The existing writer receives an internal typed overload whose chained production `runtimeQualified` value is **false**. Only that separately held, scope-checked pilot permission admits the experiment. It is never synthesized as runtime acceptance. The new private `pilotWrite` argument selects the *stricter* unexpired-write check versus scoped read-only reconciliation; it cannot grant access or bypass a missing permit.

The connection target is checked before and after Open. Exact literal server/database matching rejects alternate targets, failover, attached database files, user instances and read-only routing. Existing fresh-closed/never-reused connection ownership, binding/schema probes, native grants, physical document relations and transaction guards remain authoritative.

## Permitted behavior

- Save only an existing unlocked state-1 draft: header edits and explicitly identified existing-line Update operations.
- Separate Submit using its current state token; its effect remains state 2 plus locked.
- No Create, Add, Remove, order conversion or identifier allocation. Disallowed dispatch is rejected before reservation/business execution.
- The exact actor and branch are checked against current identity at the existing reader/writer/session checkpoints. Native Run+Update remains required; a read capability or permit is never a substitute.
- Write-window checks run at dispatch and existing native-authority/transaction checkpoints. If expiry follows a durable reservation, existing uncertainty/custody behavior is preserved and the business transaction does not commit.
- Read-only original-intent lookup remains scoped to the same actor/binding/branch/document after write expiry. It does not rewrite intent, reserve, commit or redispatch. Pending/Absent/Unknown never authorize another dispatch.
- Authority observation does not require the document still to be draft, preserving original receipt lookup after Submit's own lock transition. Existing endpoints independently disable Save/Submit on submitted detail.

No authentication/session/CSRF/origin/body rules, HTTP routes, contracts, canonical intent/receipt/journal formats, SQL statements/schema, production entrypoint, dependencies or frontend files are changed.

## Verification

The recording tests use real ApiHost/Kestrel HTTPS, authentication cookies, antiforgery, LocalWebSessions, purchase endpoints, pilot registration/factory, SQL authority reader and the existing SQL writer. Identity authority and DbConnections are synthetic. They neither execute Tools nor connect to a database. Recording observations do not establish SQL Server locking, SQL compilation, trigger effects, actual crash durability or target-host acceptance.

Observed local verification:

- Locked restore passed with `--disable-parallel -m:1`; Release analyzer build passed with zero warnings/errors.
- All 96 new tests passed: 64 pilot authorization/provider/fence tests and 32 real HTTPS composition cases.
- The final full non-LegacyRuntime API suite ran 2,727 cases: 2,722 passed, five failed, zero skipped. It is **not** a full green suite.
- An untouched copy of the supplied pinned baseline reproduced the exact same five ServerConfigurationTests failures (14 passed, five failed). All control source/project inputs matched the baseline. This executor mounts `.git` ancestors for the synthetic private-file paths; the existing private-path guards correctly reject them. The guard, test inputs and production configuration code were not weakened or edited. Fresh hosted exact-head/base CI must establish the full suite result in its supported environment.
- Architecture boundary checks pass. The local scope comparison contains exactly the admitted ten paths, including the unchanged admission marker. No out-of-scope source file differs.

The five reproduced control failures are ExplicitConfiguredPathIsRetainedAfterSelectorAndPrivateFileAreRead, SelectorLoadsPrivateStandardConnectionWithoutChangingWriteGates, ExplicitPathOverridesMalformedSelector, OptionalMissingDefaultDoesNotRequireCredentials and CommandLineOverridesSelectorAndPrivateSettings.

## Explicitly deferred

The production entrypoint still registers unavailable purchase commands. There is no pilot CLI, executable, configuration switch or deployment. The existing `ApiHost.Build` configure seam is used by tests only. Later runtime work needs owner write authorization for the exact actor/target/document, normal owner ERP login and fresh target verification. Today's read-only activation is not write approval.

Frontend Remove affordance restriction, the separate operator launcher and real mobile-to-target acceptance are deferred to separately admitted work. I50 frontend paths are untouched. This phase proves composition and bounded behavior; it does not claim a deployed usable pilot or a qualified production system.
