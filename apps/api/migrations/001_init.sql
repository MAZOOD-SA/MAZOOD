-- المرحلة ٢: الحسابات والدخول والطلبات.
-- كل المبالغ (لاحقًا) بالهللة كأرقام صحيحة. الجداول هنا حسب PLAN.md القسم ٣.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE CHECK (phone ~ '^\+9665\d{8}$'),
  role          text NOT NULL DEFAULT 'factory' CHECK (role IN ('factory', 'provider', 'staff')),
  locale        text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- رموز التحقق: ما نحفظ الرمز نفسه، نحفظ بصمته (HMAC) فقط.
CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_created_idx ON otp_codes (phone, created_at DESC);

-- الجلسات: التوكن نفسه ما ينحفظ، نحفظ SHA-256 له.
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE factories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- بيانات الشركة يدخلها المالك/المصنع بنفسه من شاشة الحساب. فاضية لين يكمّلها.
  name                text,
  city                text,
  commercial_register text CHECK (commercial_register IS NULL OR commercial_register ~ '^\d{10}$'),
  vat_number          text CHECK (vat_number IS NULL OR vat_number ~ '^3\d{13}3$'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- يسمح مستقبلًا بأكثر من موظف للمصنع. الآن مستخدم واحد = مصنع واحد.
CREATE TABLE factory_members (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  factory_id uuid NOT NULL REFERENCES factories(id),
  role       text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member'))
);
CREATE INDEX factory_members_factory_idx ON factory_members (factory_id);

CREATE TABLE requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  category    text NOT NULL CHECK (category IN ('transport','maintenance','materials','security','cleaning','customs')),
  type_id     text NOT NULL,
  details     text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 2000),
  location    text NOT NULL CHECK (char_length(location) BETWEEN 2 AND 200),
  needed_when text NOT NULL CHECK (needed_when IN ('today','tomorrow','this_week')),
  status      text NOT NULL DEFAULT 'awaiting_offers'
              CHECK (status IN ('awaiting_offers','in_progress','completed','cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_factory_created_idx ON requests (factory_id, created_at DESC);

-- سجل الإجراءات: إضافة فقط. التعديل والحذف ممنوعين على مستوى قاعدة البيانات نفسها.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_role  text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
