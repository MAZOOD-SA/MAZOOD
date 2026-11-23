-- لوحة الإدارة (الخطوة هـ-٢، docs/plans/admin-panel.md): تنفيذ طلب حذف الحساب.
-- الحذف = مسح البيانات الشخصية، والفواتير والسجل والطلبات تبقى بدون الاسم (قرار المالك، 23 نوفمبر 2026،
-- والمدة يأكدها المحامي: البند ٤٤ في docs/legal/brief-for-lawyer.md).

-- المستخدم المحذوف: بدون جوال ولا اسم، وحالته deleted (ما يقدر يدخل).
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'deleted'));
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_phone_unless_deleted CHECK (phone IS NOT NULL OR status = 'deleted');

-- المزوّد المحذوف: اسم صاحبه ورقم هويته ينمسحون. الاسم التجاري يبقى (بيانات منشأة، وتظهر في الفواتير).
ALTER TABLE providers ALTER COLUMN owner_name DROP NOT NULL;
ALTER TABLE providers ALTER COLUMN id_number_enc DROP NOT NULL;
ALTER TABLE providers ALTER COLUMN id_number_last4 DROP NOT NULL;

-- ملف الهوية ينمسح من التخزين، والسطر يبقى مع وقت المسح (عشان السجل يبيّن إنه كان موجود وتوثّق).
ALTER TABLE provider_documents ADD COLUMN purged_at timestamptz;

-- سبب الرفض أو ملاحظة التنفيذ، يشوفها صاحب الطلب في «حسابي».
ALTER TABLE account_deletion_requests ADD COLUMN handled_note text CHECK (handled_note IS NULL OR length(handled_note) <= 500);
