// نقطة التشغيل: pnpm --filter @mazood/api dev
import { normalizeSaudiMobile } from "@mazood/shared";
import { buildApp } from "./app.ts";
import { startScheduledJobs } from "./jobs.ts";
import { expoPush, noPush } from "./notify.ts";
import { loadConfig } from "./config.ts";
import { migrate } from "./migrate.ts";
import { openDb } from "./open-db.ts";
import { consoleSms, noSms } from "./sms.ts";
import { diskStorage, memoryStorage } from "./storage.ts";

const config = loadConfig(process.env);
const db = await openDb(config);
// تشغيل التحديثات تلقائيًا عند البدء (آمن: كل ملف يطبَّق مرة وحدة).
await migrate(db, (m) => console.log(m));

// للتطوير والتجربة فقط: DEV_OWNER_PHONE يضيف هذا الرقم كمالك عند التشغيل، عشان تقدر تدخل اللوحة
// على القاعدة التجريبية اللي في الذاكرة. ممنوع في الإنتاج (هناك نستخدم pnpm api:add-staff).
const devOwner = process.env.DEV_OWNER_PHONE ? normalizeSaudiMobile(process.env.DEV_OWNER_PHONE) : null;
if (devOwner && config.env !== "production") {
  await db.query(
    `INSERT INTO users (phone, role, display_name) VALUES ($1,'staff','المالك (تجربة)') ON CONFLICT (phone) DO NOTHING`,
    [devOwner],
  );
  await db.query(
    `INSERT INTO staff (user_id, role) SELECT id, 'owner' FROM users WHERE phone=$1 AND role='staff' ON CONFLICT (user_id) DO NOTHING`,
    [devOwner],
  );
  console.log(`[تطوير] ${devOwner} مضاف كمالك`);
}

const sms = config.smsProvider === "console" ? consoleSms() : noSms();
// التخزين الخاص للمستندات: مجلد على الخادم (خارج أي مجلد يُعرض للعامة). بدون STORAGE_DIR (تطوير): في الذاكرة.
const storage = config.storageDir ? diskStorage(config.storageDir) : memoryStorage();
const app = await buildApp({ db, sms, config, storage });

if (!config.databaseUrl) {
  app.log.warn("DATABASE_URL غير مضبوط: نستخدم قاعدة بيانات تجريبية داخل العملية (للتطوير فقط)");
}
await app.listen({ port: config.port, host: config.host });
// المهام الدورية (التأكيد التلقائي، وانتهاء الطلبات): كل دقيقة. شرحها في jobs.ts.
// والتنبيهات: الرسائل النصية من نفس مزوّد رمز الدخول، وإشعارات الجوال من Expo لو مفعّلة (PUSH_PROVIDER).
const push = config.pushProvider === "expo" ? expoPush(config.expoAccessToken) : noPush;
startScheduledJobs(db, () => new Date(), app.log, { sms, push });
