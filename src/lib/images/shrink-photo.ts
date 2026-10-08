// Phone cameras take 3–10 MB photos, over the proof bucket's 5 MB limit
// (migration 0018) and slow to send on mobile data. A large photo is
// redrawn at most MAX_EDGE pixels on its longest side as a JPEG — still
// plenty to read a label or see a doorway. Small photos, and anything the
// browser can't decode, are returned unchanged (the size check after this
// still applies).

const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export const shrinkPhoto = async (file: Blob): Promise<Blob> => {
  if (file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== 'function') return file;
  try {
    // from-image: keep the phone's orientation (EXIF) when redrawing.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
};
