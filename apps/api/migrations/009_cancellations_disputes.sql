-- المرحلة ٤ (٨): الإلغاء بعد القبول وبعد البدء، واعتذار المزوّد، والبلاغ (نسخة أولى).

-- كل إلغاء أو اعتذار بعد القبول ينحفظ هنا، مع رسومه محسوبة من السياسة المحفوظة مع الطلب وقت القبول
-- (cancellationFee في packages/shared/src/cancellation.ts). الرسوم صفر الحين، والتحصيل في المرحلة ٥.
-- kind:
--   before_start         المصنع ألغى بعد القبول وقبل البدء (مباشرة، بدون موافقة المزوّد)
--   after_start          المصنع «طلب الإلغاء» بعد البدء، وينتظر رد المزوّد خلال المهلة
--   provider_withdrawal  المزوّد اعتذر بعد قبول عرضه وقبل البدء (ينحسب في ملفه، وتشوفه الإدارة)
-- status:
--   done       تم (الإلغاء المباشر والاعتذار)
--   pending    طلب إلغاء ينتظر رد المزوّد
--   agreed     المزوّد وافق، فانلغى الطلب
--   declined   المزوّد رفض، فانفتح بلاغ
--   timed_out  المزوّد ما رد في المهلة، فانفتح بلاغ
--   withdrawn  المصنع سحب طلب الإلغاء (أو فتح بلاغ بنفسه بداله)
CREATE TABLE cancellations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES requests(id),
  order_id               uuid NOT NULL REFERENCES orders(id),
  kind                   text NOT NULL CHECK (kind IN ('before_start', 'after_start', 'provider_withdrawal')),
  status                 text NOT NULL CHECK (status IN ('done', 'pending', 'agreed', 'declined', 'timed_out', 'withdrawn')),
  reason                 text,
  requested_by           uuid NOT NULL REFERENCES users(id),
  requested_at           timestamptz NOT NULL,
  -- طلب الإلغاء بعد البدء: آخر موعد لرد المزوّد (ينحسب من السياسة المحفوظة وينحفظ، فما يتغيّر بعدين).
  respond_by             timestamptz,
  responded_by           uuid REFERENCES users(id),
  responded_at           timestamptz,
  response_note          text,
  -- الرسوم بالهللة وتوزيعها (المجموع = fee_halalas). payer: مين يدفع.
  payer                  text NOT NULL CHECK (payer IN ('factory', 'provider')),
  fee_halalas            bigint NOT NULL DEFAULT 0 CHECK (fee_halalas >= 0),
  fee_to_provider        bigint NOT NULL DEFAULT 0 CHECK (fee_to_provider >= 0),
  fee_to_factory         bigint NOT NULL DEFAULT 0 CHECK (fee_to_factory >= 0),
  fee_to_platform        bigint NOT NULL DEFAULT 0 CHECK (fee_to_platform >= 0),
  CHECK (fee_to_provider + fee_to_factory + fee_to_platform = fee_halalas),
  CHECK (kind <> 'after_start' OR respond_by IS NOT NULL)
);
-- طلب إلغاء واحد ينتظر بالكثير لكل طلب منفّذ.
CREATE UNIQUE INDEX cancellations_one_pending ON cancellations (order_id) WHERE status = 'pending';
CREATE INDEX cancellations_due_idx ON cancellations (respond_by) WHERE status = 'pending';
CREATE INDEX cancellations_request_idx ON cancellations (request_id, requested_at);
-- اعتذارات المزوّد (لملفه في لوحة الإدارة).
CREATE INDEX cancellations_withdrawals_idx ON cancellations (order_id) WHERE kind = 'provider_withdrawal';

