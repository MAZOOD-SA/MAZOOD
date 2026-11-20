// يحوّل brand/tokens.json (المصدر الوحيد للهوية) إلى ملف TypeScript يقرأه التطبيق.
// التشغيل: pnpm tokens
// الناتج: packages/brand/src/tokens.generated.ts — لا تعدّله يدويًا، يُعاد توليده.
//
// القيم في tokens.json ممكن تكون:
//   - لون مباشر: "#0F2A44" أو "transparent"
//   - مرجع لتوكن ثاني: "{navy}"
//   - كائن فيه قيمة لكل وضع: { "light": ..., "dark": ... }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const SOURCE = resolve(repoRoot, "brand/tokens.json");
const OUTPUT = resolve(here, "../src/tokens.generated.ts");

/** "navy-700" → "navy700"، "on-accent-soft" → "onAccentSoft" */
export function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** يحلّ قيم الألوان لوضع معيّن (light أو dark)، ويتبع المراجع {name}. */
export function resolveColors(tokens, theme) {
  const byName = new Map(tokens.map((t) => [t.name, t.value]));
  const resolving = new Set();

  function valueFor(name) {
    if (!byName.has(name)) throw new Error(`توكن غير موجود: ${name}`);
    if (resolving.has(name)) throw new Error(`مرجع دائري عند: ${name}`);
    resolving.add(name);
    let v = byName.get(name);
    if (v && typeof v === "object") v = v[theme] ?? v.light;
    const ref = typeof v === "string" && v.match(/^\{(.+)\}$/);
    const out = ref ? valueFor(ref[1]) : v;
    resolving.delete(name);
    return out;
  }

  return Object.fromEntries(tokens.map((t) => [camel(t.name), valueFor(t.name)]));
}

export function buildTokens(json) {
  const tokens = json.color.tokens;
  const colors = { light: resolveColors(tokens, "light"), dark: resolveColors(tokens, "dark") };

  const px = (s) => Number(String(s).replace("px", ""));
  const spacing = Object.fromEntries(json.spacing.tokens.map((t) => [t.name.replace("space-", ""), px(t.value)]));
  const radius = Object.fromEntries(json.radius.tokens.map((t) => [t.name.replace("radius-", ""), px(t.value)]));
  const typography = {};
  for (const group of json.type.groups) {
    for (const s of group.styles) {
      typography[camel(s.name)] = { fontSize: px(s.fontSize), lineHeight: px(s.lineHeight), fontWeight: s.fontWeight };
    }
  }
  return { colors, spacing, radius, typography };
}

function main() {
  const json = JSON.parse(readFileSync(SOURCE, "utf8"));
  const built = buildTokens(json);
  const banner =
    "// ⚠️ ملف مولّد تلقائيًا من brand/tokens.json بالأمر: pnpm tokens\n" +
    "// لا تعدّله يدويًا. لتغيير الهوية: عدّل brand/tokens.json وbrand/tokens.css ثم شغّل الأمر.\n\n";
  const body = Object.entries(built)
    .map(([k, v]) => `export const ${k} = ${JSON.stringify(v, null, 2)} as const;\n`)
    .join("\n");
  writeFileSync(OUTPUT, banner + body);
  console.log(`✓ tokens → ${OUTPUT.replace(repoRoot + "/", "")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
