export type HelpSection = {
  id: string;
  title: string;
  intro?: string;
  steps?: string[];
  fields?: { name: string; detail: string }[];
  image?: { src: string; alt: string; caption: string };
  tip?: string;
  warning?: string;
};

export type HelpGuide = {
  id: string;
  title: string;
  description: string;
  available: boolean;
  minutes?: number;
  audience?: string;
  summary?: string[];
  sections?: HelpSection[];
  questions?: { question: string; answer: string }[];
  keywords?: string[];
};

type HelpSubgroup = { id: string; title: string; guides: readonly string[] };
type HelpGroup = {
  id: string;
  title: string;
  icon: "shopping" | "package" | "transfer" | "wrench";
  guides: readonly string[];
  sections?: readonly HelpSubgroup[];
};

export const helpGroups: readonly HelpGroup[] = [
  { id: "purchasing", title: "Mua hàng", icon: "shopping", guides: ["purchase-requests", "purchase-approvals", "purchase-orders"] },
  { id: "sales", title: "Bán hàng", icon: "shopping", guides: ["sales-orders", "sales-order-pm", "sales-order-sa", "sales-goods-status", "sales-dispatch-invoices", "sales-qr"] },
  {
    id: "warehouse", title: "Quản lý kho", icon: "package",
    sections: [
      { id: "inbound", title: "Đề nghị nhập hàng", guides: ["inbound-requests", "warehouse-cost-documents", "warehouse-arrival-status", "warehouse-goods-information", "warehouse-quality-confirmation", "warehouse-goods-status", "warehouse-goods-plan-approval"] },
      { id: "transfers", title: "Đề nghị điều chuyển nội bộ", guides: ["internal-transfer-requests", "internal-transfer-pm", "internal-transfer-batches", "internal-transfer-tech", "internal-transfer-sa", "internal-transfer-accounting", "internal-transfer-warehouse-out", "internal-transfer-warehouse-in"] },
      { id: "qr", title: "Quét QR-Code", guides: ["warehouse-qr", "warehouse-sales-qr"] },
    ],
    guides: [],
  },
  { id: "equipment", title: "Tài sản", icon: "wrench", guides: ["machine-movements", "machine-repairs", "asset-component-registration"] },
];

export function groupGuideIds(group: HelpGroup) {
  return [...(group.sections ?? []).flatMap(section => section.guides), ...group.guides];
}

const image = (name: string, alt: string, caption: string) => ({ src: `/help/images/${name}.png`, alt, caption });

