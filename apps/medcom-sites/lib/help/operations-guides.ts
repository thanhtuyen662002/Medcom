import type { HelpGuide, HelpSection } from "./guides";

// Text guides for the warehouse, transfer, QR and equipment screens. Each one follows the actions and
// fields the Web actually offers on that screen (workflow catalog buttons, detail edit rules).

const actionMenu = "Trong chi tiết phiếu, bấm Thêm (nút Thao tác chứng từ ở góc dưới) để mở danh sách thao tác. Thao tác nào không dùng được sẽ ghi lý do ngay dưới tên nút.";

function openSection(group: string, menu: string, extra: string[] = []): HelpSection {
  return {
    id: "mo-man-hinh", title: "Mở màn hình và tìm phiếu",
    intro: `Trong menu ứng dụng, ở nhóm ${group}, chọn ${menu}.`,
    steps: [
      "Kiểm tra chi nhánh đang làm việc ở đầu màn hình. Danh sách và quyền thao tác theo chi nhánh được cấp.",
      "Nhãn Chờ tôi xử lý cho các phiếu đang ở bước của bạn; chọn Tất cả hoặc một nhãn trạng thái để xem các phiếu khác.",
      "Muốn tìm một phiếu, nhập mã chứng từ hoặc mã / tên nhà cung cấp, khách hàng (đối tượng) vào ô tìm kiếm rồi bấm Enter.",
      "Chọn mã chứng từ để mở chi tiết. Đọc mã, trạng thái và chi nhánh ở đầu cửa sổ trước khi thao tác.",
      ...extra,
    ],
  };
}

function reasonSection(id: string, title: string, steps: string[], warning?: string): HelpSection {
  return { id, title, intro: actionMenu, steps, ...(warning ? { warning } : {}) };
}

const confirmStep = "Hộp xác nhận hiện mã phiếu và tên thao tác. Nhập Ghi chú nếu cần rồi bấm Xác nhận; chờ phiếu đổi trạng thái trước khi thao tác tiếp.";
const reasonStep = "Thao tác trả về / từ chối bắt buộc nhập lý do: ghi rõ nội dung cần bổ sung để bước trước xử lý, rồi bấm Xác nhận.";
const editStep = "Muốn sửa số liệu của bước mình: mở Thêm, chọn Sửa thông tin, nhập các ô được phép sửa rồi bấm Lưu thay đổi. Hủy sửa nằm trong Thêm; đóng cửa sổ khi đang sửa sẽ bỏ nội dung chưa lưu.";
const deleteStep = "Xóa chứng từ chỉ dùng cho phiếu còn ở trạng thái cho phép xóa. Nhãn đổi thành Bấm lần nữa để xóa; chỉ bấm lần hai khi chắc chắn đúng phiếu.";
const photoStep = "Phần Ảnh hàng về có các nhóm ảnh (hư hỏng, trước / sau khi dỡ hàng). Bấm Chọn ảnh (lấy từ thư viện) hoặc Chụp ảnh (mở camera điện thoại) để thêm; Làm mới ảnh để tải lại danh sách. Chỉ thêm được ảnh khi phiếu đang ở bước của bạn và chưa khóa (Nháp, Thủ kho, Kỹ thuật, PM); ở bước khác ảnh chỉ để xem.";

const inboundFlow = "Luồng đề nghị nhập hàng: Nháp → Thủ kho xác nhận hàng về → TP SA kiểm soát → Kỹ thuật (nếu có thiết bị) → PM xác nhận chất lượng → Kế toán. Phương án hàng hóa đặc biệt đi qua BLĐ phê duyệt.";

