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

## Cập nhật riêng luồng copy nhiều lô — 23/10/2026

HDSD nhập hàng và sơ đồ đã bổ sung cách nhấp phải dòng → **Chèn dòng / Copy dòng này (nhân bản)** → chỉnh số lượng, lô, hạn dùng → **Lưu một lần**, áp dụng cả phiếu mới và phiếu đã lưu còn Nháp/Yêu cầu TM xem lại. TLKT cùng bài ghi các đối tượng lưu bộ chi tiết cuối cùng và tham số người dùng đúng của bộ xử lý trước lưu.

Căn cứ là lượt sửa ERP được chủ hệ thống yêu cầu trước lượt cập nhật tài liệu này: chủ hệ thống thực hiện copy hai dòng và chỉ sửa số lượng chi tiết rồi lưu thành công trên phiếu thử riêng. Đọc lại DB xác nhận ba dòng 80 + 1.600 + 2.000 = 3.680 và dòng khác 480; giữ khóa dòng PO, cùng một đợt phân bổ và mã phiên lưu đã áp dụng. Các ca kiểm thử DB xác nhận chặn vượt PO, tính cả đợt khác và hoàn tác khi lỗi. Đã xóa bộ dữ liệu thử riêng, giữ nguyên phân quyền và liên kết master/detail. Không suy rộng kết quả này sang các vai trò hoặc quy trình khác còn UNKNOWN trong bảng quan sát ngày 22/10.

Định nghĩa và kết quả đọc DB đầy đủ giữ ngoài repo; [content/evidence.json](content/evidence.json) chỉ bổ sung metadata, hash đối tượng và mô tả kiểm chứng đã loại dữ liệu giao dịch. Các mã lô trong HDSD là ví dụ minh họa.

## Tách giao diện theo nhóm người đọc — 23/10/2026

Theo yêu cầu chủ hệ thống, bỏ hai tab chuyển HDSD/TLKT trên header và thanh tóm tắt giai đoạn cuối bài. Hai đường dẫn vẫn hoạt động riêng, với dữ liệu tải và tìm kiếm riêng từng khu vực; HDSD không hiển thị lời mời mở TLKT, kết quả tìm kiếm hoặc liên kết chuyển sang TLKT. Logo và liên kết bài giữ nguyên khu vực đang đọc. Bố cục điện thoại bỏ phần chiều cao dành cho thanh tab cũ. Các tab nội dung Hướng dẫn/Luồng xử lý, Sơ đồ và Xử lý lỗi/Form & SQL vẫn phục vụ bài hiện tại.

Đây là thay đổi giao diện tài liệu, không thay đổi dữ liệu nghiệp vụ, phân quyền hoặc các bước trên ERP. Cấu trúc tải HDSD giữ tên `assets/content.generated.js` để tương thích script cập nhật IIS hiện có; TLKT dùng `assets/technical.generated.js` được đóng gói cùng thư mục assets.

## Luồng nhập hàng: Kỹ thuật trước PM — 23/10/2026

HDSD, TLKT và sơ đồ nhập hàng cập nhật theo bản sửa đã áp dụng: **TP SA → Kỹ thuật → PM → Kế toán** nếu có thiết bị; **TP SA → PM → Kế toán** nếu không có thiết bị. Phiếu hỗn hợp theo nhánh thiết bị. Thứ tự phần nhập hàng trong sơ đồ tổng quan cũng được sửa cho thống nhất; nội dung các quy trình khác giữ nguyên.

Các bài ghi đúng nút TP SA **Gửi Kỹ thuật / Gửi PM (không thiết bị)**, Kỹ thuật **Gửi PM / Trả TP SA**, PM **Gửi kế toán / Trả lại bước trước / Chọn gửi về**. Hướng dẫn trả lại phân biệt PM trả Kỹ thuật cho thiết bị và trả TP SA cho hàng khác, kèm các đích khi chọn bước. Phần copy nhiều lô, chỉnh số lượng và lưu một lần giữ nguyên.

