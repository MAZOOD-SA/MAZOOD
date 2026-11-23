// المكوّنات الأساسية المطابقة لـ brand/reference.html: النص، والأزرار، والشارات، والبطاقات.
// كل الألوان من useTheme() وكل المسافات والزوايا من @mazood/brand. ممنوع أي لون مباشر.
import { fontFamilyByWeight, layout, radius, spacing, typography, type ColorName, type Palette, type TypographyName } from "@mazood/brand";
import { IconRosetteDiscountCheck } from "@/components/icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { IconComponent } from "@/data/categories";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

// ───────── النص ─────────

type AppTextProps = TextProps & {
  variant?: TypographyName;
  color?: ColorName;
  weight?: keyof typeof fontFamilyByWeight;
  align?: TextStyle["textAlign"];
};

export function AppText({ variant = "body", color = "ink", weight, align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const t = typography[variant];
  const w = weight ?? (t.fontWeight as keyof typeof fontFamilyByWeight);
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fontFamilyByWeight[w], fontSize: t.fontSize, lineHeight: t.lineHeight, color: colors[color], textAlign: align },
        style,
      ]}
    />
  );
}

// ───────── المرور بالماوس والكيبورد (الموقع) ─────────
// في الموقع Pressable يعطينا hovered وfocused. في الجوال ما تجي، فما يتغيّر شي.

type InteractionState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** إطار واضح حول العنصر المختار بالكيبورد (Tab)، ومؤشر اليد على اللي ينضغط. */
export function focusRing(state: InteractionState, colors: Palette): ViewStyle {
  const web = { cursor: "pointer" } as ViewStyle;
  if (!state.focused) return web;
  return { ...web, outlineColor: colors.ink, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as ViewStyle;
}

// ───────── الأزرار ─────────
// accent (كهرماني): زر واحد بس في كل شاشة، للإجراء الأهم.
// primary: كحلي في الفاتح، وبإطار كهرماني في الداكن.
// secondary: إطار رمادي. ghost: بدون خلفية.

export type ButtonVariant = "accent" | "primary" | "secondary" | "ghost";

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: ButtonVariant;
  icon?: IconComponent;
  full?: boolean;
  size?: "md" | "lg";
  loading?: boolean;
  tone?: "default" | "danger";
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = "primary", icon: Icon, full, size = "md", loading, tone = "default", disabled, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const look: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    accent: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
    primary: { bg: colors.btnPrimaryBg, fg: colors.btnPrimaryFg, border: colors.btnPrimaryBorder },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.lineStrong },
    ghost: { bg: "transparent", fg: tone === "danger" ? colors.danger : colors.ink, border: "transparent" },
  };
  const l = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      // في الموقع: data-accent على الزر الكهرماني، عشان فحص الصور يتأكد إنه واحد بس في كل شاشة.
      {...(variant === "accent" ? ({ dataSet: { accent: "true" } } as object) : {})}
      {...rest}
      style={(state) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing["2"],
          minHeight: layout.touchMin,
          backgroundColor: l.bg,
          borderColor: l.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: size === "lg" ? 12 : 10,
          paddingHorizontal: 18,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : (state as InteractionState).hovered ? 0.92 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        focusRing(state, colors),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={l.fg} size="small" />
      ) : (
        Icon && <Icon size={18} color={l.fg} strokeWidth={2} />
      )}
      <Text style={{ fontFamily: fontFamilyByWeight[600], fontSize: typography.label.fontSize, lineHeight: typography.label.lineHeight, color: l.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ───────── الشارات ─────────

/** action: ينتظر إجراء من المستخدم، بدون لون كهرماني (سطح محايد وخط داكن). */
export type BadgeTone = "ok" | "new" | "action" | "muted" | "bad";

export function Badge({ label, tone, icon: Icon }: { label: string; tone: BadgeTone; icon?: IconComponent }) {
  const { colors } = useTheme();
  const look: Record<BadgeTone, { bg: string; fg: string }> = {
    ok: { bg: colors.successSoft, fg: colors.success },
    new: { bg: colors.surfaceAlt, fg: colors.ink }, // بدون أصفر (قرار المالك ٢٣ نوفمبر): الجديد يبان من الخط الثقيل مو من اللون
    action: { bg: colors.surfaceAlt, fg: colors.ink },
    muted: { bg: colors.surfaceAlt, fg: colors.inkMuted },
    bad: { bg: colors.surfaceAlt, fg: colors.danger },
  };
  const l = look[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing["1"],
        backgroundColor: l.bg,
        borderRadius: radius.full,
        paddingVertical: 2,
        paddingHorizontal: spacing["2"],
        alignSelf: "flex-start",
      }}
    >
      {Icon && <Icon size={14} color={l.fg} strokeWidth={2} />}
      <Text style={{ fontFamily: fontFamilyByWeight[600], fontSize: typography.caption.fontSize, lineHeight: typography.caption.lineHeight, color: l.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** شارة «موثّق» الخضراء: تظهر جنب اسم أي مزوّد موثّق (قاعدة ٥ في CLAUDE.md). */
export function VerifiedBadge() {
  const { t } = useI18n();
  return <Badge label={t("verified")} tone="ok" icon={IconRosetteDiscountCheck} />;
}

// ───────── البطاقة ─────────

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surfaceRaised, // في الداكن أفتح من الصفحة (طبقة مرفوعة)
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing["4"],
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={(state) => [
          base,
          { opacity: state.pressed ? 0.85 : 1, borderColor: (state as InteractionState).hovered ? colors.lineStrong : colors.line },
          focusRing(state, colors),
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

// ───────── أدوات صغيرة ─────────

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.line }} />;
}

export function Row({ children, gap = "2", style }: { children: ReactNode; gap?: keyof typeof spacing; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing[gap] }, style]}>{children}</View>;
}

/** رسالة تنبيه هادئة (سطح محايد بإطار line، بدون أصفر: قرار المالك ٢٣ نوفمبر). */
export function Notice({ text, icon: Icon }: { text: string; icon?: IconComponent }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing["2"], backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing["3"] }}>
      {Icon && <Icon size={18} color={colors.ink} strokeWidth={2} />}
      <AppText variant="bodySm" color="ink" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

/** أزرار اختيار (مثل اختيار النوع أو اللغة). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            aria-checked={selected}
            onPress={() => onChange(o.value)}
            style={(state) => [{
              minHeight: layout.touchMin,
              justifyContent: "center",
              borderWidth: 1,
              borderColor: selected ? colors.ink : colors.lineStrong,
              backgroundColor: selected ? colors.surfaceAlt : colors.surface,
              borderRadius: radius.md,
              paddingVertical: spacing["2"],
              paddingHorizontal: spacing["3"],
            }, focusRing(state, colors)]}
          >
            <AppText variant="label" weight={selected ? 600 : 400}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
