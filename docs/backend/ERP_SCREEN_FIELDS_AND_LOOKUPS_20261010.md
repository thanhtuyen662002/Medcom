# Phụ lục field và dropdown của 7 form ERP

Generated from `inventories/erp/20261010/six-screen-catalog.json` by `tools/source/generate_erp_screen_handoff.py`. No SQL definitions or real rows.

417 fields / 106 lookup bindings. `writable` means accepted in the fixed module draft input; state, permission and target acceptance still apply. Parameters are exact native names separated by `;`. Pass only declared context keys. NULL is not a missing JSON field in full read responses.

See [integration guide](BE_FE_SIX_SCREEN_COMMANDS_20261010.md) for routes, actions, payloads and UNKNOWN gates.

## purchase-requests — Đề nghị mua hàng

Evidence: catalog `screens[id=purchase-requests]`; menu `05011`, form `AP_PurposeRequestListFrm`.

### header — dbo.AP_PurchaseRequestTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `purchaseRequestId` | `PurchaseRequestID` | nvarchar(50) | false | false |
| `purchaseDate` | `PurchaseDate` | datetime | true | true |
| `purposeId` | `PurposeID` | int | true | true |
| `personSuggest` | `PersonSuggest` | nvarchar(500) | false | true |
| `department` | `Department` | nvarchar(100) | false | true |
| `purposeDescOrClient` | `PurposeDescOrClient` | nvarchar(max) | true | true |
| `price` | `Price` | decimal(18, 2) | true | true |
| `notes` | `Notes` | nvarchar(max) | true | true |
| `statusId` | `StatusID` | int | false | false |
| `isLocked` | `isLock` | bit | true | false |
| `currencyId` | `CurrencyID` | varchar(3) | false | true |
| `objectId` | `ObjectID` | varchar(100) | false | true |
| `rateExchange` | `RateExchange` | float | false | true |
| `branchId` | `BranchID` | varchar(50) | false | false |

### lines — dbo.AP_PurchaseRequestDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(50) | false | false |
| `itemId` | `ItemID` | varchar(50) | false | true |
| `budget` | `Budget` | decimal(18, 0) | true | true |
| `timeRequired` | `TimeRequired` | nvarchar(200) | true | true |
| `quantity` | `Quantity` | decimal(18, 0) | false | true |
| `unitPrice` | `UnitPrice` | decimal(18, 0) | false | true |
| `totalPrice` | `TotalPrice` | decimal(18, 0) | true | false |
| `model` | `Model` | varchar(50) | true | true |
| `purchaseRequestId` | `PurchaseRequestID` | nvarchar(50) | true | false |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.CurrencyID | CurrencyID | CurrencyID | — | — | RateExchange | false | false |
| header.Department | Department | Department | — | — | Department | false | false |
| header.ObjectID | ObjectID | ObjectName | — | — | ObjectID;ObjectName;Address | false | false |
| header.PersonSuggest | PersonSuggest | PersonSuggest | — | — | PersonSuggest | false | false |
| header.PurposeID | PurposeID | PurposeName | — | — | PurposeID;PurposeName | false | false |
| header.StatusID | StatusID | StatusName | — | — | StatusID;StatusName | false | false |
| lines.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;HangSX | false | false |
| list.PurposeID | PurposeID | PurposeName | — | — | PurposeID | false | false |
| list.StatusID | StatusID | StatusName | — | — | StatusID;StatusName | true | false |

## sales-orders — Quản lý đơn hàng

Evidence: catalog `screens[id=sales-orders]`; menu `0600201`, form `AR_OrderByContractFrm`.