-- البلاغ: يوصل لخدمة العملاء. number: رقم قصير يشوفه المصنع («رقم البلاغ ١٢٣»).
-- opened_by_role: factory أو provider أو system (طلب إلغاء رُفض أو ما انرد عليه).
-- resolution: قرار خدمة العملاء (complete: يكتمل، cancel: ينلغي، resume: يرجع للتنفيذ).
CREATE TABLE disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          bigserial UNIQUE,
  request_id      uuid NOT NULL REFERENCES requests(id),
  order_id        uuid NOT NULL REFERENCES orders(id),
  cancellation_id uuid REFERENCES cancellations(id),
  opened_by_role  text NOT NULL CHECK (opened_by_role IN ('factory', 'provider', 'system')),
  opened_by       uuid REFERENCES users(id),
  reason          text NOT NULL CHECK (reason IN ('quality', 'not_delivered', 'delay', 'price', 'conduct', 'other',
                                                  'cancellation_declined', 'cancellation_no_response')),
  details         text,
  -- حالة الطلب لحظة فتح البلاغ (in_progress أو delivered)، عشان قرار «يرجع للتنفيذ» يكون واضح.
  status_before   text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at       timestamptz NOT NULL,
  resolution      text CHECK (resolution IS NULL OR resolution IN ('complete', 'cancel', 'resume')),
  closed_by       uuid REFERENCES users(id),
  closed_at       timestamptz,
  CHECK ((status = 'open') = (resolution IS NULL))
);
-- بلاغ مفتوح واحد بالكثير لكل طلب منفّذ.
CREATE UNIQUE INDEX disputes_one_open ON disputes (order_id) WHERE status = 'open';
CREATE INDEX disputes_open_idx ON disputes (opened_at) WHERE status = 'open';

-- ملاحظات البلاغ: من المصنع أو المزوّد أو خدمة العملاء. internal = ملاحظة داخلية للإدارة بس.
-- المصنع والمزوّد يشوفون ملاحظاتهم وملاحظات خدمة العملاء غير الداخلية، وما يشوفون ملاحظات بعض.
-- إضافة فقط (دليل وقت الخلاف).
CREATE TABLE dispute_notes (
  id          bigserial PRIMARY KEY,
  dispute_id  uuid NOT NULL REFERENCES disputes(id),
  author_id   uuid NOT NULL REFERENCES users(id),
  author_role text NOT NULL CHECK (author_role IN ('factory', 'provider', 'staff')),
  body        text NOT NULL,
  internal    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL,
  CHECK (NOT internal OR author_role = 'staff')
);
CREATE INDEX dispute_notes_idx ON dispute_notes (dispute_id, created_at);
CREATE TRIGGER dispute_notes_no_update_delete BEFORE UPDATE OR DELETE ON dispute_notes
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER dispute_notes_no_truncate BEFORE TRUNCATE ON dispute_notes
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- سياسة الإلغاء بالشكل القديم ({ responseHours, feeHalalas }) تترقّى للشكل الجديد. الكود يقرأ الشكلين
-- (upgradeCancellationPolicy)، وهذا بس عشان البيانات تكون بشكل واحد.
UPDATE orders SET cancellation_policy = jsonb_build_object(
    'responseHours', cancellation_policy->'responseHours',
    'graceMinutesAfterAccept', 0,
    'factory', jsonb_build_object(
      'afterAccept', '{"fixedHalalas":0,"percentBps":0,"minHalalas":0,"maxHalalas":null}'::jsonb,
      'afterStart', jsonb_build_object('fixedHalalas', COALESCE(cancellation_policy->'feeHalalas', '0'::jsonb),
                                       'percentBps', 0, 'minHalalas', 0, 'maxHalalas', NULL)),
    'providerShareBps', 10000,
    'provider', jsonb_build_object(
      'afterAccept', '{"fixedHalalas":0,"percentBps":0,"minHalalas":0,"maxHalalas":null}'::jsonb,
      'toFactoryBps', 0))
  WHERE cancellation_policy ? 'feeHalalas' AND NOT cancellation_policy ? 'factory';

-- الإعداد المحفوظ بالقيمة القديمة الافتراضية ينشال، فيرجع للافتراضي الجديد (كل الرسوم صفر).
-- أي قيمة قديمة ثانية تبقى، والكود يرقّيها وقت القراءة.
DELETE FROM settings WHERE key = 'cancellation' AND value = '{"responseHours":24,"feeHalalas":0}'::jsonb;

-- قرار خدمة العملاء في البلاغ («يكتمل») يسجّل إن الاكتمال كان بقرار الإدارة.
ALTER TABLE orders DROP CONSTRAINT orders_confirmed_by_check;
ALTER TABLE orders ADD CONSTRAINT orders_confirmed_by_check CHECK (confirmed_by IS NULL OR confirmed_by IN ('factory', 'system', 'staff'));
