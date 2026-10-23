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

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
export type StatusBadgeStyle = Record<"--status-fg" | "--status-bg" | "--status-dark-fg" | "--status-dark-bg", string>;

// Presentation only: never changes status IDs, filter groups or workflow rules.
export function statusBadgeTone(label: string, fallback?: StatusTone): StatusTone | undefined {
  if (/từ chối|không duyệt|hủy|huỷ|trả về/i.test(label)) return "danger";
  if (/chờ|đang|chưa/i.test(label)) return "warning";
  if (/hoàn tất|hoàn thành|đã duyệt|đã nhập|đã khóa/i.test(label)) return "success";
  if (/nháp|dự thảo|mới lập/i.test(label)) return "neutral";
  return fallback;
}

const badgePairs: Record<StatusTone, readonly [string, string, string, string]> = {
  neutral: ["#404040", "#F5F5F5", "#E5E5E5", "#262626"],
  success: ["#166534", "#F0FDF4", "#BBF7D0", "#052E16"],
  warning: ["#92400E", "#FFFBEB", "#FDE68A", "#451A03"],
  danger: ["#991B1B", "#FEF2F2", "#FECACA", "#450A0A"],
  info: ["#0C224F", "#EDF1F9", "#B2C4E6", "#0A1E46"],
};

function blend(left: Rgb, right: Rgb, weight: number): Rgb {
  const channel = (index: number) => Math.round(left[index] * (1 - weight) + right[index] * weight);
  return [channel(0), channel(1), channel(2)];
}
function hex(rgb: Rgb): string {
  return "#" + rgb.map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Shared web badge tones. Unknown ERP hues are tinted rather than painted neon.
 * Both themes supply their own complete, opaque pair (including foreground-only
 * ERP configurations), so contrast does not depend on the surrounding surface. */
export function statusBadgeStyle(foreColor: unknown, backColor: unknown, tone?: StatusTone): StatusBadgeStyle {
  const hue = parseColor(backColor) ?? parseColor(foreColor);
  let pair = badgePairs[tone ?? "neutral"];
  if (!tone && hue) {
    const lightBack = blend(WHITE, hue.rgb, 0.08);
    const lightFore = blend(BLACK, hue.rgb, 0.35);
    const darkBack = blend([23, 23, 23], hue.rgb, 0.18);
    const darkFore = blend(WHITE, hue.rgb, 0.28);
    pair = [
      contrastRatio(lightFore, lightBack) >= MIN_TEXT_CONTRAST ? hex(lightFore) : readableText(lightBack), hex(lightBack),
      contrastRatio(darkFore, darkBack) >= MIN_TEXT_CONTRAST ? hex(darkFore) : readableText(darkBack), hex(darkBack),
    ];
  }
  return { "--status-fg": pair[0], "--status-bg": pair[1], "--status-dark-fg": pair[2], "--status-dark-bg": pair[3] };
}