### header — dbo.AR_OrderTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | varchar(50) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | true |
| `objectId` | `ObjectID` | varchar(100) | false | true |
| `contractId` | `ContractID` | nvarchar(250) | true | true |
| `memo` | `Memo` | nvarchar(max) | true | true |
| `deliverDate` | `DeliverDate` | datetime | true | true |
| `baseTotal` | `BaseTotal` | decimal(28, 0) | true | true |
| `statusId` | `StatusID` | int | true | false |
| `employeeId` | `EmployeeID` | varchar(50) | false | true |
| `managerId` | `ManagerID` | varchar(50) | true | true |
| `phone` | `Phone` | varchar(150) | true | true |
| `branchId` | `BranchID` | varchar(50) | false | false |
| `taxCode` | `TaxCode` | varchar(50) | true | true |
| `notes` | `Notes` | nvarchar(max) | true | true |
| `depositAmount` | `DepositAmount` | decimal(28, 0) | true | true |
| `isLocked` | `isLock` | bit | false | false |
| `agencyId` | `AgencyID` | varchar(50) | true | true |
| `isVAT` | `isVAT` | bit | true | true |
| `isOrder` | `isOrder` | bit | false | true |
| `currencyId` | `CurrencyID` | varchar(3) | false | true |
| `rateExchange` | `RateExchange` | float | false | true |
| `linkId` | `LinkID` | varchar(50) | true | true |
| `userCreate` | `UserCreate` | varchar(50) | true | false |
| `userUpdate` | `UserUpdate` | varchar(50) | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `ghiChuDonHang` | `GhiChuDonHang` | nvarchar(250) | true | true |
| `paymentTermId` | `PaymentTermID` | varchar(50) | true | true |
| `ceoId` | `CeoID` | varchar(50) | true | true |
| `thamGiaHopDongBan` | `ThamGiaHopDongBan` | bit | true | true |
| `sendTo` | `SendTo` | nvarchar(max) | true | false |
| `bBKCUrl` | `BBKCUrl` | varchar(500) | true | true |
| `beforeOutStockUrl` | `BeforeOutStockUrl` | varchar(500) | true | true |
| `bBBGUrl` | `BBBGUrl` | varchar(500) | true | true |
| `documentUrl` | `DocumentUrl` | nvarchar(500) | true | true |
| `handoverLocation` | `HandoverLocation` | nvarchar(200) | true | true |
| `representedByA` | `RepresentedByA` | nvarchar(100) | true | true |
| `positionA` | `PositionA` | nvarchar(100) | true | true |
| `addressA` | `AddressA` | nvarchar(200) | true | true |
| `representedByB` | `RepresentedByB` | nvarchar(100) | true | true |
| `positionB` | `PositionB` | nvarchar(100) | true | true |
| `addressB` | `AddressB` | nvarchar(200) | true | true |
| `conclude` | `Conclude` | nvarchar(500) | true | true |
| `minutesNumber` | `MinutesNumber` | int | true | true |
| `partyAKeep` | `PartyAKeep` | int | true | true |
| `partyBKeep` | `PartyBKeep` | int | true | true |
| `deliveryStatusId` | `DeliveryStatusID` | int | true | true |
| `deliveryEmployeeId` | `DeliveryEmployeeID` | nvarchar(200) | true | true |
| `deliveryEmployeeSubId` | `DeliveryEmployeeSubID` | nvarchar(200) | true | true |
| `vehicle` | `Vehicle` | nvarchar(200) | true | true |
| `soPhieu` | `SoPhieu` | nvarchar(100) | true | true |
| `soHoaDon` | `SoHoaDon` | nvarchar(100) | true | true |
| `ngayPhieu` | `NgayPhieu` | datetime | true | true |
| `ngayHoaDon` | `NgayHoaDon` | datetime | true | true |

### lines — dbo.AR_OrderDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(40) | false | false |
| `documentId` | `DocumentID` | varchar(50) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | true |
| `quantity` | `Quantity` | decimal(18, 0) | true | true |
| `unitFactor` | `UnitFactor` | float | true | false |
| `unit2` | `Unit2` | nvarchar(50) | true | false |
| `quantity2` | `Quantity2` | decimal(18, 0) | true | false |
| `unitPrice` | `UnitPrice` | decimal(28, 0) | true | true |
| `tonKhoHienTai` | `TonKhoHienTai` | decimal(18, 0) | true | false |
| `deliveryQuantity` | `DeliveryQuantity` | decimal(18, 0) | true | false |
| `soLuongHopDong` | `SoLuongHopDong` | decimal(18, 0) | true | false |
| `amount` | `Amount` | decimal(28, 0) | true | false |
| `discountPercent` | `DiscountPercent` | decimal(18, 2) | true | true |
| `discountAmount` | `DiscountAmount` | decimal(18, 0) | true | false |
| `vATPercent` | `VATPercent` | decimal(18, 2) | true | true |
| `vATAmount` | `VATAmount` | decimal(18, 0) | true | false |
| `totalAmount` | `TotalAmount` | decimal(18, 0) | true | false |
| `vATQuantity` | `VATQuantity` | decimal(18, 2) | true | true |
| `dienGiai` | `DienGiai` | nvarchar(max) | true | true |
| `notes` | `Notes` | nvarchar(max) | true | true |
| `property` | `Property` | nvarchar(50) | true | true |
| `property2` | `Property2` | nvarchar(50) | true | true |
| `parentId` | `ParentID` | varchar(50) | true | true |
| `notes2` | `Notes2` | nvarchar(200) | true | true |
| `costId` | `CostID` | varchar(50) | true | true |
| `storeHouseId` | `StoreHouseID` | varchar(50) | true | true |
| `vATId` | `VATID` | varchar(50) | true | true |

### history — dbo.AR_OrderLogTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(50) | false | false |
| `documentId` | `DocumentID` | varchar(50) | false | false |
| `thoiGian` | `ThoiGian` | datetime | true | false |
| `userName` | `UserName` | nvarchar(50) | true | false |
| `statusId` | `StatusID` | int | true | false |
| `sendTo` | `SendTo` | nvarchar(max) | true | false |
| `notes` | `Notes` | nvarchar(max) | true | false |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | ObjectID | — | ObjectID;ObjectName;EmployeeID | false | false |
| header.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| header.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | ContractID | — | ObjectName;Address | false | false |
| header.StatusID | StatusID | StatusName | — | — | — | false | false |
| lines.ItemID | ItemID | ItemID | Master.ContractID;UserAutoID | — | ItemCode;ItemName;SoLuongHopDong;DeliveryQuantity;VATPercent;UnitPrice;DienGiai;UnitFactor;Unit2;Unit | true | false |

