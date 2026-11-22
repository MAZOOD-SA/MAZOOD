// تأسيس أول مالك للمنصة (أو إعطاء دور إداري) من سطر الأوامر.
//
//   pnpm --filter @mazood/api staff:grant 05XXXXXXXX owner
//
// الأدوار: owner (المالك)، general_manager (مدير عام)، verification (توثيق)، support (خدمة عملاء)، finance (مالية).
// يحتاج DATABASE_URL (من apps/api/.env على جهاز المبرمج، أو من إعدادات الاستضافة).
import { STAFF_ROLES, type StaffRole } from "@mazood/shared";
import { createDb } from "../src/db";
import { grantStaffRole } from "../src/staff";

const [phone, role] = process.argv.slice(2);
if (!phone || !STAFF_ROLES.includes(role as StaffRole)) {
  console.error(`الاستخدام: pnpm --filter @mazood/api staff:grant 05XXXXXXXX <${STAFF_ROLES.join("|")}>`);
  process.exit(1);
}
const db = createDb(process.env.DATABASE_URL ?? "");
grantStaffRole(db, phone, role as StaffRole)
  .then((u) => console.log(`تم: الرقم ${u.phone} صار له الدور ${role}.`))
  .catch((e) => {
    console.error(`ما تم: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
