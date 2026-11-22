import type { Config } from "./config.ts";
import { createPgDb, createPgliteDb, type Db } from "./db.ts";

/** DATABASE_URL موجود: PostgreSQL. غير موجود (تطوير بس): PGlite، في الذاكرة أو في PGLITE_DIR. */
export async function openDb(config: Config): Promise<Db> {
  if (config.databaseUrl) return createPgDb(config.databaseUrl);
  return createPgliteDb(config.pgliteDir);
}
