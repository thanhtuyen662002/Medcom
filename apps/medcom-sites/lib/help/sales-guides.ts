import type { HelpGuide } from "./guides";

export const salesGuides: HelpGuide[] = [
  {
    id: "sales-orders", title: "Quản lý đơn hàng", available: true, minutes: 10, audience: "Nhân viên kinh doanh",
    description: "Lập đơn theo khách hàng/hợp đồng, quản lý hàng hóa, gửi PM và theo dõi kết quả xử lý.",
    keywords: ["bán hàng", "đơn hàng", "PM", "thu hồi", "hợp đồng"],
    summary: ["Tạo và kiểm tra đơn hàng", "Chỉnh sửa hàng hóa khi được phép", "Gửi PM, thu hồi và xem lịch sử"],
    sections: [
      { id: "danh-sach", title: "Tra cứu đơn hàng", steps: ["Mở nhóm Bán hàng → Quản lý đơn hàng; kiểm tra chi nhánh đang làm việc.", "Nhập thông tin tìm kiếm và bấm Enter. Desktop dùng bảng, điện thoại dùng thẻ chứng từ.", "Dùng Trước/Sau và Dòng/trang để xem các trang khác. Số lượng hiển thị phản ánh trang đang tải.", "Chọn mã chứng từ để mở đơn. Kiểm tra tên trạng thái và thông tin khóa ở đầu form."] },
      { id: "tao-don", title: "Lập đơn mới", steps: ["Bấm Tạo mới. Điện thoại có ba bước Thông tin → Chi tiết → Xem lại.", "Nhập ngày chứng từ, chọn khách hàng/hợp đồng và nhân viên. Chọn hợp đồng có thể điền khách hàng/nhân viên liên quan; kiểm tra lại thông tin đã điền.", "Chọn mã hàng theo hợp đồng, nhập số lượng, đơn giá, thuế và các nội dung cần thiết. Bấm Thêm dòng để thêm hàng.", "Đọc lại diễn giải và ghi chú đơn hàng. Số tiền hiển thị trong nháp là tạm tính; kết quả lưu là dữ liệu xác nhận.", "Bấm Xác nhận tạo đơn. Nếu có ảnh chờ tải, tiếp tục tải ảnh vào đơn đã tạo; không lập thêm đơn để thay cho lần tải ảnh chưa xong."], warning: "Nếu xuất hiện Kiểm tra / tiếp tục, dùng đúng nút đó để xác nhận lần tạo đang chờ trước khi tạo đơn khác." },
      { id: "sua-don", title: "Sửa thông tin và hàng hóa", steps: ["Mở đơn và bấm Sửa khi nút được bật. Chỉ sửa được theo quyền, người lập và trạng thái hiện tại.", "Hệ thống đọc đủ hàng hóa cùng phiên bản trước khi mở chế độ sửa. Nếu dữ liệu đã thay đổi, tải lại đơn.", "Thêm/sửa/xóa dòng hàng và nhập các thông tin cần cập nhật. Đổi khách hàng/hợp đồng sẽ xóa lựa chọn hàng không còn phù hợp; cần chọn lại trước khi lưu.", "Bấm Lưu thay đổi. Muốn bỏ nháp, bấm Hủy sửa."], tip: "Để tránh mất nội dung, form yêu cầu lưu hoặc Hủy sửa trước khi đóng một nháp đã thay đổi." },
      { id: "gui-pm", title: "Gửi PM và thu hồi", steps: ["Kiểm tra nội dung đơn, hàng hóa và lịch sử gửi/duyệt.", "Bấm Gửi PM, tìm người nhận; dùng phân trang nếu chưa thấy người cần chọn. Kiểm tra mục Đã chọn.", "Nhập ghi chú nếu cần và bấm Xác nhận. Danh sách nút/trạng thái sẽ được đọc lại sau khi hoàn tất.", "Nếu cần sửa một đơn đã gửi, dùng Thu hồi để sửa khi được phép. Thu hồi không đồng nghĩa được sửa mọi đơn hoặc mọi thời điểm."], warning: "Nút bị khóa hoặc không xuất hiện có thể do quyền, người nhận hoặc trạng thái. Không dùng màn hình khác để bỏ qua điều kiện này." },
      { id: "ket-qua", title: "Theo dõi và xử lý mất kết nối", steps: ["Tab Chi tiết hàng hóa cho xem bảng hoặc thẻ; bấm mở rộng để xem đầy đủ thông tin một dòng.", "Tab Lịch sử gửi / duyệt hiển thị người gửi, người nhận, thời gian, tên trạng thái và ghi chú. Bấm Tải thêm khi còn dữ liệu.", "Nếu chưa xác nhận được kết quả gửi/lưu, giữ đơn mở và bấm Kiểm tra kết quả.", "Nếu cần gửi lại, dùng Gửi lại cùng thao tác. Nút này giữ nguyên lần thao tác đang chờ; không tạo một lần ghi mới."], tip: "Thông tin hợp đồng và Làm mới nằm trong Thao tác khác. Xóa đơn hàng chỉ xuất hiện khi người dùng và đơn hàng được phép." },
    ],
  },
  {
    id: "sales-order-pm", title: "Xác nhận đơn hàng", available: true, minutes: 5, audience: "PM được phân công",
    description: "Kiểm tra đơn được giao, xác nhận gửi SA hoặc trả lại kèm lý do.", keywords: ["PM", "xác nhận", "gửi SA", "trả lại"],
    summary: ["Tra cứu đơn trong phạm vi được giao", "Xem hàng hóa và lịch sử", "Gửi SA hoặc trả lại"],
    sections: [
      { id: "mo-don", title: "Mở và kiểm tra đơn", steps: ["Trong Bán hàng, chọn PM xử lý đơn hàng (Xác nhận đơn hàng).", "Kiểm tra chi nhánh, tìm và mở đơn được giao.", "Đọc khách hàng/hợp đồng, người phụ trách, diễn giải, các dòng hàng và lịch sử. Tải thêm dữ liệu khi có nút tương ứng."], tip: "Đây là bước xác nhận; không sửa nội dung đơn thay cho người lập." },
      { id: "xac-nhan", title: "Gửi SA", steps: ["Bấm Gửi SA khi được bật.", "Nhập ghi chú nếu có, kiểm tra mã đơn và bấm Xác nhận.", "Chờ kết quả hoàn tất và kiểm tra lại trạng thái/lịch sử." ] },
      { id: "tra-lai", title: "Trả lại để bổ sung", steps: ["Bấm Trả lại.", "Nhập lý do cụ thể để nhân viên kinh doanh biết nội dung cần sửa.", "Bấm Xác nhận; kiểm tra kết quả trước khi xử lý đơn khác."], warning: "Nếu kết quả chưa rõ, dùng Kiểm tra kết quả hoặc Gửi lại cùng thao tác; không bấm gửi một thao tác mới." },
    ],
  },
  {
    id: "sales-order-sa", title: "Duyệt đơn hàng", available: true, minutes: 6, audience: "SA có quyền xử lý",
    description: "Rà soát đơn đã qua PM, chuyển Kế toán/Kỹ thuật hoặc gửi về bước xử lý trước.", keywords: ["SA", "duyệt", "kế toán", "kỹ thuật", "gửi về"],
    summary: ["Rà soát nội dung và lịch sử", "Chuyển đơn sang bộ phận phù hợp", "Trả lại đúng bước"],
    sections: [
      { id: "kiem-tra", title: "Rà soát đơn hàng", steps: ["Mở Bán hàng → SA xử lý đơn hàng (Duyệt đơn hàng).", "Tìm và mở đơn trong chi nhánh được cấp; xem thông tin khách hàng, hàng hóa và lịch sử PM.", "Các nút xử lý chỉ được mở theo trạng thái và quyền tại thời điểm xem."] },
      { id: "chuyen-tiep", title: "Chuyển Kế toán hoặc Kỹ thuật", steps: ["Chọn Gửi Kế toán hoặc Gửi Kỹ thuật theo bước cần xử lý và nút đang được mở.", "Nhập ghi chú, kiểm tra đúng đơn và bấm Xác nhận.", "Chờ thông báo kết quả và đọc lại trạng thái đơn."], tip: "Không cần tự nhập mã trạng thái. Hệ thống quyết định trạng thái sau thao tác." },
      { id: "gui-ve", title: "Gửi về bước trước hoặc trả lại", steps: ["Chọn Gửi về bước trước để chọn một bước từ danh sách được cấp. Dùng tìm kiếm/Trước/Sau nếu danh sách có nhiều trang.", "Kiểm tra bước đã chọn, nhập ghi chú và xác nhận.", "Trả lại yêu cầu nhập lý do rõ ràng. Kết quả chưa xác nhận phải được tra cứu lại trên chính đơn đang mở." ] },
    ],
  },
  {
    id: "sales-qr", title: "Xuất hàng theo PXK", available: true, minutes: 5, audience: "Nhân viên xuất hàng có quyền",
    description: "Mở chứng từ xuất bán đã có, quét thêm/xóa QR và đối chiếu hàng hóa.", keywords: ["xuất hàng", "PXK", "QR", "mã vạch"],
    summary: ["Chọn đúng chứng từ xuất", "Quét thêm hoặc xóa mã", "Đối chiếu kết quả"],
    sections: [
      { id: "chon-phieu", title: "Chọn chứng từ xuất", steps: ["Mở Bán hàng → Xuất hàng theo PXK.", "Kiểm tra chi nhánh và mã chứng từ trước khi mở chi tiết.", "Đọc thông tin phiếu, số lượng và bảng đối chiếu; bước quét thao tác trên chứng từ đã có."], warning: "Màn hình này không thay thế bước lập/duyệt PXK hoặc hóa đơn." },
      { id: "quet", title: "Quét thêm hoặc xóa QR", steps: ["Chọn nút quét thêm hoặc quét xóa theo thao tác cần thực hiện.", "Cho phép camera trên điện thoại; đặt mã trong khung quét. Có thể nhập mã thủ công nếu không dùng camera.", "Kiểm tra phản hồi sau mỗi lần quét và đối chiếu lại danh sách.", "Nếu mất kết nối hoặc chưa có kết quả, dừng quét mã khác, bấm Kiểm tra kết quả. Gửi lại cùng mã giữ nguyên lần thao tác đang chờ."], tip: "Phiếu khóa hoặc quyền không đủ sẽ không cho phép thêm/xóa QR." },
      { id: "doi-chieu", title: "Đối chiếu trước khi kết thúc", steps: ["Đọc lại danh sách mã đã quét và phần so sánh hàng hóa của phiếu.", "Nếu số lượng hoặc mã chưa khớp, kiểm tra đúng phiếu và đúng mã trước khi quét tiếp.", "Hoàn tất hoặc xác nhận kết quả lần quét đang chờ rồi mới đóng chứng từ." ] },
    ],
  },
];
