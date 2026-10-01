# Keyless table register

Evidence level: **VERIFIED** from authoritative table DDL. Exactly **50 of 583** permanent tables have no declared PRIMARY KEY.

- `DB-TABLE-dbo.AR_InvoiceDebtDateV2_DataBackupTbl`
- `DB-TABLE-dbo.AR_InvoiceDebtFullFix_DataBackupTbl`
- `DB-TABLE-dbo.AR_InvoiceDetail_AmountCostBackupTbl`
- `DB-TABLE-dbo.CF_ObjectAttachTbl`
- `DB-TABLE-dbo.CF_ObjectTbl_ImportBackup`
- `DB-TABLE-dbo.HR_LayDuLieuExcelTbl`
- `DB-TABLE-dbo.SY_AmountCostFix_ConfigBackupTbl`
- `DB-TABLE-dbo.SY_APILog`
- `DB-TABLE-dbo.SY_FAFormNativeConfigBackupTbl`
- `DB-TABLE-dbo.SY_InitSetup`
- `DB-TABLE-dbo.SY_InvoiceDebtDateConfigBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtDateProcBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtDateV2_ActionBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtDateV2_ObjectBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtFullFix_ActionBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtFullFix_DropdownBackupTbl`
- `DB-TABLE-dbo.SY_InvoiceDebtFullFix_ObjectBackupTbl`
- `DB-TABLE-dbo.SY_SynDate`
- `DB-TABLE-dbo.Temp_CF_ObjectTbl221`
- `DB-TABLE-dbo.Temp_CF_ObjectTbl73`
- `DB-TABLE-dbo.Temp_CF_ObjectTbl817`
- `DB-TABLE-dbo.Temp2_CF_ObjectTbl221`
- `DB-TABLE-dbo.Temp2_CF_ObjectTbl73`
- `DB-TABLE-dbo.Temp2_CF_ObjectTbl817`
- `DB-TABLE-dbo.Temp3_CF_ObjectTbl221`
- `DB-TABLE-dbo.Temp3_CF_ObjectTbl73`
- `DB-TABLE-dbo.Temp3_CF_ObjectTbl817`
- `DB-TABLE-dbo.ZZ_CF_Contract_Cleanup_20260811`
- `DB-TABLE-dbo.ZZ_CF_ContractDetailTbl_Before_FinalizeItem_20260812`
- `DB-TABLE-dbo.ZZ_CF_ContractTbl_MST_Before_20260811`
- `DB-TABLE-dbo.ZZ_CF_ItemTbl_Before_FinalizeItem_20260812`
- `DB-TABLE-dbo.ZZ_CF_ItemTbl_Before_ItemCodeNSX_20260811`
- `DB-TABLE-dbo.ZZ_CF_ItemTbl_Before_ItemNameExcel_20260812`
- `DB-TABLE-dbo.ZZ_CF_ItemTbl_Before_SafeMerge_20260811`
- `DB-TABLE-dbo.ZZ_CF_ItemUnitTbl_Before_Dedup_VT0043_20260812`
- `DB-TABLE-dbo.ZZ_CF_ItemUnitTbl_Before_Description_20260812`
- `DB-TABLE-dbo.ZZ_CF_ItemUnitTbl_Before_FinalizeItem_20260812`
- `DB-TABLE-dbo.ZZ_CF_ItemUnitTbl_Before_SafeMerge_20260811`
- `DB-TABLE-dbo.ZZ_CF_Object_Cleanup_20260811`
- `DB-TABLE-dbo.ZZ_CF_ObjectID_MST_Map_20260811`
- `DB-TABLE-dbo.ZZ_CF_ObjectTbl_MST_Before_20260811`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_CF_ContractAttachTbl`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_CF_ContractDetailTbl`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_CF_ContractTbl`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_CF_ContractThanhToanTbl`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_ContractExclusion`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_ContractExternalRef`
- `DB-TABLE-dbo.ZZ_MedcomFull_20260805_CustomerMap`
- `DB-TABLE-dbo.ZZ_MedcomResetPeriod_20260805_SY_InitSetup`
- `DB-TABLE-dbo.ZZ_SY_BalanceItemTbl_Before_FinalizeItem_20260812`

## Classification and reuse rule

The set contains backup/repair/history and Temp/ZZ namespaces plus five operational-looking surfaces requiring priority caller/runtime verification: `CF_ObjectAttachTbl`, `HR_LayDuLieuExcelTbl`, `SY_APILog`, `SY_InitSetup`, and `SY_SynDate`.

Names alone are not proof of runtime purpose. Backup/Temp/ZZ objects are **retire/replace candidates**, not Web domain models, until a dependency proves an active contract. Operational-looking keyless tables are **compatibility facade / controlled-schema-change candidates**; Web code must not invent row identity, update/delete semantics, singleton semantics, or deduplication keys.

Whether a keyless table has another usable uniqueness contract or relies on application-enforced identity remains UNKNOWN unless separately evidenced.
