// «مساعدة»: أكثر الأسئلة لكل نوع مستخدم (من docs/admin/faq.md)، وتحتها طريقة التواصل.
// في الكمبيوتر تنفتح من القائمة الجانبية، وفي الجوال من «حسابي» (docs/plans/design-phase.md، القسم ٤).
import { layout, radius, spacing } from "@mazood/brand";
import { useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { IconChevronDown, IconMessageCircle } from "@/components/icons";
import { useUiTransition } from "@/components/flow";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Card, focusRing } from "@/components/ui";
import { FAQ, type FaqItem } from "@/data/faq";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Help() {
  const { t } = useI18n();
  const { role } = useStore();
  return (
    <Screen title={t("help")} back>
      <View style={{ gap: spacing["4"] }}>
        {role === "staff" ? (
          <>
            <FaqGroup title={t("helpForCustomers")} items={FAQ.factory} />
            <FaqGroup title={t("helpForProviders")} items={FAQ.provider} />
          </>
        ) : (
          <FaqGroup items={role === "provider" ? FAQ.provider : FAQ.factory} />
        )}
        <Card style={{ flexDirection: "row", gap: spacing["3"], alignItems: "flex-start" }}>
          <ContactIcon />
          <View style={{ flex: 1, gap: spacing["1"] }}>
            <AppText weight={700}>{t("helpNoAnswer")}</AppText>
            <AppText variant="bodySm" color="inkMuted">
              {t("helpContact")}
            </AppText>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function ContactIcon() {
  const { colors } = useTheme();
  return <IconMessageCircle size={22} color={colors.inkMuted} strokeWidth={1.75} />;
}

function FaqGroup({ title, items }: { title?: string; items: FaqItem[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing["2"] }}>
      {title && <SectionTitle title={title} />}
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised, overflow: "hidden" }}>
        {items.map((item, i) => (
          <FaqRow key={item.q.en} item={item} first={i === 0} />
        ))}
      </View>
    </View>
  );
}

/** سؤال ينفتح وينطوي. الجواب يطلع تحت السؤال، وقارئ الشاشة يعرف الحالة من expanded. */
function FaqRow({ item, first }: { item: FaqItem; first: boolean }) {
  const { colors } = useTheme();
  const { tl } = useI18n();
  const [open, setOpen] = useState(false);
  // السهم يدور والجواب يطلع بهدوء (١٥٠ مللي ثانية، ويقف مع «تقليل الحركة»).
  const t = useUiTransition(open);
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const answerShift = t.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] });
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={tl(item.q)}
        onPress={() => setOpen((o) => !o)}
        style={(state) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing["3"],
            minHeight: layout.touchMin + 8,
            paddingHorizontal: spacing["4"],
            paddingVertical: spacing["3"],
            backgroundColor: (state as { hovered?: boolean }).hovered ? colors.surfaceAlt : "transparent",
          },
          focusRing(state, colors),
        ]}
      >
        <AppText weight={600} style={{ flex: 1 }}>
          {tl(item.q)}
        </AppText>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <IconChevronDown size={20} color={colors.inkMuted} strokeWidth={1.75} />
        </Animated.View>
      </Pressable>
      {open && (
        <Animated.View style={{ paddingHorizontal: spacing["4"], paddingBottom: spacing["4"], opacity: t, transform: [{ translateY: answerShift }] }}>
          <AppText variant="bodySm" color="inkMuted">
            {tl(item.a)}
          </AppText>
        </Animated.View>
      )}
    </View>
  );
}
