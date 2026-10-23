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

Luồng thông thường: **TP SA → Kỹ thuật nếu có thiết bị → PM → Kế toán**. Mã trạng thái giữ nguyên ý nghĩa: 6/7 thuộc PM, 8/9 thuộc Kỹ thuật. Thứ tự nghiệp vụ hiện là 4 → 8 → 6 → 13 với thiết bị, hoặc 4 → 6 → 13 với hàng khác; không dùng phép so sánh mã tăng dần để suy ra bước trước/sau.

| Màn hình / nút | Action | Trạng thái nguồn | Đích / điều kiện |
| --- | --- | --- | --- |
| TM — Gửi Thủ kho | TM_SENDWH | 0, 1 | 2 — Đã gửi thủ kho |
| Thủ kho — Gửi TP SA | WH_SENDSA | 2, 3 | 4 — Đã gửi TP SA |
| TP SA — Gửi Kỹ thuật | SA_SENDTECH | 4, 5 | 8 — Đã gửi Kỹ thuật; phiếu có thiết bị |
| TP SA — Gửi PM (không thiết bị) | SA_SENDPM | 4, 5 | 6 — Đã gửi PM; phiếu không có thiết bị, phải chọn PM |
| Kỹ thuật — Gửi PM | TECH_SENDPM | 8, 9 | 6 — Đã gửi PM; phải chọn PM |
| PM — Gửi kế toán | PM_SENDACCOUNT | 6, 7 | 13 — Đã gửi kế toán; thiết bị phải có lượt Kỹ thuật gửi PM hợp lệ |
| TM — Gửi BLĐ | TM_SENDBLD | 0, 1 | 10 — Đã gửi BLĐ; nhánh phương án giữ nguyên |
| BLĐ — Phê duyệt / Hủy PA | BLD_APPROVE / BLD_CANCEL | 10 | 13 / 12 |

Các nút gọi `IV_InboundRequest_ChangeWorkflowStatusStp`. `@SendTo` bắt buộc với SA_SENDPM và TECH_SENDPM, được kiểm tra PM đang hoạt động, lưu vào master và dòng lịch sử chuyển bước. Kiểm tra người thực hiện, vai trò và chi nhánh tiếp tục dùng cấu hình hiện hữu; lần cập nhật này không cấp lại quyền.

PM không còn nút gửi tiến sang Kỹ thuật; Kỹ thuật không còn nút gửi thẳng Kế toán. Hai action cũ `PM_SENDTECH` và `TECH_SENDACCOUNT` bị từ chối với lỗi 65831 để phiên ERP còn giữ cấu hình cũ không đi sai luồng. Đây là tên action đã ngừng dùng, không phải API tích hợp mới.

## Phân nhánh thiết bị và điều kiện trước gửi

`IV_InboundRequest_HasEquipmentFnc` đọc chi tiết theo DocumentID, nối `CF_ItemTbl.CategoryID` và `CF_CategoryTbl`. Có bất kỳ dòng CategoryID = `TB` → 1; tất cả dòng có loại hàng hợp lệ và không có TB → 0. Không có chi tiết, không tìm thấy mã hàng hoặc loại hàng không hợp lệ → NULL. Cờ `isProperty`/`isProperty2` phục vụ tài sản, không quyết định nhánh thiết bị.

STP phân loại lại trong giao dịch, giữ khóa chi tiết và danh mục trong lúc chuyển bước; không tin một cờ thiết bị do giao diện truyền vào. SA_SENDTECH chỉ cho phiếu có thiết bị; SA_SENDPM chỉ cho phiếu không có thiết bị. Phiếu hỗn hợp vẫn đi qua Kỹ thuật. Chưa xác định được loại hàng thì các action gửi tại TP SA, Kỹ thuật và PM bị chặn, người dùng cần hoàn thiện dữ liệu nguồn.

