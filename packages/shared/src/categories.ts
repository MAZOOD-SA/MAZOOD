// الأقسام الستة وأنواعها. الخادم يتحقق إن القسم والنوع من هذي القائمة،
// والتطبيق يعرض نفس الأسماء (ويضيف أيقونة كل قسم من brand/BRAND.md).
// لاحقًا (المرحلة ٦) تنتقل الأقسام لقاعدة البيانات وتتعدل من لوحة الإدارة.

export type Localized = { ar: string; en: string };

export const CATEGORY_IDS = ["transport", "maintenance", "materials", "security", "cleaning", "customs"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type CategoryInfo = {
  id: CategoryId;
  name: Localized;
  hint: Localized;
  types: { id: string; name: Localized }[];
};

export const CATEGORY_INFO: CategoryInfo[] = [
  {
    id: "transport",
    name: { ar: "نقل ومعدات", en: "Transport & equipment" },
    hint: { ar: "سطحات، تريلات، معدات ثقيلة", en: "Flatbeds, trailers, heavy equipment" },
    types: [
      { id: "heavy", name: { ar: "معدات ثقيلة", en: "Heavy equipment" } },
      { id: "flatbed", name: { ar: "سطحة", en: "Flatbed" } },
      { id: "reefer", name: { ar: "تريلا مبردة", en: "Refrigerated trailer" } },
      { id: "freezer", name: { ar: "تريلا مجمدة", en: "Freezer trailer" } },
      { id: "open", name: { ar: "تريلا مكشوفة", en: "Open trailer" } },
    ],
  },
  {
    id: "maintenance",
    name: { ar: "صيانة وحِرف", en: "Maintenance & trades" },
    hint: { ar: "ورش، حدادة، سباكة، مكيفات", en: "Workshops, welding, plumbing, AC" },
    types: [
      { id: "workshop", name: { ar: "ورشة", en: "Workshop" } },
      { id: "smith", name: { ar: "حدادة", en: "Metalwork" } },
      { id: "carpentry", name: { ar: "نجارة", en: "Carpentry" } },
      { id: "plumbing", name: { ar: "سباكة", en: "Plumbing" } },
      { id: "ac", name: { ar: "مكيفات", en: "Air conditioning" } },
    ],
  },
  {
    id: "materials",
    name: { ar: "مواد", en: "Materials" },
    hint: { ar: "رمل دفان", en: "Fill sand" },
    types: [{ id: "sand", name: { ar: "رمل دفان", en: "Fill sand" } }],
  },
  {
    id: "security",
    name: { ar: "أمن وسلامة", en: "Security & safety" },
    hint: { ar: "معدات وحراسات", en: "Equipment and guards" },
    types: [
      { id: "guards", name: { ar: "حراسات أمنية", en: "Security guards" } },
      { id: "equipment", name: { ar: "معدات سلامة", en: "Safety equipment" } },
    ],
  },
  {
    id: "cleaning",
    name: { ar: "نظافة", en: "Cleaning" },
    hint: { ar: "أدوات ومنظفات", en: "Tools and chemicals" },
    types: [
      { id: "tools", name: { ar: "أدوات نظافة", en: "Cleaning tools" } },
      { id: "chemicals", name: { ar: "منظفات كيميائية", en: "Cleaning chemicals" } },
    ],
  },
  {
    id: "customs",
    name: { ar: "تخليص جمركي", en: "Customs clearance" },
    hint: { ar: "استيراد وتصدير", en: "Import and export" },
    types: [
      { id: "import", name: { ar: "استيراد", en: "Import" } },
      { id: "export", name: { ar: "تصدير", en: "Export" } },
    ],
  },
];

export function categoryInfo(id: CategoryId): CategoryInfo {
  const c = CATEGORY_INFO.find((x) => x.id === id);
  if (!c) throw new Error(`قسم غير معروف: ${id}`);
  return c;
}

/** اسم النوع داخل القسم، أو null إذا النوع مو من هذا القسم. */
export function typeName(category: CategoryId, typeId: string): Localized | null {
  return categoryInfo(category).types.find((t) => t.id === typeId)?.name ?? null;
}
