-- المرحلة ٤ (٩): التقييم بالنجوم. المصنع يقيّم المزوّد مرة وحدة لكل طلب مكتمل (اختياري).
-- comment: فاضي للمستقبل. التعليق المكتوب مؤجّل لقرار المالك والمحامي (القرار ٣٣)،
-- والقيد تحت يمنع أي نص فيه لين ينشال القيد بقرار.
CREATE TABLE ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL UNIQUE REFERENCES orders(id),
  request_id  uuid NOT NULL REFERENCES requests(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  stars       smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment     text CHECK (comment IS NULL),
  rated_by    uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL
);
-- متوسط المزوّد في بطاقة العرض.
CREATE INDEX ratings_provider_idx ON ratings (provider_id);

-- رقم الالتزام (القرار ٣٣) يعدّ طلبات المزوّد المقبولة خلال المدة: orders_provider_idx (provider_id, accepted_at) يكفي.