## internal-transfer-requests — Đề nghị điều chuyển nội bộ

Evidence: catalog `screens[id=internal-transfer-requests]`; menu `07010100`, form `IV_InternalTransferRequestFrm`.

### header — dbo.IV_InternalTransferRequestTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | nvarchar(50) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | true |
| `salesUser` | `SalesUser` | varchar(100) | false | false |
| `branchId` | `BranchID` | varchar(50) | false | false |
| `fromBranchId` | `FromBranchID` | varchar(50) | false | true |
| `toBranchId` | `ToBranchID` | varchar(50) | false | true |
| `requestedTransferDate` | `RequestedTransferDate` | datetime | true | true |
| `assignedPM` | `AssignedPM` | varchar(100) | true | false |
| `statusId` | `StatusID` | int | false | false |
| `transferReason` | `TransferReason` | nvarchar(500) | true | true |
| `transportMethod` | `TransportMethod` | nvarchar(50) | true | true |
| `notes` | `Notes` | nvarchar(1000) | true | true |
| `pMConfirmedBy` | `PMConfirmedBy` | varchar(100) | true | false |
| `pMConfirmedAt` | `PMConfirmedAt` | datetime | true | false |
| `isLocked` | `isLock` | bit | false | false |
| `userCreate` | `UserCreate` | varchar(100) | true | false |
| `userUpdate` | `UserUpdate` | varchar(100) | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `sendTo` | `SendTo` | nvarchar(max) | true | false |

### lines — dbo.IV_InternalTransferRequestDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | nvarchar(50) | false | false |
| `documentId` | `DocumentID` | nvarchar(50) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | true |
| `requestedQty` | `RequestedQty` | decimal(28, 4) | false | true |
| `pMApprovedQty` | `PMApprovedQty` | decimal(28, 4) | true | false |
| `requestedLot` | `RequestedLot` | nvarchar(100) | true | true |
| `expectedObjectId` | `ExpectedObjectID` | varchar(100) | true | true |
| `territoryNote` | `TerritoryNote` | nvarchar(500) | true | true |
| `isEquipment` | `IsEquipment` | bit | false | true |
| `requestedAssetId` | `RequestedAssetID` | varchar(50) | true | true |
| `pMNote` | `PMNote` | nvarchar(500) | true | false |
| `notes` | `Notes` | nvarchar(500) | true | true |

### history — dbo.IV_InternalTransferRequestLogTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(50) | false | false |
| `documentId` | `DocumentID` | varchar(50) | false | false |
| `thoiGian` | `ThoiGian` | datetime | false | false |
| `userName` | `UserName` | varchar(50) | true | false |
| `statusId` | `StatusID` | int | true | false |
| `sendTo` | `SendTo` | nvarchar(max) | true | false |
| `notes` | `Notes` | nvarchar(max) | true | false |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.AssignedPM | UserName | HoTen | FromBranchID | FromBranchID | — | false | false |
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.FromBranchID | BranchID | BranchName | — | — | — | false | false |
| header.ToBranchID | BranchID | BranchName | — | — | — | false | false |
| header.TransportMethod | ID | Name | — | — | — | false | false |
| lines.ExpectedObjectID | ObjectID | ObjectID | — | — | ExpectedObjectName | false | false |
| lines.ItemID | ItemID | ItemID | — | — | ItemCode;ItemName;Unit;HangSX;isLot | false | false |
| lines.RequestedAssetID | AssetID | AssetID | ItemID | ItemID | RequestedAssetName;RequestedAssetSerial | false | false |

## warehouse-qr — Quét QR xuất kho

Evidence: catalog `screens[id=warehouse-qr]`; menu `0702001`, form `IV_Output_QRCodeFrm`.

### header — dbo.IV_OutputTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | false |
| `objectId` | `ObjectID` | varchar(100) | true | false |
| `memo` | `Memo` | nvarchar(200) | true | false |
| `notes` | `Notes` | nvarchar(200) | true | false |
| `isLocked` | `isLock` | bit | false | false |
| `outputType` | `OutputType` | varchar(20) | false | false |
| `searchField` | `SearchField` | nvarchar(2000) | true | false |
| `userCreate` | `UserCreate` | varchar(50) | true | false |
| `userUpdate` | `UserUpdate` | varchar(50) | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `status` | `Status` | int | false | false |
| `calPrice` | `CalPrice` | bit | false | false |
| `calCost` | `CalCost` | bit | false | false |
| `linkId` | `LinkID` | varchar(50) | true | false |
| `isPacket` | `isPacket` | bit | false | false |
| `baseTotal` | `BaseTotal` | decimal(28, 0) | true | false |
| `docBatch` | `DocBatch` | varchar(50) | true | false |
| `nguoiNhan` | `NguoiNhan` | nvarchar(100) | true | false |
| `productOrderId` | `ProductOrderID` | varchar(50) | true | false |
| `branchId` | `BranchID` | varchar(50) | false | false |
| `nguoiGiao` | `NguoiGiao` | nvarchar(100) | true | false |
| `isScanQrCode` | `isScanQRCode` | bit | true | false |
| `internalTransferBatchId` | `InternalTransferBatchID` | varchar(30) | true | false |

