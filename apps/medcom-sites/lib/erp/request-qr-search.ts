/** RequestSearch and the document-search APIs count UTF-16 code units. */
export const MAX_REQUEST_QR_SEARCH_LENGTH = 100;
export type RequestQrSearchValidation =
  | { ok: true; text: string }
  | { ok: false; message: string };

/** Opaque text only: never trim, truncate, parse, case-fold or navigate.
 * Stricter than the general scanner: reject C1 controls and unpaired UTF-16
 * surrogates as well as C0/DEL. Whitespace is tested only for emptiness.
 */
export function validateRequestQrSearchText(value: unknown): RequestQrSearchValidation {
  if (typeof value !== "string") return { ok: false, message: "Mã không phải văn bản hợp lệ. Hãy quét lại hoặc nhập mã thủ công." };
  if (!value.trim()) return { ok: false, message: "Mã trống hoặc chỉ có khoảng trắng. Hãy nhập mã có nội dung." };
  if (value.length > MAX_REQUEST_QR_SEARCH_LENGTH) return { ok: false, message: "Mã vượt quá 100 ký tự tìm kiếm. Hãy quét mã ngắn hơn hoặc nhập mã tìm kiếm thủ công." };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return { ok: false, message: "Mã chứa ký tự điều khiển. Hãy quét lại hoặc nhập mã không có ký tự điều khiển." };
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return malformed();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return malformed();
  }
  return { ok: true, text: value };
}
function malformed(): RequestQrSearchValidation {
  return { ok: false, message: "Mã chứa văn bản Unicode không hợp lệ. Hãy quét lại hoặc nhập mã thủ công." };
}
