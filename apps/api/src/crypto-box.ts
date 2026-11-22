// تشفير البيانات الحساسة داخل قاعدة البيانات (مثل رقم الهوية) بـ AES-256-GCM.
// لو تسرّب جدول المزوّدين وحده، أرقام الهويات تبقى غير مقروءة بدون المفتاح DATA_ENCRYPTION_KEY.
// الصيغة: v1.<iv>.<tag>.<ciphertext> (كلها base64url). «v1» يسمح نغيّر المفتاح مستقبلًا.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type CryptoBox = { encrypt(plain: string): string; decrypt(box: string): string };

export function createCryptoBox(key: string): CryptoBox {
  // نشتق ٣٢ بايت ثابتة من المفتاح المعطى (أيًا كان طوله، بشرط ≥ ٣٢ حرف في الإعدادات).
  const k = createHash("sha256").update(`mazood-data-key:${key}`).digest();
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", k, iv);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return ["v1", iv, c.getAuthTag(), ct].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(".");
    },
    decrypt(box) {
      const [v, iv, tag, ct] = box.split(".");
      if (v !== "v1") throw new Error("صيغة تشفير غير معروفة");
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
    },
  };
}
