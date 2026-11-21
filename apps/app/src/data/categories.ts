// الأقسام الستة للواجهة: نفس الأقسام اللي في packages/shared (الخادم يتحقق منها)، مع أيقونة كل قسم.
// أيقونة كل قسم ثابتة حسب جدول الأيقونات في brand/BRAND.md.
import {
  IconFileCertificate,
  IconShieldCheck,
  IconShovel,
  IconSpray,
  IconTool,
  IconTruck,
} from "@/components/icons";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";
import { CATEGORY_DEFS, type CategoryDef, type CategoryId } from "@mazood/shared";

export type { CategoryId };

export type IconComponent = ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number }>;

export type Category = CategoryDef & { icon: IconComponent };

/** أيقونة كل قسم (ثابتة حسب BRAND.md). الأسماء والأنواع من packages/shared. */
const ICONS: Record<CategoryId, IconComponent> = {
  transport: IconTruck,
  maintenance: IconTool,
  materials: IconShovel,
  security: IconShieldCheck,
  cleaning: IconSpray,
  customs: IconFileCertificate,
};

export const CATEGORIES: Category[] = CATEGORY_DEFS.map((c) => ({ ...c, icon: ICONS[c.id] }));

export function categoryById(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`قسم غير معروف: ${id}`);
  return c;
}
