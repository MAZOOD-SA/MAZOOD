// الدالة الوحيدة اللي تعرف منها أي شاشة مقاسها. ممنوع أي شاشة تكتب حدود العرض بالأرقام بنفسها.
import { useWindowDimensions } from "react-native";
import { deviceSizeFor, type DeviceSize } from "./device-size";

export type Layout = {
  size: DeviceSize;
  width: number;
  /** جوال: تبويبات تحت. */
  isPhone: boolean;
  /** تابلت أو كمبيوتر: قائمة جانبية بدل التبويبات. */
  hasSidebar: boolean;
};

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  const size = deviceSizeFor(width);
  return { size, width, isPhone: size === "phone", hasSidebar: size !== "phone" };
}
