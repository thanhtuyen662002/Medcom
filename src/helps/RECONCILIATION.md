# Đối chiếu hướng dẫn với ERP — 22/10/2026

Tài liệu dành cho người bảo trì nội dung; không đưa các ghi chú kiểm chứng vào trang đọc hướng dẫn. Phạm vi là tài liệu/web, không phải một đợt sửa hoặc kiểm thử ghi dữ liệu ERP.

## Căn cứ

- Đã đọc 7 tài liệu Word do chủ hệ thống cung cấp. Tài liệu bán hàng gần như toàn bộ là ảnh; đã đọc ảnh theo thứ tự thao tác.
- Đã đọc cấu hình form/menu, danh mục trạng thái và định nghĩa module hiện tại của MedData qua phiên được chủ hệ thống đăng nhập, chỉ đọc.
- [content/evidence.json](content/evidence.json) lưu tên, loại đối tượng, nhãn form/nút và hash định nghĩa liên quan, không lưu SQL body, quyền cá nhân hoặc dữ liệu giao dịch.
- Bản sao Word, ảnh nguồn và kết quả truy vấn đầy đủ giữ ngoài repo công khai. Baseline archive cũ của dự án không được tuyên bố tương đương với DB hiện tại trong lượt này.

## Những nội dung đã chỉnh

| Tài liệu nguồn | Nội dung hiện tại trên web | Căn cứ chính |
| --- | --- | --- |
| HDSD quy trình nhập hàng.docx | Nhập từng đợt tại “SL lấy đợt này”; còn lại trừ phân bổ của các đợt chưa hủy; lấy Hãng SX từ danh mục; Gửi Thủ kho kiểm tra lô, lượng và hạn dùng; tách gửi đề nghị khỏi nhập kho | AP_POInboundSelectViewDetail, AP_POInboundPartial_SyncStp, IV_InboundRequest_ChangeWorkflowStatusStp; cấu hình IV_InboundRequestFrm |
| HDSD quy trình điều chuyển nội bộ.docx | Nêu rõ nhánh không thiết bị dùng Gửi TP SA; chặn đồng bộ khi mã đề nghị trống; thay hướng dẫn nhập tay ActualReceiveQty bằng PNK thực nhận, nhận nhiều lần, hoàn tất khi đủ | IV_InternalTransfer_BatchSubmitStp và Execute, BatchSyncRequestsStp, BatchReceiveStp, IV_InternalTransferReceiptBalanceView |
| HDSD Quản lý vòng đời máy.docx | Tên menu hiện tại; biến động phải khóa mới tham gia trạng thái hiện hành; tách tình trạng Excel, hiệu lực ngày và vòng đời máy; dùng Machine 360 | FA_AssetCurrentLifecycleView, FA_AssetCurrentContractView, FA_AssetStatusDisplayView; FA_AssetListFrm, FA_Move2026Frm, FA_Repair2026Frm |
| HDSD Quản lý linh kiện bằng QR.docx | Phân biệt đăng ký thành công và tồn kho; kiểm tra kết quả yêu cầu đăng ký; quét đủ mã và hoàn tất chứng từ; thu hồi cần phiếu rã đã khóa và đúng máy nguồn | FA_PartRegistrationRequestProcessStp; FA_PartScanLinkInputStp, FA_PartScanLinkOutputStp, FA_PartScanRecoverInputStp |
| HDSD quy trình bán hàng.docx | Giữ NVKD → PM → SA → Kỹ thuật khi cần → Kế toán → Kho; thêm điều kiện người tạo Thu hồi để sửa; tách trạng thái gửi Kho khỏi tiến độ giao; làm rõ chứng từ xuất bán trước Gửi Thủ kho | Cấu hình 6 form AR_Order; AR_Order_SalesRecallFromPMStp; AR_OrderTbl_UpdateRefDoc |
| HDSD Quy Trình BPTM.docx | Tách mua hàng và theo dõi đợt; dùng đúng tên Nhập hạn thanh toán, Dự kiến nộp thuế, Xác nhận nộp thuế; Lưu khác Áp dụng; hạn NCC theo ngày chứng từ giao hàng + số ngày công nợ hoặc ngày thủ công có lý do | AP_PurchaseRequest_ApproveOrRejectStp, AP_PurchaseRequest_CreatePOStp; AP_BPTMUI_ApplyDueStp; AP_POShipment_SetDeliveryDueStp; AP_POShipmentBPTMAlertView |
| HDSD THEO DÕI VÀ PHÂN BỔ CHI PHÍ HÀNG NHẬP KHẨU.docx | Bổ sung chi phí riêng sau gửi; lấy vào dịch vụ khi đề nghị ở bước Kế toán; chống dùng lặp; chốt dịch vụ, lấy rồi phân bổ riêng; bỏ chỉ dẫn bỏ qua cảnh báo tổng tiền/thuế mặc định | AP_ServiceInboundCostCandidateView, AP_Service_ImportInboundCostStp, AP_Service_ValidateInboundCostStp, AP_ImportPurchase_PrePostStp và các view chi phí/thuế |

