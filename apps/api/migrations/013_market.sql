-- سوق منتجات المصانع (خطة العميل الفرد والسوق، الخطوة ب). الشرح في docs/architecture.md والقرارات ٤٤ إلى ٤٨.
-- المبالغ كلها بالهللة (bigint) قبل الضريبة.

-- تصنيفات المنتجات: مقترحة في الخطة، وتتعدّل من لوحة الإدارة لاحقًا (المرحلة ٦).
CREATE TABLE product_categories (
  id       text PRIMARY KEY CHECK (id ~ '^[a-z_]{2,40}$'),
  name_ar  text NOT NULL,
  name_en  text NOT NULL,
  sort     int  NOT NULL DEFAULT 0,
  active   boolean NOT NULL DEFAULT true
);
INSERT INTO product_categories (id, name_ar, name_en, sort) VALUES
  ('plastics_packaging', 'بلاستيك وتغليف', 'Plastics & packaging', 1),
  ('steel_metals', 'حديد ومعادن', 'Steel & metals', 2),
  ('wood_pallets', 'أخشاب وطبالي', 'Wood & pallets', 3),
  ('cardboard_paper', 'كرتون وورق', 'Cardboard & paper', 4),
  ('chemicals_cleaning', 'كيماويات ومنظفات', 'Chemicals & cleaning', 5),
  ('building_materials', 'مواد بناء', 'Building materials', 6),
  ('food', 'مواد غذائية', 'Food products', 7),
  ('other', 'منتجات ثانية', 'Other products', 8);

-- الباقات: عامة (للمصنع البائع الحين، وللمزوّد لاحقًا لو تقرر، القرار ٤٥).
CREATE TABLE subscription_plans (
  id                    text PRIMARY KEY CHECK (id ~ '^[a-z_]{2,40}$'),
  audience              text NOT NULL CHECK (audience IN ('seller', 'provider')),
  name_ar               text NOT NULL,
  name_en               text NOT NULL,
  monthly_price_halalas bigint NOT NULL CHECK (monthly_price_halalas >= 0),
  max_products          int CHECK (max_products IS NULL OR max_products > 0),
  featured              boolean NOT NULL DEFAULT false,
  active                boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- السعر المبدئي ٤٠٠ ريال (قرار المالك: «حواليها، ممكن أكثر»). يتغيّر من اللوحة أو بأمر واحد.
INSERT INTO subscription_plans (id, audience, name_ar, name_en, monthly_price_halalas, max_products, featured)
VALUES ('seller_basic', 'seller', 'باقة البائع', 'Seller plan', 40000, 100, false);

-- المصنع البائع: منشأة فعّلت البيع، ولازم يتوثّق بالسجل التجاري قبل ما تظهر منتجاته.
CREATE TABLE sellers (
  factory_id    uuid PRIMARY KEY REFERENCES factories(id),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'verified', 'rejected', 'suspended')),
  status_reason text CHECK (status_reason IS NULL OR length(status_reason) <= 500),
  submitted_at  timestamptz,
  verified_at   timestamptz,
  decided_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- مستند السجل التجاري للبائع: نفس التخزين الخاص والروابط المؤقتة المستخدمة مع المزوّدين.
CREATE TABLE seller_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL REFERENCES sellers(factory_id),
  doc_type      text NOT NULL DEFAULT 'commercial_register' CHECK (doc_type IN ('commercial_register')),
  storage_key   text NOT NULL,
  mime_type     text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes    int  NOT NULL CHECK (size_bytes > 0),
  expires_on    date NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'replaced')),
  reject_reason text,
  reviewed_by   uuid REFERENCES users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_documents_factory_idx ON seller_documents (factory_id, created_at DESC);

-- الاشتراك: فترة لها بداية ونهاية. كل دفعة تمدّها. «مشترك» = فيه فترة تغطي الحين.
-- subject_type عام (factory للمصنع البائع، وprovider لاحقًا) عشان ما نعيد بناءه (القرار ٤٥).
CREATE TABLE subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('factory', 'provider')),
  subject_id   uuid NOT NULL,
  plan_id      text NOT NULL REFERENCES subscription_plans(id),
  kind         text NOT NULL CHECK (kind IN ('trial', 'paid')),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL CHECK (ends_at > starts_at),
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_subject_idx ON subscriptions (subject_type, subject_id, ends_at DESC);
-- فترة تجريبية وحدة بالكثير لكل مشترك.
CREATE UNIQUE INDEX subscriptions_one_trial_idx ON subscriptions (subject_type, subject_id) WHERE kind = 'trial';

