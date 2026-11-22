-- المرحلة ٤ (٧): التنفيذ. صور البدء والانتهاء، وطلبات تعديل السعر، وموعد التأكيد التلقائي.

-- موعد التأكيد التلقائي ينحسب وينحفظ لحظة «تم التنفيذ» (delivered_at + الإعداد autoConfirmHours)،
-- فلو تغيّر الإعداد بعدين ما يتغيّر موعد طلب سلّمه المزوّد قبل، والمصنع يشوف الموعد بالضبط.
ALTER TABLE orders ADD COLUMN auto_confirm_at timestamptz;
ALTER TABLE orders ADD COLUMN confirmed_by text CHECK (confirmed_by IS NULL OR confirmed_by IN ('factory', 'system'));
CREATE INDEX orders_auto_confirm_idx ON orders (auto_confirm_at) WHERE state = 'open' AND auto_confirm_at IS NOT NULL;

-- صور التنفيذ في التخزين الخاص (نفس طريقة المستندات): ما لها رابط عام، وتنفتح برابط مؤقت للمصنع
-- صاحب الطلب والمزوّد المنفّذ بس. النوع يُفحص من محتوى الملف.
CREATE TABLE order_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id),
  stage       text NOT NULL CHECK (stage IN ('start', 'delivery')),
  storage_key text NOT NULL UNIQUE,
  mime_type   text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  size_bytes  integer NOT NULL CHECK (size_bytes > 0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL
);
CREATE INDEX order_photos_order_idx ON order_photos (order_id, stage, created_at);

-- طلب تعديل السعر (الإضافة ٩). طلب واحد ينتظر بالكثير لكل طلب منفّذ.
-- old_price_halalas: السعر وقت الطلب، عشان سجل الأسعار يبقى واضح حتى لو انطلب تعديل ثاني بعدين.
CREATE TABLE price_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id),
  old_price_halalas bigint NOT NULL CHECK (old_price_halalas > 0),
  new_price_halalas bigint NOT NULL CHECK (new_price_halalas > 0),
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by      uuid NOT NULL REFERENCES users(id),
  requested_at      timestamptz NOT NULL,
  decided_by        uuid REFERENCES users(id),
  decided_at        timestamptz
);
CREATE UNIQUE INDEX price_changes_one_pending ON price_changes (order_id) WHERE status = 'pending';
