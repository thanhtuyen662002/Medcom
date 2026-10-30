// Phone cameras produce 3–12 MB photos; shrink them in the browser before upload so they stay well under the
// 10 MB attachment limit (and any reverse-proxy body limit) and upload quickly on mobile data.
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 2560;
const QUALITY = 0.85;

/** Returns a smaller JPEG for a large JPG/PNG photo, or the original file when it is small, unreadable or would not shrink. */
export async function compressImageFile(file: File): Promise<File> {
  const image = /^image\/(jpeg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (!image || file.size <= COMPRESS_ABOVE_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    // imageOrientation applies the camera's EXIF rotation so portrait photos stay upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return file; }
    // JPEG has no transparency: a PNG's transparent areas become white instead of black.
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
