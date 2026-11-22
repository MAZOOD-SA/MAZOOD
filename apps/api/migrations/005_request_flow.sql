-- المرحلة ٤ (٣): حالات الطلب الجديدة (جدول الانتقالات في packages/shared/src/order-flow.ts)،
-- ووقت انتهاء الطلب. الانتهاء يُحسب من expires_at وقت القراءة، فلو تأخرت المهمة الحالة تبقى صحيحة.
ALTER TABLE requests DROP CONSTRAINT requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (status IN (
  'awaiting_offers','pending_approval','accepted','in_progress','delivered','completed','expired','cancelled','disputed'
));
ALTER TABLE requests ADD COLUMN expires_at timestamptz;
-- الطلبات المفتوحة الحالية تاخذ نفس المدة الافتراضية (٧ أيام من إنشائها).
UPDATE requests SET expires_at = created_at + interval '7 days';
ALTER TABLE requests ALTER COLUMN expires_at SET NOT NULL;
