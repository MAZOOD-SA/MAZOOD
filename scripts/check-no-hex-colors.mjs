// فحص قاعدة «لا تكتب أي لون مباشرة في الكود» من CLAUDE.md.
// يمر على كود التطبيق والحزم، ويفشل إذا لقى لون hex أو rgb()/hsl() مكتوب مباشرة.
// المسموح: ملفات brand/ (هي المصدر) والملف المولّد منها.
// التشغيل: pnpm check:colors
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SCAN = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "build", "ios", "android", "web-build", "coverage", "generated"]);
// أدوات الهوية نفسها (تقرأ الألوان من brand/ وتحوّلها) مسموح لها.
const ALLOWED_FILES = new Set(["packages/brand/src/tokens.generated.ts"]);
const ALLOWED_DIRS = ["packages/brand/scripts/"];
const EXT = /\.(tsx?|jsx?|mjs|css)$/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\s*\(/;

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    const rel = relative(root, full);
    if (!EXT.test(name) || ALLOWED_FILES.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d))) continue;
    readFileSync(full, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (COLOR.test(line)) problems.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
  }
}
for (const d of SCAN) walk(join(root, d));

if (problems.length) {
  console.error("✗ لقينا ألوان مكتوبة مباشرة. استخدم ألوان الثيم (useTheme().colors) بدلها:\n");
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("✓ ما فيه أي لون مكتوب مباشرة في الكود");