### lines — dbo.IV_OutputQRCodeTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | nvarchar(50) | false | false |
| `documentId` | `DocumentID` | nvarchar(50) | false | false |
| `qrCode` | `QRCode` | nvarchar(200) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | false |
| `itemCode` | `ItemCode` | nvarchar(50) | true | false |
| `lot` | `Lot` | nvarchar(50) | false | false |
| `quantity` | `Quantity` | decimal(38, 10) | true | false |
| `qrPackageId` | `QRPackageID` | nvarchar(200) | true | false |
| `quyCach` | `QuyCach` | nvarchar(50) | true | false |

### comparison — dbo.IV_OutputDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(40) | false | false |
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | false |
| `lot` | `Lot` | varchar(50) | true | false |
| `expireDate` | `ExpireDate` | datetime | true | false |
| `storeHouseId` | `StoreHouseID` | varchar(50) | false | false |
| `quantity` | `Quantity` | decimal(28, 4) | true | false |
| `unitPrice` | `UnitPrice` | decimal(28, 2) | true | false |
| `amount` | `Amount` | decimal(28, 0) | true | false |
| `invAccId` | `InvAccID` | varchar(50) | false | false |
| `accountId2` | `AccountID2` | varchar(50) | false | false |
| `costCenterId` | `CostCenterID` | varchar(50) | true | false |
| `costId` | `CostID` | varchar(50) | true | false |
| `notes` | `Notes` | nvarchar(100) | true | false |
| `quantity2` | `Quantity2` | decimal(28, 4) | true | false |
| `property` | `Property` | nvarchar(50) | true | false |
| `property2` | `Property2` | nvarchar(50) | true | false |
| `parentId` | `ParentID` | varchar(50) | true | false |
| `packetGroup` | `PacketGroup` | varchar(50) | true | false |
| `unitFactor` | `UnitFactor` | float | true | false |
| `refDoc` | `RefDoc` | varchar(50) | true | false |
| `assetId` | `AssetID` | varchar(50) | true | false |
| `repairDocumentId` | `RepairDocumentID` | varchar(30) | true | false |
| `repairDetailId` | `RepairDetailID` | varchar(40) | true | false |
| `sourceInputDetailId` | `SourceInputDetailID` | varchar(40) | true | false |
| `partSerialNo` | `PartSerialNo` | nvarchar(100) | true | false |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.FldObjectID | ObjectID | ObjectID | — | — | ObjectID;ObjectName;Address | false | false |
| header.FldOutputType | OutputType | OutputType | — | — | CalPrice;CalCost;isPacket | false | false |
| grdChitiet2.AccountID2 | AccountID2 | AccountID2 | — | — | — | false | false |
| grdChitiet2.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| grdChitiet2.CostID | CostID | CostID | — | — | — | false | false |
| grdChitiet2.InvAccID | InvAccID | InvAccID | — | — | — | false | false |
| grdChitiet2.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID | false | false |
| grdChitiet2.ItemName | ItemName | ItemName | Master.DocumentDate | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;Lot;Quantity2;Quantity;Property;Property2 | true | false |
| grdChitiet2.Lot | Lot | Lot | Master.DocumentDate;ItemID;StoreHouseID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;Lot;ExpireDate;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.Property | Property | Property | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;AccountID2;Lot;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.Property2 | Property2 | Property2 | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;AccountID2;Lot;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.RefDoc | RefDoc | RefDoc | Master.DocumentDate;Master.ObjectID;AccountID2 | ObjectID;DocumentDate | — | true | false |
| grdChitiet2.StoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| grdPhieuMuaHang.CouponSeri | CouponSeri | CouponSeri | — | — | TriGia | true | true |

## sales-qr — Quét QR xuất bán hàng

Evidence: catalog `screens[id=sales-qr]`; menu `0702010`, form `AR_Invoice_QRCodeFrm`.

