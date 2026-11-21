import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// الاختبارات اللي تشتغل بالأمر: pnpm test
// - unit: الهوية، والتنسيق، والمبالغ، ومنطق الواجهة، وقواعد التحقق المشتركة. ما تحتاج شي.
// - api: الخادم كامل على قاعدة بيانات اختبار حقيقية (PostgreSQL). تحتاج: docker compose up -d db
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { "@": resolve(import.meta.dirname, "apps/app/src") } },
        test: {
          name: "unit",
          include: ["packages/**/*.test.{mjs,ts}", "apps/app/src/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
      {
        test: {
          name: "api",
          root: resolve(import.meta.dirname, "apps/api"),
          include: ["test/**/*.test.ts"],
          globalSetup: ["test/global-setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
