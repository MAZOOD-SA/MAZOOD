// مكوّنات شاشات العروض والتنفيذ (المرحلة ٤): التحديث التلقائي، ولحظة المكافأة، والنجوم، والخط الزمني.
import { layout, motion, radius, spacing } from "@mazood/brand";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Pressable, View, type TextStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { fileUrl } from "@/api/client";
import type { Execution, ProviderCard, TimelineEvent } from "@/api/types";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { IconStar } from "./icons";
import { AppText, focusRing, Row, VerifiedBadge } from "./ui";

/** كل كم ثانية تسأل الشاشة المفتوحة الخادم (بدون التنبيهات، الخطوة ١٠). */
export const REFRESH_EVERY_MS = 20_000;

/**
 * يحدّث بيانات الشاشة: أول ما تنفتح، وكل ٢٠ ثانية وهي مفتوحة، ويوقف لما المستخدم يطلع منها.
 * الاتصال المفتوح الدائم أبسط لما يكثر المستخدمين (docs/plans/phase-4.md، القسم ٧).
 */
export function useAutoRefresh(load: () => Promise<unknown> | void) {
  const ref = useRef(load);
  ref.current = load;
  useFocusEffect(
    useCallback(() => {
      ref.current();
      const timer = setInterval(() => ref.current(), REFRESH_EVERY_MS);
      return () => clearInterval(timer);
    }, []),
  );
}

/** «تقليل الحركة» في إعدادات الجوال أو الكمبيوتر: النتيجة تطلع مباشرة بدون حركة. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * حركة واجهة صغيرة (مرحلة التصميم و): قيمة تروح لـ١ لما on صحيح ولـ٠ لما يكون خطأ،
 * بمدة motion.fast من التوكنز (١٥٠ مللي ثانية) وease-out. مع «تقليل الحركة» تقفز للقيمة مباشرة.
 * تُستخدم لظهور الجواب في «مساعدة» ودوران سهمه، ولظهور بطاقة «خطوتك الجاية».
 */
export function useUiTransition(on: boolean): Animated.Value {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.stopAnimation();
      v.setValue(on ? 1 : 0);
      return;
    }
    const anim = Animated.timing(v, { toValue: on ? 1 : 0, duration: motion.fast, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [on, reduced, v]);
  return v;
}

