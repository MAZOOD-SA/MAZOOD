// المقاس الحالي للشاشة (جوال، تابلت، كمبيوتر). كل شاشة تاخذ ترتيبها من هنا، وممنوع أي شاشة
// تكتب عرض بالأرقام بنفسها: الأرقام كلها في brand/tokens.json (breakpoints وlayout).
import { useWindowDimensions } from "react-native";
import { layoutFor, type Layout } from "./layout-size";

export { layoutFor, type Layout, type LayoutSize } from "./layout-size";

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  return layoutFor(width);
}
