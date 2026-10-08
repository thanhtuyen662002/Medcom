# Existing-purchase pilot operator boundary

I58 adds an **offline-tested, opt-in startup path** for the accepted I57 existing-document pilot. It does not activate a deployment, qualify a database, verify an ERP login, or establish production runtime acceptance. `RuntimeAccepted` remains false. Default startup retains unavailable purchase commands, even if a permit file exists.

## Required authorization before any live launch

Obtain separate, explicit owner authorization for the exact candidate build and matching FE artifact, deployment destination, launch/stop method and one server instance. The private write permit must identify the literal SQL server/database, installed binding GUID, tenant/company, normal ERP principal, branch, one existing document, approval reference and a UTC interval no longer than eight hours. The owner must approve the bounded header/existing-line changes and **separately** approve Submit, which changes status to 2 and locks the document. If Submit is not approved, stop after Save and verified readback. Read-only access authorization is not write activation or deployment authorization.

Before launch/dispatch, independently verify the exact target/build, installed control-table/binding shape, ordinary ERP login, native Run + Update permissions, current actor/branch scope, and current unlocked state-1 document with its fresh state token. Historical installation or recording tests do not satisfy these target checks. Do not reinstall control tables as an implicit prerequisite. Tools/password verification, login, cookies, CSRF, origin and TLS protections remain unchanged. No synthetic identity may be used for a live pilot.

The existing permit bounds target, actor, document and time. It does not encode a per-field edit allowlist or separate Save/Submit permission flags. Operator supervision must enforce the approved edit and stop after Save when Submit lacks approval. Do not treat the presence of a permit as permission for additional edits or actions.

## Exact protected input and explicit launch

Use the existing `ServerConfiguration` private-file loader and external-path policy. Keep the file outside the repository and served content tree with the deployment's existing private-file protections. Do not commit real permit values, SQL credentials, legacy data or approval details. This document intentionally provides field names only, with no usable permit.

Within the selected private JSON file, create the object `Medcom.PurchaseRequestPilot` containing exactly these eleven scalar values (write identifiers and UTC timestamps as strings):

- `Server`, `Database`: literal target already used by the ordinary read/authentication store, without aliases/wildcards/failover/read-only routing
- `DatabaseBindingId`: nonempty GUID in hyphenated D format, matching the installed binding
- `TenantId`, `CompanyId`: exact values of the ordinary `Legacy` company configuration
- `ActorId`, `BranchId`, `DocumentId`: one exact normal ERP principal, branch and existing purchase document
- `AuthorizationReference`: exact reference for the bounded owner approval
- `WriteStartsAtUtc`, `WriteExpiresAtUtc`: UTC strings in `yyyy-MM-ddTHH:mm:ssZ` format, optionally with 1–7 fractional-second digits before `Z`; expiry must follow start by no more than eight hours

All fields are mandatory. Whitespace-padded, empty, wildcard, nested, unknown or malformed fields fail startup. Permit fields are accepted only from the private snapshot loaded by `ServerConfiguration`. Any copy or partial override in public appsettings, environment variables or command-line arguments fails startup, even if identical. Do not split the permit across configuration sources. Existing process overrides for ordinary server settings still follow the established loader; target/company must still match the permit exactly. The helper reuses the already-composed identity/read store's SQL/TLS connection policy and creates fresh closed connections; it does not probe the target during composition.

`Legacy:Enabled` and `Legacy:EnableReadOnlyPilots` must both be true, with the existing real legacy password verifier, identity authority, purchase reader and local session store. This startup path does not add an authentication bypass or another SQL connection policy. Its private snapshot provenance check deliberately depends on the current loader's adjacent private-snapshot/path-marker providers; changes to that loader require re-review, never a permissive fallback.

The operator selects the mode with exactly one standalone `--purchase-request-pilot` argument to the existing API executable. Continue selecting the private file through the established external selector or `--Medcom:PrivateConfigPath <approved external path>`. The pilot flag takes no value. Duplicate flags, alternate casing, suffixes, `=true` and `=false` fail startup. The existing one-shot diagnostic branches retain precedence. No API endpoint, browser control, `Enabled=true` setting or request payload activates this path.

An explicitly requested pilot with invalid settings exits with a fixed sanitized startup error rather than silently enabling a partial writer. Neither exceptions nor logs should disclose permit values or connection credentials. A valid future or expired window can compose, but grants no current writes; I57's existing observation/write window checks remain authoritative, including read-only original-intent lookup after expiry.

## Supervised sequence and stop procedure

Use one browser tab and one server instance. Complete ordinary ERP login, read the current target/document, review the approved edit, then click Save once. Verify the receipt or reconcile the **same frozen original DTO, idempotency key and JSON body** through the existing lookup. Obtain a fresh authoritative GET readback. Only after reviewing that readback and confirming separate approval, click Submit once. Verify receipt/readback and the locked state. Save and Submit remain separate actions. No Create, Add or Remove is admitted; the matching FE existing-document profile keeps the exact original line-ID set.

Unknown, timeout, Pending or Absent results never authorize another dispatch or a replacement key. Keep original in-memory custody for lookup. A matching current document is not proof of the original command's outcome. No numeric coercion, inferred totals or reconstructed intent may substitute for the original data.

If tab close/reload, login-boundary change, browser/server/session restart or navigation destroys unresolved in-memory custody, **stop the write experiment**. Do not reconstruct the original DTO/key, retry in another tab/session or claim durable recovery. Reconcile only under explicit authority with the exact original intent; if it cannot be recovered, remain blocked for owner-led investigation.

At the approved stop boundary, remove the pilot launch argument and restart through normal startup under the deployment's approved procedure. That retires local sessions and restores unavailable commands. Avoid a restart while unresolved in-memory custody could still be reconciled: first stop new operator actions and use the permitted same-session original lookup, unless an immediate shutdown is required by the owner. Preserve only authorized evidence. Expiry also blocks further writes, but is not a substitute for the approved operational stop. Do not change the database, delete the journal, rotate credentials or disable security checks as a stop workaround.

## Evidence and remaining gates

Startup tests use synthetic protected configuration and closed connections only. HTTP tests use real HTTPS/cookie/CSRF/scope/session/endpoints and the I57 factory/writer with recording identity/database providers; the live dependency monitor is removed only in the test assembly. Those tests prove composition, denial and custody behavior, not target database execution or real ERP login. Exact-head CI, independent review, explicit deployment/write authorization, current target verification and actual supervised effects remain separate prerequisites. I58 alone leaves all live operations unactivated.
