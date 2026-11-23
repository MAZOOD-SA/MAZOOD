-- «يشمل / ما يشمل» في العرض (فكرة ايكيا، docs/plans/ikea-ideas.md المهمة ٥-ب، القرار ٥٧).
-- مثل {"loading":"included","unloading":"excluded"}. البنود لكل قسم في packages/shared/src/offers.ts.
-- NULL: عرض قبل الميزة، أو من نسخة تطبيق قديمة. ما نخترع له قيم.
ALTER TABLE offers ADD COLUMN inclusions jsonb;
-- نسخة العرض القديمة تحفظ بنودها، عشان تعديل العرض ما يمسح وش كان يشمل.
ALTER TABLE offer_revisions ADD COLUMN inclusions jsonb;
