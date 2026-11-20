// تعريف الاستيراد المباشر لأيقونة وحدة من Tabler Icons (يحوّله metro.config.js لملف الأيقونة).
declare module "@tabler/icons-react-native/icons/*" {
  import type { ComponentType } from "react";
  import type { ColorValue } from "react-native";
  const Icon: ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number }>;
  export default Icon;
}
