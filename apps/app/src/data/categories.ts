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

export type CategoryId = "transport" | "maintenance" | "materials" | "security" | "cleaning" | "customs" | "pest_control";

export type IconComponent = ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number; fill?: ColorValue }>;

export type Category = {
  id: CategoryId;
  name: Localized;
  hint: Localized;
  icon: IconComponent;
  types: { id: string; name: Localized }[];
};

export const CATEGORIES: Category[] = [
  {
    id: "transport",
    name: { ar: "نقل ومعدات", en: "Transport & equipment" },
    hint: { ar: "سطحات، تريلات، معدات ثقيلة", en: "Flatbeds, trailers, heavy equipment" },
    icon: IconTruck,
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
    icon: IconTool,
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
    icon: IconShovel,
    types: [{ id: "sand", name: { ar: "رمل دفان", en: "Fill sand" } }],
  },
  {
    id: "security",
    name: { ar: "أمن وسلامة", en: "Security & safety" },
    hint: { ar: "معدات وحراسات", en: "Equipment and guards" },
    icon: IconShieldCheck,
    types: [
      { id: "guards", name: { ar: "حراسات أمنية", en: "Security guards" } },
      { id: "equipment", name: { ar: "معدات سلامة", en: "Safety equipment" } },
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
      { id: "insects", name: { ar: "رش حشرات", en: "Insect spraying" } },
      { id: "rodents", name: { ar: "مكافحة قوارض", en: "Rodent control" } },
      { id: "periodic_contract", name: { ar: "عقد رش دوري", en: "Periodic spraying contract" } },
    ],
  },
];

export function categoryById(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`قسم غير معروف: ${id}`);
  return c;
}