Chi tiết tham số, trạng thái và khóa liên kết nằm trong `content/technical/` tương ứng. Các nhãn nghiệp vụ dùng ở HDSD; số trạng thái/mã kỹ thuật chỉ dùng khi giải thích phần kỹ thuật.

## Quan sát giao diện và giới hạn

| Nội dung | Kết quả thực sự |
| --- | --- |
| Đợt điều chuyển nội bộ | Lần đầu báo Key not found dù DB có form. Sau người dùng mở lại ERP, form mở được; ba nút Gửi kỹ thuật, Gửi TP SA, Đồng bộ đề nghị hiển thị. Bản ghi đang hoàn tất nên nút bị khóa; không thử chuyển bước. |
| Phiếu đề nghị nhập hàng | Thấy nút Lấy từ đơn đặt hàng, Gửi Thủ kho, Hủy đợt nháp và các tab. Thanh trạng thái xuất hiện “Expecting object to be local”; chưa xác nhận tải chi tiết/bộ chọn PO chạy trọn vẹn trong phiên này. Nguyên nhân: UNKNOWN. |
| Danh mục tài sản | Đã mở tab Hợp đồng và hiệu lực, thấy ba trường tách biệt; menu Machine 360, lịch sử, QR và nguồn gốc linh kiện hiện diện. |
| Đơn bán hàng | Đã thấy Gửi PM và Thu hồi để sửa tại phiên Admin. Không bấm gửi/thu hồi. |
| Vai trò khác, gửi/duyệt, xuất/nhận kho, áp dụng BPTM, gửi thông báo | UNKNOWN về chấp nhận đầu cuối trong đợt chỉ đọc này. Không coi cấu hình/SQL là bằng chứng thao tác thực tế đã đạt. ERP có lúc chuyển Not Responding nên không mở tiếp mọi màn hình. |

Không sửa tài khoản, nhóm quyền, phạm vi chi nhánh, trạng thái hoặc chứng từ để phục vụ đối chiếu.

## Kiểm tra web

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 10 nhóm kiểm tra đạt: nội dung đủ nguồn, tìm kiếm, route, escape HTML/link, nội dung sinh sẵn, dữ liệu công khai, hash thư viện, tài nguyên, tham chiếu metadata, các điểm nghiệp vụ đã chỉnh |
| Sơ đồ | Đủ 9 sơ đồ được Mermaid vẽ thành SVG trên trình duyệt; không có lỗi/warning console tại lần kiểm tra |
| Tìm kiếm | “gui thu kho” ưu tiên bài nhập hàng; “BatchReceiveStp” trả về bài kỹ thuật điều chuyển; mở kết quả đúng khu vực |
| HDSD / TLKT | Giữ đúng mã bài khi chuyển khu vực, tab Form & SQL hiển thị các form/đối tượng của bài |
| Điện thoại 390×844 | Mở danh mục, chọn bài, tự đóng danh mục; nội dung không tràn ngang toàn trang, bảng có vùng cuộn riêng |
| Desktop 1366×900 | Header và sidebar cố định; nội dung theo bước, không có mục lục bên phải; không tràn ngang toàn trang |
| Sơ đồ tải xuống | Phóng to 125%, về vừa khung và tải SVG thành công |

Ảnh preview chỉ chứa nội dung minh họa đã loại thông tin khách hàng. Chưa triển khai vào tên miền của ERP; chưa xác nhận URL/HTTPS/cache trên máy chủ đích.

## Quy tắc cập nhật tiếp

Khi DB hoặc ERP đổi, đối chiếu module/form liên quan, cập nhật bài nguồn và sơ đồ cùng lượt. Đổi hash định nghĩa là dấu hiệu cần rà lại, không tự chứng minh nghiệp vụ đã đổi. Giữ các trạng thái UNKNOWN cho đến khi có quan sát hoặc kiểm thử đúng phạm vi, không nâng thành PASS bằng suy luận.
