-- المرحلة ٤ (٦): القبول، والطلب المنفّذ، وخطه الزمني، والموافقة الداخلية، وموظفين المصنع.

-- أدوار موظفين المصنع (سؤال ١٦): manager (مدير: يقبل مباشرة ويدير الموظفين)، وmember (موظف: يرفع ويرشّح).
ALTER TABLE factory_members DROP CONSTRAINT factory_members_role_check;
UPDATE factory_members SET role = 'manager' WHERE role = 'owner';
ALTER TABLE factory_members ADD CONSTRAINT factory_members_role_check CHECK (role IN ('manager', 'member'));
ALTER TABLE factory_members ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE factory_members ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE factory_members ADD COLUMN added_by uuid REFERENCES users(id);
ALTER TABLE factory_members ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- إضافة موظف للمصنع: المدير يكتب رقم جواله، فينضاف المستخدم ومكانه في المصنع مباشرة،
-- ولما يدخل برقمه ورمز التحقق يلقى نفسه في نفس المصنع (بدل ما ينفتح له مصنع جديد).

-- الطلب المنفّذ: ينفتح لما ينقبل عرض. حالة الطلب نفسها في requests.status (جدول الانتقالات)،
-- وهنا الأوقات والسعر المتفق عليه ونسخة من سياسة الإلغاء وقت القبول (ما تتغيّر لو تغيّر الإعداد بعدين).
-- state: open (شغّال)، withdrawn (المزوّد اعتذر قبل البدء)، closed (اكتمل أو انلغى).
CREATE TABLE orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES requests(id),
  offer_id            uuid NOT NULL UNIQUE REFERENCES offers(id),
  provider_id         uuid NOT NULL REFERENCES providers(id),
  factory_id          uuid NOT NULL REFERENCES factories(id),
  -- السعر المتفق عليه بالهللة قبل الضريبة (العرض المقبول هو السعر النهائي، الإضافة ٩).
  price_halalas       bigint NOT NULL CHECK (price_halalas > 0),
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'withdrawn', 'closed')),
  cancellation_policy jsonb NOT NULL,
  accepted_by         uuid NOT NULL REFERENCES users(id),
  accepted_at         timestamptz NOT NULL,
  started_at          timestamptz,
  delivered_at        timestamptz,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  withdrawn_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- طلب منفّذ واحد شغّال بس لكل طلب.
CREATE UNIQUE INDEX orders_one_open_per_request ON orders (request_id) WHERE state = 'open';
CREATE INDEX orders_provider_idx ON orders (provider_id, accepted_at DESC);

-- خط زمني لكل طلب: مين سوّى وش ومتى. إضافة فقط مثل audit_log (دليل وقت الخلاف).
CREATE TABLE order_events (
  id         bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES requests(id),
  order_id   uuid REFERENCES orders(id),
  at         timestamptz NOT NULL,
  actor_id   uuid,
  actor_role text NOT NULL,
  event      text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX order_events_request_idx ON order_events (request_id, at);
CREATE TRIGGER order_events_no_update_delete BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER order_events_no_truncate BEFORE TRUNCATE ON order_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- ترشيح الموظف لعرض، وقرار المدير. (خاص بالمصنع، غير موافقات المالك في الإدارة.)
CREATE TABLE approvals_internal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES requests(id),
  offer_id     uuid NOT NULL REFERENCES offers(id),
  nominated_by uuid NOT NULL REFERENCES users(id),
  nominated_at timestamptz NOT NULL,
  decision     text CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'withdrawn')),
  decided_by   uuid REFERENCES users(id),
  decided_at   timestamptz
);
CREATE UNIQUE INDEX approvals_internal_one_open ON approvals_internal (request_id) WHERE decision IS NULL;

-- الحماية من التكرار: لو انضغط الزر مرتين أو رجع الاتصال، نرجّع نفس الرد بدل ما نعيد العملية.
CREATE TABLE idempotency_keys (
  user_id    uuid NOT NULL REFERENCES users(id),
  key        text NOT NULL CHECK (key ~ '^[A-Za-z0-9_-]{8,100}$'),
  route      text NOT NULL,
  status     integer NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
