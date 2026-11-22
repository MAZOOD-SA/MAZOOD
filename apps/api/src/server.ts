// نقطة التشغيل: pnpm --filter @mazood/api dev
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { migrate } from "./migrate.ts";
import { openDb } from "./open-db.ts";
import { consoleSms, noSms } from "./sms.ts";

const config = loadConfig(process.env);
const db = await openDb(config);
// تشغيل التحديثات تلقائيًا عند البدء (آمن: كل ملف يطبَّق مرة وحدة).
await migrate(db, (m) => console.log(m));

const sms = config.smsProvider === "console" ? consoleSms() : noSms();
const app = await buildApp({ db, sms, config });

if (!config.databaseUrl) {
  app.log.warn("DATABASE_URL غير مضبوط: نستخدم قاعدة بيانات تجريبية داخل العملية (للتطوير فقط)");
}
await app.listen({ port: config.port, host: config.host });
