export const MAX_QR_TEXT_LENGTH = 1024;
export const MAX_QR_TEXT_BYTES = 4096;
export const MAX_FRAME_SIDE = 960;

export type QrFrameResult = { kind: "none" } | { kind: "invalid" } | { kind: "found"; text: string };

// This is opaque input. A caller must validate its own field/lookup contract.
// In particular, a URL or markup string is never interpreted here.
export function validateQrText(value: string): string | null {
  if (!value.trim() || value.length > MAX_QR_TEXT_LENGTH
      || new TextEncoder().encode(value).length > MAX_QR_TEXT_BYTES
      || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export async function decodeQrFrame(data: Uint8ClampedArray, width: number, height: number): Promise<QrFrameResult> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > MAX_FRAME_SIDE || height > MAX_FRAME_SIDE || data.length !== width * height * 4) return { kind: "invalid" };
  // Loaded from the application's bundle only when scanning starts. No CDN,
  // native BarcodeDetector dependency, image upload or persistent frame buffer.
  const { default: jsQR } = await import("jsqr");
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (!result) return { kind: "none" };
  const text = validateQrText(result.data);
  return text === null ? { kind: "invalid" } : { kind: "found", text };
}
