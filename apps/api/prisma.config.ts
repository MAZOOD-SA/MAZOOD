// إعداد Prisma (أداة قاعدة البيانات). عنوان قاعدة البيانات يجي من المتغير DATABASE_URL،
// ويُقرأ من ملف .env على جهاز المبرمج (الملف هذا ما يدخل المستودع أبدًا).
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // «prisma generate» وقت البناء ما يحتاج قاعدة بيانات، فنسمح بقيمة فاضية هنا.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
