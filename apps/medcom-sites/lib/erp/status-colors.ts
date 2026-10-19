// Bàn giao BE 19/10/2026: danh sách/chi tiết/thông báo có mã trạng thái được bổ sung
// statusForeColor/statusBackColor (mã CSS #RRGGBB, đã bỏ kênh alpha) hoặc null.
// FE dùng màu chữ/nền này cho badge trạng thái; thiếu màu thì giữ màu mặc định của giao diện.
export interface StatusColorStyle {
  color?: string;
  backgroundColor?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function cssColor(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value.trim()) ? value.trim() : undefined;
}

/** Ghép cặp màu chữ/nền hợp lệ, trả undefined khi cả hai đều thiếu hoặc sai định dạng. */
export function statusColorStyle(foreColor: unknown, backColor: unknown): StatusColorStyle | undefined {
  const color = cssColor(foreColor);
  const backgroundColor = cssColor(backColor);
  if (!color && !backgroundColor) return undefined;
  return { ...(color ? { color } : {}), ...(backgroundColor ? { backgroundColor } : {}) };
}

/** Đọc màu từ một bản ghi (header/dòng chi tiết) theo tên trường BE cung cấp. */
export function statusColorsFrom(
  source: unknown,
  foreKey = "statusForeColor",
  backKey = "statusBackColor",
): StatusColorStyle | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  return statusColorStyle(record[foreKey], record[backKey]);
}
