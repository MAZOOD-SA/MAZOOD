-- خطة العميل الفرد والسوق (الخطوة أ، قرار المالك 22 نوفمبر 2026):
-- «المصنع» في الكود صار «عميل» له نوعين: منشأة (business) أو فرد (individual).
-- ما غيّرنا اسم الجدول factories عشان ما نكسر شي (المسارات والاختبارات والعلاقات كلها عليه).
-- الشرح في docs/architecture.md والقرار ٤١ في docs/decisions.md.

-- kind فاضي = العميل الجديد ما اختار للحين (شاشة «أنت منشأة أو فرد؟»). الموجودين كلهم منشآت.
ALTER TABLE factories ADD COLUMN kind text CHECK (kind IS NULL OR kind IN ('business', 'individual'));
UPDATE factories SET kind = 'business';

-- بيانات هوية الفرد. رقم الهوية مشفّر (AES-256-GCM، crypto-box.ts) مثل هويات المزوّدين،
-- ونحفظ آخر ٤ أرقام بس للعرض. الاسم الكامل في خانة name نفسها.
ALTER TABLE factories ADD COLUMN id_type text CHECK (id_type IS NULL OR id_type IN ('national_id', 'iqama'));
ALTER TABLE factories ADD COLUMN id_number_enc text;
ALTER TABLE factories ADD COLUMN id_number_last4 text CHECK (id_number_last4 IS NULL OR id_number_last4 ~ '^\d{4}$');

-- التحقق من الهوية خطوة منفصلة (نفاذ لاحقًا، القرار ٤٢). فاضي = «بانتظار التحقق».
ALTER TABLE factories ADD COLUMN identity_verified_at timestamptz;
ALTER TABLE factories ADD COLUMN identity_method text CHECK (identity_method IS NULL OR identity_method IN ('nafath', 'manual'));

-- كل نوع ببياناته بس: المنشأة ما يكون عندها رقم هوية، والفرد ما يكون عنده سجل أو رقم ضريبي.
ALTER TABLE factories ADD CONSTRAINT factories_kind_fields CHECK (
  (kind IS DISTINCT FROM 'business' OR (id_number_enc IS NULL AND id_type IS NULL AND id_number_last4 IS NULL))
  AND (kind IS DISTINCT FROM 'individual' OR (commercial_register IS NULL AND vat_number IS NULL))
);
-- الرقم المشفّر ونوعه وآخر ٤ أرقام يمشون مع بعض.
ALTER TABLE factories ADD CONSTRAINT factories_id_complete CHECK (
  (id_number_enc IS NULL) = (id_type IS NULL) AND (id_number_enc IS NULL) = (id_number_last4 IS NULL)
);
