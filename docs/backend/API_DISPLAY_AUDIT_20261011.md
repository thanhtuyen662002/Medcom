> Hướng dẫn lịch sử trước 11/10/2026. Dùng [bàn giao API theo màn hình và thao tác](BE_FE_API_REFERENCE_20261011.md) hiện hành và OpenAPI v3. Các vị trí dữ liệu bọc/lặp cũ trong tài liệu này đã được thay thế; không dùng thuật ngữ kỹ thuật dưới đây làm nhãn giao diện.

# Rà soát dữ liệu hiển thị API — 11/10/2026

CUD/workflow follow-up: [PR140](https://github.com/thanhtuyen662002/Medcom/pull/140) implements the remaining purchase/inbound/transfer CUD and department actions cataloged here. Current scope, validation, deployment and unresolved bounds are in [I78](../execution/I78_CUD_ACTIONS_20261011.md) and the [FE CUD guide](BE_FE_CUD_WORKFLOW_20261011.md). Tables below retain the preceding audit snapshot; print/import/copy additions are excluded by the newer owner instruction.


Yêu cầu chủ dự án: mọi ID tham chiếu phải kèm tên; ItemID kèm ItemCode, ItemName, Unit; tiền VND `1,234 VND`, USD `1,234.00 USD`; ngày Việt Nam; API chi nhánh; đối chiếu CUD và nút ERP.

## Nguồn và phạm vi

- Baseline lịch sử: [SOURCE_BASELINE.md](../SOURCE_BASELINE.md); các archive được duyệt giữ nguyên danh tính. Hướng dẫn WinForms bổ sung: [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md).
- Nguồn hiện tại: `inventories/source/20261010/source-set.json`, `catalog-columns.json`; `inventories/erp/20261010/six-screen-catalog.json`. Chỉ metadata kỹ thuật, không xuất dữ liệu nghiệp vụ hoặc nội dung SQL riêng tư.
- Head main khảo sát: `d7f901584b56a8620cc6ec68f59a9cc21bcf9b23`. Mã BE: `src/backend/Medcom.Api/ApiContractCatalog.cs`, `ErpScreenEndpoints.cs`, `Medcom.Infrastructure/Erp/SqlErpScreenService.cs`; 119 method/path trước thay đổi.
- Tên hàng: `dbo.CF_ItemTbl.ItemCode/ItemName/Unit`; kho: `dbo.CF_StoreHouseTbl.StoreHouseName`; chi nhánh: `dbo.CF_BranchTbl.BranchName`; đối tượng: `dbo.CF_ObjectTbl.ObjectName`; tiền tệ: `dbo.CF_CurrencyTbl.CurrencyName`.
- Trạng thái riêng theo nguồn: `AP_PurchaseStatusTbl`, `AP_OrderStatusTbl`, `IV_InboundRequestStatusTbl`, `AR_OrderStatusTbl`, `AR_InvoiceStatusTbl`, `IV_InternalTransferRequestStatusTbl`; không dùng chung nghĩa của StatusID giữa các module.

## Tiêu chí hoàn thành

1. Bổ sung trường tên từ danh mục cho từng ID tham chiếu trong response đọc; không thay đổi giá trị nguồn hoặc hash lệnh/chứng từ.
2. Bổ sung trường `...Display` cho tiền/ngày. Giá trị raw dùng khi lưu; giá trị display dùng để hiển thị. Không suy diễn timezone cho SQL datetime.
3. Chi nhánh chỉ trả các BranchID được phiên ERP hiện tại cấp quyền, có phân trang và BranchName.
4. Kiểm tra finite catalog nút ERP với route và writer; ghi rõ trường hợp chưa có nghiệp vụ/source/runtime đủ điều kiện. Không coi route đăng ký là bằng chứng CUD đã chạy trên dữ liệu thật.
5. Kiểm thử response, quyền, duplicate/missing reference, tiền/ngày và OpenAPI; cập nhật tài liệu FE và CI trên head/base thực tế trước tích hợp.

## Kết quả triển khai

`FeDisplayProjection.cs`/`FeDisplaySchemas.cs` áp dụng projection response đọc tại `ApiHost.cs`. Input nghiêm ngặt giữ raw và có sibling `...DisplayData`; Name/Display không tham gia stateToken hoặc intent/journal. 44 binding/90 cột được đối chiếu trực tiếp qua metadata và TOP(0) trên MedData, giữ transaction rollback: `inventories/backend/20261011/reference-source-reconciliation.json`. Không xuất row nghiệp vụ. `SqlReferenceData.cs` đọc theo batch, kiểm tra schema/identity/branch trước và sau, không chọn tên tùy tiện khi duplicate. Nine local synthetic SQL checks quan sát thành công cho scope chi nhánh, paging, ItemCode/Unit, identity exact case, missing key, scope đổi và capacity; không phải nghiệm thu production.

Danh mục hiện tại: **120 operation / 423 schema / 3.460 property schema**, 106 binding dropdown native. `medcom-openapi.json` được xuất từ binary BE đã build; `BE_FE_API_REFERENCE_20261011.md` đối chiếu toàn bộ operation/schema và render Markdown với 660 bảng, 888 fragment links, không anchor thiếu. Input DTO và raw source column definitions giữ nguyên; schema response có variant bổ sung display.

### Bảng CUD và nút — phạm vi 7 form/6 nhóm đã triển khai

| Module | CUD/ghi | Nút nghiệp vụ có route | Lấy/dán dữ liệu | Khoảng trống |
|---|---|---|---|---|
| purchase-requests | create/save/delete | submit (Gửi đề nghị), send-purchase-order (Gửi đặt mua hàng) | options, selection(items), paste/validate | 5 nút in chưa có report API thực thi; không có nút recall trong nguồn form này |
| sales-orders | create/save/delete | send-pm, recall, contract-info | options, PM options, selection(contract-items), paste/validate | Phê duyệt PM/SA ngoài form hiện tại chưa có HTTP hoàn tất |
| internal-transfer-requests | create/save/delete | send-pm, recall | options, PM options, selection(items), paste/validate | Form PM/batch tiếp theo không được coi là đã hoàn tất chỉ từ send-pm |
| warehouse-qr | qr/add, qr/delete trên phiếu đã có | quét thêm/xóa QR | options | Toolbar nguồn ẩn tạo/copy/xóa parent; không có parent CUD trên form quét. In QR chưa có report API |
| sales-qr | qr/add, qr/delete trên phiếu đã có | quét thêm/xóa QR, contract-info | options | Toolbar nguồn ẩn tạo/copy/xóa parent; không có parent CUD trên form quét |
| machine-movements | create/save/delete | CUD theo toolbar | options, selection(machines), paste/validate | Không có submit/recall riêng trong finite source catalog này |
| machine-repairs | create/save/delete | CUD theo toolbar | options, selection(machines), paste/validate | Part links bảo vệ xóa/sửa; công thức toàn bộ tiền công/phụ tùng vẫn UNKNOWN |

Đường dẫn cố định `/api/erp/{module}`: GET root/detail/screen/actions; POST create/save/delete hoặc qr/add/qr/delete; POST actions/{operation}, options, selection, paste/validate, commands/lookup; GET contract-info khi form có nút. Source: `ErpScreenCatalog.cs`, `ErpScreenEndpoints.cs`, `SqlErpScreenService.cs`, `SqlErpScreenEffects.cs`, `ErpActionRules.cs`. Các action kiểm tra native quyền, trạng thái, owner/branch và concurrency, không phải switch chặn ghi chung. Startup concrete writer: `ApiHost.cs`, `ErpWriteStartup.cs`; bật ghi MedData: PR 132 comment 6097976637.

### Kiểm tra ngoài finite catalog

- `/api/documents/purchase-orders*`, `/api/documents/inbound-requests*` và alias v2: **read-only typed boundaries**. Chúng chưa cung cấp CUD cho AP_OrderFrm/IV_InboundRequestFrm; không tuyên bố full ERP CUD từ 7 form trên.
- 8 route facade cũ: purchase save/save-lookup/submit/submit-lookup và inbound draft read/save/send-to-warehouse/reconcile có provider mặc định chưa vận hành. Không dùng làm route thay thế cho writer `/api/erp/*`. Source: default DI registrations trong `ApiHost.cs`, `PurchaseRequestEndpoints.cs`, `InboundDraftEndpoints.cs`; static reconciliation `tools/backend/audit_api_data.py`.
- Import file Excel/upload, copy chứng từ server và cross-document import ngoài items/contract-items/machines: chưa có API chuyên biệt đủ evidence. FE chỉ dùng các nguồn selection/paste đã công bố; copy nháp phải dựng input writable từ đủ trang của phiếu gốc. Native copy side effects còn UNKNOWN.
- Thông báo có list/detail/target/read, hiện `AP_BPTMShipmentsFrm` chưa có typed target reader/key mapping đầy đủ — issue #135. `statusName` vẫn có key null/state=unknown nếu chưa có mapping status nguồn được xác minh.
- API mới GET `/api/lookups/branches` có paging/search, trả BranchID/BranchName theo native grants. BE không sửa FE/Sites; FE thêm allowlist route mới và chuyển header display. BFF base PR 138 hiện chứa 119 route cũ.

## Giới hạn nghiệm thu

Các checkpoint source/current-head CI, package integrity và deployment nằm ở [PR 139](https://github.com/thanhtuyen662002/Medcom/pull/139). Live ghi nghiệp vụ của người dùng và business release: **UNKNOWN**; không tạo giao dịch MedData để kiểm thử. Goal #45, traceability và các runtime/release gates vẫn mở. Báo cáo này chỉ đóng việc bổ sung/read-contract và ghi nhận chính xác phần CUD/nút đã có cùng khoảng trống; không che các phần chưa hoàn thiện.
