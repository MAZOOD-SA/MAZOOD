-- المزوّد الموثّق يشتري من السوق (قرار المالك 23 نوفمبر 2026، القرار ٥٧ في docs/decisions.md).
-- طلب الشراء صار له مشتري واحد بالضبط: عميل (buyer_factory_id) أو مزوّد (buyer_provider_id).
-- الطلبات القديمة كلها لعملاء، فتبقى مثل ما هي.

ALTER TABLE purchase_requests ALTER COLUMN buyer_factory_id DROP NOT NULL;
ALTER TABLE purchase_requests ADD COLUMN buyer_provider_id uuid REFERENCES providers(id);
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_one_buyer
  CHECK ((buyer_factory_id IS NULL) <> (buyer_provider_id IS NULL));
CREATE INDEX purchase_requests_buyer_provider_idx ON purchase_requests (buyer_provider_id, created_at DESC)
  WHERE buyer_provider_id IS NOT NULL;

-- لو الإدارة حفظت إعداد السوق قبل، نضيف له «مزوّد» عشان القرار يشتغل مباشرة.
-- (بدون إعداد محفوظ، الافتراضي في packages/shared/src/market.ts فيه «مزوّد» أصلًا.)
-- الإدارة تقدر تشيله من «الإعدادات» في أي وقت.
UPDATE settings
   SET value = jsonb_set(value, '{buyerKinds}', (value->'buyerKinds') || '"provider"'::jsonb)
 WHERE key = 'market'
   AND jsonb_typeof(value->'buyerKinds') = 'array'
   AND NOT (value->'buyerKinds') ? 'provider';