### header — dbo.AR_InvoiceTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | false |
| `objectId` | `ObjectID` | varchar(100) | false | false |
| `employeeId` | `EmployeeID` | varchar(50) | true | false |
| `managerId` | `ManagerID` | varchar(50) | true | false |
| `memo` | `Memo` | nvarchar(250) | true | false |
| `notes` | `Notes` | nvarchar(200) | true | false |
| `receiver` | `Receiver` | nvarchar(100) | true | false |
| `currencyId` | `CurrencyID` | varchar(3) | false | false |
| `rateExchange` | `RateExchange` | float | false | false |
| `paymentTypeId` | `PaymentTypeID` | varchar(50) | true | false |
| `paymentTermId` | `PaymentTermID` | varchar(50) | true | false |
| `dueDate` | `DueDate` | datetime | true | false |
| `debtDueDate` | `DebtDueDate` | datetime | true | false |
| `pONo` | `PONo` | varchar(50) | true | false |
| `contractId` | `ContractID` | nvarchar(100) | true | false |
| `refDoc` | `RefDoc` | varchar(50) | true | false |
| `baseTotal` | `BaseTotal` | decimal(18, 0) | true | false |
| `revAccId` | `RevAccID` | varchar(50) | false | false |
| `vATAccId` | `VATAccID` | varchar(50) | false | false |
| `isLocked` | `isLock` | bit | false | false |
| `invoiceNo` | `InvoiceNo` | varchar(50) | true | false |
| `searchField` | `SearchField` | nvarchar(2000) | true | false |
| `userCreate` | `UserCreate` | varchar(50) | true | false |
| `userUpdate` | `UserUpdate` | varchar(50) | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `status` | `Status` | int | false | false |
| `linkId` | `LinkID` | varchar(50) | true | false |
| `vATAccId2` | `VATAccID2` | varchar(50) | true | false |
| `amountTotal` | `AmountTotal` | decimal(28, 0) | true | false |
| `vATAmountTotal` | `VATAmountTotal` | decimal(28, 0) | true | false |
| `impExpId` | `ImpExpID` | varchar(10) | true | false |
| `isExport` | `isExport` | bit | true | false |
| `costCenterId` | `CostCenterID` | varchar(50) | true | false |
| `costId` | `CostID` | varchar(50) | true | false |
| `vATAccExId` | `VATAccExID` | varchar(50) | true | false |
| `docBatch` | `DocBatch` | varchar(50) | true | false |
| `couponAmount` | `CouponAmount` | decimal(18, 0) | true | false |
| `lanIn` | `LanIn` | int | true | false |
| `locationId` | `LocationID` | nvarchar(50) | true | false |
| `attach` | `Attach` | nvarchar(100) | true | false |
| `attachDate` | `AttachDate` | datetime | true | false |
| `noiDungHoaDon` | `NoiDungHoaDon` | nvarchar(500) | true | false |
| `nguoiMuaHangHD` | `NguoiMuaHangHD` | nvarchar(250) | true | false |
| `tenKhachLe` | `TenKhachLe` | nvarchar(250) | true | false |
| `mSTKhachLe` | `MSTKhachLe` | nvarchar(50) | true | false |
| `branchId` | `BranchID` | varchar(50) | false | false |
| `statusId` | `StatusID` | int | true | false |
| `isLocal` | `isLocal` | bit | false | false |
| `invoiceKey` | `InvoiceKey` | varchar(50) | true | false |
| `refInvoiceKey` | `RefInvoiceKey` | varchar(50) | true | false |
| `objectNameHD` | `ObjectNameHD` | nvarchar(250) | true | false |
| `addressHD` | `AddressHD` | nvarchar(250) | true | false |
| `taxCodeHD` | `TaxCodeHD` | nvarchar(50) | true | false |
| `uId` | `UID` | varchar(50) | true | false |
| `ghiChuHoaDon` | `GhiChuHoaDon` | nvarchar(250) | true | false |
| `thuHo` | `ThuHo` | bit | true | false |
| `agencyId` | `AgencyID` | varchar(50) | true | false |
| `ceoId` | `CeoID` | varchar(50) | true | false |
| `ngayGiaoLai` | `NgayGiaoLai` | datetime | true | false |
| `hinhThucGiaoHang` | `HinhThucGiaoHang` | nvarchar(100) | true | false |
| `thamGiaHopDongBan` | `ThamGiaHopDongBan` | bit | true | false |
| `cTKM` | `CTKM` | varchar(50) | true | false |
| `soTienKM` | `SoTienKM` | decimal(18, 0) | true | false |
| `maVanDon` | `MaVanDon` | nvarchar(50) | true | false |
| `phiVanChuyen` | `PhiVanChuyen` | decimal(18, 0) | true | false |
| `phiKhacTotal` | `PhiKhacTotal` | decimal(18, 0) | true | false |
| `maHopDong` | `MaHopDong` | nvarchar(50) | true | false |
| `discountTotal` | `DiscountTotal` | decimal(18, 0) | true | false |
| `isScanQrCode` | `isScanQRCode` | bit | true | false |

### lines — dbo.AR_InvoiceQRCodeTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | nvarchar(50) | false | false |
| `documentId` | `DocumentID` | nvarchar(50) | false | false |
| `qrCode` | `QRCode` | nvarchar(200) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | false |
| `itemCode` | `ItemCode` | nvarchar(50) | true | false |
| `lot` | `Lot` | nvarchar(50) | false | false |
| `quantity` | `Quantity` | decimal(38, 10) | true | false |
| `qrPackageId` | `QRPackageID` | nvarchar(200) | true | false |
| `quyCach` | `QuyCach` | nvarchar(50) | true | false |

