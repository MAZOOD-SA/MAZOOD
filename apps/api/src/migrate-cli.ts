// الأمر: pnpm --filter @mazood/api migrate
import { loadConfig } from "./config.ts";
import { openDb } from "./open-db.ts";
import { migrate } from "./migrate.ts";

const config = loadConfig(process.env);
const db = await openDb(config);
const applied = await migrate(db, console.log);
console.log(applied.length ? `تم تطبيق ${applied.length} ملف` : "قاعدة البيانات محدّثة");
await db.close();
