-- المرحلة ٤ (٤-٥): العروض ونسخها.
-- السعر بالهللة كرقم صحيح (bigint)، **قبل الضريبة**، وهو سعر المزوّد بس. السعر اللي يشوفه المصنع
-- ينحسب بدالة وحدة priceForFactory() في packages/shared (يتغيّر في المرحلة ٥ بعد قرار مين البائع).
CREATE TABLE offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid NOT NULL REFERENCES requests(id),
  provider_id      uuid NOT NULL REFERENCES providers(id),
  price_halalas    bigint NOT NULL CHECK (price_halalas > 0 AND price_halalas <= 100000000000),
  -- مدة التنفيذ بالساعات (الواجهة تعرضها بالساعات أو الأيام).
  duration_hours   integer NOT NULL CHECK (duration_hours BETWEEN 1 AND 2160),
  note             text CHECK (note IS NULL OR char_length(note) <= 500),
  valid_until      timestamptz NOT NULL,
  -- active: فعّال (وينتهي فعليًا لما يعدّي valid_until، يُحسب وقت القراءة)
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','accepted','rejected','expired')),
  -- ليش انرفض: انقبل عرض ثاني، أو انلغى الطلب، أو انتهى. «انقبل عرض ثاني» يقدر يرجع فعّال لو المقبول اعتذر.
  rejected_reason  text CHECK (rejected_reason IS NULL OR rejected_reason IN ('other_accepted','request_closed')),
  revision         integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  -- أول مرة فتح المصنع العروض بعد ما وصل هذا العرض («المصنع شاف عرضك»).
  first_seen_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- عرض فعّال واحد بس لكل مزوّد على نفس الطلب.
CREATE UNIQUE INDEX offers_one_active_per_provider ON offers (request_id, provider_id) WHERE status = 'active';
CREATE INDEX offers_request_idx ON offers (request_id, status);
CREATE INDEX offers_provider_idx ON offers (provider_id, created_at DESC);

-- النسخ القديمة من كل عرض لما يتعدّل (المصنع يشوف «تم تعديل العرض»). إضافة فقط.
CREATE TABLE offer_revisions (
  id             bigserial PRIMARY KEY,
  offer_id       uuid NOT NULL REFERENCES offers(id),
  revision       integer NOT NULL,
  price_halalas  bigint NOT NULL,
  duration_hours integer NOT NULL,
  note           text,
  valid_until    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, revision)
);
