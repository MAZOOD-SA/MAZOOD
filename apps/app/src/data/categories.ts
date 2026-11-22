// الأقسام الستة في الواجهة: الأسماء والأنواع من packages/shared (نفس اللي يتحقق منها الخادم)،
// وهنا نضيف أيقونة كل قسم. الأيقونة ثابتة حسب جدول الأيقونات في brand/BRAND.md.
import { CATEGORY_INFO, typeName, type CategoryId, type CategoryInfo, type Localized } from "@mazood/shared";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";
import {
  IconFileCertificate,
  IconShieldCheck,
  IconShovel,
  IconSpray,
  IconTool,
  IconTruck,
} from "@/components/icons";

export type { CategoryId };

export type IconComponent = ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number }>;

export type Category = CategoryInfo & { icon: IconComponent };

const ICONS: Record<CategoryId, IconComponent> = {
  transport: IconTruck,
  maintenance: IconTool,
  materials: IconShovel,
  security: IconShieldCheck,
  cleaning: IconSpray,
  customs: IconFileCertificate,
};

export const CATEGORIES: Category[] = CATEGORY_INFO.map((c) => ({ ...c, icon: ICONS[c.id] }));

export function categoryById(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`قسم غير معروف: ${id}`);
  return c;
}

/** عنوان الطلب في الواجهة = اسم النوع (مثل «سطحة»)، أو اسم القسم لو النوع مو معروف. */
export function requestTitle(r: { category: CategoryId; typeId: string }): Localized {
  return typeName(r.category, r.typeId) ?? categoryById(r.category).name;
}
