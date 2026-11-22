// تعديل إعداد من سطر الأوامر على الخادم (لين تجي شاشة الإعدادات في لوحة الإدارة، المرحلة ٦).
// الأمر:  pnpm api:set-setting -- <المفتاح> <القيمة بصيغة JSON>
// أمثلة:  pnpm api:set-setting -- offerValidityHours 24
//         pnpm api:set-setting -- cancellation "$(cat cancellation.json)"   (الشكل كامل في packages/shared/src/cancellation.ts)
// بدون قيمة: يعرض كل الإعدادات الحالية.
import { SETTING_KEYS, type SettingKey } from "@mazood/shared";
import { loadConfig } from "./config.ts";
import { migrate } from "./migrate.ts";
import { openDb } from "./open-db.ts";
import { getSettings, setSetting } from "./settings.ts";

const [key, raw] = process.argv.slice(2).filter((a) => a !== "--");
const db = await openDb(loadConfig(process.env));
await migrate(db);
try {
  if (!key) {
    console.log(JSON.stringify(await getSettings(db), null, 2));
  } else if (!(SETTING_KEYS as string[]).includes(key) || raw === undefined) {
    console.error(`الاستخدام: pnpm api:set-setting -- <${SETTING_KEYS.join("|")}> <القيمة JSON>`);
    process.exitCode = 1;
  } else {
    const after = await setSetting(db, { id: null, role: "system" }, key as SettingKey, JSON.parse(raw));
    console.log(`تم. ${key} = ${JSON.stringify(after[key as SettingKey])}`);
  }
} catch (e) {
  console.error(`ما تغيّر شي: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
