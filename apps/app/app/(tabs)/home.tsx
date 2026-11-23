// الشاشة الرئيسية للمصنع، مطابقة لـ «الشاشة الرئيسية في التطبيق» في brand/reference.html.
// الإجراء الأهم «اطلب عرض» هو زر accent الوحيد في الشاشة.
// الرأس أزرق هادئ مسطّح (hero-surface) بدل الكحلي المليان: بدون تدرّج ولا حركة، حسب brand/BRAND.md.
import { radius, spacing } from "@mazood/brand";
import { IconBell, IconBuildingStore, IconRosetteDiscountCheck, IconChevronLeft, IconChevronRight, IconPlus } from "@/components/icons";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { CategoryGrid, EmptyRequests, ListFrame, ListRow, NeedSearch, RequestCard, sortRequests } from "@/components/domain";
import { SectionTitle, useContentFrame } from "@/components/layout";
import { useAutoRefresh } from "@/components/flow";
import { isolate } from "@/lib/format";
import { useLayout } from "@/lib/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Button, Card, PromiseStrip, Row } from "@/components/ui";
import { CATEGORIES } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Home() {
  const { colors } = useTheme();
  const { t, tl, isRTL } = useI18n();
  const { state, factory: FACTORY, profileComplete, refreshRequests } = useStore();
  const unread = state.notifications.some((n) => !n.read);
  // الطلبات اللي فيها عروض جديدة تطلع فوق (docs/plans/phase-4.md، القسم ٦).
  const recent = sortRequests(state.requests).slice(0, 6);
  const width = useContentFrame("page");
  const { split } = useLayout();
  useAutoRefresh(refreshRequests);
  const Chevron = isRTL ? IconChevronLeft : IconChevronRight;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* الرأس أزرق هادئ مسطّح، والكحلي يبقى في النص والشعار بس (مرحلة التصميم و). */}
      <View style={{ backgroundColor: colors.heroSurface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={[width, { paddingTop: 20, paddingBottom: 22 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"] }}>
              <LogoMark size={30} />
              <AppText variant="h2" weight={700} style={{ color: colors.ink, fontSize: 22 }}>
                {t("appName")}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("notifications")}
              onPress={() => router.push("/notifications")}
              // ٤٤×٤٤ مساحة لمس (hitSlop ما يشتغل في الويب).
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <IconBell size={22} color={colors.ink} strokeWidth={1.75} />
              {unread && (
                <View style={{ position: "absolute", top: 11, end: 11, width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent }} />
              )}
            </Pressable>
          </View>
          {/* اتجاه السطر من لغة الواجهة، والاسم معزول: اسم مثل «Al-Sharq Industrial Co. مصنع الشرق» ما يقلب الترتيب. */}
          <AppText variant="bodySm" color="inkMuted" style={{ marginTop: 18, fontSize: 13, writingDirection: isRTL ? "rtl" : "ltr" }}>
            {profileComplete ? `${isolate(tl(FACTORY.name))} · ${tl(FACTORY.city)}` : t("welcome")}
          </AppText>
          <AppText variant="h1" style={{ color: colors.ink, marginTop: 2 }}>
            {t("homeQuestion")}
          </AppText>
          {/* كبسولة البحث (فكرة ايكيا): أقصر طريق للحلقة الأساسية. محايدة، والكهرماني للزر تحتها بس. */}
          <View style={{ marginTop: 14, maxWidth: split ? 560 : undefined }}>
            <NeedSearch />
          </View>
          {/* في الجوال الزر بعرض الشاشة (قريب من الإبهام)، وفي الكمبيوتر على قد نصه: زر بعرض ١١٠٠px شكل قالب جاهز. */}
          <Button
            label={t("requestOffer")}
            icon={IconPlus}
            variant="accent"
            size="lg"
            full={!split}
            style={{ marginTop: 14, ...(split ? { paddingHorizontal: spacing["8"] } : null) }}
            onPress={() => router.push("/request/new")}
          />
        </View>
      </View>

      <View style={[width, { paddingVertical: spacing["4"], gap: spacing["3"] }]}>
        {/* شريط الوعد (فكرة ايكيا): معلومة وحدة صادقة. المزوّد ما يرسل عرض قبل ما يتوثّق. */}
        <PromiseStrip icon={IconRosetteDiscountCheck} text={t("promiseVerified")} />
        {!profileComplete && (
          // ولا مرة طريق مسدود: قبل أول طلب، العميل يشوف وش ناقصه وزر يوديه له.
          <Card onPress={() => router.push("/factory-profile")} style={{ gap: spacing["1"] }}>
            <AppText weight={700}>{t("completeProfileFirst")}</AppText>
            <AppText variant="bodySm" color="inkMuted">
              {t("completeProfileFirstHint")}
            </AppText>
          </Card>
        )}
        <SectionTitle title={t("categories")} />
        <CategoryGrid
          categories={CATEGORIES}
          columns={split ? 4 : 2}
          onPick={(c) => router.push({ pathname: "/request/new", params: { category: c.id } })}
        />

        {/* مدخل السوق من الرئيسية (خطة السوق، القسم ٥): صف واضح إنه ينضغط (أيقونة وسهم)، مو صندوق فاضي. */}
        <ListFrame>
          {[
            <ListRow key="market" onPress={() => router.push("/shop")} label={t("marketEntryTitle")}>
              <Row gap="3">
                <IconBuildingStore size={24} color={colors.ink} strokeWidth={1.75} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodySm" weight={600}>
                    {t("marketEntryTitle")}
                  </AppText>
                  <AppText variant="caption" color="inkMuted">
                    {t("marketEntryHint")}
                  </AppText>
                </View>
                <Chevron size={20} color={colors.inkMuted} strokeWidth={1.75} />
              </Row>
            </ListRow>,
          ]}
        </ListFrame>

        <View style={{ marginTop: spacing["2"] }}>
          <SectionTitle
            title={t("yourRequests")}
            action={
              state.requests.length > recent.length ? <Button label={t("viewAll")} variant="ghost" onPress={() => router.push("/requests")} style={{ paddingVertical: 4, paddingHorizontal: 8 }} /> : undefined
            }
          />
        </View>
        {recent.length === 0 ? (
          <EmptyRequests />
        ) : (
          <ListFrame>
            {recent.map((r) => (
              <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />
            ))}
          </ListFrame>
        )}
      </View>
    </ScrollView>
  );
}
