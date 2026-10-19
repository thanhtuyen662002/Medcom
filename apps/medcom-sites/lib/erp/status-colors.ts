// Bàn giao BE 19/10/2026: danh sách/chi tiết/thông báo có mã trạng thái được bổ sung
// statusForeColor/statusBackColor (mã CSS #RRGGBB, đã bỏ kênh alpha) hoặc null.
// FE dùng màu chữ/nền này cho badge trạng thái; thiếu màu thì giữ màu mặc định của giao diện.
//
// Màu của ERP là màu cấu hình kiểu Windows: nhiều cặp chữ/nền chỉ đủ tương phản trên
// nền sáng của ERP và gần như tàng hình trên web (ví dụ chữ vàng trên nền vàng), lại
// càng khó đọc ở theme tối. Vì vậy badge luôn giữ màu nền của BE nhưng tự chọn lại
// màu chữ khi cặp màu của BE không đủ tương phản.
export interface StatusColorStyle {
  color?: string;
  backgroundColor?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Ngưỡng WCAG AA cho chữ nhỏ; dưới ngưỡng này chữ trên badge khó đọc. */
const MIN_TEXT_CONTRAST = 4.5;

type Rgb = readonly [number, number, number];
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

interface ParsedColor {
  css: string;
  rgb: Rgb;
}

function parseColor(value: unknown): ParsedColor | null {
  if (typeof value !== "string") return null;
  const css = value.trim();
  if (!HEX_COLOR.test(css)) return null;
  return { css, rgb: [Number.parseInt(css.slice(1, 3), 16), Number.parseInt(css.slice(3, 5), 16), Number.parseInt(css.slice(5, 7), 16)] };
}

function channelLuminance(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Màu chữ đọc rõ nhất trên nền đã cho, dùng khi màu chữ của BE không đủ tương phản. */
function readableText(background: Rgb): string {
  return contrastRatio(WHITE, background) > contrastRatio(BLACK, background) ? "#FFFFFF" : "#000000";
}

/**
 * Ghép cặp màu chữ/nền cho badge.
 * - Không có màu nền: giữ màu chữ của BE (nền do giao diện quyết định).
 * - Có màu nền: giữ màu chữ của BE khi đạt `MIN_TEXT_CONTRAST`; nếu không đạt hoặc BE
 *   không trả màu chữ thì chọn đen/trắng theo độ sáng của nền.
 * - Cả hai đều thiếu hoặc sai định dạng: trả undefined để giao diện dùng màu mặc định.
 */
export function statusColorStyle(foreColor: unknown, backColor: unknown): StatusColorStyle | undefined {
  const fore = parseColor(foreColor);
  const back = parseColor(backColor);
  if (!back) return fore ? { color: fore.css } : undefined;
  const color = fore && contrastRatio(fore.rgb, back.rgb) >= MIN_TEXT_CONTRAST ? fore.css : readableText(back.rgb);
  return { color, backgroundColor: back.css };
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