export const warehouseGuides: HelpGuide[] = [
  {
    id: "inbound-requests", title: "Đề nghị nhập hàng", available: true, minutes: 6,
    audience: "Nhân sự thương mại / mua hàng", keywords: ["nhập kho", "đề nghị nhập", "DN", "gửi thủ kho", "gửi BLĐ", "lô", "hạn dùng"],
    description: "Tạo đề nghị nhập hàng cho một đợt hàng về, rồi gửi Thủ kho hoặc gửi BLĐ phê duyệt phương án.",
    summary: ["Tạo đề nghị với số đơn hàng, hóa đơn và mặt hàng", "Nhập lô, hạn dùng trước khi gửi", "Gửi Thủ kho hoặc Gửi BLĐ"],
    sections: [
      openSection("Quản lý kho", "Đề nghị nhập hàng", [inboundFlow]),
      {
        id: "tao-phieu", title: "Tạo đề nghị nhập hàng", intro: "Bấm Tạo mới (nút + ở góc dưới trên điện thoại).",
        fields: [
          { name: "Ngày lập chứng từ *", detail: "Mặc định là hôm nay; số chứng từ được hệ thống cấp khi tạo." },
          { name: "Số đơn hàng * · Số hóa đơn *", detail: "Số PO / đơn đặt hàng và số hóa đơn của lô hàng." },
          { name: "Nhà cung cấp", detail: "Chọn từ danh mục; có thể tìm theo mã hoặc tên." },
          { name: "Loại đơn hàng * · Nơi đi * · Nơi đến *", detail: "Chọn loại đơn (ví dụ Hàng nhập nội địa), nhập nơi đi và chọn kho / điểm đến." },
          { name: "Mặt hàng * · Số lượng kiện/hộp *", detail: "Chọn mặt hàng từ danh mục và nhập số kiện. Mặt hàng mã TB… là thiết bị: phiếu có thiết bị sẽ qua bước Kỹ thuật." },
          { name: "Số lô · Hạn dùng", detail: "Có thể nhập ngay khi tạo. Phiếu phải có lô và hạn dùng trước khi Gửi Thủ kho hoặc Gửi BLĐ." },
        ],
        steps: ["Điền đủ các ô có dấu *; nếu thiếu, biểu mẫu báo trường cần nhập.", "Bấm Tạo chứng từ và chờ thông báo thành công; phiếu mới ở trạng thái Nháp."],
      },
      reasonSection("gui-phieu", "Gửi Thủ kho hoặc Gửi BLĐ", [
        "Gửi Thủ kho: chuyển phiếu sang Thủ kho xác nhận hàng về (trạng thái Đã gửi thủ kho).",
        "Gửi BLĐ: chuyển phiếu sang BLĐ phê duyệt phương án hàng (trạng thái Đã gửi BLĐ).",
        confirmStep,
        "Hủy đợt nháp chỉ dùng khi phiếu có đợt nhập từng phần; nếu không có, hệ thống báo Phiếu chưa có đợt nhập từng phần để hủy.",
        editStep, deleteStep,
      ], "Phiếu đã gửi đi không sửa được ở màn này nữa; muốn chỉnh, bước nhận phải trả phiếu về."),
      { id: "anh", title: "Ảnh hàng về", steps: [photoStep] },
    ],
    questions: [
      { question: "Vì sao không Gửi Thủ kho được?", answer: "Kiểm tra phiếu đã có Số lô và Hạn dùng chưa. Nếu vẫn bị chặn, đọc thông báo hệ thống hiện trong hộp xác nhận và gửi nội dung đó cho quản trị viên." },
      { question: "Khi nào chọn Gửi BLĐ?", answer: "Khi lô hàng cần BLĐ phê duyệt phương án xử lý. BLĐ phê duyệt thì phiếu sang Đã gửi kế toán; chọn Hủy/PA khác thì phiếu chuyển Hủy PA." },
    ],
  },
  {
    id: "warehouse-arrival-status", title: "Thủ kho xác nhận hàng về", available: true, minutes: 5,
    audience: "Thủ kho", keywords: ["thủ kho", "hàng về", "kiện", "lô thực tế", "gửi TP SA", "từ chối"],
    description: "Ghi nhận thực tế lô hàng về (kiện, hư hỏng, lô, số lượng) rồi gửi TP SA hoặc từ chối.",
    summary: ["Ghi số kiện, hư hỏng và thực tế từng dòng", "Gửi TP SA", "Từ chối có lý do"],
    sections: [
      openSection("Quản lý kho", "Thủ kho xác nhận hàng về"),
      {
        id: "ghi-thuc-te", title: "Ghi nhận thực tế hàng về", intro: "Mở Thêm → Sửa thông tin.",
        fields: [
          { name: "Kiện hàng", detail: "Tổng pallet, tổng thùng thực tế, số kiện thừa / thiếu / hỏng." },
          { name: "Thông tin hư hỏng", detail: "Hư hỏng bên ngoài kiện, tình trạng hư hỏng bên trong, vị trí phát hiện, mô tả, link ảnh và link biên bản (BBKC)." },
          { name: "Từng dòng hàng", detail: "Số lô, hạn dùng, số bộ và số thùng thực tế; kiểm tra xác suất và ghi chú kiểm tra." },
        ],
        steps: ["Đối chiếu với số theo chứng từ hiện ở cùng dòng.", "Bấm Lưu thay đổi và chờ thông báo; mở lại chi tiết để kiểm tra số đã lưu.", photoStep],
      },
      reasonSection("gui-tiep", "Gửi TP SA hoặc từ chối", [
        "Gửi TP SA: hộp xác nhận ghi Xác nhận Gửi TP SA; nhập ghi chú nếu cần rồi bấm nút xác nhận. Phiếu sang Đã gửi TP SA.",
        "Từ chối: trả phiếu về người lập. " + reasonStep,
      ]),
    ],
    questions: [{ question: "Đã lưu nhưng không thấy thông báo?", answer: "Mở lại chi tiết phiếu và kiểm tra các số đã lưu. Nếu số chưa đổi, thử lưu lại và gửi thông báo lỗi (nếu có) cho quản trị viên." }],
  },
  {
    id: "warehouse-goods-information", title: "TP SA kiểm soát hàng về", available: true, minutes: 5,
    audience: "Trưởng phòng SA", keywords: ["TP SA", "kiểm soát", "gửi kỹ thuật", "gửi PM", "không thiết bị", "chọn bước gửi về"],
    description: "Kiểm soát thông tin lô hàng, gửi Kỹ thuật (phiếu có thiết bị) hoặc gửi thẳng PM (phiếu không thiết bị).",
    summary: ["Gửi Kỹ thuật khi có thiết bị", "Gửi PM (không thiết bị) và chọn PM nhận", "Từ chối nhanh hoặc chọn bước gửi về"],
    sections: [
      openSection("Quản lý kho", "TP SA kiểm soát hàng về", ["Các phiếu Đã gửi TP SA và Yêu cầu TP SA xem lại nằm ở nhãn Chờ tôi xử lý."]),
      reasonSection("gui-tiep", "Gửi Kỹ thuật hoặc Gửi PM", [
        "Gửi Kỹ thuật: dùng cho phiếu có thiết bị. Phiếu không có thiết bị sẽ bị từ chối với thông báo Phiếu không có thiết bị. Vui lòng gửi trực tiếp PM.",
        "Gửi PM (không thiết bị): chọn PM nhận trong danh sách (bắt buộc), nhập ghi chú nếu cần rồi Xác nhận. Phiếu sang Đã gửi PM.",
        confirmStep,
      ]),
      reasonSection("tra-ve", "Từ chối nhanh hoặc Chọn bước gửi về", [
        "Từ chối nhanh: trả phiếu về bước trước. " + reasonStep,
        "Chọn bước gửi về: chọn đúng bước cần xem lại (ví dụ Yêu cầu thủ kho xem lại), nhập lý do rồi Xác nhận.",
      ]),
    ],
    questions: [{ question: "Không thấy tên PM trong danh sách?", answer: "Danh sách PM theo chi nhánh. Tài khoản PM phải được gán chi nhánh đang làm việc; báo quản trị viên nếu thiếu." }],
  },
  {
    id: "warehouse-goods-status", title: "Kỹ thuật xác nhận hàng về", available: true, minutes: 4,
    audience: "Kỹ thuật", keywords: ["kỹ thuật", "thiết bị", "gửi PM", "trả TP SA", "BBKC"],
    description: "Kiểm tra thiết bị trong lô hàng, ghi nhận kết quả rồi gửi PM hoặc trả TP SA.",
    summary: ["Ghi số kiện hỏng, link ảnh, link BBKC", "Gửi PM và chọn PM nhận", "Trả TP SA hoặc chọn bước gửi về"],
    sections: [
      openSection("Quản lý kho", "Kỹ thuật xác nhận hàng về"),
      { id: "ghi-ket-qua", title: "Ghi kết quả kiểm tra", intro: "Mở Thêm → Sửa thông tin.", steps: ["Nhập Số kiện hỏng, Link ảnh, Link BBKC và Ghi chú nếu có.", "Bấm Lưu thay đổi, mở lại chi tiết để kiểm tra.", photoStep] },
      reasonSection("gui-tiep", "Gửi PM, trả TP SA hoặc chọn bước gửi về", [
        "Gửi PM: chọn PM nhận (bắt buộc) rồi Xác nhận. Phiếu sang Đã gửi PM.",
        "Trả TP SA: trả phiếu về TP SA. " + reasonStep,
        "Chọn bước gửi về: chọn bước cần xem lại, nhập lý do rồi Xác nhận.",
      ]),
    ],
  },
  {
    id: "warehouse-quality-confirmation", title: "PM xác nhận chất lượng hàng về", available: true, minutes: 4,
    audience: "PM", keywords: ["PM", "chất lượng", "gửi kế toán", "trả lại", "chọn gửi về"],
    description: "Xác nhận chất lượng lô hàng rồi gửi kế toán, hoặc trả về bước trước.",
    summary: ["Ghi số kiện hỏng, link ảnh, ghi chú", "Gửi kế toán", "Trả lại bước trước hoặc chọn gửi về"],
    sections: [
      openSection("Quản lý kho", "PM xác nhận chất lượng hàng về", ["Chỉ PM được chọn ở bước trước mới thấy phiếu trong Chờ tôi xử lý."]),
      { id: "ghi-ket-qua", title: "Ghi nhận chất lượng", intro: "Mở Thêm → Sửa thông tin.", steps: ["Nhập Số kiện hỏng, Link ảnh và Ghi chú nếu có.", "Bấm Lưu thay đổi.", photoStep] },
      reasonSection("gui-tiep", "Gửi kế toán hoặc trả về", [
        "Gửi kế toán: " + confirmStep + " Phiếu sang Đã gửi kế toán và xuất hiện ở Chứng từ chi phí nhập hàng.",
        "Trả lại bước trước: " + reasonStep + " Phiếu sang Yêu cầu TP SA xem lại.",
        "Chọn gửi về: chọn bước cần xem lại (TM, Thủ kho, TP SA hoặc Kỹ thuật), nhập lý do rồi Xác nhận.",
      ]),
    ],
  },
  {
    id: "warehouse-goods-plan-approval", title: "BLĐ phê duyệt phương án hàng", available: true, minutes: 3,
    audience: "Ban lãnh đạo", keywords: ["BLĐ", "phê duyệt", "phương án", "hủy PA"],
    description: "Phê duyệt hoặc hủy phương án xử lý lô hàng được gửi từ đề nghị nhập hàng.",
    summary: ["Đọc thông tin lô hàng", "Phê duyệt", "Hủy/PA khác có lý do"],
    sections: [
      openSection("Quản lý kho", "BLĐ phê duyệt phương án hàng", ["Phiếu ở trạng thái Đã gửi BLĐ hiện ở nhãn Chờ tôi xử lý."]),
      reasonSection("quyet-dinh", "Phê duyệt hoặc Hủy/PA khác", [
        "Đọc thông tin chứng từ và các dòng hàng trước khi quyết định.",
        "Phê duyệt: " + confirmStep + " Phiếu sang Đã gửi kế toán.",
        "Hủy/PA khác: " + reasonStep + " Phiếu chuyển Hủy PA.",
      ]),
    ],
  },
  {
    id: "warehouse-cost-documents", title: "Chứng từ chi phí nhập hàng", available: true, minutes: 5,
    audience: "Kế toán / Thương mại", keywords: ["chi phí", "hóa đơn", "VAT", "phân bổ", "cước"],
    description: "Nhập các chứng từ chi phí (cước, phí…) của một đề nghị nhập hàng; thành tiền và thuế do hệ thống tính.",
    summary: ["Thêm chứng từ chi phí", "Chọn đối tượng, loại chi phí, thuế, tài khoản", "Sửa hoặc xóa dòng chi phí"],
    sections: [
      openSection("Quản lý kho", "Chứng từ chi phí nhập hàng"),
      {
        id: "them-chi-phi", title: "Thêm chứng từ chi phí", intro: "Trong chi tiết phiếu, ở phần Chứng từ chi phí bấm Sửa chi phí, rồi Thêm chứng từ chi phí.",
        fields: [
          { name: "Số hóa đơn · Ngày hóa đơn", detail: "Theo hóa đơn chi phí." },
          { name: "Nhà cung cấp dịch vụ · Đối tượng *", detail: "Chọn từ danh mục; Đối tượng là bắt buộc." },
          { name: "Nội dung · Loại chi phí · Cách phân bổ", detail: "Diễn giải và chọn loại chi phí, cách phân bổ." },
          { name: "Loại tiền · Tỷ giá · Số tiền nguyên tệ", detail: "Chọn loại tiền (VND tỷ giá 1) và nhập số tiền." },
          { name: "Thuế GTGT · Tài khoản chi phí · Ghi chú", detail: "Chọn mã thuế và tài khoản chi phí." },
        ],
        steps: ["Bấm Lưu chi phí. Thành tiền, % thuế và tiền thuế do hệ thống tính lại khi lưu.", "Muốn sửa: bấm Sửa chi phí, đổi số liệu rồi Lưu chi phí.", "Muốn bỏ một dòng: trong chế độ sửa, bấm nút xóa của dòng đó rồi Lưu chi phí."],
        warning: "Nút xóa trong phần chi phí chỉ bỏ dòng chi phí đó, không xóa đề nghị nhập hàng.",
      },
    ],
  },
  {
    id: "warehouse-qr", title: "Quét QR xuất kho", available: true, minutes: 3,
    audience: "Thủ kho", keywords: ["QR", "quét", "tem", "xuất kho", "PXK", "camera"],
    description: "Quét hoặc nhập mã tem kiện để thêm / xóa mã QR trên phiếu xuất kho.",
    summary: ["Mở phiếu xuất đang mở", "Quét thêm hoặc quét xóa mã QR", "Nhập mã thủ công khi không dùng được camera"],
    sections: [
      openSection("Mã vạch & Quét QR", "Quét QR xuất kho", ["Chỉ phiếu Chưa khóa mới quét được; phiếu Đã khóa sẽ tắt nút quét và ghi lý do bên dưới."]),
      {
        id: "quet", title: "Quét thêm hoặc quét xóa mã QR", intro: "Trong chi tiết phiếu, ở phần Thao tác quét mã vạch / QR tem kiện.",
        steps: [
          "Bấm Quét thêm mã QR để thêm mã vào phiếu, hoặc Quét xóa mã QR để bỏ mã đã quét. Kiểm tra tên thao tác đang mở để tránh xóa nhầm.",
          "Cho phép camera và đặt tem trong khung. Nếu không dùng được camera, nhập mã vào ô Hoặc nhập mã thủ công rồi bấm Xác nhận.",
          "Mã tem có dạng ItemID;ItemCode;Lot hoặc mã kiện PKG…; mã sai định dạng sẽ báo Mã QR không đúng định dạng tem.",
          "Đợi thông báo kết quả, kiểm tra Danh sách mã QR rồi mới quét mã tiếp theo.",
        ],
      },
    ],
  },
];

