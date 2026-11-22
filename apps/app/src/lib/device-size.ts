// المقاس الحالي للشاشة: جوال، أو تابلت، أو كمبيوتر.
// الحدود من brand/tokens.json (layout)، فتتغيّر من مكان واحد مثل الألوان.
import { layout } from "@mazood/brand";

export type DeviceSize = "phone" | "tablet" | "desktop";

export function deviceSizeFor(width: number): DeviceSize {
  if (width >= layout.breakpointDesktop) return "desktop";
  if (width >= layout.breakpointTablet) return "tablet";
  return "phone";
}
