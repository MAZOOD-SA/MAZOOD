// علامة مزوّد: نفس شكل brand/logo/mazood-mark.svg بالضبط (ما نرسم شعار جديد)،
// بس الألوان تجي من التوكنز بدل ما تكون مكتوبة في الكود.
import { colors as brandColors } from "@mazood/brand";
import Svg, { Circle, Path } from "react-native-svg";

const NUT = "M60 6 L106.77 33 L106.77 87 L60 114 L13.23 87 L13.23 33 Z";
const CHECK = "M47 61 L56 70 L74 52";

export function LogoMark({ size = 30 }: { size?: number }) {
  // ألوان الشعار ثابتة في الوضعين (حسب brand/logo/README.md).
  const { amber, navy } = brandColors.light;
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={NUT} fill={amber} />
      <Circle cx={60} cy={60} r={27} fill={navy} />
      <Path d={CHECK} fill="none" stroke={amber} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
