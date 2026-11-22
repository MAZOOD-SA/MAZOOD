// طبقة الحماية الثانية: «أمان على مستوى الصف» (RLS) في PostgreSQL (القرار ١٥ في docs/decisions.md).
//
// كل طلب من مصنع يشتغل داخل معاملة وحدة، وأول شي فيها نقول لقاعدة البيانات:
// «هذي المعاملة لمصنع رقم كذا» (app.factory_id). وقاعدة البيانات نفسها (سياسات في الترحيل
// 20261122..._row_level_security) ما ترجع ولا تعدّل إلا صفوف هذا المصنع في جداول المصانع
// والطلبات والعروض. فلو نسي مبرمج يكتب where factoryId في كود جديد، القاعدة تمنع التسريب.
//
// فايدة ثانية: الطلب كله معاملة وحدة، فإما ينجح كامل أو يرجع كامل (مثلًا قبول عرض ورفض الباقي).
//
// الإعداد ينحط بـ set_config(..., true)، يعني يختفي تلقائيًا مع نهاية المعاملة،
// فما ينتقل لطلب ثاني يستخدم نفس الاتصال.
import type { Db } from "./db";
import type { Tx } from "./services/requests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withFactoryScope<T>(db: Db, factoryId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // الرقم يجي من جلسة الخادم نفسه، والفحص هنا احتياط إضافي قبل ما يوصل قاعدة البيانات.
  if (!UUID.test(factoryId)) throw new Error("factoryId غير صالح");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.factory_id', ${factoryId}, true)`;
    return fn(tx);
  });
}
