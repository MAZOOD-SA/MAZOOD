// حساب المقاس من العرض (دالة صافية بدون react-native، عشان تنختبر). الاستخدام: useLayout() في layout.ts.
// المقاس الحالي للشاشة (جوال، تابلت، كمبيوتر). كل شاشة تاخذ ترتيبها من هنا، وممنوع أي شاشة
// تكتب عرض بالأرقام بنفسها: الأرقام كلها في brand/tokens.json (breakpoints وlayout).
import { breakpoints, layout, spacing } from "@mazood/brand";

export type LayoutSize = "phone" | "tablet" | "desktop";

export type Layout = {
  size: LayoutSize;
  width: number;
  /** تابلت أو كمبيوتر: قائمة جانبية بدل التبويبات السفلية. */
  sidebar: boolean;
  /** كمبيوتر: الشاشات تنقسم لعمودين (المحتوى، والعمود الجانبي). */
  split: boolean;
  /** أقصى عرض للمحتوى في هذا المقاس. */
  maxWidth: number;
  /** الهامش الجانبي للصفحة. */
  gutter: number;
  /** كم بطاقة في الصف (للمقارنة والشبكات)، حسب أقصى عدد تسمح فيه الشاشة. */
  columns: (max: number) => number;
};

/** دالة صافية (تنختبر بدون شاشة): المقاس من العرض. */
export function layoutFor(width: number): Layout {
  const size: LayoutSize = width >= breakpoints.desktop ? "desktop" : width >= breakpoints.tablet ? "tablet" : "phone";
  const perSize = { phone: 1, tablet: 2, desktop: 3 } as const;
  return {
    size,
    width,
    sidebar: size !== "phone",
    split: size === "desktop",
    maxWidth: size === "desktop" ? layout.pageMax : layout.contentMax,
    gutter: size === "phone" ? spacing["4"] : spacing["8"],
    columns: (max) => Math.max(1, Math.min(max, perSize[size])),
  };
}

