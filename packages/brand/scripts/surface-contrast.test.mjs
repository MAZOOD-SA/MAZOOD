// فحوص ألوان الأسطح: الرأس والبطاقات المرفوعة تقرى عليها، وما فيه ألوان أقسام (cat-*).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveColors } from "./build-tokens.mjs";

const root = resolve(import.meta.dirname, "../../..");
const json = JSON.parse(readFileSync(resolve(root, "brand/tokens.json"), "utf8"));

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

describe("أيقونات الأقسام بلون واحد", () => {
  // قرار ٢٣ نوفمبر ٢٠٢٦: شلنا ألوان الأقسام السبعة (كانت تخلّي الواجهة تبان جاهزة ومكررة).
  // الأيقونة بلون النص (ink)، ولون القسم ما يرجع إلا بقرار جديد من المالك.
  it("ما فيه توكنات cat-*", () => {
    expect(json.color.tokens.filter((t) => t.name.startsWith("cat-")).map((t) => t.name)).toEqual([]);
  });
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

describe("البطاقات المرفوعة (surface-raised)", () => {
  for (const theme of ["light", "dark"]) {
    it(`surface-raised (${theme}): النص والأيقونات تقرى عليها`, () => {
      const colors = resolveColors(json.color.tokens, theme);
      if (!colors.surfaceRaised) throw new Error("توكن غير موجود: surface-raised");
      expect(contrast(colors.ink, colors.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.inkMuted, colors.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("في الداكن البطاقة أفتح من الصفحة، والرأس أفتح من البطاقة (طبقات واضحة)", () => {
    const d = resolveColors(json.color.tokens, "dark");
    expect(luminance(d.surfaceRaised)).toBeGreaterThan(luminance(d.surface));
    expect(luminance(d.heroSurface)).toBeGreaterThan(luminance(d.surfaceRaised));
  });
});
