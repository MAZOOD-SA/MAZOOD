// تصغير صورة المنتج قبل الرفع (القرار ٤٦): أطول ضلع ١٦٠٠ بكسل، JPEG بجودة ٨٠٪.
// في الموقع نستخدم canvas المتصفح (بدون مكتبة إضافية). في الجوال ترتفع الصورة كما هي (الخادم يرفض فوق ٣ ميجا)،
// ولما نحتاج ضغط في الجوال نضيف expo-image-manipulator ونسجّلها في docs/licenses.md.
export const MAX_IMAGE_SIDE = 1600;

/** أبعاد جديدة تحافظ على النسبة وما تكبّر الصورة الصغيرة. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** يرجّع ملف أصغر في الموقع، أو نفس الملف لو ما قدر (المتصفح ما يدعم، أو الصورة صغيرة أصلًا). */
export async function compressImageForWeb(file: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && file.size < 400_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
