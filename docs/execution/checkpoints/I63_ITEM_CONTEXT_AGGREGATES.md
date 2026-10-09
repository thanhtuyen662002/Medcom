# I63: preserve item-context checks while removing outer aggregate references

## Scope and source identity

- Approved application baseline: `884be183160d0ea1e5c2a8d8ce5e20431dd55d6f`, tree `070b46760f043cc04d9f48b341802c8c163c7f44`.
- Implementation scope: `src/backend/Medcom.Infrastructure/ItemDisplayContextReader.cs` and `tests/backend/Medcom.Api.Tests/ItemDisplayContextTests.cs`, plus this checkpoint.
- No database, deployment, configuration, authorization, schema or command/write behavior changes.

## Verified source defect

The master metadata `OUTER APPLY` used `MAX(CASE ...)` with inner `I.ItemName`/`I.ItemID` and outer `L.ItemId` in the same aggregate argument. The stored inbound-code variant likewise combined inner `C` columns with outer `L.LineId`/`L.ItemId`.

The [Microsoft SQL Server error catalog, error 8124](https://learn.microsoft.com/en-us/sql/relational-databases/errors-events/database-engine-events-and-errors-8000-to-8999?view=sql-server-ver17) prohibits mixing outer references and other columns within an aggregate expression. Both generated shapes violate that documented restriction. This is a source-derived SQL binding defect; this checkpoint does not claim an observed SQL Server 8124 exception from production.

Purchase-request detail and both paged document detail readers call `ItemDisplayContextReader.ReadAsync`; corresponding lists do not. Baseline exception handling maps failures to unavailable without retaining a SQL diagnostic. Therefore matching live HTTP failures alone cannot establish the exact runtime exception or the stage reached.

## Narrow repair and retained guarantees

Each `OUTER APPLY` now contains a derived row projection. It computes the same `InvalidMaster` or `InvalidStored` CASE for each matched source row. The enclosing aggregation reads only columns local to that derived relation.

Preserved without relaxation:

- Complete per-row identity CASE expressions, including exact binary and byte-length comparisons, name-length rejection and SQL NULL behavior.
- Native SQL-equal matching before aggregation, `COUNT_BIG` cardinality, count-equals-one metadata selection, no fanout and no arbitrary duplicate selection.
- Persisted inbound code semantics; no master-code fallback and no NULL/empty coercion.
- Original line and item identities, parameters and their types/sizes, schema qualification, serializable transaction, `HOLDLOCK`, timeout, budget and every reader/cardinality validator.
- Projection field order, names and types, including integer qualification flags and bigint row counts.

The local derived projection does not filter invalid rows before counting. It changes expression scope, not which records qualify or how their values are interpreted.

## Regression evidence

Using .NET SDK 10.0.401 and cached locked dependencies:

1. Added the actual-production-query structural regression before changing the reader. All six cases failed on the original query: master-only, stored-only and combined projections, each at one and 500 lines. Failures specifically identify outer `L` references within aggregate arguments.
2. Applied the derived-row repair. The full item-context suite passed: 46/46.
3. Added complete CASE-preservation assertions and reran all item-context, paged-document-scope and purchase-request-query tests together: 183/183 passed, zero failures. The six previously failing production-query cases pass in this run.

Reproduce the final regression with:

```sh
dotnet test tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj \
  --configuration Release --no-restore -m:1 -nr:false \
  --filter 'FullyQualifiedName~ItemDisplayContextTests|FullyQualifiedName~SqlDocumentBranchScopeTests|FullyQualifiedName~PurchaseRequestQueryTests'
```

The new guard inspects balanced aggregate arguments in the fixed production-generated SQL; it is intentionally not presented as a general SQL parser or semantic compiler. The existing recording source still supplies synthetic results, so passing it does not prove SQL Server compilation or production recovery.

## Remaining gate

No SQL Server engine, database query, vendor code or target deployment was executed for I63. Real-engine compilation and authenticated runtime detail-read recovery remain unverified and must be observed separately. The source-level defect and failing-to-passing structural regression justify this bounded repair without weakening identity or metadata validation.