Căn cứ là định nghĩa STP/helper đọc lại sau triển khai, cấu hình ba form và 56 kiểm tra DB/SQL: 31 kiểm tra hợp lệ, 20 kiểm tra chặn lỗi và 5 kiểm tra truy vấn trả lại. Sau chủ hệ thống mở lại ERP, đã đọc được đủ ba form với các nút mới. Chỉ kiểm tra hiển thị/control tree trên phiên Admin; không gửi, trả lại hoặc lưu chứng từ trong lần kiểm tra giao diện. Không nâng kết quả này thành chấp nhận đầu cuối trên các vai trò khác. Metadata công khai chỉ chứa tên, hash định nghĩa và phạm vi kiểm chứng, không chứa SQL body hoặc chứng từ.

TLKT giải thích giữ mã trạng thái cũ, tập đích trả lại tường minh, loại hàng TB, điều kiện Kỹ thuật gửi PM trước khi PM gửi Kế toán cho thiết bị, và cách xử lý phiếu cũ đang ở PM. Các quy trình khác và phân quyền không bị thay đổi bởi lượt cập nhật tài liệu này.

## Đề nghị mua hàng: giá tùy chọn, bỏ tỷ giá và xóa phiếu — 29/10/2026

Chỉ cập nhật bài Mua hàng ở HDSD/TLKT, sơ đồ và xử lý lỗi của bài. Người lập có thể để trống đơn giá khi chưa có báo giá; giá âm vẫn bị chặn. Phiếu đề nghị giữ loại tiền nhưng bỏ ô tỷ giá. PO giữ giá trống, lấy tỷ giá theo ngày từ danh mục tỷ giá; khi thiếu tỷ giá thì PO nháp dùng dấu chưa có tỷ giá và cần bổ sung trước xử lý tài chính. Không hướng dẫn lấy tỷ giá cố định hoặc coi tổng tiền thiếu giá là tổng hoàn chỉnh.

TLKT ghi rõ `AP_PurchaseRequest_OptionalPriceValidationFnc`, `CF_Currency_GetRateOnDateFnc`, `CF_Document_ExchangeRateValidationFnc` và `AP_PurchaseRequest_DeleteDraftTrg`, cùng các khóa và điều kiện giao dịch. Trigger xóa detail trước master trong giao dịch DELETE, chỉ cho phiếu Nháp chưa khóa/chưa có PO; giữ khóa ngoại NO_ACTION. Luồng duyệt, từ chối và phân quyền hiện hữu giữ nguyên.

Căn cứ là bản sửa đã triển khai và kết quả đọc lại ngày 29/10: 23 ca hợp lệ + 6 ca chặn lỗi cho giá/tỷ giá; 13 ca trước triển khai cho xóa (có hoàn tác khi lỗi chi tiết), 12 ca hợp lệ/chặn lỗi sau triển khai và thử hoàn tác bản sửa. Phiên Admin đã lưu một phiếu minh họa với USD, đơn giá trống và không có ô tỷ giá, chọn lại để xác nhận dữ liệu; sau xác nhận của chủ hệ thống, xóa thành công chính phiếu đó từ ERP. Đối chiếu DB xác nhận không còn master/detail thử, không có dòng mồ côi, các phiếu khác và quyền giữ nguyên.

Chỉ công khai tên/hash đối tượng và mô tả kiểm chứng đã loại dữ liệu giao dịch trong `content/evidence.json`. Không đưa SQL body, ảnh chứng từ, mã phiếu thử hay thông tin kết nối vào repo. Không nâng kết quả Admin này thành kiểm chứng gửi/duyệt/chốt tài chính trên mọi vai trò. Nội dung các quy trình khác không đổi; lượt cập nhật tài liệu không sửa DB hoặc triển khai IIS.

## Quy tắc cập nhật tiếp

Khi DB hoặc ERP đổi, đối chiếu module/form liên quan, cập nhật bài nguồn và sơ đồ cùng lượt. Đổi hash định nghĩa là dấu hiệu cần rà lại, không tự chứng minh nghiệp vụ đã đổi. Giữ các trạng thái UNKNOWN cho đến khi có quan sát hoặc kiểm thử đúng phạm vi, không nâng thành PASS bằng suy luận.
