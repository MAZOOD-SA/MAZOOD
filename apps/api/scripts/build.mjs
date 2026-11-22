// بناء الخادم للنشر: يجمع كود الخادم والقواعد المشتركة (packages/shared) في ملف واحد
// dist/server.mjs. المكتبات الخارجية (Fastify وPrisma...) ما تنجمع، تبقى في node_modules.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  plugins: [
    {
      name: "external-node-modules",
      setup(b) {
        // أي مكتبة من node_modules تبقى خارجية، إلا حزمنا (@mazood/*) لأنها TypeScript تحتاج تنجمع.
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@mazood/") ? undefined : { path: args.path, external: true }));
      },
    },
  ],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