export const helpGuides: HelpGuide[] = [
  {
    id: "purchase-requests", title: "Đề nghị mua hàng", available: true, minutes: 8,
    audience: "Người lập đề nghị", keywords: ["PR", "tạo phiếu", "gửi duyệt", "bộ phận", "dòng hàng"],
    description: "Từ tạo phiếu, thêm hàng hóa đến gửi đề nghị và theo dõi kết quả — từng bước trên điện thoại.",
    summary: ["Tạo một đề nghị mới", "Nhập và kiểm tra dòng hàng", "Gửi đề nghị, theo dõi trạng thái"],
    sections: [
      { id: "mo-danh-sach", title: "Mở danh sách và tìm đề nghị", intro: "Trong ứng dụng, mở menu điều hướng. Ở nhóm Mua hàng & Nhập kho, chọn Đề nghị mua hàng (PR). Tên nhóm trong ứng dụng có thể viết tắt khác với mục lục này.",
        steps: ["Kiểm tra chi nhánh đang làm việc. Dữ liệu và quyền thao tác phụ thuộc chi nhánh được cấp.", "Muốn tìm một phiếu, nhập mã chứng từ, người lập hoặc đối tượng vào ô tìm kiếm rồi bấm Enter / phím tìm kiếm trên bàn phím điện thoại.", "Chọn một nhãn trạng thái: Tất cả, Mới lập, Chờ duyệt, Đã duyệt, Trả về hoặc Đã gửi ĐMH. Vuốt ngang hàng nhãn nếu chưa thấy hết.", "Chạm vào thẻ chứng từ để mở chi tiết. Dùng nút Làm mới danh sách khi cần đọc lại dữ liệu."],
        image: image("pr-list", "Danh sách đề nghị mua hàng trên điện thoại, khung đỏ số 1 tại Tạo mới, số 2 tại bộ lọc trạng thái, số 3 tại một phiếu minh họa.", "1 · Tạo mới   2 · Lọc trạng thái   3 · Mở chi tiết"),
        tip: "Các con số cạnh nhãn trạng thái phản ánh dữ liệu đang được tải; không dùng chúng như một báo cáo tổng số toàn hệ thống." },
      { id: "tao-thong-tin", title: "Tạo phiếu: nhập thông tin chung", intro: "Bấm Tạo mới. Trên điện thoại, biểu mẫu chia thành 3 bước: Thông tin → Dòng hàng → Xem lại. Máy tính hiển thị các phần trên cùng một biểu mẫu.",
        fields: [
          { name: "Mã đề xuất", detail: "Hệ thống tự cấp sau khi tạo; không cần tự nhập mã." },
          { name: "Ngày đề xuất · Chi nhánh", detail: "Kiểm tra ngày lập. Chi nhánh được lấy từ phạm vi đang làm việc." },
          { name: "Người đề nghị *", detail: "Mở danh sách và chọn người đề nghị. Có thể chọn nhiều mục rồi bấm Xong." },
          { name: "Bộ phận *", detail: "Chọn bộ phận tương ứng; trường này cũng hỗ trợ chọn nhiều." },
          { name: "Mục đích", detail: "Chọn từ danh sách nếu có. Bổ sung diễn giải ở Mục đích / Khách hàng và Ghi chú." },
          { name: "Khách hàng *", detail: "Chọn khách hàng / đối tượng có trong danh sách, không chỉ gõ tên rồi bỏ qua bước chọn." },
          { name: "Loại tiền * · Tỷ giá", detail: "Kiểm tra loại tiền. Tỷ giá lấy theo lựa chọn loại tiền và không sửa tay. Giá bán là trường bổ sung nếu nghiệp vụ cần." },
        ],
        steps: ["Chạm trường có mũi tên để mở danh sách lựa chọn; tìm và chọn đúng mục. Với trường chọn nhiều, đánh dấu các mục rồi bấm Xong.", "Cuộn xuống kiểm tra Khách hàng, Loại tiền và Tỷ giá. Dấu * đánh dấu các trường bắt buộc.", "Bấm Tiếp: Dòng hàng. Nếu biểu mẫu chưa chuyển bước, đọc thông báo đỏ cạnh trường còn thiếu và bổ sung."],
        image: image("pr-header", "Biểu mẫu tạo đề nghị: thông tin phiếu và các trường Người đề nghị, Bộ phận được khoanh đỏ.", "Điền thông tin phiếu; cuộn xuống để hoàn tất phần khách hàng và tiền tệ."),
      },
      { id: "them-dong-hang", title: "Thêm và kiểm tra dòng hàng", intro: "Mỗi thẻ trong bước Dòng hàng là một mặt hàng cần mua. Biểu mẫu bắt đầu với một dòng trống.",
        steps: ["Chạm Mã hàng và chọn hàng hóa từ danh sách. Kiểm tra tên hàng, đơn vị tính và thông tin bổ sung hiển thị bên dưới.", "Nhập Số lượng và Đơn giá. Có thể bổ sung Model, Ngân sách và Thời gian yêu cầu theo nhu cầu.", "Kiểm tra Tổng giá của dòng. Khi cần nhiều mặt hàng, bấm Thêm dòng rồi nhập lần lượt.", "Muốn bỏ một dòng, chạm biểu tượng X ở góc thẻ dòng hàng. Kiểm tra kỹ trước khi bỏ; biểu mẫu cần ít nhất một dòng hợp lệ.", "Bấm Xem lại & tạo. Dùng Quay lại nếu cần chỉnh phần thông tin chung."],
        image: image("pr-lines", "Bước dòng hàng của đề nghị mua với nút Thêm dòng và các trường Mã hàng, Số lượng, Đơn giá được đánh dấu.", "1 · Thêm dòng   2 · Chọn hàng   3 · Nhập số lượng và đơn giá"),
        tip: "Nhập số không có dấu phân cách hàng nghìn. Ví dụ: 150000; nếu cần phần thập phân, dùng dấu chấm, ví dụ 1.5." },
      { id: "xac-nhan-tao", title: "Xem lại và xác nhận tạo", steps: ["Đối chiếu chi nhánh, ngày đề xuất, người đề nghị, bộ phận và khách hàng.", "Kiểm tra mã hàng, số lượng, thành tiền từng dòng và Tổng thanh toán. Đây là thời điểm phù hợp để quay lại sửa sai.", "Bấm Xác nhận tạo phiếu một lần và chờ phản hồi. Trên máy tính, nút tương ứng là Xác nhận tạo chứng từ.", "Khi ứng dụng báo tạo thành công, quay về danh sách và kiểm tra phiếu vừa tạo. Ghi nhớ mã phiếu do hệ thống cấp."],
        image: image("pr-review", "Bước xem lại đề nghị mua hàng, tổng thanh toán và nút Xác nhận tạo phiếu được đánh dấu đỏ.", "Kiểm tra tổng hợp trước khi bấm Xác nhận tạo phiếu."),
        warning: "Tạo phiếu và gửi đề nghị là hai thao tác riêng. Chỉ coi dữ liệu đã được lưu khi ứng dụng có phản hồi thành công. Nếu lỗi mạng hoặc kết quả chưa rõ, kiểm tra danh sách trước khi tạo lại để tránh trùng phiếu." },
      { id: "gui-de-nghi", title: "Gửi đề nghị và chuyển đặt mua hàng", intro: "Mở phiếu đã lưu và bấm nút ba chấm (⋮) bên cạnh trạng thái. Menu chỉ hiện các thao tác mà tài khoản và trạng thái phiếu cho phép.",
        steps: ["Để đưa phiếu vào bước tiếp theo, chọn Gửi đề nghị.", "Trong hộp xác nhận, kiểm tra mã chứng từ, nhập Ghi chú / Diễn giải nếu cần, rồi bấm nút Xác nhận tương ứng.", "Chờ thông báo kết quả; sau đó đọc lại trạng thái trên chi tiết hoặc danh sách. Có thể dùng nhãn Chờ duyệt để tìm các phiếu ở trạng thái này.", "Nếu đã tới bước được phép chuyển đặt mua, mở menu ⋮ và chọn Gửi đặt mua hàng, rồi xác nhận theo hộp thoại. Thao tác này chỉ xuất hiện/khả dụng khi hệ thống cho phép."],
        image: image("pr-actions", "Chi tiết phiếu đề nghị với menu ba chấm đang mở, gồm Sửa thông tin, Gửi đề nghị và các hành động theo quyền.", "Mở menu ⋮ để tìm Gửi đề nghị và các thao tác của phiếu."),
        warning: "Nếu một thao tác bị mờ, đọc lý do trên giao diện. Không phải phiếu nào cũng sửa, xóa hoặc gửi tiếp được." },
      { id: "sua-va-theo-doi", title: "Sửa, xóa và theo dõi phiếu", steps: ["Tìm và mở phiếu. Kiểm tra mã, trạng thái, chi nhánh trước khi thao tác.", "Nếu được cấp quyền sửa: mở ⋮ → Sửa thông tin, chỉnh các trường cho phép rồi bấm Lưu thay đổi. Chờ thông báo kết quả và kiểm tra lại dữ liệu.", "Nếu được phép xóa: mở ⋮ → Xóa chứng từ. Nhãn đổi thành Bấm lần nữa để xóa; chỉ bấm lần thứ hai khi chắc chắn muốn xóa đúng phiếu.", "Theo dõi bằng các nhãn trạng thái. Khi có phiếu Trả về, mở chi tiết kiểm tra thông tin hiện có và xác nhận yêu cầu chỉnh sửa với người duyệt trước khi gửi lại."],
        warning: "Xóa dòng khi đang nhập và xóa chứng từ đã lưu là hai thao tác khác nhau. Không dùng xóa chứng từ để thay cho việc điều chỉnh một dòng hàng." },
    ],
    questions: [
      { question: "Vì sao không thấy hoặc không bấm được Tạo mới?", answer: "Tài khoản, chi nhánh hoặc điều kiện hiện tại có thể chưa cho phép tạo. Đọc lý do nếu giao diện hiển thị, kiểm tra lại chi nhánh; nếu vẫn bị chặn, gửi quản trị viên tên màn hình và nội dung thông báo." },
      { question: "Bấm Tiếp nhưng vẫn ở bước Thông tin?", answer: "Kiểm tra Người đề nghị, Bộ phận, Khách hàng và Loại tiền. Cần chọn một mục từ danh sách, không chỉ nhập chữ tìm kiếm. Cuộn biểu mẫu để xem các thông báo lỗi màu đỏ." },
      { question: "Đã bấm tạo nhưng mạng bị ngắt, có nên bấm lại?", answer: "Trước hết mở/làm mới danh sách và tìm theo thông tin vừa nhập để kiểm tra phiếu đã tồn tại chưa. Nếu kết quả còn chưa rõ, ghi lại thời điểm thao tác và liên hệ người hỗ trợ, tránh tạo thêm một phiếu giống nhau." },
    ],
  },
  {
    id: "purchase-approvals", title: "Duyệt đề nghị mua hàng", available: true, minutes: 5,
    audience: "Người được phân quyền duyệt", keywords: ["phê duyệt", "không duyệt", "từ chối", "lý do", "chờ duyệt"],
    description: "Tìm đề nghị đang chờ, kiểm tra nội dung và thực hiện Duyệt hoặc Không duyệt có lý do.",
    summary: ["Lọc phiếu chờ duyệt", "Kiểm tra thông tin và hàng hóa", "Duyệt hoặc không duyệt"],
    sections: [
      { id: "tim-phieu", title: "Mở danh sách chờ duyệt", intro: "Trong menu ứng dụng, chọn Mua hàng & Nhập kho → Duyệt đề nghị mua.", steps: ["Kiểm tra chi nhánh đang làm việc.", "Chọn nhãn Chờ duyệt. Các nhãn Tất cả, Đã duyệt và Không duyệt giúp tra cứu lại các nhóm phiếu tương ứng.", "Nếu cần một phiếu cụ thể, nhập thông tin vào ô tìm kiếm và bấm Enter / phím tìm kiếm trên điện thoại.", "Chạm thẻ chứng từ để mở chi tiết. Có thể bấm Làm mới danh sách để đọc dữ liệu mới nhất."],
        image: image("approval-list", "Danh sách duyệt đề nghị, nhãn Chờ duyệt và một phiếu minh họa được khoanh đỏ.", "1 · Lọc Chờ duyệt   2 · Mở phiếu cần kiểm tra"),
        tip: "Danh sách trống có thể do bộ lọc, chi nhánh hoặc phạm vi quyền. Thử Tất cả và Làm mới trước khi kết luận không có đề nghị." },
      { id: "kiem-tra", title: "Kiểm tra nội dung trước khi quyết định", steps: ["Đối chiếu mã đề nghị, ngày đề xuất, người đề nghị, bộ phận, khách hàng và mục đích mua.", "Cuộn tới phần hàng hóa, kiểm tra từng mã hàng, số lượng, đơn giá, ngân sách và thời gian yêu cầu nếu có.", "Nếu có nút tải thêm dòng, bấm để đọc tiếp; không chỉ kiểm tra các dòng đang thấy đầu tiên.", "Bấm nút ⋮ cạnh trạng thái để mở Thao tác chứng từ. Kiểm tra Duyệt và Không duyệt có được phép thực hiện không."],
        image: image("approval-menu", "Chi tiết đề nghị mua, menu ba chấm mở với hai lựa chọn Duyệt và Không duyệt được đánh dấu.", "Menu ⋮ chứa quyết định Duyệt / Không duyệt."),
        warning: "Kiểm tra đúng mã phiếu trước mỗi quyết định. Quyền xem phiếu không tự động đồng nghĩa với quyền duyệt phiếu." },
      { id: "duyet", title: "Duyệt một đề nghị", steps: ["Trong chi tiết phiếu, mở ⋮ → Duyệt.", "Đọc mã chứng từ trong hộp xác nhận. Bổ sung Ghi chú / Diễn giải nếu cần.", "Bấm nút Xác nhận Duyệt theo nhãn trên hộp thoại một lần, chờ hệ thống xử lý.", "Chỉ khi có thông báo thành công mới coi thao tác đã hoàn tất. Đọc lại trạng thái; về danh sách và dùng nhãn Đã duyệt để kiểm tra."],
        image: image("approval-confirm", "Hộp xác nhận duyệt với mã chứng từ, ô Ghi chú / Diễn giải và nút Xác nhận Duyệt được đánh dấu.", "Đối chiếu mã phiếu rồi mới xác nhận quyết định."),
      },
      { id: "khong-duyet", title: "Không duyệt và ghi lý do", steps: ["Trong chi tiết phiếu, mở ⋮ → Không duyệt.", "Nhập Lý do từ chối. Nêu rõ nội dung cần bổ sung hoặc điều chỉnh, ví dụ: “Đề nghị kiểm tra lại số lượng và bổ sung thời gian cần hàng.”", "Kiểm tra lại chứng từ, rồi bấm nút Xác nhận tương ứng. Nhãn nút lấy theo tên hành động mà hệ thống trả về.", "Đợi phản hồi thành công và đọc lại trạng thái. Dùng nhãn Không duyệt trong danh sách để tra cứu kết quả."],
        image: image("approval-reject", "Hộp xác nhận không duyệt với trường Lý do từ chối và nút xác nhận màu đỏ.", "Ghi lý do cụ thể để người lập biết cần điều chỉnh nội dung nào."),
        warning: "Không để trống lý do từ chối. Khi hệ thống báo dữ liệu đã thay đổi hoặc thao tác không còn khả dụng, tải lại phiếu và kiểm tra lại trước khi quyết định." },
      { id: "kiem-tra-ket-qua", title: "Kiểm tra kết quả và xử lý khi bị chặn", steps: ["Thông báo thành công là căn cứ xác nhận thao tác đã được ghi nhận; việc hộp thoại đóng không đủ để kết luận đã duyệt.", "Nếu nút bị khóa hoặc không xuất hiện, kiểm tra trạng thái phiếu và quyền tại chi nhánh. Đọc lý do nếu giao diện cung cấp.", "Nếu mất kết nối sau khi bấm xác nhận, làm mới và tra cứu lại phiếu trước khi thực hiện thêm lần nữa.", "Khi cần hỗ trợ, cung cấp mã phiếu, thời điểm và nội dung lỗi. Không gửi mật khẩu hoặc ảnh chứa thông tin không liên quan."],
      },
    ],
    questions: [
      { question: "Tôi thấy phiếu nhưng không thấy Duyệt?", answer: "Menu phụ thuộc quyền và trạng thái của từng phiếu. Kiểm tra đúng chi nhánh, tải lại chi tiết; nếu vẫn không có, nhờ quản trị viên kiểm tra quyền duyệt của tài khoản." },
      { question: "Có duyệt nhiều phiếu cùng lúc không?", answer: "Hướng dẫn hiện tại áp dụng cho từng chứng từ: mở phiếu → kiểm tra → quyết định → xác nhận. Chưa có thao tác duyệt hàng loạt được xác nhận trong giao diện đang hướng dẫn." },
    ],
  },
  {
    id: "purchase-orders", title: "Đặt mua hàng", available: true, minutes: 4,
    audience: "Nhân sự mua hàng", keywords: ["PO", "nhà cung cấp", "đơn đặt mua", "tra cứu"],
    description: "Tra cứu đơn đặt mua, đọc thông tin nhà cung cấp và kiểm tra các dòng hàng trên điện thoại.",
    summary: ["Tìm đơn đặt mua", "Kiểm tra nhà cung cấp và hàng hóa", "Hiểu trạng thái mở / khóa"],
    sections: [
      { id: "mo-dat-mua", title: "Mở màn hình Đặt mua hàng", intro: "Trong menu ứng dụng, chọn Mua hàng & Nhập kho → Đặt mua hàng. Tiêu đề trong vùng nội dung có thể là Đề nghị mua hàng (PO), tùy tên màn hình được hệ thống cung cấp.", steps: ["Kiểm tra chi nhánh đang làm việc trước khi tra cứu.", "Nhập mã chứng từ, người lập hoặc đối tượng vào ô tìm kiếm rồi bấm Enter / phím tìm kiếm trên điện thoại.", "Chọn Tất cả, Đang mở / Chưa khóa hoặc Đã khóa / Hoàn tất để thu hẹp danh sách đang tải. Vuốt ngang hàng nhãn trên màn hình nhỏ.", "Chạm thẻ đơn đặt mua để xem chi tiết."],
        image: image("po-list", "Danh sách Đặt mua hàng trên mobile, ô tìm kiếm, bộ lọc và đơn minh họa được đánh dấu đỏ.", "1 · Tìm kiếm   2 · Lọc mở / khóa   3 · Mở đơn đặt mua"),
        tip: "Bộ lọc mở / khóa áp dụng lên các bản ghi của trang đang tải. Kiểm tra thêm các trang tiếp theo nếu chưa tìm thấy đơn." },
      { id: "doc-chi-tiet", title: "Đọc thông tin đơn đặt mua", steps: ["Kiểm tra mã chứng từ và trạng thái ở đầu cửa sổ chi tiết.", "Đối chiếu nhà cung cấp / đối tượng, ngày chứng từ, ngày giao hàng và mã hợp đồng nếu có.", "Kiểm tra loại tiền, tỷ giá, nội dung và ghi chú của đơn theo các trường thực tế hiển thị.", "Cuộn xuống đọc từng dòng hàng: mã/tên hàng, số lượng, đơn giá và thông tin bổ sung. Nếu có nút tải thêm dòng, bấm để đọc hết.", "Bấm X ở đầu cửa sổ để đóng chi tiết và quay về danh sách."],
        image: image("po-detail", "Chi tiết đơn đặt mua với thông tin nhà cung cấp, các trường chứng từ và hàng hóa minh họa.", "Đọc thông tin đơn và cuộn xuống kiểm tra đầy đủ dòng hàng."),
        warning: "Nhãn Đã khóa / Hoàn tất đang dùng trạng thái khóa của chứng từ; không tự suy ra hàng đã giao đủ, đã nhập kho hoặc đã thanh toán." },
      { id: "lam-moi", title: "Làm mới và xem thêm dữ liệu", steps: ["Bấm X để đóng chi tiết trước khi tìm một đơn khác.", "Dùng Làm mới danh sách để lấy lại dữ liệu.", "Nếu có trang tiếp theo, dùng nút chuyển trang ở cuối danh sách; sau đó kiểm tra lại các nhãn lọc.", "Nếu danh sách trống, kiểm tra từ khóa, chọn Tất cả và kiểm tra chi nhánh. Khi có lỗi kết nối, đọc thông báo và thử tải lại."],
      },
    ],
    questions: [
      { question: "Vì sao không có nút Tạo mới, Sửa hoặc Xóa?", answer: "Giao diện Đặt mua hàng hiện ẩn các thao tác ghi này. Bạn có thể tìm và xem chi tiết đơn; phần tạo/sửa/xóa được để Feature cho đến khi được mở sử dụng." },
      { question: "Đã khóa có nghĩa là đã giao hàng xong chưa?", answer: "Không đủ căn cứ để kết luận. Nhãn hiện tại biểu diễn trạng thái khóa. Cần kiểm tra chứng từ và quy trình liên quan trước khi kết luận về giao hàng, nhập kho hay thanh toán." },
    ],
  },
  ...[
    ["inbound-requests", "Phiếu đề nghị nhập hàng"],
    ["warehouse-cost-documents", "Chứng từ chi phí"],
    ["warehouse-arrival-status", "Xác nhận tình trạng hàng về"],
    ["warehouse-goods-information", "Kiểm soát thông tin hàng hóa"],
    ["warehouse-quality-confirmation", "Kiểm soát và xác nhận chất lượng hàng hóa"],
    ["warehouse-goods-status", "Xác nhận tình trạng hàng hóa"],
    ["warehouse-goods-plan-approval", "Phê duyệt phương án hàng hóa"],
    ["sales-orders", "Quản lý đơn hàng"], ["sales-order-pm", "Xác nhận đơn hàng"], ["sales-order-sa", "Duyệt đơn hàng"],
    ["sales-goods-status", "Xác nhận tình trạng hàng hoá"], ["sales-dispatch-invoices", "Duyệt, PXK và hoá đơn"],
    ["sales-qr", "Xuất hàng theo PXK"], ["warehouse-qr", "Xuất kho"], ["warehouse-sales-qr", "Xuất bán hàng"],
    ["internal-transfer-requests", "Phiếu đề nghị điều chuyển nội bộ (Sales / NVKD)"], ["internal-transfer-pm", "Xác nhận đề nghị điều chuyển (PM)"],
    ["internal-transfer-batches", "Đợt điều chuyển nội bộ (PM / Điều phối)"], ["internal-transfer-tech", "Xác nhận thiết bị điều chuyển (Kỹ thuật)"],
    ["internal-transfer-sa", "Phê duyệt điều chuyển nội bộ (TP SA)"], ["internal-transfer-accounting", "Xử lý điều chuyển nội bộ (Kế toán)"],
    ["internal-transfer-warehouse-out", "Xác nhận xuất điều chuyển (Kho nguồn)"], ["internal-transfer-warehouse-in", "Xác nhận nhận điều chuyển (Kho đích)"],
    ["machine-movements", "Phiếu di chuyển / bàn giao máy"], ["machine-repairs", "Phiếu sửa chữa / bảo hành / bảo trì máy"],
    ["asset-component-registration", "Đăng ký QR / Serial linh kiện"],
  ].map(([id, title]): HelpGuide => ({ id, title, available: false, description: "Hướng dẫn sẽ được bổ sung khi giao diện chức năng sẵn sàng." })),
];

export const readyGuides = helpGuides.filter(guide => guide.available);
export const defaultGuideId = "purchase-requests";
export function findGuide(id: string) { return helpGuides.find(guide => guide.id === id); }
export function searchGuides(query: string) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return helpGuides.filter(guide => {
    const text = normalize([guide.title, guide.description, ...(guide.keywords ?? []), ...(guide.sections ?? []).flatMap(section => [section.title, section.intro ?? "", ...(section.steps ?? []), ...(section.fields ?? []).map(field => `${field.name} ${field.detail}`)])].join(" "));
    return terms.every(term => text.includes(term));
  });
}
