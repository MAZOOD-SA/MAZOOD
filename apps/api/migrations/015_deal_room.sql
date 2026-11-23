-- غرفة الصفقة (القرار ٣٥ والقرار ٥٠، الخطة docs/plans/deal-room.md).
-- محادثة لكل طلب منفّذ (order) بين العميل والمزوّد بعد القبول.
--  * النص مشفّر (AES-256-GCM بالمفتاح DATA_ENCRYPTION_KEY، crypto-box.ts): لو تسرّبت القاعدة، المحادثات ما تنقرأ.
--  * إضافة فقط: ما تتعدّل ولا تنحذف (نفس حماية audit_log)، عشان تكون دليل وقت النزاع.
--  * أسطر النظام (بدأ التنفيذ، تم، بلاغ...) ما تنحفظ هنا: تنقرأ من order_events.
CREATE TABLE order_messages (
  seq         bigserial PRIMARY KEY,
  id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id),
  sender_id   uuid NOT NULL REFERENCES users(id),
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'provider')),
  body_enc    text NOT NULL,
  created_at  timestamptz NOT NULL
);
CREATE INDEX order_messages_order_idx ON order_messages (order_id, seq);
CREATE TRIGGER order_messages_no_update_delete BEFORE UPDATE OR DELETE ON order_messages
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER order_messages_no_truncate BEFORE TRUNCATE ON order_messages
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- آخر رسالة قرأها كل مستخدم في كل محادثة (لرقم «غير مقروء»، ولمعرفة مين فاتح المحادثة الحين).
CREATE TABLE order_message_reads (
  order_id   uuid NOT NULL REFERENCES orders(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  last_seq   bigint NOT NULL DEFAULT 0,
  read_at    timestamptz NOT NULL,
  PRIMARY KEY (order_id, user_id)
);
