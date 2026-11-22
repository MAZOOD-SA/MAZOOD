-- المرحلة ٣: المزوّدين ومستنداتهم، وموظفين الإدارة.

-- اسم الشخص (للموظفين وأصحاب الحسابات)
ALTER TABLE users ADD COLUMN display_name text;

CREATE TABLE staff (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  role       text NOT NULL CHECK (role IN ('owner','general_manager','verification','support','finance')),
  active     boolean NOT NULL DEFAULT true,
  added_by   uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- مالك واحد بس فعّال في أي وقت.
CREATE UNIQUE INDEX staff_single_owner ON staff (role) WHERE role = 'owner' AND active;

CREATE TABLE providers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users(id),
  trade_name          text NOT NULL CHECK (char_length(trade_name) BETWEEN 2 AND 120),
  owner_name          text NOT NULL CHECK (char_length(owner_name) BETWEEN 2 AND 120),
  id_type             text NOT NULL CHECK (id_type IN ('national_id','iqama')),
  -- رقم الهوية مشفّر (AES-256-GCM) بمفتاح من إعدادات الخادم. نحفظ آخر ٤ أرقام للعرض.
  id_number_enc       text NOT NULL,
  id_number_last4     text NOT NULL CHECK (id_number_last4 ~ '^\d{4}$'),
  commercial_register text NOT NULL CHECK (commercial_register ~ '^\d{10}$'),
  categories          text[] NOT NULL CHECK (cardinality(categories) BETWEEN 1 AND 6),
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending','verified','rejected','suspended')),
  status_reason       text,
  submitted_at        timestamptz,
  verified_at         timestamptz,
  verified_by         uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX providers_status_submitted_idx ON providers (status, submitted_at);

CREATE TABLE provider_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES providers(id),
  doc_type         text NOT NULL,
  -- مكان الملف في التخزين الخاص. اسم عشوائي، ما فيه اسم الملف الأصلي.
  storage_key      text NOT NULL UNIQUE,
  mime_type        text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  size_bytes       integer NOT NULL CHECK (size_bytes > 0),
  expires_on       date NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','replaced')),
  checklist        jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  reviewed_by      uuid REFERENCES users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_documents_provider_idx ON provider_documents (provider_id, doc_type);
CREATE INDEX provider_documents_expiry_idx ON provider_documents (expires_on) WHERE status = 'approved';
