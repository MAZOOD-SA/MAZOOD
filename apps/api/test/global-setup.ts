// يجهّز قاعدة بيانات الاختبار قبل الاختبارات: يمسحها كاملة ويطبّق كل ملفات الترحيل من الصفر.
// للأمان: يرفض يشتغل إلا على قاعدة اسمها ينتهي بـ _test، عشان ما يمسح قاعدة التطوير أو الحقيقية بالغلط.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/db.ts";

export const DEFAULT_TEST_DATABASE_URL = "postgresql://mazood:mazood@localhost:5432/mazood_test";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL لازم يشير لقاعدة اسمها ينتهي بـ _test (الحالي: ${dbName}). رفضنا عشان ما نمسح بيانات حقيقية.`);
  }

  const db = createDb(url);
  try {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA public");
  } catch (e) {
    throw new Error(
      `ما قدرنا نتصل بقاعدة الاختبار (${dbName}). شغّلها بالأمر: docker compose up -d db\n` +
        `أو حدد عنوان ثاني في TEST_DATABASE_URL.\nالسبب: ${(e as Error).message}`,
    );
  } finally {
    await db.$disconnect();
  }

  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