/** قيمة من ٠ إلى ١ خلال مدة حركة المكافأة (من التوكنز). مع «تقليل الحركة» تبدأ من ١. */
function useRewardProgress(run: boolean): number {
  const reduced = useReducedMotion();
  const [p, setP] = useState(run && !reduced ? 0 : 1);
  useEffect(() => {
    if (!run || reduced) {
      setP(1);
      return;
    }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setP(value));
    Animated.timing(v, { toValue: 1, duration: motion.reward, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => {
      v.removeListener(id);
      v.stopAnimation();
    };
  }, [run, reduced]);
  return p;
}

/** لحظة المكافأة للمصنع: الرقم في «وصل طلبك لـ ٨ مزوّدين» يعدّ لين يوقف (docs/product.md، القسم ٢). */
export function CountUp({ to, animate, style }: { to: number; animate: boolean; style?: TextStyle }) {
  const { num } = useI18n();
  const p = useRewardProgress(animate);
  return (
    <AppText variant="display" style={style} accessibilityLabel={num(to)}>
      {num(Math.round(to * p))}
    </AppText>
  );
}

/** لحظة المكافأة للمزوّد: علامة صح تنرسم بلون --success لما ينقبل عرضه. */
export function RewardCheck({ size = 56, animate }: { size?: number; animate: boolean }) {
  const { colors } = useTheme();
  const p = useRewardProgress(animate);
  const LEN = 40;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={24} cy={24} r={22} fill={colors.successSoft} />
      <Path
        d="M14 25 L21 32 L34 17"
        fill="none"
        stroke={colors.success}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${LEN}`}
        strokeDashoffset={LEN * (1 - p)}
      />
    </Svg>
  );
}

// ───────── النجوم ─────────

/** نجوم التقييم: للعرض، أو للاختيار (onChange). كل نجمة زر بحجم الإصبع. */
export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Row gap="1" style={{ flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value);
        const star = <IconStar size={size} color={on ? colors.ink : colors.lineStrong} fill={on ? colors.accent : "none"} strokeWidth={1.75} />;
        if (!onChange) return <View key={n}>{star}</View>;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t("rateStars", { n })}
            onPress={() => onChange(n)}
            style={(s) => [{ minWidth: layout.touchMin, minHeight: layout.touchMin, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, focusRing(s, colors)]}
          >
            {star}
          </Pressable>
        );
      })}
    </Row>
  );
}

/** اسم المزوّد وشارة «موثّق» والنجوم ورقم الالتزام (القرار ٣٣)، كما في بطاقة العرض. */
export function ProviderLine({ provider, large, nameOnly }: { provider: ProviderCard; large?: boolean; nameOnly?: boolean }) {
  const { t, num, locale } = useI18n();
  const r = provider.rating;
  const c = provider.commitment;
  return (
    <View style={{ gap: 2 }}>
      <Row style={{ flexWrap: "wrap" }}>
        <AppText variant={large ? "h2" : "body"} weight={600}>
          {provider.tradeName}
        </AppText>
        {provider.verified && <VerifiedBadge />}
      </Row>
      {!nameOnly && <Row gap="2" style={{ flexWrap: "wrap" }}>
        {r ? (
          <Row gap="1">
            <Stars value={r.average} size={14} />
            <AppText variant="caption" color="inkMuted">
              {formatNumber(r.average, locale, 1)} ({num(r.count)})
            </AppText>
          </Row>
        ) : (
          <AppText variant="caption" color="inkMuted">
            {t("noRatingsYet")}
          </AppText>
        )}
        {c && (
          <AppText variant="caption" color="inkMuted">
            · {c.kind === "new" ? t("commitmentNew") : t("commitmentCount", { kept: num(c.kept), total: num(c.total) })}
          </AppText>
        )}
      </Row>}
    </View>
  );
}

// ───────── الخط الزمني ─────────

const EVENT_KEYS: Record<string, StringKey> = {
  created: "evCreated",
  nominated: "evNominated",
  nomination_approved: "evAccepted",
  nomination_rejected: "evNominationRejected",
  accepted: "evAccepted",
  started: "evStarted",
  photo_added: "evPhotoAdded",
  delivered: "evDelivered",
  confirmed: "evConfirmed",
  auto_confirmed: "evAutoConfirmed",
  price_change_requested: "evPriceChangeRequested",
  price_change_approved: "evPriceChangeApproved",
  price_change_rejected: "evPriceChangeRejected",
  price_change_withdrawn: "evPriceChangeWithdrawn",
  cancellation_requested: "evCancellationRequested",
  cancellation_withdrawn: "evCancellationWithdrawn",
  cancellation_agreed: "evCancellationAgreed",
  cancellation_declined: "evCancellationDeclined",
  cancelled: "evCancelled",
  provider_withdrew: "evProviderWithdrew",
  republished: "evRepublished",
  dispute_opened: "evDisputeOpened",
  dispute_resolved: "evDisputeResolved",
  rated: "evRated",
  expired: "evExpired",
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t, relative } = useI18n();
  const { colors } = useTheme();
  const shown = events.filter((e) => EVENT_KEYS[e.event]);
  return (
    <View style={{ gap: spacing["3"] }}>
      {shown.map((e, i) => (
        <Row key={`${e.at}-${i}`} gap="3" style={{ alignItems: "flex-start" }}>
          <View style={{ alignItems: "center", paddingTop: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: i === shown.length - 1 ? colors.ink : colors.lineStrong }} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodySm" weight={i === shown.length - 1 ? 600 : 400}>
              {t(EVENT_KEYS[e.event])}
            </AppText>
            <AppText variant="caption" color="inkMuted">
              {relative(e.at)}
            </AppText>
          </View>
        </Row>
      ))}
    </View>
  );
}

/** صور التنفيذ (روابط مؤقتة من الخادم). */
export function PhotoStrip({ photos, stage }: { photos: Execution["photos"]; stage: "start" | "delivery" }) {
  const { colors } = useTheme();
  const list = photos.filter((p) => p.stage === stage && p.link.path);
  if (list.length === 0) return null;
  return (
    <Row gap="2" style={{ flexWrap: "wrap" }}>
      {list.map((p) => (
        <Image
          key={p.id}
          source={{ uri: fileUrl(p.link.path) }}
          accessibilityIgnoresInvertColors
          style={{ width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line }}
        />
      ))}
    </Row>
  );
}

/** بطاقة فيها عنوان صغير ومحتوى (للعمود الجانبي). */
export function SideCard({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing["4"], gap: spacing["3"], backgroundColor: colors.surfaceRaised }}>
      <AppText variant="label" color="inkMuted">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** سطر معلومة: تسمية وقيمة. */
export function Fact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={ltr ? { writingDirection: "ltr", alignSelf: "flex-start" } : undefined}>
        {value}
      </AppText>
    </View>
  );
}
