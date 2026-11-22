// الشاشة الرئيسية للمصنع، مطابقة لـ «الشاشة الرئيسية في التطبيق» في brand/reference.html.
// الإجراء الأهم «اطلب عرض» هو زر accent الوحيد في الشاشة.
//
// حسب docs/product.md (القسم ٣) الرئيسية تجمع ثلاث شاشات كانت منفصلة في المرحلة ١:
//   - «طلباتي»: كل الطلبات هنا، مع تصفية (الحالية، والمكتملة، والملغية).
//   - «التنبيهات»: الطلب اللي وصلته عروض جديدة يطلع فوق، وعليه نقطة كهرمانية وعدد العروض الجديدة.
import { colors as brandColors, spacing } from "@mazood/brand";
import type { RequestDto } from "@mazood/shared";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { usePrefetchActive, useRequests } from "@/api/requests";
import { useSession } from "@/api/session";
import { CategoryTile, RequestCard } from "@/components/domain";
import { SkeletonList } from "@/components/feedback";
import { IconPlus } from "@/components/icons";
import { CONTENT_MAX_WIDTH, SectionTitle } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Button, Chips } from "@/components/ui";
import { CATEGORIES } from "@/data/categories";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

// رأس الشاشة كحلي في الوضعين (كما في المرجع)، والنص فوقه بلون concrete الفاتح.
const header = brandColors.light;

type Filter = "active" | "completed" | "cancelled";

const inFilter = (r: RequestDto, f: Filter) =>
  f === "completed" ? r.status === "completed" : f === "cancelled" ? r.status === "cancelled" : r.status !== "completed" && r.status !== "cancelled";

/** الطلبات اللي فيها عروض جديدة أول، وبعدها الأحدث. */
function sortForHome(list: RequestDto[]): RequestDto[] {
  return [...list].sort((a, b) => Number(b.unseenOffers > 0) - Number(a.unseenOffers > 0) || b.createdAt.localeCompare(a.createdAt));
}

export default function Home() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { me } = useSession();
  const requests = useRequests();
  const [filter, setFilter] = useState<Filter>("active");
  const width = { width: "100%" as const, maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" as const };
  const all = requests.data ?? [];
  const list = sortForHome(all.filter((r) => inFilter(r, filter)));
  usePrefetchActive(requests.data);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ backgroundColor: header.navy }}>
        <View style={[width, { paddingHorizontal: spacing["4"], paddingTop: 20, paddingBottom: 22 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"] }}>
            <LogoMark size={30} />
            <AppText variant="h2" weight={700} style={{ color: header.concrete, fontSize: 22 }}>
              {t("appName")}
            </AppText>
          </View>
          <AppText variant="bodySm" style={{ color: header.concrete, opacity: 0.8, marginTop: 18, fontSize: 13 }}>
            {me?.factory ? `${me.factory.name} · ${me.factory.location}` : ""}
          </AppText>
          <AppText variant="h2" weight={700} style={{ color: header.concrete, fontSize: 22, lineHeight: 30, marginTop: 2 }}>
            {t("homeQuestion")}
          </AppText>
          <Button label={t("requestOffer")} icon={IconPlus} variant="accent" size="lg" full style={{ marginTop: 14 }} onPress={() => router.push("/request/new")} />
        </View>
      </View>

      <View style={[width, { padding: spacing["4"], gap: spacing["3"] }]}>
        <SectionTitle title={t("categories")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
          {CATEGORIES.map((c) => (
            <View key={c.id} style={{ width: "31.5%", flexGrow: 1 }}>
              <CategoryTile compact category={c} onPress={() => router.push({ pathname: "/request/new", params: { category: c.id } })} />
            </View>
          ))}
        </View>

        <View style={{ marginTop: spacing["2"] }}>
          <SectionTitle title={t("yourRequests")} />
        </View>
        {all.length > 0 && (
          <Chips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: t("filterActive") },
              { value: "completed", label: t("filterCompleted") },
              { value: "cancelled", label: t("filterCancelled") },
            ]}
          />
        )}
        {requests.isPending ? (
          <SkeletonList />
        ) : requests.isError && !requests.data ? (
          <View style={{ gap: spacing["2"] }}>
            <AppText variant="bodySm" color="danger">
              {errorMessage(requests.error, t)}
            </AppText>
            <Button label={t("retry")} variant="secondary" onPress={() => requests.refetch()} />
          </View>
        ) : all.length === 0 ? (
          <View style={{ gap: spacing["3"] }}>
            <AppText variant="bodySm" color="inkMuted">
              {t("noRequests")}
            </AppText>
            <Button label={t("requestOffer")} icon={IconPlus} variant="secondary" onPress={() => router.push("/request/new")} />
          </View>
        ) : list.length === 0 ? (
          <AppText variant="bodySm" color="inkMuted">
            {t("noRequestsInFilter")}
          </AppText>
        ) : (
          list.map((r) => <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />)
        )}
      </View>
    </ScrollView>
  );
}
