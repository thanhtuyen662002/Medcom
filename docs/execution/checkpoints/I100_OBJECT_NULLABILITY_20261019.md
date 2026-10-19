# I100 — current ObjectID nullability and scoped 503 repair

Owner reports `erp_source_schema_changed` after an ERP change. Base: `7fbdcc34de80e02dab500119bc5d157a95e49f2d`. Scope is backend diagnosis, typed contract repair, regression tests and normal reviewed main integration; owner manages VPS redeploy. No FE mutation or production database write is included.

An authorized metadata-only MedData audit at `2026-10-19T09:15:57Z` checked 641 columns across 30 distinct physical tables used by all 19 compiled ERP forms. Actual `SqlErpScreenReader.SchemaMatches` rejected six forms. The only required-column differences were `dbo.AP_PurchaseRequestTbl.ObjectID`, `dbo.AP_OrderTbl.ObjectID` and `dbo.AR_OrderTbl.ObjectID`: each remains `varchar(100)`, nonidentity/noncomputed, but now permits NULL. The pinned 20261010/20261011 contracts required NOT NULL. Evidence: `inventories/backend/20261019/object-nullability-audit.json`, obtained from `sys.tables`, `sys.columns`, `sys.types`; no business rows queried and the read transaction rolled back.

Affected modules: purchase-requests, purchase-approvals, purchase-orders, sales-orders, sales-order-pm and sales-order-sa. This explains the supplied response code in the checked current database. The exact deployed VPS binary and authenticated post-redeploy behavior remain UNKNOWN until verified. Other failing requests shown without their response code are not assigned this cause without evidence.

Approved historical Library identities remain in `docs/SOURCE_BASELINE.md`; archive rematerialization/re-hashing is unavailable in this session. Current metadata is separately identified, not claimed equivalent to those archives. The historical catalogs remain evidence of their original snapshots. No passwords, connection strings, real document/user IDs, SQL bodies or native binaries are published.

Implementation and exact-head validation are pending in this initial Draft lease checkpoint. Structural checks for missing fields, incompatible types, identity/computed columns and protocol keys must remain enforced; this task does not reinstate or bypass retired fingerprint gates. Goal #45 remains open.
