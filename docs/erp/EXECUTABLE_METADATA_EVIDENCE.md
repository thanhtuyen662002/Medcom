# ERP executable metadata evidence

Source: authoritative root `ERP.NET.exe` inside `ERP_Medcom2026(4).zip`. Method: non-decompiling packaged metadata/string/resource inspection. No secrets or business rows are reproduced.

## VERIFIED
The current root executable contains operational form/resource identifiers across AR, AP, CS, FA, GJ, IV and SY. Representative symbols include `AR_InvoiceFrm`, `AR_Invoice2025Frm`, `AR_Invoice2026Frm`, `AR_OrderFrm`, `AP_PurchaseFrm`, `CS_PaymentFrm`, `FA_AssetListFrm`, `FA_MoveFrm`, `GJ_EntryFrm`, `IV_StockInputFrm`, `IV_StockOutputFrm`, `IV_StockTranferFrm`, `SY_ConfigSelectorFrm`, `SY_DatabaseSelectorFrm`, `SY_LockDocumentFrm` and `SY_UserSelectorFrm`.

Embedded resource names independently corroborate many of these, including `ERP.AR_InvoiceFrm.resources`, `ERP.AP_PurchaseFrm.resources`, `ERP.FA_AssetListFrm.resources`, `ERP.GJ_EntryFrm.resources`, `ERP.IV_StockInputFrm.resources` and `ERP.SY_UserSelectorFrm.resources`.

Menu/navigation symbols include `COMMON_STARTMENU`, `STARTMENU`, `LoadMainMenu`, `MainMenu`, `SetMenuData`, `MenuItem_CommandClick` and `SystemMenu_Action`.

Permission/role symbols include `GetPermission`, `PermissionType`, `GetAllRolesbyAcc` and `roles`. Configurable lookup symbols include `SetDropdown`, `SetDropdownFromConfig`, `GridEXDropDown` and `GridEXDropDownCollection`.

## CORROBORATED
Where matching DAT artifacts exist, stable form IDs such as `ERP-FRM-AR_InvoiceFrm`, `ERP-FRM-AP_PurchaseFrm` and `ERP-FRM-FA_AssetListFrm` now have both persisted-layout evidence and executable/resource-name evidence. This corroborates packaged presence, not current user reachability.

## Version drift
Historical `UpdateBK` executable copies have symbol sets that differ from the current root executable. Backup executable metadata is version-history evidence only and must not be merged into the candidate-current inventory.

## UNKNOWN
Exact menu hierarchy/captions/order, account-role authorization semantics, data sources behind permission APIs, dropdown query contracts, and whether every packaged form is currently reachable remain UNKNOWN pending C# and DB binding verification.
