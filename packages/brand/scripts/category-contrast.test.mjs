// ألوان الأقسام: لكل قسم لون للأيقونة (cat-<id>) ولون لدائرتها (cat-<id>-soft)، بالفاتح والداكن.
// الاختبار يتأكد إن كل قسم له التوكنين، وإن الأيقونة تبان (تباين ٣:١ أو أكثر) على دائرتها وعلى خلفية الصفحة.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { camel, resolveColors } from "./build-tokens.mjs";

const root = resolve(import.meta.dirname, "../../..");
const json = JSON.parse(readFileSync(resolve(root, "brand/tokens.json"), "utf8"));

// نفس قيم CategoryId في packages/shared. لو انضاف قسم، أضفه هنا ومعه توكنيه.
const CATEGORY_IDS = ["transport", "maintenance", "materials", "security", "cleaning", "customs", "pest_control"];

/** الإضاءة النسبية حسب WCAG 2.x */
function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("ألوان الأقسام", () => {
  for (const theme of ["light", "dark"]) {
    const colors = resolveColors(json.color.tokens, theme);
    for (const id of CATEGORY_IDS) {
      it(`${id} (${theme}): التوكنين موجودين والتباين ٣ أو أكثر`, () => {
        const fg = colors[camel(`cat-${id}`)];
        const soft = colors[camel(`cat-${id}-soft`)];
        if (!fg) throw new Error(`توكن غير موجود: cat-${id}`);
        if (!soft) throw new Error(`توكن غير موجود: cat-${id}-soft`);
        expect(contrast(fg, soft)).toBeGreaterThanOrEqual(3);
        expect(contrast(fg, colors.surface)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("خلفية رأس الرئيسية", () => {
  for (const theme of ["light", "dark"]) {
    it(`hero-surface (${theme}): النص الأساسي والثانوي يقرى عليها (٤٫٥ أو أكثر)`, () => {
      const colors = resolveColors(json.color.tokens, theme);
      if (!colors.heroSurface) throw new Error("توكن غير موجود: hero-surface");
      expect(contrast(colors.ink, colors.heroSurface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.inkMuted, colors.heroSurface)).toBeGreaterThanOrEqual(4.5);
      expect(colors.heroSurface).not.toBe(colors.surface);
    });
  }
});