### comparison — dbo.AR_InvoiceDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(40) | false | false |
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `itemId` | `ItemID` | nvarchar(50) | false | false |
| `lot` | `Lot` | varchar(50) | true | false |
| `expireDate` | `ExpireDate` | datetime | true | false |
| `notes` | `Notes` | nvarchar(500) | true | false |
| `storeHouseId` | `StoreHouseID` | varchar(50) | false | false |
| `quantity` | `Quantity` | decimal(28, 4) | false | false |
| `unitPrice` | `UnitPrice` | decimal(28, 4) | true | false |
| `sourceAmount` | `SourceAmount` | decimal(28, 2) | true | false |
| `amount` | `Amount` | decimal(28, 0) | true | false |
| `vATId` | `VATID` | varchar(50) | true | false |
| `vATPercent` | `VATPercent` | decimal(18, 2) | true | false |
| `vATAmount` | `VATAmount` | decimal(28, 0) | true | false |
| `discountPercentTT` | `DiscountPercentTT` | decimal(18, 2) | true | false |
| `discountAmountTT` | `DiscountAmountTT` | decimal(28, 0) | true | false |
| `discountPercent` | `DiscountPercent` | decimal(18, 2) | true | false |
| `discountAmount` | `DiscountAmount` | decimal(28, 0) | true | false |
| `totalAmount` | `TotalAmount` | decimal(28, 0) | true | false |
| `costCenterId` | `CostCenterID` | varchar(50) | true | false |
| `costId` | `CostID` | varchar(50) | true | false |
| `incomeAccId` | `IncomeAccID` | varchar(50) | false | false |
| `invAccId` | `InvAccID` | varchar(50) | true | false |
| `costOfSaleAccId` | `CostOfSaleAccID` | varchar(50) | true | false |
| `discountAcctId` | `DiscountAcctID` | varchar(50) | true | false |
| `discountAmount2` | `DiscountAmount2` | decimal(18, 0) | true | false |
| `unitCost` | `UnitCost` | float | true | false |
| `amountCost` | `AmountCost` | decimal(28, 0) | true | false |
| `quantity2` | `Quantity2` | decimal(28, 4) | true | false |
| `property` | `Property` | nvarchar(50) | true | false |
| `property2` | `Property2` | nvarchar(50) | true | false |
| `objectId` | `ObjectID` | varchar(50) | true | false |
| `parentId` | `ParentID` | varchar(50) | true | false |
| `unitPriceV` | `UnitPriceV` | decimal(28, 2) | true | false |
| `unitFactor` | `UnitFactor` | float | true | false |
| `exportPercent` | `ExportPercent` | decimal(18, 2) | true | false |
| `exportAmount` | `ExportAmount` | decimal(28, 2) | true | false |
| `dienGiai` | `DienGiai` | nvarchar(250) | true | false |
| `stockQuantity` | `StockQuantity` | decimal(28, 4) | true | false |
| `isKM` | `isKM` | bit | true | false |
| `employeeId` | `EmployeeID` | varchar(50) | true | false |
| `managerId` | `ManagerID` | varchar(50) | true | false |
| `cTKM` | `CTKM` | varchar(50) | true | false |
| `tongTienNhom1` | `TongTienNhom1` | decimal(18, 0) | true | false |
| `tongTienNhom2` | `TongTienNhom2` | decimal(18, 0) | true | false |
| `phiKhac` | `PhiKhac` | decimal(18, 0) | true | false |
| `tongTienNhomFyto` | `TongTienNhomFyto` | decimal(18, 0) | true | false |
| `quyCach` | `QuyCach` | nvarchar(50) | true | false |
| `sLTheoQuyCach` | `SLTheoQuyCach` | decimal(18, 2) | true | false |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.AgencyID | AgencyID | AgencyID | — | — | — | false | false |
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.CeoID | CeoID | CeoID | — | — | CeoName | false | false |
| header.ChietKhau1AccID | ChietKhau1AccID | ChietKhau1AccID | — | — | — | false | true |
| header.ChietKhau2AccID | ChietKhau2AccID | ChietKhau2AccID | — | — | — | false | true |
| header.ChietKhau3AccID | ChietKhau3AccID | ChietKhau3AccID | — | — | — | false | true |
| header.ChietKhau4AccID | ChietKhau4AccID | ChietKhau4AccID | — | — | — | false | true |
| header.ContractID | ContractID | ContractID | — | — | ContractID | false | false |
| header.CostCenterID | CostCenterID | CostCenterID | — | — | CostCenterID | false | false |
| header.CostID | CostID | CostID | — | — | CostID | false | false |
| header.CTKM | CTKM | CTKM | BranchID | — | — | false | false |
| header.CurrencyID | CurrencyID | CurrencyID | — | — | RateExchange | false | false |
| header.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| header.FldRefDoc | RefDoc | RefDoc | ObjectID;RevAccID;DocumentDate | — | RefDoc | false | false |
| header.HinhThucGiaoHang | HinhThucGiaoHang | HinhThucGiaoHang | — | — | — | false | false |
| header.LocationID | LocationID | LocationName | — | — | — | false | false |
| header.MaHopDong | MaHopDong | MaHopDong | — | — | — | false | true |
| header.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | BranchID | — | ObjectID;ObjectName;Address;RevAccID;Phone;LocationID;NguoiMuaHangHD;ChietKhau2AccID;ChietKhau4AccID;CostCenterID;Phone;HinhThucGiaoHang;PhanLoai | false | false |
| header.PaymentTermID | PaymentTermID | PaymentTermName | — | — | — | false | false |
| header.PaymentTypeID | PaymentTypeID | PaymentTypeName | — | — | — | false | false |
| header.RevAccID | RevAccID | RevAccID | — | — | — | false | false |
| header.VATAccID | VATAccID | VATAccID | — | — | — | false | false |
| header.VATAccID2 | VATAccID2 | VATAccID2 | — | — | — | false | false |
| grdChitiet2.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| grdChitiet2.CostID | CostID | CostID | — | — | — | false | false |
| grdChitiet2.CostOfSaleAccID | CostOfSaleAccID | CostOfSaleAccID | — | — | — | false | false |
| grdChitiet2.CTKM | CTKM | CTKM | Master.BranchID | — | — | false | false |
| grdChitiet2.DiscountAcctID | DiscountAcctID | DiscountAcctID | — | — | — | false | false |
| grdChitiet2.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| grdChitiet2.IncomeAccID | IncomeAccID | IncomeAccID | — | — | — | false | false |
| grdChitiet2.InvAccID | InvAccID | InvAccID | — | — | — | false | false |
| grdChitiet2.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID;DienGiai | false | false |
| grdChitiet2.ItemName | ItemName | ItemName | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID;DienGiai | true | false |
| grdChitiet2.Lot | Lot | Lot | Master.DocumentDate;ItemID | — | StoreHouseID;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;ExpireDate;Property;Property2;UnitCost | true | false |
| grdChitiet2.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| grdChitiet2.ObjectID | ObjectID | ObjectName | — | — | — | false | false |
| grdChitiet2.Property | Property | Property | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;Property;Property2;Quantity2;Quantity;UnitCost | true | false |
| grdChitiet2.Property2 | Property2 | Property2 | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;Property;Property2;Quantity2;Quantity;UnitCost | true | false |
| grdChitiet2.StoreHouseID | StoreHouseID | StoreHouseID | Master.BranchID | Master.BranchID | — | false | false |
| grdChitiet2.VATID | VATID | VATID | — | — | VATPercent | false | false |
| grdChitietKM.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID | false | true |
| grdChitietKM.Lot | Lot | Lot | Master.DocumentDate;ItemID;StoreHouseID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;ExpireDate;Property;Property2;UnitCost | true | true |
| grdChitietKM.StoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | true |
| grdHoaDon.ItemName | ItemName | ItemName | — | — | ItemName;VATID;VATPercent | false | true |
| grdHoaDon.ObjectName | ObjectName | ObjectName | — | — | Address;TaxCode | false | true |
| grdHoaDon.VATID | VATID | VATID | — | — | VATPercent | false | true |

