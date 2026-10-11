#!/usr/bin/env python3
"""Publish a purpose-only screen/API handoff from the finite registered boundary."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOGS = ["inventories/erp/20261010/six-screen-catalog.json", "inventories/erp/20261011/cud-workflow-catalog.json"]
api = json.loads((ROOT / "docs/backend/medcom-openapi.json").read_text(encoding="utf-8"))
screens = [screen for name in CATALOGS for screen in json.loads((ROOT / name).read_text(encoding="utf-8"))["screens"]]
base_buttons = {
    ("purchase-requests", "CommandButtonCtl"): "submit", ("purchase-requests", "CommandButtonCtl_1"): "send-purchase-order",
    ("sales-orders", "CommandButtonCtl"): "contract-info", ("sales-orders", "CommandButtonCtl_1"): "recall",
    ("sales-orders", "ExecSQLWithParaButtonCtl"): "send-pm", ("internal-transfer-requests", "CommandButtonCtl_1"): "recall",
    ("internal-transfer-requests", "ExecSQLWithParaButtonCtl"): "send-pm", ("sales-qr", "CommandButtonCtl_2"): "contract-info",
}
purposes = {
    "": ("Danh sách", "Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình."),
    "/screen": ("Chuẩn bị màn hình", "Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng."),
    "/detail": ("Mở phiếu", "Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang."),
    "/actions": ("Các nút trên phiếu", "Lấy nút được phép hiện và thao tác theo người dùng, chi nhánh và trạng thái hiện tại."),
    "/options": ("Danh sách chọn", "Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang."),
    "/create": ("Thêm", "Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu."),
    "/save": ("Lưu", "Ghi thay đổi của phiếu và các dòng chi tiết."),
    "/delete": ("Xóa", "Xóa phiếu khi người dùng và trạng thái cho phép."),
    "/contract-info": ("Xem thông tin hợp đồng", "Mở thông tin hợp đồng liên quan đến phiếu."),
    "/item-price": ("Chọn hàng", "Lấy giá mua áp dụng cho hàng được chọn."),
    "/commands/lookup": ("Kiểm tra kết quả thao tác", "Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng."),
    "/qr/add": ("Quét thêm mã QR", "Ghi mã QR quét vào phiếu đang mở."),
    "/qr/delete": ("Quét xóa mã QR", "Xóa mã QR quét khỏi phiếu đang mở."),
    "/sections/costs/save": ("Lưu chi phí", "Ghi các dòng chi phí của đề nghị nhập kho."),
    "/sections/assets/save": ("Lưu danh sách máy", "Ghi các máy đã chọn trên phiếu kỹ thuật điều chuyển."),
    "/selection": ("Chọn dữ liệu có sẵn", "API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy."),
    "/paste/validate": ("Dán dữ liệu", "API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy."),
}
shared = {
    "/api/auth/csrf": ("Đăng nhập và các thao tác", "Chuẩn bị bảo vệ phiên trước khi đăng nhập hoặc thao tác; không tạo nút hay nhãn trên giao diện."),
    "/api/auth/login": ("Đăng nhập", "Đăng nhập bằng tài khoản ERP."),
    "/api/auth/session": ("Thông tin người dùng", "Lấy người đang đăng nhập và quyền truy cập."),
    "/api/auth/session/continue": ("Duy trì phiên", "Tiếp tục phiên đang sử dụng."),
    "/api/auth/logout": ("Đăng xuất", "Kết thúc phiên người dùng."),
    "/api/workspace": ("Không gian làm việc", "Lấy chi nhánh và màn hình người dùng được truy cập."),
    "/api/lookups/branches": ("Chọn chi nhánh", "Lấy mã và tên chi nhánh được phép dùng, có tìm kiếm và phân trang."),
    "/api/notifications": ("Thông báo", "Lấy thông báo gửi riêng cho người đang đăng nhập, theo trang."),
    "/api/notifications/{id}": ("Thông báo", "Đọc nội dung một thông báo của người dùng."),
    "/api/notifications/{id}/target": ("Mở phiếu từ thông báo", "Lấy màn hình đích và mã phiếu để mở đúng chứng từ."),
    "/api/notifications/{id}/read": ("Đánh dấu đã xem", "Ghi nhận người dùng đã xem thông báo."),
    "/health/live": ("Hỗ trợ vận hành", "Kiểm tra BE còn hoạt động; không đưa lên giao diện nghiệp vụ."),
    "/health/ready": ("Hỗ trợ vận hành", "Kiểm tra điều kiện vận hành; không dùng để khóa các nút của người dùng."),
    "/api/platform/metadata": ("Hỗ trợ tích hợp", "Thông tin hệ thống dành cho đội triển khai; không dùng làm nội dung giao diện nghiệp vụ."),
    "/api/contracts/openapi.json": ("Hỗ trợ tích hợp", "Tài liệu cấu trúc dữ liệu dành cho lập trình viên; không hiển thị cho người dùng ERP."),
    "/api/documents/field-contract": ("Hỗ trợ tích hợp", "Mô tả dữ liệu chứng từ dành cho đội triển khai."),
    "/api/documents/query-contract": ("Hỗ trợ tích hợp", "Mô tả bộ lọc và phân trang dành cho đội triển khai."),
}
lines = ["# Bàn giao API BE cho FE — màn hình và thao tác", "",
    f"Danh mục đủ {sum(len(item) for item in api['paths'].values())} API hiện có, phục vụ 19 màn hình ERP. Cập nhật 11/10/2026. Địa chỉ BE: https://medcom-production.up.railway.app.", "",
    "## Quy định giao diện", "",
    "Tên màn hình và nút phải dùng nhãn nghiệp vụ trong các bảng dưới đây. Tên cột dùng nhãn nghiệp vụ đã được duyệt trên ERP. FE không tự đặt nhãn theo tên trường, đường dẫn API, tên bảng, mã lỗi hoặc thông tin kỹ thuật BE. Không đưa các từ như fields, stateToken, readScope, ReferenceState, schema hay tên thao tác nội bộ lên giao diện.", "",
    "Chỉ hiện nút mà BE cho phép hiện; chỉ cho bấm nút mà BE cho phép thao tác. Sau khi thêm/lưu/gửi/thu hồi, tải lại phiếu và các nút. Lỗi hiển thị bằng câu tiếng Việt theo thao tác đang làm; thông tin chẩn đoán giữ cho đội triển khai.", "",
    "Mỗi bản ghi đã trả đủ dữ liệu tại một vị trí, danh sách và chi tiết vẫn lấy theo trang. Hàng hóa đi kèm mã hàng, tên hàng, đơn vị; kho, chi nhánh và trạng thái đi kèm tên. Tiền và ngày có dữ liệu hiển thị phù hợp Việt Nam. Những mã thuộc các chứng từ khác nhau được giữ riêng.", "",
    "Lần bàn giao này không bổ sung In hoặc Import/copy. Các API chọn/dán đã tồn tại được ghi trong danh mục để nhận diện, không yêu cầu dựng thêm các nút đó.", "",
    "## API dùng chung", "", "| Dùng ở đâu / thao tác | API | Làm gì |", "|---|---|---|"]
covered = set()
def row(place, method, path, purpose):
    covered.add((method, path))
    lines.append(f"| {place.replace('|', '/')} | `{method.upper()} {path}` | {purpose} |")
for path, item in api["paths"].items():
    if path in shared:
        for method in item: row(shared[path][0], method, path, shared[path][1])
for screen in screens:
    module = screen["id"]
    buttons = {button.get("operation", base_buttons.get((module, button["control"]))): button["caption"]
               for button in screen["buttons"] if not button["control"].startswith("PrintButtonCtl")}
    lines += ["", "## " + screen["caption"], "", "| Thao tác / vị trí | API | Làm gì |", "|---|---|---|"]
    base = "/api/erp/" + module
    for path, item in api["paths"].items():
        if path != base and not path.startswith(base + "/"): continue
        suffix = path[len(base):]
        if suffix in purposes: place, purpose = purposes[suffix]
        elif suffix.startswith("/actions/"):
            action = suffix.split('/')[2]
            caption = buttons.get(action)
            if caption is None: raise ValueError("Unmapped business action: " + path)
            if suffix.endswith("/options"):
                place, purpose = "Lựa chọn khi " + caption, "Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi."
            else: place, purpose = caption, "Thực hiện nút “" + caption + "” trên phiếu đang mở, khi người dùng và trạng thái cho phép."
        else: raise ValueError("Unmapped operation: " + path)
        for method in item: row(place, method, path, purpose)
lines += ["", "## Các API đọc đã có ở nhóm chứng từ", "",
    "Màn hình mới dùng API trong từng mục ERP phía trên. Nhóm dưới đây phục vụ phần đọc đang tích hợp từ trước.", "",
    "| Dùng ở đâu / thao tác | API | Làm gì |", "|---|---|---|"]
old_writes = []
for path, item in api["paths"].items():
    for method, operation in item.items():
        if (method, path) in covered: continue
        if operation["x-medcom-admission"].startswith("default-provider-unavailable"):
            old_writes.append((method, path)); continue
        caption = "Đề nghị mua hàng" if "purchase-requests" in path else "Đơn đặt mua" if "purchase-orders" in path else "Đề nghị nhập kho"
        purpose = "Đọc chi tiết phiếu theo trang." if path.endswith("/detail") else "Lấy thông tin lựa chọn trước khi mở phiếu." if path.endswith("/workspace") else "Lấy danh sách chọn của phiếu." if path.endswith("/lookup") else "Đọc danh sách phiếu theo trang."
        row(caption, method, path, purpose)
lines += ["", "## Các API cũ đã được thay thế khi ghi phiếu", "",
    "Không nối nút thêm/lưu/gửi vào các API dưới đây. Dùng API ERP của đúng màn hình ở trên để ghi dữ liệu.", "",
    "| Dùng ở đâu | API cũ | API đang dùng |", "|---|---|---|"]
for method, path in old_writes:
    caption = "Đề nghị mua hàng" if "purchase-requests" in path else "Đề nghị nhập kho"
    current = "/api/erp/purchase-requests" if "purchase-requests" in path else "/api/erp/inbound-requests"
    row(caption, method, path, "Dùng nhóm `" + current + "` ở mục màn hình tương ứng.")
assert covered == {(method, path) for path, item in api["paths"].items() for method in item}
lines += ["", "## Tài liệu cho đội triển khai", "",
    "Cấu trúc dữ liệu được mô tả trong [OpenAPI](medcom-openapi.json). Quy tắc chuyển đổi dữ liệu trả về nằm trong [ghi chú nội bộ BE](API_RESPONSE_CONTRACT_V3_20261011.md); không lấy các thuật ngữ của tài liệu đó làm nhãn giao diện.", "",
    "Danh mục đối chiếu từ API đã build và hai catalog màn hình trong `inventories/erp/20261010/six-screen-catalog.json`, `inventories/erp/20261011/cud-workflow-catalog.json`. Tình trạng merge, triển khai và kiểm thử thực tế được ghi tại [I79](../execution/I79_API_RESPONSE_STANDARDIZATION_20261011.md). Việc FE đã chuyển cách đọc dữ liệu và nghiệm thu thao tác trên phiếu thật vẫn UNKNOWN cho đến khi đội FE/owner xác nhận.", ""]
(ROOT / "docs/backend/BE_FE_API_REFERENCE_20261011.md").write_text('\n'.join(lines), encoding="utf-8", newline="\n")
print(f"Generated {len(covered)} unique API purposes across {len(screens)} screens")
