-- يشتغل مرة وحدة أول ما تنشأ قاعدة التطوير في Docker.
-- ينشئ قاعدة ثانية للاختبارات (pnpm test يمسحها ويعيد بناءها كل مرة، فلا تحط فيها شي مهم).
CREATE DATABASE mazood_test OWNER mazood;
