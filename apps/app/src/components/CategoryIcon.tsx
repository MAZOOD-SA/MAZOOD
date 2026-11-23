// أيقونة القسم بلونه: دائرة cat-<id>-soft وفيها الأيقونة بلون cat-<id> (brand/BRAND.md، قسم الأيقونات).
import { View } from "react-native";
import { categoryColorKeys, type Category } from "@/data/categories";
import { useTheme } from "@/theme/ThemeProvider";

export function CategoryIcon({ category, size }: { category: Category; size: number }) {
  const { colors } = useTheme();
  const { fg, soft } = categoryColorKeys(category.id);
  const Icon = category.icon;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[soft], alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={Math.round(size * 0.52)} color={colors[fg]} strokeWidth={1.75} />
    </View>
  );
}
