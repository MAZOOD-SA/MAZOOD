-- ═══════════════════════════════════════════════════════════════════════
-- طبقة الحماية الثانية: «أمان على مستوى الصف» (Row Level Security)
-- القرار ١٥ في docs/decisions.md، والشرح في apps/api/src/scope.ts.
--
-- القاعدة: إذا المعاملة محددة بمصنع (app.factory_id)، قاعدة البيانات ما ترجع ولا تعدّل
-- إلا صفوف هذا المصنع، حتى لو الاستعلام نفسه ما فيه فلترة.
-- وإذا ما فيه تحديد (مهام النظام، والدخول، ووضع التجربة، ولوحة الإدارة لاحقًا) تشتغل عادي.
--
-- FORCE: الخادم يتصل بنفس المستخدم اللي يملك الجداول، وبدون FORCE المالك يتجاوز السياسات.
-- ملاحظة للنشر: مستخدم قاعدة البيانات للخادم لازم ما يكون superuser (هذا يتجاوز RLS دائمًا).
-- ═══════════════════════════════════════════════════════════════════════

-- يرجع رقم المصنع المحدد للمعاملة، أو NULL إذا ما فيه تحديد.
-- (بعد أول استخدام في الاتصال، القيمة ترجع '' بدل NULL، فنعاملها نفس الشي.)
CREATE FUNCTION app_current_factory() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.factory_id', true), '')::uuid
  $$;

-- الطلبات
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY requests_factory_isolation ON "requests"
  USING (app_current_factory() IS NULL OR "factory_id" = app_current_factory())
  WITH CHECK (app_current_factory() IS NULL OR "factory_id" = app_current_factory());

-- العروض: تتبع الطلب
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY offers_factory_isolation ON "offers"
  USING (
    app_current_factory() IS NULL
    OR EXISTS (SELECT 1 FROM "requests" r WHERE r."id" = "offers"."request_id" AND r."factory_id" = app_current_factory())
  )
  WITH CHECK (
    app_current_factory() IS NULL
    OR EXISTS (SELECT 1 FROM "requests" r WHERE r."id" = "offers"."request_id" AND r."factory_id" = app_current_factory())
  );

-- المصانع
ALTER TABLE "factories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "factories" FORCE ROW LEVEL SECURITY;
CREATE POLICY factories_isolation ON "factories"
  USING (app_current_factory() IS NULL OR "id" = app_current_factory())
  WITH CHECK (app_current_factory() IS NULL OR "id" = app_current_factory());

-- أعضاء المصانع
ALTER TABLE "factory_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "factory_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY factory_members_isolation ON "factory_members"
  USING (app_current_factory() IS NULL OR "factory_id" = app_current_factory())
  WITH CHECK (app_current_factory() IS NULL OR "factory_id" = app_current_factory());
