-- التنبيهات (الخطوة ١٠ في docs/plans/phase-4.md، القسم ٧، ومعها أحداث السوق). القرار ٤٩.
-- كل حدث يكتب صف هنا، ومهمة كل دقيقة ترسله للقنوات (رسالة نصية وإشعار جوال) وتعيد المحاولة لو فشل.
-- داخل التطبيق: الصف نفسه يظهر في شاشة التنبيهات.
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  event           text NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- يمنع التكرار: نفس المفتاح لنفس المستخدم ما ينكتب مرتين (مثل تذكير ٢٤ ساعة لنفس الطلب).
  dedupe_key      text,
  read_at         timestamptz,
  -- حالة كل قناة: none (ما تنطبق)، pending، sent، failed، skipped (المستخدم طفّاها أو ما عنده جهاز).
  sms_status      text NOT NULL DEFAULT 'none' CHECK (sms_status IN ('none', 'pending', 'sent', 'failed', 'skipped')),
  push_status     text NOT NULL DEFAULT 'none' CHECK (push_status IN ('none', 'pending', 'sent', 'failed', 'skipped')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_outbox_idx ON notifications (next_attempt_at) WHERE sms_status = 'pending' OR push_status = 'pending';
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE notification_prefs (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  sms        boolean NOT NULL DEFAULT true,
  push       boolean NOT NULL DEFAULT true,
  muted      text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- رموز إشعارات Expo لأجهزة المستخدم. الرمز ينلغي مع الخروج، أو لما يرد Expo إنه ما عاد صالح.
CREATE TABLE push_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  platform   text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id) WHERE revoked_at IS NULL;
