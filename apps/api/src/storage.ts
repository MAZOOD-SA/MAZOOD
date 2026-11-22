// التخزين الخاص للمستندات (الهويات والسجلات). ما له أي رابط عام:
// الملف ما ينفتح إلا برابط مؤقت يوقّعه الخادم (files.ts)، وكل فتح ينكتب في سجل الإجراءات.
// اليوم: قرص محلي خاص بالخادم (أو الذاكرة للاختبارات). لما تنحدد الاستضافة نضيف S3 بنفس الواجهة.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FileStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export function memoryStorage(): FileStorage {
  const files = new Map<string, Buffer>();
  return {
    async put(key, bytes) {
      files.set(key, bytes);
    },
    async get(key) {
      return files.get(key) ?? null;
    },
  };
}

export function diskStorage(dir: string): FileStorage {
  // المفتاح نولّده نحن (uuid)، بس نتأكد بعد عشان ما يطلع أحد خارج المجلد.
  const safe = (key: string) => {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("مفتاح ملف غير صالح");
    return join(dir, key);
  };
  return {
    async put(key, bytes) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(safe(key), bytes, { mode: 0o600 });
    },
    async get(key) {
      try {
        return await readFile(safe(key));
      } catch {
        return null;
      }
    },
  };
}

/** نوع الملف من محتواه (أول بايتات)، مو من اسمه أو من اللي يقوله المتصفح. */
export function sniffMime(bytes: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}