## machine-movements — Phiếu di chuyển / bàn giao máy

Evidence: catalog `screens[id=machine-movements]`; menu `1207`, form `FA_Move2026Frm`.

### header — dbo.FA_MoveTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | true |
| `nguoiGiao` | `NguoiGiao` | nvarchar(150) | true | true |
| `nguoiNhan` | `NguoiNhan` | nvarchar(150) | true | true |
| `memo` | `Memo` | nvarchar(150) | true | true |
| `notes` | `Notes` | nvarchar(150) | true | true |
| `isLocked` | `isLock` | bit | false | false |
| `userCreate` | `UserCreate` | varchar(50) | true | false |
| `userUpdate` | `UserUpdate` | varchar(50) | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `moveTypeId` | `MoveTypeID` | varchar(30) | false | true |
| `contractId` | `ContractID` | nvarchar(100) | true | true |
| `effectiveFrom` | `EffectiveFrom` | datetime | true | true |
| `effectiveTo` | `EffectiveTo` | datetime | true | true |
| `referenceNo` | `ReferenceNo` | nvarchar(100) | true | true |
| `referenceDate` | `ReferenceDate` | datetime | true | true |
| `documentLink` | `DocumentLink` | nvarchar(1000) | true | true |

### lines — dbo.FA_MoveDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(40) | false | false |
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `assetId` | `AssetID` | varchar(50) | false | true |
| `quantity` | `Quantity` | decimal(18, 2) | true | true |
| `departmentId` | `DepartmentID` | varchar(50) | true | true |
| `objectId` | `ObjectID` | varchar(50) | true | true |
| `costCenterId` | `CostCenterID` | varchar(50) | true | true |
| `costId` | `CostID` | varchar(50) | true | true |
| `notes` | `Notes` | nvarchar(150) | true | true |
| `fromObjectId` | `FromObjectID` | varchar(100) | true | true |
| `fromStoreHouseId` | `FromStoreHouseID` | varchar(50) | true | true |
| `toStoreHouseId` | `ToStoreHouseID` | varchar(50) | true | true |
| `fromLocation` | `FromLocation` | nvarchar(500) | true | true |
| `toLocation` | `ToLocation` | nvarchar(500) | true | true |
| `handoverDate` | `HandoverDate` | datetime | true | true |
| `handoverComponents` | `HandoverComponents` | nvarchar(max) | true | true |
| `assetCondition` | `AssetCondition` | nvarchar(1000) | true | true |
| `lifecycleStatusAfter` | `LifecycleStatusAfter` | varchar(30) | true | false |
| `toLocationId` | `ToLocationID` | nvarchar(50) | true | true |
| `toQuanHuyen` | `ToQuanHuyen` | nvarchar(50) | true | true |
| `toXaPhuong` | `ToXaPhuong` | nvarchar(50) | true | true |
| `toChuyenKhoa` | `ToChuyenKhoa` | nvarchar(250) | true | true |
| `toZoneId` | `ToZoneID` | nvarchar(50) | true | true |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | — | — | — | false | false |
| header.MoveTypeID | MoveTypeID | MoveTypeName | — | — | — | false | false |
| lines.AssetID | AssetID | AssetID | — | — | AssetID;AssetName;Unit | false | false |
| lines.AssetName | AssetName | AssetName | — | — | AssetID;AssetName;Unit | true | true |
| lines.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| lines.CostID | CostID | CostID | — | — | — | false | false |
| lines.DepartmentID | DepartmentID | DepartmentName | — | — | — | false | false |
| lines.FromObjectID | ObjectID | ObjectID | — | — | — | false | false |
| lines.FromStoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| lines.ObjectID | ObjectID | ObjectName | — | — | ObjectID;ToLocationID;ToQuanHuyen;ToXaPhuong;ToChuyenKhoa;ToZoneID;ToLocation | false | false |
| lines.ToChuyenKhoa | ChuyenKhoa | ChuyenKhoa | — | — | — | false | false |
| lines.ToLocationID | LocationID | LocationID | — | — | — | false | false |
| lines.ToStoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| lines.ToZoneID | ZoneID | ZoneID | — | — | — | false | false |

