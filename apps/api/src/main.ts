// تشغيل الخادم. الإعدادات من متغيرات البيئة (شوف .env.example).
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { systemClock, timerScheduler, type AppContext } from "./context";
import { createDb } from "./db";
import { ensureDemoProviders } from "./demo";
import { ConsoleSmsSender } from "./sms";

async function main() {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);
  let log: { error: (o: object, m: string) => void } = console;
  const scheduler = timerScheduler((err) => log.error({ err }, "مهمة مجدولة فشلت"));

  // مرسل الرسائل يكتب في سجل الخادم، والسجل ما يجهز إلا بعد بناء الخادم،
  // فنربطه بعد البناء (المسارات تقرأ ctx.sms وقت الإرسال، مو وقت التسجيل).
  const ctx: AppContext = { config, db, clock: systemClock, scheduler, sms: { sendOtp: async () => {} } };
  const app = await buildApp(ctx);
  log = app.log;
  ctx.sms = new ConsoleSmsSender(app.log);

  if (config.DEMO_MODE) {
    await ensureDemoProviders(ctx);
    app.log.warn("وضع التجربة شغّال: عروض وهمية توصل تلقائيًا. ممنوع على المنصة الحقيقية.");
  }

  const shutdown = async () => {
    scheduler.stop();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
