# BOARD — P2 (thống nhất màn hình, bộ công cụ, form; mobile-first)

Thiết kế: `docs/architecture/APP_SCREEN_UNIFICATION_P2.md`. Nhánh tích hợp: `p2/main` (từ `main` `cb85348`). Thư mục: `D:/Projects/medcom-wt/P2-xx`. Log: `.agent-runs/P2-xx-*.log`.

| Phiếu | Nội dung | Agent | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| [P2-01](P2-01.md) | Thư viện `components/app/*` + sửa lỗi tab PR | Codex | **Done** (PR #176) | — |
| [P2-02](P2-02.md) | Tab Đơn hàng/PR/Nhập kho, trang chủ, cài đặt, scanner; bỏ chức năng giả | Codex | **Done** (p2/main) | P2-01 |
| [P2-03](P2-03.md) | Danh sách ERP 19 module | Codex | **Đang làm** | P2-01 |
| P2-04 | Form tạo/sửa → `FormSheet`/`FormField` | Codex | Todo | P2-03 |
| P2-05 | Khung điều hướng | Codex | Todo | P2-02 |
| P2-06 | Rà soát thị giác cuối, sửa lỗi | Leader + Codex | Todo | tất cả |

## Quy tắc phát hành (chủ dự án, 2026-10-24)

Một agent trên VPS kéo `main` và **deploy production định kỳ ở phút 00 và 30**. Vì vậy:
- Chỉ merge vào `main` phần đã review xong, đã kiểm tra giao diện thật (mobile + desktop) và CI xanh; mọi lần merge đi qua PR.
- Mỗi lần merge là một bước hoàn chỉnh, không để giao diện vỡ hay chức năng dở dang trên production.
- Ưu tiên merge sớm bản sửa tab "Đề nghị PR" (lỗi production) sau khi P2-01 đạt.
- Leader không chạy deploy, không đổi DB/schema/migration.

## Nhật ký

- 2026-10-24: Chủ dự án giao toàn quyền (gồm sửa BE và merge `main`, đi ngủ). Leader merge PR #175 (`cb85348`) sau khi kiểm tra merge không tự deploy (deploy workflow chỉ `workflow_dispatch`). Tạo `p2/main`.
- Phát hiện lỗi production có sẵn: tab "Đề nghị PR" hỏng do schema `workspace` FE lệch backend; đưa vào P2-01.
- Giao P2-01.
- P2-01 Đạt (22/22 test mới; contracts 833/820/13 trùng baseline; build pass; tab Đề nghị PR tải được 11 phiếu thật trên VPS). Merge vào `p2/main`, mở PR #176 vào `main` (repo không cho auto-merge, leader merge tay khi CI xanh). Giao P2-02 ∥ P2-03.
- P2-02 Đạt lần 1 (55/55 test liên quan; contracts 833/820/13 trùng baseline; lint baseline; build pass). Xóa QuickCreate, duyệt/từ chối giả, dữ liệu mẫu; nút tạo PO/PR mở form thật theo quyền. Merge vào `p2/main`.
- P2-03 Review lần 1: 3 lỗi lint mới (`react-hooks/immutability`); leader cho phép dời 3 khai báo lên trước handler.
