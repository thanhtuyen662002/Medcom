# I99 — warehouse permissions and presentation

Owner request, 2026-10-19: repair administrator warehouse CUD capabilities, return currency display values and omit ERP-hidden presentation fields. This direct backend request supersedes the previous full-physical-column response requirement for hidden presentation columns; internal database snapshots and write authority remain intact.

Base read: `9dca94a96b4ad1cb42e2f6fee744e103e16a8d66`. Source paths under review: `src/backend/Medcom.Application/ErpActionRules.cs`, `src/backend/Medcom.Infrastructure/Erp/ErpSqlAuthority.cs`, `src/backend/Medcom.Contracts/ErpScreenCatalog.cs`, `src/backend/Medcom.Api/FeDisplayProjection.cs`, and native `SY_FrmCfg`/`SY_FrmLstTbl` technical configuration.

Validation and diagnosis: IN PROGRESS. This note makes no administrator/runtime/hidden-column acceptance claim. No frontend changes, target deployment or production business writes are authorized by this checkpoint. Approved historical Library archive identities remain in `docs/SOURCE_BASELINE.md`; rematerialization/re-hashing is unavailable in this session. Current owner-accessible ERP and read-only database evidence will be identified separately.
