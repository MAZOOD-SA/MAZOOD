// نقطة الدخول للهوية. التطبيق يقرأ الألوان والمسافات والخطوط من هنا فقط.
import { colors, layout, motion, radius, spacing, typography } from "./tokens.generated";

export { colors, layout, motion, radius, spacing, typography };

export type ThemeName = keyof typeof colors;
export type ColorName = keyof (typeof colors)["light"];
export type Palette = Record<ColorName, string>;
export type TypographyName = keyof typeof typography;

/**
 * أسماء ملفات خط IBM Plex Sans Arabic لكل وزن.
 * في التطبيق ما ينفع نكتب fontWeight مع خط مخصص، فلكل وزن ملف خط مستقل.
 */
export const fontFamilyByWeight = {
  400: "IBMPlexSansArabic_400Regular",
  500: "IBMPlexSansArabic_500Medium",
  600: "IBMPlexSansArabic_600SemiBold",
  700: "IBMPlexSansArabic_700Bold",
} as const;

export type FontWeight = keyof typeof fontFamilyByWeight;