const transferFlow = "Luồng điều chuyển: NVKD lập đề nghị → PM duyệt (xác nhận số lượng) → PM lập đợt điều chuyển → Kỹ thuật (đợt có thiết bị) → TP SA duyệt → Kế toán → Kho xuất → Kho nhận.";

export const transferGuides: HelpGuide[] = [
  {
    id: "internal-transfer-requests", title: "Đề nghị điều chuyển", available: true, minutes: 5,
    audience: "NVKD", keywords: ["điều chuyển", "DCNB", "chi nhánh nhận", "gửi PM", "thu hồi"],
    description: "Lập đề nghị điều chuyển hàng sang chi nhánh khác và gửi PM duyệt.",
    summary: ["Tạo đề nghị với chi nhánh nhận và mặt hàng", "Gửi PM và chọn PM nhận", "Thu hồi để sửa khi cần"],
    sections: [
      openSection("Điều chuyển nội bộ", "Đề nghị điều chuyển", [transferFlow]),
      {
        id: "tao-phieu", title: "Tạo đề nghị", intro: "Bấm Tạo mới.",
        fields: [
          { name: "Ngày lập chứng từ *", detail: "Mặc định hôm nay." },
          { name: "Chi nhánh nhận *", detail: "Phải khác chi nhánh đang làm việc (chi nhánh gửi)." },
          { name: "Mặt hàng * · Số lượng yêu cầu *", detail: "Chọn mặt hàng và nhập số lượng cần điều chuyển." },
        ],
        steps: ["Bấm Tạo chứng từ; phiếu mới ở trạng thái Nháp.", editStep, deleteStep],
      },
      reasonSection("gui-pm", "Gửi PM và thu hồi", [
        "Gửi PM: chọn PM nhận (bắt buộc) rồi Xác nhận. Phiếu sang Đã gửi PM.",
        "Thu hồi để sửa: lấy phiếu về khi PM chưa xử lý, sửa rồi gửi lại.",
        "Khi PM từ chối, phiếu sang PM yêu cầu NVKD chỉnh sửa: đọc lý do, sửa rồi Gửi PM lại.",
      ]),
    ],
  },
  {
    id: "internal-transfer-pm", title: "PM duyệt điều chuyển", available: true, minutes: 4,
    audience: "PM", keywords: ["PM", "duyệt điều chuyển", "số lượng PM duyệt", "đồng ý", "từ chối"],
    description: "Xác nhận số lượng từng dòng của đề nghị điều chuyển rồi đồng ý hoặc từ chối.",
    summary: ["Nhập Số lượng PM duyệt từng dòng", "Đồng ý điều chuyển", "Từ chối có lý do"],
    sections: [
      openSection("Điều chuyển nội bộ", "PM duyệt điều chuyển", ["Chỉ PM được NVKD chọn mới xử lý được phiếu."]),
      {
        id: "xac-nhan-so-luong", title: "Xác nhận số lượng từng dòng", intro: "Mở Thêm → Sửa thông tin.",
        steps: ["Ở mỗi dòng, nhập Số lượng PM duyệt (không âm, không vượt số NVKD đề nghị) và Ghi chú PM nếu cần.", "Bấm Lưu thay đổi và kiểm tra số đã lưu."],
        warning: "Phải lưu số lượng PM duyệt trước; nếu chưa, Đồng ý điều chuyển sẽ báo PM phải xác nhận số lượng từng dòng.",
      },
      reasonSection("quyet-dinh", "Đồng ý hoặc từ chối", [
        "Đồng ý điều chuyển: " + confirmStep + " Dòng có số lượng PM duyệt lớn hơn 0 sẽ được đưa vào đợt điều chuyển.",
        "Từ chối: " + reasonStep + " Phiếu sang PM yêu cầu NVKD chỉnh sửa.",
      ]),
    ],
  },
  {
    id: "internal-transfer-batches", title: "Đợt điều chuyển", available: true, minutes: 6,
    audience: "PM / Điều phối", keywords: ["đợt điều chuyển", "DCT", "đồng bộ đề nghị", "gửi kỹ thuật", "gửi TP SA", "vận chuyển"],
    description: "Gom các đề nghị đã PM duyệt thành một đợt, đồng bộ hàng hóa rồi gửi Kỹ thuật hoặc TP SA.",
    summary: ["Tạo đợt theo chi nhánh nhận", "Đồng bộ đề nghị", "Gửi kỹ thuật (có thiết bị) hoặc Gửi TP SA"],
    sections: [
      openSection("Điều chuyển nội bộ", "Đợt điều chuyển", [transferFlow, "Chỉ PM phụ trách đợt mới thao tác được; với người khác các nút ghi lý do không cho phép."]),
      {
        id: "tao-dot", title: "Tạo đợt điều chuyển", intro: "Bấm Tạo mới.",
        steps: [
          "Chọn Chi nhánh nhận (bắt buộc). Danh sách đề nghị chỉ hiện các đề nghị đã PM duyệt từ chi nhánh này sang chi nhánh nhận.",
          "Chọn một đề nghị, hoặc để trống để tạo đợt trống rồi dùng Đồng bộ đề nghị.",
          "Bấm Tạo chứng từ. Bấm Hủy sẽ xóa các lựa chọn trên biểu mẫu.",
        ],
      },
      reasonSection("dong-bo-gui", "Đồng bộ đề nghị và gửi đi", [
        "Đồng bộ đề nghị: kéo các dòng hàng của đề nghị trong đợt vào Hàng hóa trong đợt. Kiểm tra Số đề nghị, Số dòng hàng và Có thiết bị sau khi đồng bộ.",
        "Gửi kỹ thuật: dùng khi đợt có thiết bị. Gửi TP SA: dùng khi đợt không có thiết bị.",
        confirmStep,
        "Sửa thông tin cho phép sửa Ngày tạo đợt, Ngày chuyển dự kiến, Phương thức / Đơn vị / SĐT vận chuyển, Biển số xe và Ghi chú.",
      ], "Nếu hệ thống báo Phải chọn kho nguồn và kho đích khác nhau, đợt chưa có kho nguồn / kho đích hợp lệ; liên hệ quản trị viên để kiểm tra kho của đề nghị."),
    ],
  },
  {
    id: "internal-transfer-tech", title: "Kỹ thuật điều chuyển", available: true, minutes: 3,
    audience: "Kỹ thuật", keywords: ["kỹ thuật", "thiết bị", "điều chuyển", "BBKC"],
    description: "Kiểm tra thiết bị của đợt điều chuyển rồi gửi TP SA hoặc từ chối.",
    summary: ["Ghi tình trạng, ghi chú, link BBKC từng dòng", "Gửi TP SA", "Từ chối nhanh"],
    sections: [
      openSection("Điều chuyển nội bộ", "Kỹ thuật điều chuyển"),
      { id: "ghi-ket-qua", title: "Ghi kết quả kỹ thuật", intro: "Mở Thêm → Sửa thông tin.", steps: ["Ở mỗi dòng, nhập Tình trạng kỹ thuật, Ghi chú và Link BBKC.", "Bấm Lưu thay đổi."] },
      reasonSection("gui-tiep", "Gửi TP SA hoặc từ chối", ["Gửi TP SA: " + confirmStep, "Từ chối nhanh: " + reasonStep]),
    ],
  },
  {
    id: "internal-transfer-sa", title: "SA duyệt điều chuyển", available: true, minutes: 3,
    audience: "TP SA", keywords: ["SA", "duyệt điều chuyển", "số lượng duyệt", "gửi kế toán"],
    description: "Duyệt số lượng từng dòng của đợt điều chuyển rồi gửi Kế toán hoặc trả về.",
    summary: ["Nhập số lượng duyệt từng dòng", "Gửi Kế toán", "Từ chối nhanh hoặc chọn bước gửi về"],
    sections: [
      openSection("Điều chuyển nội bộ", "SA duyệt điều chuyển"),
      { id: "duyet-so-luong", title: "Duyệt số lượng", intro: "Mở Thêm → Sửa thông tin.", steps: ["Ở mỗi dòng, nhập Số lượng duyệt và ghi chú nếu cần.", "Bấm Lưu thay đổi."] },
      reasonSection("gui-tiep", "Gửi Kế toán hoặc trả về", ["Gửi Kế toán: " + confirmStep, "Từ chối nhanh: " + reasonStep, "Chọn bước gửi về: chọn bước cần xem lại, nhập lý do rồi Xác nhận."]),
    ],
  },
  {
    id: "internal-transfer-accounting", title: "Kế toán điều chuyển", available: true, minutes: 3,
    audience: "Kế toán", keywords: ["kế toán", "điều chuyển", "phiếu xuất", "lô", "hạn dùng"],
    description: "Lập phiếu xuất kho (PXK) từ đợt trên ERP, ghi lô / hạn dùng từng dòng rồi gửi Kho nguồn.",
    summary: ["Lập PXK từ đợt trên ERP", "Ghi lô, hạn dùng, ghi chú kế toán", "Gửi Kho nguồn"],
    sections: [
      openSection("Điều chuyển nội bộ", "Kế toán điều chuyển"),
      { id: "lap-pxk", title: "Lập phiếu xuất kho", steps: ["Lập và lưu phiếu xuất kho (PXK) từ đợt điều chuyển trên ERP. Web không lập PXK.", "Sau khi PXK được lưu, chi tiết đợt trên Web hiện PXK ở mục Phiếu xuất kho liên kết."],
        warning: "Chưa có PXK lưu từ đợt thì Gửi Kho nguồn sẽ báo Chưa có Phiếu xuất kho được lưu từ đợt điều chuyển này." },
      { id: "ghi-ke-toan", title: "Ghi thông tin kế toán", intro: "Mở Thêm → Sửa thông tin.", steps: ["Ở mỗi dòng, nhập Lô, Hạn dùng và Ghi chú kế toán.", "Bấm Lưu thay đổi."] },
      reasonSection("gui-tiep", "Gửi Kho nguồn hoặc trả về", ["Gửi Kho nguồn: " + confirmStep + " Đợt sang Đã liên kết PXK.", "Từ chối nhanh: " + reasonStep, "Chọn bước gửi về: chọn bước cần xem lại, nhập lý do rồi Xác nhận."]),
    ],
  },
  {
    id: "internal-transfer-warehouse-out", title: "Kho xuất điều chuyển", available: true, minutes: 3,
    audience: "Thủ kho chi nhánh gửi", keywords: ["kho xuất", "kho nguồn", "xuất điều chuyển", "vận chuyển"],
    description: "Ghi số lượng xuất thực tế, thông tin vận chuyển rồi xác nhận xuất sang Kho đích.",
    summary: ["Ghi vận chuyển và số lượng xuất thực tế", "Xác nhận xuất / Gửi Kho đích", "Từ chối hoặc chọn bước gửi về"],
    sections: [
      openSection("Điều chuyển nội bộ", "Kho xuất điều chuyển"),
      { id: "ghi-xuat", title: "Ghi thông tin xuất", intro: "Mở Thêm → Sửa thông tin.", steps: ["Nhập Phương thức vận chuyển, Đơn vị vận chuyển, Số điện thoại và Biển số xe.", "Ở mỗi dòng, nhập Số lượng xuất thực tế và Ghi chú thủ kho.", "Bấm Lưu thay đổi."],
        warning: "Phải lưu số lượng thực xuất từng dòng trước; nếu chưa, Xác nhận xuất sẽ báo Kho phải xác nhận số lượng thực xuất cho từng dòng." },
      reasonSection("gui-tiep", "Xác nhận xuất hoặc trả về", ["Xác nhận xuất / Gửi Kho đích: " + confirmStep, "Từ chối nhanh: " + reasonStep, "Chọn bước gửi về: chọn bước cần xem lại, nhập lý do rồi Xác nhận."]),
    ],
  },
  {
    id: "internal-transfer-warehouse-in", title: "Kho nhận điều chuyển", available: true, minutes: 3,
    audience: "Thủ kho chi nhánh nhận", keywords: ["kho nhận", "kho đích", "nhận điều chuyển"],
    description: "Lập phiếu nhập kho (PNK) nháp từ đợt trên ERP rồi xác nhận nhận hàng; số nhận lấy từ PNK.",
    summary: ["Lập PNK nháp từ đợt trên ERP", "Ghi chú nhận hàng", "Xác nhận nhận hàng"],
    sections: [
      openSection("Điều chuyển nội bộ", "Kho nhận điều chuyển", ["Danh sách theo chi nhánh nhận: chọn đúng chi nhánh nhận ở đầu màn hình."]),
      { id: "lap-pnk", title: "Lập phiếu nhập kho", steps: ["Lập PNK nháp từ đợt điều chuyển trên ERP và nhập số nhận trên PNK. Web không lập PNK và không sửa số nhận.", "Số lượng nhận thực tế trên Web được ERP tổng hợp từ PNK đã xác nhận."],
        warning: "Chưa có PNK nháp hợp lệ thì Xác nhận nhận hàng sẽ báo Chưa có PNK nháp hợp lệ chưa xác nhận của đợt này." },
      { id: "ghi-nhan", title: "Ghi chú nhận hàng", intro: "Mở Thêm → Sửa thông tin.", steps: ["Chọn Phiếu nhập kho liên kết nếu cần.", "Ở mỗi dòng, nhập Ghi chú nhận hàng.", "Bấm Lưu thay đổi."] },
      reasonSection("xac-nhan", "Xác nhận nhận hàng", ["Xác nhận nhận hàng: " + confirmStep]),
    ],
  },
];

