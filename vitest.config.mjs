import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// الاختبارات اللي تشتغل بالأمر: pnpm test
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "apps/app/src") } },
  test: {
    include: ["packages/**/*.test.{mjs,ts}", "apps/app/src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
