# Phát hiện lệch cấu hình ERP so với Web

Web dựa vào cấu hình và mã SQL của ERP: nút/hook của 19 form (`SY_FrmCfg`), các thủ tục Web và nút ERP gọi, trigger trên các bảng Web ghi. Khi ERP đổi những thứ này, Web có thể hỏng âm thầm (10/2026: nút "Gửi đặt mua hàng" đổi sang `AP_PurchaseRequest_CreatePOStp`; trigger `INSTEAD OF INSERT` làm lỗi tạo đề nghị nhập). Bộ kiểm tra này báo các thay đổi đó.

## Cách chạy
- Backend (khi `Legacy:Enabled`) chạy `ErpConfigSnapshot.sql` (chỉ đọc) 20 giây sau khởi động và mỗi 6 giờ, so mã băm SHA-256 với bản mốc `inventories/erp/20261026/erp-config-baseline.json`.
- `/health/ready` → mục `erp_config`: `healthy` (khớp bản mốc), `drifted` (có thay đổi), `unavailable` (chưa kiểm hoặc đọc ERP lỗi).
- Chi tiết: `GET /api/platform/erp-config-drift` (đã đăng nhập): danh sách `changed` / `missing` / `added` / `removed` theo tên form|control, thủ tục, bảng|trigger — không có nội dung SQL. Tối đa 200 mục, thay đổi có thể làm hỏng lệnh Web xếp trước.
- Log cảnh báo `ErpConfigDrift` (EventId 1012).
- `unverifiable` > 0: tài khoản SQL của API không xem được định nghĩa của một số thủ tục/trigger; các mục đó không bị coi là thay đổi.

## Khi báo `drifted`
1. Mở danh sách thay đổi, đối chiếu từng mục với code Web (ví dụ thủ tục nút gọi, số dòng trigger tạo ra, nút mới).
2. Sửa Web nếu cần (theo `docs/audits/WORKFLOW_PARITY_20261025.md`).
3. Cập nhật bản mốc: chạy `src/backend/Medcom.Infrastructure/Erp/ErpConfigSnapshot.sql` chỉ-đọc trên MedData (`sqlcmd -s "|" -y 0 -o snapshot.txt`), rồi
   `python tools/backend/erp_config_baseline.py snapshot.txt YYYY-MM-DD`
   và trỏ `EmbeddedResource` trong `Medcom.Infrastructure.csproj` sang file mới.

## Bản mốc 26/10/2026
724 mục (24 form, gồm form Thủ kho, TP SA, Kỹ thuật, PM, BLĐ từ 26/10): 503 nút/hook, 128 control, 66 thủ tục/hàm (gồm các thủ tục chúng gọi trực tiếp), 27 trigger. Chụp sau khi sửa #200/#201; các nút ERP Web chưa có (xem báo cáo đối chiếu) đã nằm trong bản mốc nên không bị báo lại.
