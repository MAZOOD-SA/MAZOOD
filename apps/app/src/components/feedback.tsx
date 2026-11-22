// عناصر تُطمئن المستخدم إن التطبيق شغّال (من قائمة الإتقان، docs/product.md القسم ٨):
//   - Skeleton: شكل الشاشة يظهر فورًا وقت التحميل، بدل مؤشر دوّار.
//   - Toast: رسالة نجاح قصيرة بعد أي عملية، تختفي لحالها.
//   - OfflineBanner: شريط «لا يوجد اتصال» لما الخادم ما يرد، والبيانات المعروضة آخر نسخة محفوظة.
// الألوان من الثيم فقط، والحركة خفيفة جدًا عشان ما تأخّر الاستجابة.
import { radius, spacing } from "@mazood/brand";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, View, type DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useServerReachable } from "@/api/connection";
import { IconCircleCheck, IconWifiOff } from "@/components/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText, Card, Row } from "./ui";

// ───────── الهياكل المؤقتة ─────────

export function SkeletonLine({ width = "100%", height = 14 }: { width?: DimensionValue; height?: number }) {
  const { colors } = useTheme();
  return <View style={{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }} />;
}

/** شكل بطاقة طلب وقت التحميل. */
export function SkeletonCard() {
  return (
    <Card style={{ gap: spacing["2"] }}>
      <SkeletonLine width="45%" height={16} />
      <SkeletonLine width="30%" height={12} />
    </Card>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="loading" style={{ gap: spacing["3"] }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

// ───────── رسالة النجاح ─────────

type ToastValue = { show: (message: string) => void };
const ToastContext = createContext<ToastValue>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(m);
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
      }, 2600);
    },
    [opacity],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ position: "absolute", start: spacing["4"], end: spacing["4"], bottom: insets.bottom + 84, alignItems: "center", opacity }}
        >
          <Row style={{ backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: spacing["3"], paddingHorizontal: spacing["4"], maxWidth: 560 }}>
            <IconCircleCheck size={18} color={colors.surface} strokeWidth={2} />
            <AppText variant="bodySm" weight={600} style={{ color: colors.surface, flexShrink: 1 }}>
              {message}
            </AppText>
          </Row>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}

// ───────── شريط عدم الاتصال ─────────

export function OfflineBanner() {
  const reachable = useServerReachable();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (reachable) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6, paddingHorizontal: spacing["4"] }}>
      <Row style={{ justifyContent: "center" }}>
        <IconWifiOff size={16} color={colors.inkMuted} strokeWidth={2} />
        <AppText variant="caption" color="inkMuted" weight={600}>
          {t("offlineBanner")}
        </AppText>
      </Row>
    </View>
  );
}
