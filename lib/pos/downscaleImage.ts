/** Longest side sent to the server: enough to read a printed slip, small enough for a ~4 MB request cap. */
const MAX_SIDE = 1800;
const MAX_BYTES = 3.5 * 1024 * 1024;

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality)
  );

/** Browser only: shrink a phone photo to a JPEG upright and under the upload limit. */
export async function downscaleToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, 0.85);
    if (blob.size > MAX_BYTES) blob = await toBlob(canvas, 0.65);
    return blob;
  } finally {
    bitmap.close();
  }
}
