// قراءة الإعدادات وتعديلها. نقرأ من القاعدة في كل مرة (جدول صغير)، فأي تعديل ينعكس فورًا
// بدون إعادة تشغيل الخادم. التعديل يتحقق من القيمة وينكتب في سجل الإجراءات (مين، ومن كم لكم).
import { SETTING_DEFAULTS, SETTING_KEYS, SETTINGS_SCHEMA, type SettingKey, type Settings } from "@mazood/shared";
import { audit, type Actor } from "./audit.ts";
import type { Db } from "./db.ts";

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (!(SETTING_KEYS as string[]).includes(r.key)) continue;
    // قيمة محفوظة غلط (مثلًا من نسخة قديمة) ما توقف المنصة: نرجع للافتراضي لهذا المفتاح.
    const one = SETTINGS_SCHEMA.shape[r.key as SettingKey].safeParse(r.value);
    if (one.success) merged[r.key] = one.data;
  }
  return merged as Settings;
}

export async function setSetting<K extends SettingKey>(db: Db, actor: Actor, key: K, value: Settings[K]): Promise<Settings> {
  if (!(SETTING_KEYS as string[]).includes(key)) throw new Error(`إعداد غير معروف: ${String(key)}`);
  const parsed = SETTINGS_SCHEMA.shape[key].parse(value);
  return db.tx(async (t) => {
    const before = (await getSettings(t))[key];
    await t.query(
      `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1,$2,now(),$3)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`,
      [key, JSON.stringify(parsed), actor.id],
    );
    await audit(t, actor, "settings.updated", { type: "setting", id: key }, { key, from: before, to: parsed });
    return getSettings(t);
  });
}