Với PM_SENDACCOUNT của phiếu thiết bị, action nhập hàng thành công gần nhất trong `WF_ActionAudit658Tbl` phải là `INBOUND_TECH_SENDPM`. STP đọc theo AuditID trước khi ghi action hiện tại. Một lần trả lại rồi gửi qua các bước trước sẽ làm mất điều kiện này cho đến khi Kỹ thuật gửi PM lần nữa. Phiếu thiết bị cũ đang ở PM chưa đáp ứng điều kiện phải trả Kỹ thuật kiểm tra lại; không đổi ngược mã trạng thái hoặc viết lại lịch sử hàng loạt.

Nút Gửi Thủ kho vẫn kiểm tra lô chứng từ, số lượng dương và hạn dùng. Các thao tác tiếp tục dùng khóa ứng dụng theo phiếu, giao dịch và cập nhật theo trạng thái nguồn; khi thất bại không ghi dở trạng thái/lịch sử. Không ghép điều kiện SQL với giá trị trống ở UI.

## Trả lại theo thứ tự nghiệp vụ

| Nút / action | Nguồn | Đích nhanh | Đích khi chọn bước gửi về |
| --- | --- | --- | --- |
| Thủ kho — Từ chối / WH_RETURN | 2, 3 | 1 — Yêu cầu TM xem lại | Không có action chọn bước trong luồng này |
| TP SA — Từ chối nhanh / SA_RETURN; SA_RETURNTO | 4, 5 | 3 — Yêu cầu Thủ kho xem lại | 1, 3 |
| Kỹ thuật — Trả TP SA / TECH_RETURN; TECH_RETURNTO | 8, 9 | 5 — Yêu cầu TP SA xem lại | 1, 3, 5 |
| PM — Trả lại bước trước / PM_RETURN; PM_RETURNTO, có thiết bị | 6, 7 | 9 — Yêu cầu Kỹ thuật xem lại | 1, 3, 5, 9 |
| PM — Trả lại bước trước / PM_RETURN; PM_RETURNTO, không có thiết bị | 6, 7 | 5 — Yêu cầu TP SA xem lại | 1, 3, 5 |

Mọi action RETURN và BLD_CANCEL yêu cầu lý do. STP kiểm tra `@TargetStatus` theo tập đích tường minh và IsReject, thay cho giới hạn số StatusID. Không cho Kỹ thuật trả tiến sang PM hoặc PM chọn chính bước PM. Sau khi nhận trả lại, gửi tiếp bằng các action của luồng mới.

Danh sách chọn bước tại PM dùng `IV_InboundRequest_HasEquipmentFnc` và tham số DocumentID để chỉ thêm trạng thái 9 cho phiếu thiết bị. Các truy vấn lịch sử tham gia danh sách TP SA/Kỹ thuật/PM nhận cả trạng thái gửi và yêu cầu xem lại tương ứng (4/5, 8/9, 6/7), nhưng trả một dòng theo DocumentID. Nhờ vậy phiếu cũ từ PM được trả thẳng về Kỹ thuật vẫn xuất hiện dù chưa có dòng lịch sử trạng thái 8, và không bị nhân đôi khi có cả 8 và 9.

## Hủy và xóa

Hủy đợt nháp giải phóng phân bổ và giữ lịch sử đợt. Trigger INSTEAD OF DELETE kiểm tra trạng thái 0/1, khóa PO liên quan, chặn chứng từ đã phát sinh nghiệp vụ và xử lý liên kết khi xóa; không bổ sung cascade tùy tiện cho chứng từ đã xử lý.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `IV_InboundRequestFrm` | Phiếu đề nghị nhập hàng |
| `IV_IncomingShipmentStatusFrm` | Xác nhận tình trạng hàng về |
| `IV_GoodsInfoControlFrm` | Kiểm soát thông tin hàng hóa |
| `IV_GoodsStatusConfirmFrm` | Xác nhận tình trạng hàng hóa |
| `IV_GoodsQualityControlConfirmFrm` | Kiểm soát và xác nhận chất lượng hàng hóa |
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
| `IV_InboundRequest_HasEquipmentFnc` | Function | Phân loại phiếu có thiết bị theo loại hàng TB; NULL khi chưa xác định được |
| `IV_InboundRequest_DeleteDraftTrg` | Trigger | Chặn xóa sai bước và xử lý liên kết phiếu nháp |
