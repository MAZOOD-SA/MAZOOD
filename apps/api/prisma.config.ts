// إعداد Prisma (أداة قاعدة البيانات). عنوان القاعدة يجي من متغير البيئة DATABASE_URL.
// على جهاز المبرمج: إذا المتغير مو محدد، نقرأه من apps/api/.env.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // قيمة وهمية وقت «prisma generate» بس (ما يتصل بشي). الأوامر اللي تتصل تحتاج DATABASE_URL حقيقي.
    url: process.env.DATABASE_URL ?? "postgresql://unset@localhost:5432/unset",
  },
});
