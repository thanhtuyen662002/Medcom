# I35 — explicit per-invocation inspector development TLS opt-in

Immutable admission: `5727afc7072750f0c9896db4d258aac1a6b9a7b5`, marker tree
`3d651053725896fcaa09e13735180e63a0ed6b56`, PR #87. Five-path scope is in
`docs/execution/direct-runs/I35.json` and its original marker bytes are preserved.

Accepted baseline: remote main `eb4ddd195b59046f867a83e0c4b4897f5d2b620a`, tree
`c37f0a1c39ed8e17f51976064a794e9208c2a914`. Local base commit
`f533a38c6f9272c48605bee568113ab52674d86a` has that exact tree but is not relabelled
as the remote main commit. I34 implementation, marker, policies, SQL, locks, workflows,
package rules and every earlier test remain unchanged except the admitted Program/test/
README additions below.

## Source-confirmed compatibility gap

The reviewed operator `Start-Preview-BE.ps1` already passes the existing fixed-target
`Medcom:SqlDevelopmentTestTls` Enabled/Server/Database values as process arguments. It
does not rewrite the owner's private JSON. I34's inspector instead loaded the private
configuration with an empty argument list. `ServerConfiguration.ResolveConnectionString`
rejects Encrypt=False or TrustServerCertificate=True when the exception is not explicitly
enabled. Therefore that known configuration stops before Open at configuration/BLOCKED;
it is not evidence of a network or credential failure. This assessment used public
launcher and current inspector/policy source only. No owner private file was read.

## Bounded change

Only the trailing valueless flag `--allow-development-sql-tls` is added to:

`inspect --config PATH [--options PATH] [--allow-development-sql-tls]`

The parser refuses duplicates, misplaced/valued/unknown flags and target selectors.
Absence retains existing behavior. Inherited Medcom/Legacy/connection-string environment
overrides are still rejected before private loading. On explicit opt-in, after normal
private path/loading checks, the inspector accepts either an absent exception section or
an already enabled, complete, identical section. Malformed, incomplete, disabled,
nested/unknown or conflicting exception values are refused; no silent repair/override.

Only three constants are then layered into this ConfigurationManager in memory. The
unchanged shared resolver and SqlDevelopmentTestTlsTarget enforce exactly
`zmc.bms79.com,17456` / `MedData`, mandatory encryption, no failover/read-only routing,
no user-instance/attach target and no alternate/aliased endpoint. No configurable target
choice, private JSON/environment write, certificate store/system setting change or
persistent exception is introduced. The explicit flag bypasses server-certificate
validation solely for that already-approved development target; it is not trusted
production TLS acceptance.

Successful explicit selection records the fixed code
`EXPLICIT_FIXED_TARGET_DEVELOPMENT_TLS` on the existing configuration check. Default
status/code behavior and all other machine-readable keys remain stable. This is a
configuration observation, not a real-target connection claim. No RuntimeAcceptance,
writer or release activation is introduced; release remains blocked.

The Vietnamese README explains default versus explicit opt-in and corrects credential
wording: SqlClient consumes the existing private connection string locally for the
owner-authorized connection; credentials are not displayed/exported or extracted for
another purpose. Business rows/Tools.dll remain outside scope.

## Verification boundary

All 177 existing synthetic cases are preserved byte-for-byte. Added 46 synthetic cases
(three facts and 43 theory rows), making 223 authored inspector cases. New cases cover
all four valid CLI forms, invalid placement/duplicates/target choices, default refusal
of the compatibility fixture, mandatory encrypted exact-target opt-in, unchanged config/
options bytes, no sticky opt-in, identical existing exception, malformed/disabled/
conflicting sections, alternate targets/routing and inherited-environment rejection.
Tests call only configuration/parser helpers and recording providers, never real SQL.

Observed locally: fixed-plan/161-column verifier and 12 synthetic packaging regressions,
97 existing integration/package guards, CI-policy and whitespace checks pass. The five
scope paths and immutable marker are verified exactly; linked policies and other I34
assets are unchanged. No verified local .NET SDK is available, so the expanded suite,
compilation/analyzers and compiled packaging are NOT_RUN locally. Exact-source Linux/
Windows full hosted CI and independent review/package audit remain mandatory. No real
owner invocation, private input access or SQL execution occurred.


## Pre-publication fixture correction

Independent review found the reused WriteConfig helper writes an explicit Enabled=false
section by default, whereas the new compatibility success fixture needs the section to
be absent. Only the new I35 fixtures now use an explicit no-section writer for that
success case, alternate-target refusals and environment-rejection cases. This also
prevents those negative cases from passing for the unrelated disabled-section reason.
The real explicit-disable rejection is unchanged; all original 177 test bytes and the
223-case revised total are preserved. No inspector logic was weakened to correct that fixture.


Independent review also identified that ConfigurationManager represents an explicitly
empty object or JSON null with null Value and zero children. The opt-in now checks the
parent's child-key presence, distinguishing a truly absent exception from null/empty
configured sections. New null/empty-object/empty-array negative fixtures require refusal;
these add three cases (223 total). This preserves the instruction to refuse malformed or
incomplete existing settings rather than silently filling them. Synthetic hosted tests
must verify the provider behavior; no private file is used.