-- دفعات الاشتراك اليدوية (تحويل بنكي يسجّله موظف المالية). إضافة فقط: التصحيح بقيد جديد.
CREATE TABLE subscription_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  amount_halalas  bigint NOT NULL CHECK (amount_halalas >= 0),
  paid_on         date NOT NULL,
  reference       text NOT NULL CHECK (length(reference) BETWEEN 2 AND 80),
  recorded_by     uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION subscription_payments_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'subscription_payments is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER subscription_payments_append_only BEFORE UPDATE OR DELETE ON subscription_payments
  FOR EACH ROW EXECUTE FUNCTION subscription_payments_immutable();

-- المنتجات.
CREATE TABLE products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id          uuid NOT NULL REFERENCES sellers(factory_id),
  category_id        text NOT NULL REFERENCES product_categories(id),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description        text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 3000),
  unit               text NOT NULL,
  min_order_qty      int  NOT NULL CHECK (min_order_qty >= 1),
  pricing            text NOT NULL CHECK (pricing IN ('fixed', 'quote')),
  unit_price_halalas bigint CHECK (unit_price_halalas IS NULL OR unit_price_halalas > 0),
  price_tiers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- hidden: المصنع أخفاه مؤقتًا. removed: الإدارة أخفته لأنه مخالف (مع السبب).
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'removed')),
  removed_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((pricing = 'fixed') = (unit_price_halalas IS NOT NULL))
);
CREATE INDEX products_seller_idx ON products (seller_id, created_at DESC);
CREATE INDEX products_category_idx ON products (category_id) WHERE status = 'active';

-- صور المنتج: للعرض العام (مو مستندات حساسة)، بس نحفظها بنفس التخزين ونتأكد من نوعها من محتواها.
CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id),
  storage_key text NOT NULL,
  mime_type   text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  size_bytes  int  NOT NULL CHECK (size_bytes > 0),
  sort        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort);

-- طلب الشراء (طلب عرض سعر على منتج) ورد المصنع.
CREATE TABLE purchase_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES products(id),
  seller_id         uuid NOT NULL REFERENCES sellers(factory_id),
  buyer_factory_id  uuid NOT NULL REFERENCES factories(id),
  buyer_user_id     uuid NOT NULL REFERENCES users(id),
  quantity          int  NOT NULL CHECK (quantity >= 1),
  city_id           text NOT NULL REFERENCES cities(id),
  needed_when       text NOT NULL CHECK (needed_when IN ('today', 'tomorrow', 'this_week', 'this_month')),
  note              text CHECK (note IS NULL OR char_length(note) <= 1000),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'quoted', 'revision_requested', 'accepted', 'received', 'rejected', 'declined', 'cancelled')),
  revision_used     boolean NOT NULL DEFAULT false,
  revision_note     text,
  decision_note     text,
  accepted_quote_id uuid,
  seller_user_id    uuid REFERENCES users(id),
  accepted_at       timestamptz,
  received_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (seller_id <> buyer_factory_id)
);
CREATE INDEX purchase_requests_buyer_idx ON purchase_requests (buyer_factory_id, created_at DESC);
CREATE INDEX purchase_requests_seller_idx ON purchase_requests (seller_id, created_at DESC);

CREATE TABLE purchase_quotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id),
  unit_price_halalas  bigint NOT NULL CHECK (unit_price_halalas > 0),
  total_halalas       bigint NOT NULL CHECK (total_halalas > 0),
  lead_time_days      int NOT NULL CHECK (lead_time_days BETWEEN 0 AND 365),
  delivery_included   boolean NOT NULL,
  valid_until         timestamptz NOT NULL,
  note                text CHECK (note IS NULL OR char_length(note) <= 1000),
  -- active: آخر رد. superseded: رد قديم قبل التعديل.
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX purchase_quotes_one_active_idx ON purchase_quotes (purchase_request_id) WHERE status = 'active';
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_quote_fk FOREIGN KEY (accepted_quote_id) REFERENCES purchase_quotes(id);

-- تقييم المشتري للبائع بعد الاستلام (نجوم بس، بدون تعليق، مثل الخدمات القرار ٣٣).
CREATE TABLE seller_ratings (
  purchase_request_id uuid PRIMARY KEY REFERENCES purchase_requests(id),
  seller_id           uuid NOT NULL REFERENCES sellers(factory_id),
  stars               int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_ratings_seller_idx ON seller_ratings (seller_id);
