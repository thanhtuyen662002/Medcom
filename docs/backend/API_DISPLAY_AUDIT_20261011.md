# Rà soát dữ liệu hiển thị API — 11/10/2026

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

Trạng thái triển khai, kiểm thử và live acceptance ở checkpoint đầu: **PENDING**. Live ghi nghiệp vụ của người dùng: **UNKNOWN**; không tạo giao dịch MedData chỉ để kiểm thử.
