// الأقسام السبعة وأنواعها (المعرّفات فقط). الأسماء والأيقونات في الواجهة.
// الخادم يتحقق من أن النوع يتبع القسم. في المرحلة ٦ تنتقل الأقسام لقاعدة البيانات وتتعدل من لوحة الإدارة.
export const CATEGORY_TYPES = {
  transport: ["heavy", "flatbed", "reefer", "freezer", "open"],
  maintenance: ["workshop", "smith", "carpentry", "plumbing", "ac"],
  materials: ["sand"],
  security: ["guards", "equipment"],
  cleaning: ["tools", "chemicals"],
  customs: ["import", "export"],
  // أضافه المالك في ٢١ نوفمبر ٢٠٢٦. الأنواع مقترحة في docs/plans/phase-4.md.
  pest_control: ["insects", "rodents", "periodic_contract"],
} as const;

export type CategoryId = keyof typeof CATEGORY_TYPES;
export const CATEGORY_IDS = Object.keys(CATEGORY_TYPES) as CategoryId[];

export function isValidCategoryType(category: string, typeId: string): boolean {
  const types = (CATEGORY_TYPES as Record<string, readonly string[]>)[category];
  return !!types && types.includes(typeId);
}

/** معرّف المدينة (مثل sudair). الأسماء في جدول cities بقاعدة البيانات. */
export const CITY_ID_PATTERN = /^[a-z][a-z_]{1,39}$/;
