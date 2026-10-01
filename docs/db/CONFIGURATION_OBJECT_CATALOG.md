# SQL object namespace catalog

Source: authoritative Medcom database baseline recorded in docs/SOURCE_BASELINE.md.

This pass records sanitized DDL metadata only and does not publish row values.

## Verified table namespace distribution

The dump contains 583 CREATE TABLE definitions. Major name-prefix groups are AR 100, SY 79, CF 65, GJ 54, IV 52, ZZ 35, HR 28, FA 23, AP 20, CS 19, PC 18, EQ 12, WA 10, KD 9 and AG 8. Prefixes are useful inventory partitions but are not promoted to business classification without dependency evidence.

## Verified configuration object presence

The schema directly defines these stable DB objects:

- DB-TABLE-dbo.SY_Menu
- DB-TABLE-dbo.SY_FrmCfg
- DB-TABLE-dbo.SY_FrmCtrTbl
- DB-TABLE-dbo.SY_FrmDrdwTbl
- DB-TABLE-dbo.SY_FrmExpTbl
- DB-TABLE-dbo.SY_FrmFltTbl
- DB-TABLE-dbo.SY_FrmGrdActTbl
- DB-TABLE-dbo.SY_FrmLstTbl
- DB-TABLE-dbo.SY_FrmMstActTbl
- DB-TABLE-dbo.SY_FrmOptBtnTbl
- DB-TABLE-dbo.SY_FrmParTbl
- DB-TABLE-dbo.SY_UserBranch
- DB-TABLE-dbo.SY_UserStorehouse

Their DDL proves that the current database carries menu/form/control/dropdown/filter/action/list and user-scope metadata rather than leaving all of those concerns solely in the Windows executable.

## Verified configuration capabilities

SY_Menu includes menu identity, multilingual captions, form binding, parent relation, display-state flags, parameters, shortcut metadata and filter metadata.

SY_FrmCtrTbl includes form/control identity, multilingual captions, geometry, ordering and disabled state.

SY_FrmDrdwTbl includes form/grid/column binding, value/display columns, source metadata, linked columns, parameters, defaults, multiselect, search/order metadata, editable-column metadata and reload behavior.

SY_FrmGrdActTbl and SY_FrmMstActTbl include action source, parameters, target columns/values, messages and action ordering/type metadata.

SY_FrmLstTbl includes list-form table/key/detail metadata plus hidden, summary, editor and default-column metadata.

SY_FrmOptBtnTbl includes configured actions, before/after actions, status gating, reference metadata and multi-select behavior.

SY_FrmParTbl includes form/grid parameter definitions and target/message metadata.

## Web reuse disposition

These objects are compatibility inputs, not browser-executable contracts. Existing metadata should first be exposed through typed server-side facades. Fields representing sources, filters, table names, actions or parameters must be resolved and validated on the server rather than accepted from the client as direct query authority.

The current schema is already capable of representing substantial ERP configuration. New Web configuration tables should therefore be additive only for semantics that a later exact gap analysis proves cannot be represented safely, such as versioned browser personalization or conflict-aware saved views.

## Remaining unknowns

Exact key/index coverage, configured-source execution semantics, configuration precedence, concurrency behavior during configuration edits, and full dependency graphs remain pending exact DDL/body analysis. These are UNKNOWN rather than inferred.

Workstream remains active.
