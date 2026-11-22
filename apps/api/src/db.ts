// طبقة قاعدة البيانات: واجهة صغيرة تشتغل مع PostgreSQL الحقيقي (pg) ومع PGlite
// (PostgreSQL كامل داخل العملية، للاختبارات والتشغيل المحلي بدون تثبيت شي).
// كل الاستعلامات parameterized ($1, $2) وما نركّب نص SQL من مدخلات المستخدم أبدًا.
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** يشغّل عدة أوامر بدون معاملات (للـ migrations). */
  exec(sql: string): Promise<void>;
  /** كل اللي داخل الدالة ينجح معًا أو يتراجع معًا. */
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

export async function createPgDb(connectionString: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool: Pool = new pg.Pool({ connectionString, max: 10 });
  const wrap = (q: { query: Pool["query"] }, onTx: Db["tx"]): Db => ({
    async query(sql, params) {
      const r = await q.query(sql, params as unknown[]);
      return r.rows;
    },
    async exec(sql) {
      await q.query(sql);
    },
    tx: onTx,
    close: () => pool.end(),
  });
  const db: Db = wrap(pool, async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inner: Db = wrap(client as unknown as Pool, () => {
        throw new Error("معاملة داخل معاملة غير مدعومة");
      });
      const result = await fn(inner);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  return db;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const lite: PGlite = new PGlite(dataDir);
  await lite.waitReady;
  const wrap = (q: Pick<PGlite, "query" | "exec">, onTx: Db["tx"]): Db => ({
    async query(sql, params) {
      const r = await q.query(sql, params as unknown[]);
      return r.rows as never;
    },
    async exec(sql) {
      await q.exec(sql);
    },
    tx: onTx,
    close: () => lite.close(),
  });
  return wrap(lite, (fn) =>
    lite.transaction((t) =>
      fn(
        wrap(t as unknown as PGlite, () => {
          throw new Error("معاملة داخل معاملة غير مدعومة");
        }),
      ),
    ),
  );
}
