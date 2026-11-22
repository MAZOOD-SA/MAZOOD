// الشاشة الرئيسية للمصنع، مطابقة لـ «الشاشة الرئيسية في التطبيق» في brand/reference.html.
// الإجراء الأهم «اطلب عرض» هو زر accent الوحيد في الشاشة.
import { colors as brandColors, radius, spacing } from "@mazood/brand";
import { IconBell, IconPlus } from "@/components/icons";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { CategoryTile, RequestCard, sortRequests } from "@/components/domain";
import { Grid, SectionTitle, useContentFrame } from "@/components/layout";
import { useAutoRefresh } from "@/components/flow";
import { useLayout } from "@/lib/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Button } from "@/components/ui";
import { CATEGORIES } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

// رأس الشاشة كحلي في الوضعين (كما في المرجع)، والنص فوقه بلون concrete الفاتح.
const header = brandColors.light;

export default function Home() {
  const { colors } = useTheme();
  const { t, tl } = useI18n();
  const { state, factory: FACTORY, profileComplete, refreshRequests } = useStore();
  const unread = state.notifications.some((n) => !n.read);
  // الطلبات اللي فيها عروض جديدة تطلع فوق (docs/plans/phase-4.md، القسم ٦).
  const recent = sortRequests(state.requests).slice(0, 6);
  const width = useContentFrame("page");
  const { split } = useLayout();
  useAutoRefresh(refreshRequests);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ backgroundColor: header.navy }}>
        <View style={[width, { paddingTop: 20, paddingBottom: 22 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"] }}>
              <LogoMark size={30} />
              <AppText variant="h2" weight={700} style={{ color: header.concrete, fontSize: 22 }}>
                {t("appName")}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("notifications")} onPress={() => router.push("/notifications")} hitSlop={8}>
              <IconBell size={22} color={header.concrete} strokeWidth={1.75} />
              {unread && (
                <View style={{ position: "absolute", top: 0, end: 0, width: 8, height: 8, borderRadius: radius.full, backgroundColor: header.amber }} />
              )}
            </Pressable>
          </View>
          <AppText variant="bodySm" style={{ color: header.concrete, opacity: 0.8, marginTop: 18, fontSize: 13 }}>
            {profileComplete ? `${tl(FACTORY.name)} · ${tl(FACTORY.city)}` : t("welcome")}
          </AppText>
          <AppText variant="h2" weight={700} style={{ color: header.concrete, fontSize: 22, lineHeight: 30, marginTop: 2 }}>
            {t("homeQuestion")}
          </AppText>
          <Button
            label={t("requestOffer")}
            icon={IconPlus}
            variant="accent"
            size="lg"
            full
            style={{ marginTop: 14 }}
            onPress={() => router.push("/request/new")}
          />
        </View>
      </View>

      <View style={[width, { paddingVertical: spacing["4"], gap: spacing["3"] }]}>
        <SectionTitle title={t("categories")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
          {CATEGORIES.map((c) => (
            <View key={c.id} style={{ width: split ? "13%" : "31.5%", flexGrow: 1 }}>
              <CategoryTile compact category={c} onPress={() => router.push({ pathname: "/request/new", params: { category: c.id } })} />
            </View>
          ))}
        </View>

        <View style={{ marginTop: spacing["2"] }}>
          <SectionTitle
            title={t("yourRequests")}
            action={
              state.requests.length > recent.length ? <Button label={t("viewAll")} variant="ghost" onPress={() => router.push("/requests")} style={{ paddingVertical: 4, paddingHorizontal: 8 }} /> : undefined
            }
          />
        </View>
        {recent.length === 0 ? (
          <AppText variant="bodySm" color="inkMuted">
            {t("noRequests")}
          </AppText>
        ) : (
          <Grid minItemWidth={320} max={2}>
            {recent.map((r) => (
              <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />
            ))}
          </Grid>
        )}
      </View>
    </ScrollView>
  );
}
