# I32 — fixed purchase purpose and currency reads

## Scope and provenance

- Goal #45; Draft PR #84; immutable admission control `ec7474ebac2d8afff73613dbba08c5b676664db5`.
- Base `79261930cd6c0bbb147939a720f207b95bf1a9d8`, exact base tree `6ba8cb62b2b3e9a777458ad2a323acf0b37807e0`.
- Exactly the 11 admitted paths in `docs/execution/direct-runs/I32.json`; root remains the sole GitHub publisher.
- `docs/erp/PURCHASE_LOOKUP_BINDING_EVIDENCE.json` records the source member identity, addresses, complete-schema requirements, hash encoding, contract and limitations. No private source bodies/rows are included.

## Implemented behavior

The existing lookup route now offers fixed `purposes` and `currencies` reads only after live source binding/schema qualification. Both derive from the directly verified `AP_PurposeRequestListFrm` header dropdowns. Configuration SQL is hashed by SQL Server and never executed. Positive tests provide the actual pinned digest through the ordinary typed recording reader; there is no production fingerprint override.

Purpose IDs remain exact Int32 values serialized as invariant decimal strings. Nullable names remain JSON null; empty names remain empty. No `isDisable` filter is invented. Currency display remains its exact ID, while `currencyName` and `rateExchange` are additive currency-only fields. Rates preserve finite zero, negative and fractional values without defaults, date-effective substitution or recalculation. Branch JSON remains `{id,label}`. Items/objects stay honestly unavailable.

Paging is bounded and parameterized, with a validated 21st sentinel for 20-item pages. Currency order follows source `CurrencyName` with a binary ID tie-break; purposes use deterministic ID order. Native-equality global duplicate/alias checks prevent arbitrary selection across pages. Wrong column names/types/counts, excess rows/results, required NULL violations and oversized values fail closed.

Native authorization, credential/group validation, branch intersection and serializable read ownership remain in place. The query result is now fenced again after rollback/disposal, so cancellation or session revocation during cleanup cannot release a late read. No editor, writes, Create/Add, allocator, reservations, journal access, default command-DI registration, API/BFF route, SQL deployment or private settings were changed.

## Validation observed locally

- Production client lookup tests: 13/13 groups passed with the supplemental frontend dependency overlay; changed-file ESLint passed.
- Project architecture check passed; source catalog validation passed (1,527 declared objects and 33 catalog members).
- Repository policy/guard unit tests: 97 passed.
- Private-source cross-check recomputed both UTF16LE/no-BOM digests and compared all 40 pinned semantic metadata slots against the independently re-parsed original records. SQL bodies remained private and were not executed.
- The .NET SDK is absent in this local environment. New production-query and real HTTP endpoint regressions are authored, but local .NET restore/build/tests were not run. Required hosted CI must establish them.
- Supplemental full frontend run: 192 passed, 7 failed/blocked by absent browser/sandbox browser sockets, absent `jsqr`, and the intentional overlay package-layout difference. Typecheck reported missing `jsqr` only. This is not lockfile parity or a full frontend pass.
- Preparation suites are blocked by missing historical pinned Git objects in the supplied object store. The source scanner suite ran 48 cases, with 20 failures and 4 errors because its private-fixture safety guard detects the environment's `.git` ancestor in both writable roots and temporary storage. Guards/tests were not weakened. Full-history, ordinary hosted CI remains required.

## Authored regression coverage and remaining gates

Actual production module tests cover exact source pins and every binding value/NULL distinction; shape drift; binding/catalog duplicates and aliases; null/empty labels; finite rates without positivity; strict reader types/names; unexpected result sets and overflows; parameterized search/paging; native/session denial; late revocation/cancellation during reads and cleanup; zero commits/DML; endpoint serialization/privacy; strict per-kind client parsing and branch compatibility.

The recording provider does not execute T-SQL. Deployed configuration, permissions/metadata visibility, target collation/optimizer behavior and real runtime acceptance remain unverified. Independent review and all required CI for the exact source head/current base precede any merge. Production acceptance remains false.
