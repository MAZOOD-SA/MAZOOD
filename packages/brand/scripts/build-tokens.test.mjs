// اختبارات الهوية: تتأكد إن التحويل صحيح، وإن tokens.json وtokens.css متطابقين.
// لأن الموقع ممكن يقرأ CSS والتطبيق يقرأ JSON، ولازم الاثنين يعطون نفس الألوان.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokens, camel, resolveColors } from "./build-tokens.mjs";

const root = resolve(import.meta.dirname, "../../..");
const json = JSON.parse(readFileSync(resolve(root, "brand/tokens.json"), "utf8"));
const css = readFileSync(resolve(root, "brand/tokens.css"), "utf8");

/** يقرأ متغيرات CSS من أول كتلة تطابق المحدد. */
function cssVars(selectorStart) {
  const start = css.indexOf(selectorStart);
  const block = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const lightCss = cssVars(':root, [data-theme="light"]');
const darkCss = { ...lightCss, ...cssVars('[data-theme="dark"]') };

function resolveCss(vars, name) {
  const v = vars[name];
  const ref = v?.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolveCss(vars, ref[1]) : v;
}

describe("brand tokens", () => {
  it("يحوّل الأسماء لـ camelCase", () => {
    expect(camel("on-accent-soft")).toBe("onAccentSoft");
    expect(camel("navy-700")).toBe("navy700");
  });

  it("يتبع المراجع ويختار قيمة كل وضع", () => {
    const tokens = [
      { name: "a", value: "#000000" },
      { name: "b", value: { light: "{a}", dark: "#111111" } },
    ];
    expect(resolveColors(tokens, "light").b).toBe("#000000");
    expect(resolveColors(tokens, "dark").b).toBe("#111111");
  });

  it("يرفض المراجع الدائرية", () => {
    const tokens = [
      { name: "a", value: "{b}" },
      { name: "b", value: "{a}" },
    ];
    expect(() => resolveColors(tokens, "light")).toThrow();
  });

  for (const theme of ["light", "dark"]) {
    it(`tokens.json وtokens.css متطابقين في الوضع ${theme}`, () => {
      const built = buildTokens(json).colors[theme];
      const vars = theme === "light" ? lightCss : darkCss;
      for (const t of json.color.tokens) {
        const fromCss = resolveCss(vars, t.name);
        expect(fromCss, `--${t.name} ناقص في tokens.css`).toBeDefined();
        expect(built[camel(t.name)].toLowerCase(), `--${t.name} (${theme})`).toBe(fromCss.toLowerCase());
      }
    });
  }

  it("الزر الرئيسي في الداكن مو كهرماني مليان (زر accent واحد بكل شاشة)", () => {
    const dark = buildTokens(json).colors.dark;
    expect(dark.btnPrimaryBg).not.toBe(dark.accent);
  });
});
