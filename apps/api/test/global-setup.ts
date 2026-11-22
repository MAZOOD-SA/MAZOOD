// قبل اختبارات الخادم: نمسح قاعدة بيانات الاختبار وننشئها من جديد بكل الترحيلات.
// قاعدة الاختبار منفصلة عن قاعدة التطوير، فالاختبارات ما تلمس بياناتك.
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://mazood:mazood_dev@localhost:5432/mazood_test";

export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `ما قدرت أتصل بقاعدة بيانات الاختبار (${TEST_DATABASE_URL}).\n` +
        "شغّلها بالأمر: docker compose up -d db\n" +
        "أو حدّد عنوانها في المتغير TEST_DATABASE_URL. التفاصيل في README.md.\n" +
        String(err),
    );
  }
  // DROP SCHEMA يمسح كل شي، ومنها سجل الإجراءات (اللي ما ينمسح سطر سطر).
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  execSync("npx prisma migrate deploy", {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
