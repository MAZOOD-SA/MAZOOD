-- المرحلة ٤ (٢): إعدادات المنصة. القيم الافتراضية والتحقق منها في packages/shared/src/settings.ts.
-- صف لكل إعداد. لو ما فيه صف، الخادم يستخدم القيمة الافتراضية. كل تغيير ينكتب في audit_log.
CREATE TABLE settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-zA-Z]{2,60}$'),
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
