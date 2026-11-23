// الأقسام السبعة. أيقونة كل قسم ثابتة حسب جدول الأيقونات في brand/BRAND.md.
// لاحقًا (المرحلة 6) تنتقل الأقسام لقاعدة البيانات وتتعدل من لوحة الإدارة.
import {
  IconBug,
  IconFileCertificate,
  IconShieldCheck,
  IconShovel,
  IconSpray,
  IconTool,
  IconTruck,
} from "@/components/icons";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";
import type { Localized } from "@/i18n/I18nProvider";
import type { SearchEntry } from "@/lib/search";

export type CategoryId = "transport" | "maintenance" | "materials" | "security" | "cleaning" | "customs" | "pest_control";

export type IconComponent = ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number; fill?: ColorValue }>;

export type Category = {
  id: CategoryId;
  name: Localized;
  hint: Localized;
  icon: IconComponent;
  /**
   * hint: سطر قصير تحت اسم النوع في رفع الطلب (اختياري).
   * keywords: كلمات الناس العادية للبحث «وش تحتاج؟» (مثل «ونش»)، عربي وإنجليزي. نزيدها مع الوقت.
   */
  types: { id: string; name: Localized; hint?: Localized; keywords?: string[] }[];
  /** كلمات بحث للقسم كله. */
  keywords?: string[];
};

export const CATEGORIES: Category[] = [
  {
    id: "transport",
    name: { ar: "نقل ومعدات", en: "Transport & equipment" },
    hint: { ar: "سطحات، تريلات، معدات ثقيلة", en: "Flatbeds, trailers, heavy equipment" },
    icon: IconTruck,
    types: [
      { id: "heavy", name: { ar: "معدات ثقيلة", en: "Heavy equipment" }, hint: { ar: "رافعة، شيول، بوكلين", en: "Crane, loader, excavator" }, keywords: ["ونش", "كرين", "رافعه", "شيول", "بوكلين", "حفار", "crane", "loader", "excavator", "forklift", "رافعة شوكية"] },
      { id: "flatbed", name: { ar: "سطحة", en: "Flatbed" }, hint: { ar: "نقل معدات وبضاعة على سطح مكشوف", en: "Equipment and goods on an open deck" }, keywords: ["سطحه", "سطحات", "دينا", "truck"] },
      { id: "reefer", name: { ar: "تريلا مبردة", en: "Refrigerated trailer" }, hint: { ar: "بضاعة تحتاج تبريد", en: "Chilled goods" }, keywords: ["تريله", "ثلاجه", "تبريد", "reefer"] },
      { id: "freezer", name: { ar: "تريلا مجمدة", en: "Freezer trailer" }, hint: { ar: "بضاعة مجمدة", en: "Frozen goods" }, keywords: ["تريله", "فريزر", "تجميد", "frozen"] },
      { id: "open", name: { ar: "تريلا مكشوفة", en: "Open trailer" }, hint: { ar: "حمولات كبيرة بدون غطاء", en: "Large uncovered loads" }, keywords: ["تريله", "trailer"] },
    ],
  },
  {
    id: "maintenance",
    name: { ar: "صيانة وحِرف", en: "Maintenance & trades" },
    hint: { ar: "ورش، حدادة، سباكة، مكيفات", en: "Workshops, welding, plumbing, AC" },
    icon: IconTool,
    types: [
      { id: "workshop", name: { ar: "ورشة", en: "Workshop" } },
      { id: "smith", name: { ar: "حدادة", en: "Metalwork" }, keywords: ["حداد", "لحام", "welding"] },
      { id: "carpentry", name: { ar: "نجارة", en: "Carpentry" }, keywords: ["نجار", "خشب"] },
      { id: "plumbing", name: { ar: "سباكة", en: "Plumbing" }, keywords: ["سباك", "تسريب", "مويه", "plumber"] },
      { id: "ac", name: { ar: "مكيفات", en: "Air conditioning" }, keywords: ["مكيف", "تكييف", "تبريد", "ac"] },
    ],
  },
  {
    id: "materials",
    name: { ar: "مواد", en: "Materials" },
    hint: { ar: "رمل دفان", en: "Fill sand" },
    icon: IconShovel,
    types: [{ id: "sand", name: { ar: "رمل دفان", en: "Fill sand" }, keywords: ["رمل", "دفان", "تراب", "sand"] }],
  },
  {
    id: "security",
    name: { ar: "أمن وسلامة", en: "Security & safety" },
    hint: { ar: "معدات وحراسات", en: "Equipment and guards" },
    icon: IconShieldCheck,
    types: [
      { id: "guards", name: { ar: "حراسات أمنية", en: "Security guards" }, keywords: ["حارس", "حراسه", "امن", "guard"] },
      { id: "equipment", name: { ar: "معدات سلامة", en: "Safety equipment" }, keywords: ["طفايه", "طفايات", "خوذ", "سلامه", "extinguisher"] },
    ],
  },
  {
    id: "cleaning",
    name: { ar: "نظافة", en: "Cleaning" },
    hint: { ar: "أدوات ومنظفات", en: "Tools and chemicals" },
    icon: IconSpray,
    types: [
      { id: "tools", name: { ar: "أدوات نظافة", en: "Cleaning tools" } },
      { id: "chemicals", name: { ar: "منظفات كيميائية", en: "Cleaning chemicals" } },
    ],
  },
  {
    id: "customs",
    name: { ar: "تخليص جمركي", en: "Customs clearance" },
    hint: { ar: "استيراد وتصدير", en: "Import and export" },
    icon: IconFileCertificate,
    types: [
      { id: "import", name: { ar: "استيراد", en: "Import" } },
      { id: "export", name: { ar: "تصدير", en: "Export" } },
    ],
  },
  {
    id: "pest_control",
    name: { ar: "مكافحة الحشرات والقوارض", en: "Pest control" },
    hint: { ar: "رش حشرات، فيران، عقود دورية", en: "Insects, rodents, periodic contracts" },
    icon: IconBug,
    types: [
      { id: "insects", name: { ar: "رش حشرات", en: "Insect spraying" }, keywords: ["رش", "حشرات", "صراصير", "نمل", "بق"] },
      { id: "rodents", name: { ar: "مكافحة قوارض", en: "Rodent control" }, keywords: ["فيران", "فار", "جرذان", "قوارض"] },
      { id: "periodic_contract", name: { ar: "عقد رش دوري", en: "Periodic spraying contract" }, hint: { ar: "زيارات رش على مدار السنة", en: "Scheduled visits through the year" }, keywords: ["عقد", "دوري", "شهري"] },
    ],
  },
];

export function categoryById(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`قسم غير معروف: ${id}`);
  return c;
}

/** مدخلات بحث «وش تحتاج؟»: كل قسم، وكل نوع فيه، بأسمائه باللغتين وكلماته البديلة. */
export function searchEntries(): SearchEntry[] {
  return CATEGORIES.flatMap((c) => [
    { categoryId: c.id, typeId: null, terms: [c.name.ar, c.name.en, c.hint.ar, c.hint.en, ...(c.keywords ?? [])] },
    ...c.types.map((t) => ({ categoryId: c.id, typeId: t.id, terms: [t.name.ar, t.name.en, ...(t.keywords ?? [])] })),
  ]);
}
