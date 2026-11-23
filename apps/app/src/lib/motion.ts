// «تقليل الحركة» وردة فعل الضغط، مشتركة بين كل الأزرار والبطاقات.
// الإعداد يُقرأ مرة وحدة للتطبيق كله (مستمع واحد)، بدل ما كل زر يسأل النظام لحاله.
import { motion } from "@mazood/brand";
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform, type ViewStyle } from "react-native";

let reduced = false;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  const set = (v: boolean) => {
    reduced = v;
    listeners.forEach((l) => l());
  };
  AccessibilityInfo.isReduceMotionEnabled?.().then(set).catch(() => {});
  AccessibilityInfo.addEventListener?.("reduceMotionChanged", set);
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** «تقليل الحركة» في إعدادات الجوال أو الكمبيوتر: النتيجة تطلع مباشرة بدون حركة. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced, () => false);
}

/** منحنى ease-out قوي: الحركة تبدأ فورًا وتهدى في آخرها، فالواجهة تحس إنها سمعت الضغطة. */
export const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * ردة فعل الضغط: الزر يصغر شوي (٠٫٩٧) وهو مضغوط، مثل زر حقيقي.
 * في الموقع ينتقل بنعومة (١٥٠ مللي ثانية)، وفي الجوال يتغيّر مباشرة. مع «تقليل الحركة» ما فيه تصغير.
 * القيم: الضغط ٠٫٩٧ (مو أقل، عشان ما يبان إن الزر «انهار»)، والمدة motion.fast من التوكنز.
 */
export function pressFeedback(pressed: boolean, reducedMotion: boolean, scale = 0.97): ViewStyle {
  const style: ViewStyle = { transform: [{ scale: pressed && !reducedMotion ? scale : 1 }] };
  if (Platform.OS === "web" && !reducedMotion) {
    // خصائص CSS يفهمها react-native-web؛ الأنواع ما تعرفها فنمررها كـViewStyle.
    Object.assign(style, {
      transitionProperty: "transform, opacity, background-color, border-color",
      transitionDuration: `${motion.fast}ms`,
      transitionTimingFunction: EASE_OUT_CSS,
    });
  }
  return style;
}
