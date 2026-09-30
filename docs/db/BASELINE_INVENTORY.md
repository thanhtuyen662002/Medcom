# Medcom SQL Server archaeology — baseline inventory

Evidence level: **VERIFIED** unless a row explicitly says otherwise.

Source: `Medcom-Data (3)(1).zip` → `Medcom-Data.sql`, SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

This document contains sanitized schema metadata only. No production row values are committed.

## Database-level facts

- Script header identifies database `Medcom`.
- Script generation timestamp recorded in source: 2026-09-28 11:21:40.
- Primary data/log logical names remain `VietDuc` / `VietDuc_Log` even though database name is Medcom. This is a legacy naming artifact and must not be treated as a business-domain identifier.
- Canonical normalized coverage is recorded in `DECLARATION_NORMALIZATION.md` and `DECLARATION_COUNT_CORRECTION.md`; those artifacts supersede the provisional scanner counts previously recorded here.
- Parsed table definitions contain 7,968 column declarations.
- Source contains 540 PRIMARY KEY declaration lines, 364 FOREIGN KEY declaration lines, 812 ALTER TABLE default-constraint statements and 558 ALTER TABLE check-constraint statements.
- 125 explicit CREATE INDEX statements were found. This number excludes indexes implicitly created by PK/unique constraints and therefore is not the total physical-index count.
- Nearly all parsed objects are in `dbo`; at least one function is under `zuser`. Schema usage requires a later exact catalog pass.

## Table namespace/domain signal

Table-name prefixes provide a useful first-pass domain partition, but classification by prefix is **INFERRED** until object semantics/dependencies are reviewed.

| Prefix | Table count | Initial interpretation |
|---|---:|---|
| AR | 100 | receivables/sales |
| SY | 79 | system/config/security/workflow |
| CF | 65 | common/master data |
| GJ | 54 | general journal/accounting |
| IV | 52 | inventory |
| ZZ | 35 | backup/repair/temporary historical artifacts |
| HR | 28 | HR/personnel |
| FA | 23 | fixed assets |
| AP | 20 | purchasing/payables |
| CS | 19 | cash/payment |
| PC | 18 | cost/project/accounting support |
| EQ | 12 | equipment |
| WA | 10 | workflow/warehouse or domain-specific; UNKNOWN pending semantic pass |
| KD | 9 | domain-specific; UNKNOWN pending semantic pass |
| AG | 8 | domain-specific; UNKNOWN pending semantic pass |
| SL | 8 | domain-specific; UNKNOWN pending semantic pass |

Other prefixes exist and will be catalogued in the machine-readable inventory.

## High-value verified anchors

The source directly defines core objects including:
- `dbo.AR_InvoiceTbl`, `dbo.AR_InvoiceDetailTbl`, `dbo.AR_OrderTbl`
- `dbo.AP_PurchaseTbl`, `dbo.AP_PurchaseDetailTbl`, `dbo.AP_OrderTbl`
- `dbo.IV_OutputTbl`, `dbo.IV_InboundRequestTbl`, `dbo.IV_InboundRequestDetailsTbl`
- `dbo.CF_ObjectTbl`, `dbo.CF_ItemTbl`, `dbo.CF_ItemUnitTbl`, `dbo.CF_UnitTbl`
- `dbo.SY_User`, `dbo.SY_UserGroup`
- `dbo.FA_AssetTbl`

The source also contains a large reporting procedure surface, e.g. AR order/sales reports, inventory stock-card/balance reports and general-journal reports. This is early evidence that Web report migration cannot be treated as a UI-only rewrite: stored-procedure report contracts are a major compatibility surface.

## Early architecture findings

1. **Database reuse is feasible but cannot be assumed object-by-object.** The schema has extensive business logic in procedures/functions plus hundreds of constraints. Web APIs must preserve these contracts or deliberately replace them with tested equivalents.
2. **Legacy/repair artifacts are first-class migration risk.** At least 35 `ZZ_*` tables and multiple names containing `Backup`, `Fix` or `Delete` are present. They must be classified before automated schema generation so historical repair tables do not accidentally become Web domain models.
3. **Security/config requires dedicated review.** `SY_User`, `SY_UserGroup` and a large `SY_*` surface exist, but UI visibility/configuration must not be assumed to equal authorization. Exact permission tables and enforcement paths remain pending.
4. **Report compatibility is a separate work package.** Hundreds of RPX files exist on the ERP side and the DB contains many `*ReportStp` procedures. Later traceability must connect report definition → procedure/view → parameters → Web report/export behavior.
5. **Trigger side effects exist.** Verified trigger declarations include fixed-asset lifecycle synchronization and an invoice debt-due-date guard. Writes through new Web APIs must account for trigger-generated side effects and duplicate execution/retry behavior.
6. **Current dump contains operational/historical residue.** Web schema reuse should start from an allow-listed domain catalog, not expose every table automatically.

## Next exact passes

- Generate sanitized table/column/type/nullability/default catalog with stable `DB-TABLE-dbo.*` IDs.
- Extract PK/FK/unique/check/default constraints and exact index ownership.
- Catalog procedures/functions/views/triggers with definitions hashed, dependencies and write/read side effects.
- Classify `SY_*` configuration/security objects and determine whether existing schema can represent Web form/grid/tab/user-role-company preferences.
- Identify tables without PKs, suspicious wide tables, heap/index risks, orphan-prone relationships and procedure dynamic-SQL dependencies.
- Produce reuse disposition by domain: reuse-as-is / compatibility facade / controlled change / additive Web config / retire-replace.

No `complete_candidate` claim is made in this pass.
