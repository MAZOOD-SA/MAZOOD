// خلفية رأس الرئيسية: تدرّج فاتح يتحرّك ببطء يمين ويسار (docs/plans/design-phase.md، القسم ٢).
// الألوان من الـpalette (surfaceAlt ثم accentSoft بشفافية ثم surface)، فتتبدّل مع الوضع الداكن لحالها.
// طبقة التدرّج أعرض من الرأس بمرّتين ومتوسّطة عليه (تبدأ قبله بنص عرضه)، وتنزاح نص عرض
// يمين ويسار رايح وجاي (دورة ١٢ ثانية). التوسيط يخلّيها تغطي الرأس كامل في العربي والإنجليزي،
// لأن الويب يقلب left وright في الاتجاه من اليمين لليسار.
// لو الجوال مفعّل فيه «تقليل الحركة»، التدرّج يبقى ثابت.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { useReducedMotion } from "./flow";

const HALF_CYCLE_MS = 6000; // رايح ٦ ثواني وجاي ٦ = دورة ١٢ ثانية
const ACCENT_STOP_OPACITY = 0.35;

export function HeroGradient({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || width === 0) {
      shift.stopAnimation();
      shift.setValue(0);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    // الويب ما فيه native driver، فيشتغل بالـJS هناك بدل ما يطلع تحذير.
    const useNativeDriver = Platform.OS !== "web";
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, { toValue: 1, duration: HALF_CYCLE_MS, easing: ease, useNativeDriver }),
        Animated.timing(shift, { toValue: 0, duration: HALF_CYCLE_MS, easing: ease, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, width, shift]);

  const translateX = shift.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, width / 2] });

  return (
    <View style={{ overflow: "hidden", backgroundColor: colors.surfaceAlt }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", top: 0, bottom: 0, left: -width / 2, width: width * 2, transform: [{ translateX }] }}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="mazoodHeroGradient" x1="0" y1="0" x2="1" y2="0.35">
              <Stop offset="0" stopColor={colors.surfaceAlt} stopOpacity={1} />
              <Stop offset="0.5" stopColor={colors.accentSoft} stopOpacity={ACCENT_STOP_OPACITY} />
              <Stop offset="1" stopColor={colors.surface} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#mazoodHeroGradient)" />
        </Svg>
      </Animated.View>
      {children}
    </View>
  );
}
