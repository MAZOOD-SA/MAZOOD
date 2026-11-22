// تشغيل ملفات migrations بالترتيب، مرة وحدة لكل ملف. آمن تشغيله أكثر من مرة.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

/** until: (للاختبارات) يوقف بعد هذا الملف، عشان نختبر نقل البيانات القديمة لملف جديد. */
export async function migrate(db: Db, log: (m: string) => void = () => {}, opts: { until?: string } = {}): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (opts.until && file > opts.until) break;
    if (done.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    log(`migration applied: ${file}`);
    applied.push(file);
  }
  return applied;
}
