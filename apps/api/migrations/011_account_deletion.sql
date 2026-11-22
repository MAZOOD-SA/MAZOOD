-- المرحلة ٤ (١١): «طلب حذف الحساب» من «حسابي» للمصنع والمزوّد (قرار المالك، 22 نوفمبر 2026).
-- الطلب يوصل للوحة الإدارة (الخطوة ١٢)، والموظف ينفّذه: البيانات الشخصية تنمسح، والفواتير والسجل تنحفظ
-- (نظام حماية البيانات الشخصية يسمح بحفظ اللي يلزم نظامًا، مثل الفواتير). هنا الطلب نفسه بس.
CREATE TABLE account_deletion_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  role         text NOT NULL CHECK (role IN ('factory', 'provider')),
  reason       text CHECK (reason IS NULL OR length(reason) <= 500),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
  requested_at timestamptz NOT NULL,
  handled_at   timestamptz,
  handled_by   uuid REFERENCES users(id)
);
-- طلب واحد ينتظر لكل مستخدم.
CREATE UNIQUE INDEX account_deletion_pending_idx ON account_deletion_requests (user_id) WHERE status = 'pending';
