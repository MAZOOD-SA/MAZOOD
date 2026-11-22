// إضافة أول موظف (المالك) من سطر الأوامر على الخادم. بعده كل الموظفين يُضافون من لوحة الإدارة.
// الأمر: pnpm api:add-staff -- <رقم الجوال> <الدور> "<الاسم>"
// مثال:  pnpm api:add-staff -- 05XXXXXXXX owner "اسم المالك"
import { normalizeSaudiMobile, STAFF_ROLES, type StaffRole } from "@mazood/shared";
import { audit } from "./audit.ts";
import { loadConfig } from "./config.ts";
import { migrate } from "./migrate.ts";
import { openDb } from "./open-db.ts";

const [phoneArg, roleArg, ...nameParts] = process.argv.slice(2).filter((a) => a !== "--");
const phone = normalizeSaudiMobile(phoneArg ?? "");
const role = roleArg as StaffRole;
const name = nameParts.join(" ").trim();
if (!phone || !STAFF_ROLES.includes(role) || name.length < 2) {
  console.error(`الاستخدام: pnpm api:add-staff -- <الجوال> <${STAFF_ROLES.join("|")}> "<الاسم>"`);
  process.exit(1);
}

const db = await openDb(loadConfig(process.env));
await migrate(db);
try {
  await db.tx(async (t) => {
    const existing = await t.query<{ id: string; role: string }>("SELECT id, role FROM users WHERE phone=$1", [phone]);
    if (existing[0] && existing[0].role !== "staff") throw new Error("الرقم مسجّل كمصنع أو مزوّد. استخدم رقم ثاني للموظف.");
    const [u] = existing[0]
      ? await t.query<{ id: string }>("UPDATE users SET display_name=$2 WHERE id=$1 RETURNING id", [existing[0].id, name])
      : await t.query<{ id: string }>("INSERT INTO users (phone, role, display_name) VALUES ($1,'staff',$2) RETURNING id", [phone, name]);
    await t.query(
      `INSERT INTO staff (user_id, role) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, active=true, updated_at=now()`,
      [u.id, role],
    );
    await audit(t, { id: null, role: "system" }, "staff.added_cli", { type: "user", id: u.id }, { role });
  });
  console.log(`تمت إضافة الموظف بدور ${role}. يدخل برقم جواله ورمز التحقق، ثم يفتح /admin.`);
} catch (e) {
  const msg = (e as Error).message;
  console.error(msg.includes("staff_single_owner") ? "فيه مالك فعّال من قبل. ما يصير مالكين، ونقل الملكية له خطوات خاصة (docs/owner-guide.md)." : msg);
  process.exitCode = 1;
} finally {
  await db.close();
}