## machine-repairs — Phiếu sửa chữa / bảo hành / bảo trì máy

Evidence: catalog `screens[id=machine-repairs]`; menu `1209`, form `FA_Repair2026Frm`.

### header — dbo.FA_RepairTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `documentDate` | `DocumentDate` | datetime | false | true |
| `nguoiGiao` | `NguoiGiao` | nvarchar(150) | true | true |
| `nguoiNhan` | `NguoiNhan` | nvarchar(150) | true | true |
| `memo` | `Memo` | nvarchar(150) | true | true |
| `notes` | `Notes` | nvarchar(150) | true | true |
| `isLocked` | `isLock` | bit | false | false |
| `userCreate` | `UserCreate` | varchar(50) | true | false |
| `userUpdate` | `UserUpdate` | varchar(50) | true | false |
| `dateUpdate` | `DateUpdate` | datetime | true | false |
| `dateCreate` | `DateCreate` | datetime | true | false |
| `serviceTypeId` | `ServiceTypeID` | varchar(30) | false | true |
| `objectId` | `ObjectID` | varchar(100) | true | true |
| `serviceLocation` | `ServiceLocation` | nvarchar(500) | true | true |
| `contractId` | `ContractID` | nvarchar(100) | true | true |
| `startDate` | `StartDate` | datetime | true | true |
| `endDate` | `EndDate` | datetime | true | true |
| `technician` | `Technician` | nvarchar(150) | true | true |
| `serviceStatus` | `ServiceStatus` | varchar(30) | true | true |
| `referenceNo` | `ReferenceNo` | nvarchar(100) | true | true |
| `referenceDate` | `ReferenceDate` | datetime | true | true |
| `documentLink` | `DocumentLink` | nvarchar(1000) | true | true |

### lines — dbo.FA_RepairDetailTbl

| JSON field | SQL column | SQL type | Nullable | Writable |
|---|---|---|---|---|
| `userAutoId` | `UserAutoID` | varchar(40) | false | false |
| `documentId` | `DocumentID` | varchar(30) | false | false |
| `assetId` | `AssetID` | varchar(50) | false | true |
| `noiDung` | `NoiDung` | nvarchar(150) | true | true |
| `quantity` | `Quantity` | decimal(18, 2) | true | true |
| `amount` | `Amount` | decimal(18, 2) | true | false |
| `notes` | `Notes` | nvarchar(150) | true | true |
| `problemDescription` | `ProblemDescription` | nvarchar(max) | true | true |
| `actionTaken` | `ActionTaken` | nvarchar(max) | true | true |
| `resultStatus` | `ResultStatus` | nvarchar(500) | true | true |
| `warrantyCovered` | `WarrantyCovered` | bit | true | true |
| `nextServiceDate` | `NextServiceDate` | datetime | true | true |
| `laborAmount` | `LaborAmount` | decimal(28, 0) | true | true |
| `partsAmount` | `PartsAmount` | decimal(28, 0) | true | false |
| `internalAlert` | `InternalAlert` | nvarchar(1000) | true | true |

### Dropdown / dropselect

| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | — | — | ServiceLocation | false | false |
| header.ServiceStatus | ServiceStatus | ServiceStatusName | — | — | — | false | false |
| header.ServiceTypeID | ServiceTypeID | ServiceTypeName | — | — | — | false | false |
| lines.AssetID | AssetID | AssetID | — | — | AssetID;AssetName;Unit | false | false |
| lines.AssetName | AssetName | AssetName | — | — | AssetID;AssetName;Unit | true | true |
