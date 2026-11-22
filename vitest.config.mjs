import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// الاختبارات اللي تشتغل بالأمر: pnpm test
export default defineConfig({
  resolve: {
    alias: [
      // أيقونات Tabler تشتغل بس داخل Metro، فنبدلها بقطعة فاضية في الاختبارات.
      { find: /^@tabler\/icons-react-native\/icons\/.*$/, replacement: resolve(import.meta.dirname, "apps/app/src/test/icon-stub.ts") },
      { find: "@", replacement: resolve(import.meta.dirname, "apps/app/src") },
    ],
  },
  test: {
    include: ["packages/**/*.test.{mjs,ts}", "apps/app/src/**/*.test.ts", "apps/api/src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
