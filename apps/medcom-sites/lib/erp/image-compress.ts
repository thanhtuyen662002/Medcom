// Phone cameras produce 3–12 MB photos. The IIS sites in front of the Web and API accept request bodies up to
// 1 MB (docs/deployment/iis), so shrink photos in the browser to stay under it; this also uploads quickly on
// mobile data. Each attempt lowers quality, then size, until the JPEG fits.
const TARGET_BYTES = 900 * 1024;
const ATTEMPTS: ReadonlyArray<readonly [number, number]> = [[2048, 0.85], [2048, 0.75], [2048, 0.65], [1600, 0.7], [1600, 0.55], [1280, 0.6]];

/** Returns a JPEG under ~900 KB for a larger JPG/PNG photo, or the original file when it is small or unreadable. */
export async function compressImageFile(file: File): Promise<File> {
  const image = /^image\/(jpeg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (!image || file.size <= TARGET_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    // imageOrientation applies the camera's EXIF rotation so portrait photos stay upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let best: Blob | null = null;
    try {
      for (const [edge, quality] of ATTEMPTS) {
        const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) break;
        // JPEG has no transparency: a PNG's transparent areas become white instead of black.
        context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && (!best || blob.size < best.size)) best = blob;
        if (best && best.size <= TARGET_BYTES) break;
      }
    } finally {
      bitmap.close();
    }
    if (!best || best.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([best], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
