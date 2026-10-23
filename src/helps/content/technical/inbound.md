## Liên kết PO → đợt → đề nghị → nhập kho

`AP_OrderTbl.DocumentID` → `AP_OrderDetailTbl.DocumentID`. Chi tiết được tham chiếu bằng `OrderDetailID`, không nối chỉ bằng ItemID vì một PO có thể lặp mã hàng.

`AP_POShipmentTbl.InboundRequestDocumentID` → `IV_InboundRequestTbl.DocumentID`; `IV_InboundRequestDetailsTbl.DocumentID` → master đề nghị. `IV_InputTbl.LinkID` tham chiếu đề nghị ở luồng nhập kho liên quan.

## Lấy hàng từng đợt và lưu

`AP_POInboundSelectViewDetail` cung cấp phần còn lại và HangSX từ danh mục. Bộ chọn nhận “SL lấy đợt này”; `AP_POInboundPartial_SyncStp` kiểm tra và đồng bộ phân bổ trong giao dịch lưu. Không gọi sync như một thao tác độc lập ngoài giao dịch lưu. Các đợt CANCELLED bị loại khỏi lượng đã phân bổ.

`IV_InboundPartial_PlanHeaderTrg` và `IV_InboundPartial_PlanDetailTrg` bảo vệ đồng bộ khi master/detail thay đổi. Cùng PO dùng khóa ứng dụng để hai phiên không lấy vượt phần còn lại.

## Copy nhiều lô trên phiếu đã lưu

Chức năng **Chèn dòng / Copy dòng này (nhân bản)** của lưới tạo khóa `UserAutoID` riêng cho dòng mới và giữ `OrderDetailID`. Các dòng lô cùng nguồn được cộng theo `OrderDetailID`; không cộng hoặc nối chỉ bằng ItemID.

Với phiếu đã lưu còn trạng thái 0/1, `IV_InboundRequest_PrepareDetailSaveStp` nhận bộ chi tiết cuối cùng từ form trước khi lưu. `IV_InboundRequest_ParseSaveDetailsFnc` đọc các dòng từ dữ liệu XML. Các cấu hình kiểm tra trước lưu EBS/EBC truyền người dùng bằng tham số hệ thống `@User`; ở bước này, `{User}` bị bộ xử lý của ERP hiểu là tên cột dữ liệu.

Cấu hình ESDB gán `DetailSaveToken` ẩn vào master để lần chỉ sửa chi tiết vẫn cập nhật master. `IV_InboundRequest_ApplyDetailSaveTrg` kiểm tra phiên lưu, giao dịch, trạng thái, thay đổi đồng thời và liên kết nhập kho rồi áp dụng toàn bộ kế hoạch chi tiết cuối cùng trong giao dịch lưu của ERP.

`IV_InboundRequest_SaveBatchAdapterTrg` tiếp nhận các INSERT của dòng copy trong cùng giao dịch, cập nhật đúng dòng đã áp dụng và giữ giá trị thực tế từ bộ ghi dữ liệu của ERP. Các trigger đồng bộ hiện có vẫn kiểm tra tổng cuối cùng cùng các đợt khác. Khi vượt PO hoặc có lỗi, toàn bộ lần lưu được hoàn tác; phân bổ không bị cộng trùng do thứ tự ghi dòng copy và dòng gốc.

Phiếu đã chuyển xử lý, đã hủy hoặc đã có liên kết nhập kho không được sửa kế hoạch bằng luồng này. Phân quyền hiện hữu và liên kết master/detail được giữ nguyên.

## Chuyển bước

| Action | Trạng thái nguồn | Đích |
| --- | --- | --- |
| TM_SENDWH | 0, 1 | 2 — Đã gửi thủ kho |
| WH_SENDSA | 2, 3 | 4 — Đã gửi TP SA |
| SA_SENDPM | 4, 5 | 6 — Đã gửi PM |
| PM_SENDTECH | 6, 7 | 8 — Đã gửi Kỹ thuật |
| PM_SENDACCOUNT | 6, 7 | 13 — Đã gửi kế toán |
| TECH_SENDACCOUNT | 8, 9 | 13 — Đã gửi kế toán |
| TM_SENDBLD | 0, 1 | 10 — Đã gửi BLĐ |
| BLD_APPROVE / BLD_CANCEL | 10 | 13 / 12 |

Nút “Gửi Thủ kho” gọi `IV_InboundRequest_ChangeWorkflowStatusStp` với TM_SENDWH. Kiểm tra trạng thái, người xử lý và dữ liệu chứng từ vẫn nằm phía DB; không ghép điều kiện SQL với giá trị trống ở UI. Trả lại yêu cầu lý do và quay về đúng bước trước.

## Hủy và xóa

Hủy đợt nháp giải phóng phân bổ và giữ lịch sử đợt. Trigger INSTEAD OF DELETE kiểm tra trạng thái 0/1, khóa PO liên quan, chặn chứng từ đã phát sinh nghiệp vụ và xử lý liên kết khi xóa; không bổ sung cascade tùy tiện cho chứng từ đã xử lý.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `IV_InboundRequestFrm` | Phiếu đề nghị nhập hàng |
| `IV_IncomingShipmentStatusFrm` | Xác nhận tình trạng hàng về |
| `IV_GoodsInfoControlFrm` | Kiểm soát thông tin hàng hóa |
| `IV_GoodsQualityControlConfirmFrm` | Kiểm soát và xác nhận chất lượng hàng hóa |
| `IV_GoodsStatusConfirmFrm` | Xác nhận tình trạng hàng hóa |
| `IV_CargoHandlingPlanApprovalFrm` | Phê duyệt phương án hàng hóa |
| `IV_InboundRequestCTCPFrm` | Chứng từ chi phí |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `AP_POInboundSelectViewDetail` | View | Dòng PO còn được lấy, khóa dòng nguồn và Hãng SX |
| `AP_POInboundPartialUsageView` | View | Tổng lượng đã phân bổ cho các đợt |
| `AP_POInboundPartial_SyncStp` | STP | Đồng bộ lượng từng đợt trong giao dịch lưu |
| `AP_POInboundPartial_CancelStp` | STP | Hủy đợt nháp, trả lượng về PO |
| `IV_InboundPartial_PlanHeaderTrg` | Trigger | Đồng bộ kế hoạch khi master thay đổi |
| `IV_InboundPartial_PlanDetailTrg` | Trigger | Đồng bộ kế hoạch khi detail thay đổi |
| `IV_InboundRequest_PrepareDetailSaveStp` | STP | Chuẩn bị bộ chi tiết cuối cùng của phiếu đã lưu |
| `IV_InboundRequest_ParseSaveDetailsFnc` | Function | Đọc chi tiết cuối cùng từ XML của form |
| `IV_InboundRequest_ApplyDetailSaveTrg` | Trigger | Áp dụng kế hoạch cuối cùng trong giao dịch lưu |
| `IV_InboundRequest_SaveBatchAdapterTrg` | Trigger | Tiếp nhận dòng copy, giữ dữ liệu và tránh cộng phân bổ trùng |
| `IV_InboundRequest_ChangeWorkflowStatusStp` | STP | Kiểm tra và chuyển trạng thái đề nghị |
| `IV_InboundRequest_DeleteDraftTrg` | Trigger | Chặn xóa sai bước và xử lý liên kết phiếu nháp |
