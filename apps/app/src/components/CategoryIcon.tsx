// أيقونة القسم: بلون النص، بدون دائرة ملوّنة (brand/BRAND.md، قسم الأيقونات، قرار ٢٣ نوفمبر ٢٠٢٦).
// size هو مساحة الأيقونة في التخطيط، والرسم نفسه أصغر شوي عشان يتوازن مع النص جنبه.
import { View } from "react-native";
import type { Category } from "@/data/categories";
import { useTheme } from "@/theme/ThemeProvider";

export function CategoryIcon({ category, size, muted }: { category: Category; size: number; muted?: boolean }) {
  const { colors } = useTheme();
  const Icon = category.icon;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <Icon size={Math.round(size * 0.7)} color={muted ? colors.inkMuted : colors.ink} strokeWidth={1.75} />
    </View>
  );
}