export const equipmentGuides: HelpGuide[] = [
  {
    id: "machine-movements", title: "Bàn giao di chuyển máy", available: true, minutes: 5,
    audience: "Kỹ thuật / Điều phối thiết bị", keywords: ["máy", "bàn giao", "di chuyển", "MLI", "serial", "đối tượng nhận"],
    description: "Lập phiếu bàn giao / di chuyển máy và ghi thông tin bàn giao của từng máy.",
    summary: ["Tạo phiếu với loại di chuyển và máy", "Ghi đối tượng, kho, ngày bàn giao từng máy", "Sửa hoặc xóa phiếu"],
    sections: [
      openSection("Thiết bị & Bảo hành", "Bàn giao di chuyển máy"),
      {
        id: "tao-phieu", title: "Tạo phiếu bàn giao", intro: "Bấm Tạo mới.",
        steps: [
          "Chọn Loại di chuyển (bắt buộc).",
          "Chọn Thiết bị / máy: danh sách hiện tên máy, mã máy và dòng phụ gồm tên hàng · số serial · khách hàng đang giữ, để phân biệt các máy cùng loại.",
          "Nhập ghi chú nếu cần rồi bấm Tạo chứng từ.",
        ],
      },
      {
        id: "ghi-ban-giao", title: "Ghi thông tin bàn giao", intro: "Mở Thêm → Sửa thông tin.",
        steps: [
          "Phần đầu phiếu: Người giao, Người nhận, Hợp đồng, Hiệu lực từ / đến, Số / ngày tham chiếu, Nội dung, Ghi chú.",
          "Từng máy: Đối tượng / Kho nguồn, Đối tượng nhận / Kho đích (chọn từ danh mục), Ngày bàn giao, Vị trí nguồn / đích, Phụ kiện bàn giao, Tình trạng máy, Ghi chú dòng.",
          "Chọn Đối tượng nhận sẽ tự điền vị trí đích theo khách hàng đó.",
          "Bấm Lưu thay đổi.", deleteStep,
        ],
      },
    ],
  },
  {
    id: "machine-repairs", title: "Sửa chữa bảo hành máy", available: true, minutes: 5,
    audience: "Kỹ thuật", keywords: ["sửa chữa", "bảo hành", "bảo trì", "MLRP", "dịch vụ"],
    description: "Lập phiếu sửa chữa / bảo hành / bảo trì và ghi kết quả dịch vụ cho từng máy.",
    summary: ["Tạo phiếu với loại dịch vụ và máy", "Ghi kết quả dịch vụ từng máy", "Sửa hoặc xóa phiếu"],
    sections: [
      openSection("Thiết bị & Bảo hành", "Sửa chữa bảo hành máy"),
      {
        id: "tao-phieu", title: "Tạo phiếu sửa chữa", intro: "Bấm Tạo mới.",
        steps: ["Chọn Loại dịch vụ sửa chữa (Sửa chữa, Bảo hành, Bảo trì, Hiệu chuẩn…).", "Chọn Thiết bị / máy (tên máy, mã, serial, khách hàng).", "Nhập Ghi chú / Diễn giải rồi bấm Tạo chứng từ."],
      },
      {
        id: "ghi-ket-qua", title: "Ghi thông tin và kết quả dịch vụ", intro: "Mở Thêm → Sửa thông tin.",
        steps: [
          "Phần đầu phiếu: Đối tượng dịch vụ, Địa điểm, Người giao / nhận, Hợp đồng, Ngày bắt đầu / kết thúc, Kỹ thuật viên, Tình trạng dịch vụ, tham chiếu, Nội dung, Ghi chú.",
          "Từng máy: Nội dung dịch vụ, Số lượng, Mô tả sự cố, Biện pháp xử lý, Kết quả dịch vụ, Trong bảo hành (Có / Không), Ngày dịch vụ tiếp theo, Tiền công, Cảnh báo nội bộ, Ghi chú dòng.",
          "Bấm Lưu thay đổi.", deleteStep,
        ],
        tip: "Thành tiền của dòng do ERP xác định; Web không tự cộng Tiền công.",
      },
    ],
  },
];
