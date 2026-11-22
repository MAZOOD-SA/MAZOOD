-- المرحلة ٤ (١): المدن (القرار ٢٠ في docs/decisions.md) والقسم السابع.
-- كل مصنع وطلب ومزوّد مربوط بمدينة من الحين، قبل ما تمتلي القاعدة. البداية: سدير.

CREATE TABLE cities (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z][a-z_]{1,39}$'),
  name_ar    text NOT NULL CHECK (char_length(name_ar) BETWEEN 2 AND 80),
  name_en    text NOT NULL CHECK (char_length(name_en) BETWEEN 2 AND 80),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cities (id, name_ar, name_en) VALUES ('sudair', 'سدير', 'Sudair');

-- المصنع: city_id بدل الحقل النصي. كل المصانع الحالية في سدير (المدينة الوحيدة اللي نشتغل فيها).
ALTER TABLE factories ADD COLUMN city_id text REFERENCES cities(id);
UPDATE factories SET city_id = 'sudair';
ALTER TABLE factories DROP COLUMN city;

-- الطلب: المدينة، والمنطقة (تظهر للمزوّد قبل القبول، مثل «المرحلة الثانية»).
-- location يبقى الموقع بالضبط، وما يظهر للمزوّد إلا بعد القبول.
ALTER TABLE requests ADD COLUMN city_id text REFERENCES cities(id);
UPDATE requests SET city_id = 'sudair';
ALTER TABLE requests ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE requests ADD COLUMN area text CHECK (area IS NULL OR char_length(area) BETWEEN 2 AND 120);
CREATE INDEX requests_open_idx ON requests (city_id, category, created_at DESC) WHERE status = 'awaiting_offers';

-- المدن اللي يخدمها كل مزوّد. المزوّدين الحاليين يخدمون سدير.
CREATE TABLE provider_cities (
  provider_id uuid NOT NULL REFERENCES providers(id),
  city_id     text NOT NULL REFERENCES cities(id),
  PRIMARY KEY (provider_id, city_id)
);
INSERT INTO provider_cities (provider_id, city_id) SELECT id, 'sudair' FROM providers;

-- حصر الموظف بمدن معيّنة. ما فيه صفوف للموظف = يشوف كل المدن.
CREATE TABLE staff_cities (
  user_id uuid NOT NULL REFERENCES staff(user_id),
  city_id text NOT NULL REFERENCES cities(id),
  PRIMARY KEY (user_id, city_id)
);

-- القسم السابع: مكافحة الحشرات والقوارض (أضافه المالك في ٢١ نوفمبر ٢٠٢٦).
ALTER TABLE requests DROP CONSTRAINT requests_category_check;
ALTER TABLE requests ADD CONSTRAINT requests_category_check
  CHECK (category IN ('transport','maintenance','materials','security','cleaning','customs','pest_control'));
ALTER TABLE providers DROP CONSTRAINT providers_categories_check;
ALTER TABLE providers ADD CONSTRAINT providers_categories_check CHECK (cardinality(categories) BETWEEN 1 AND 7);
