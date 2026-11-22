// الطلبات المتاحة للمزوّد: طلبات أقسامه ومدنه المفتوحة، الأحدث أول، مع فلترة بالقسم.
// الكمبيوتر: القائمة في جهة، والطلب المختار ونموذج العرض في الجهة الثانية (يرسل عروض كثيرة بسرعة).
// الجوال: الضغط على الطلب يفتح شاشته (app/provider/request/[id].tsx).
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import type { OpenRequest } from "@/api/types";
import { useAutoRefresh } from "@/components/flow";
import { Screen } from "@/components/layout";
import { OpenRequestCard, ProviderRequestPanel } from "@/components/provider";
import { AppText, Chips, Notice } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { useStore } from "@/data/store";
import { useProvider } from "@/data/useProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { useLayout } from "@/lib/layout";

export default function AvailableRequests() {
  const { t, tl } = useI18n();
  const { authed } = useStore();
  const { provider } = useProvider();
  const { split } = useLayout();
  const [list, setList] = useState<OpenRequest[] | null>(null);
  const [category, setCategory] = useState<"all" | CategoryId>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = category === "all" ? "" : `?category=${category}`;
      setList((await authed<{ requests: OpenRequest[] }>(`/v1/provider/requests${q}`)).requests);
    } catch {
      setList((l) => l ?? []);
    }
  }, [authed, category]);
  useAutoRefresh(load);

  const categories = (provider?.categories ?? []) as CategoryId[];
  const current = split ? (list?.find((r) => r.id === selected) ?? list?.[0]) : undefined;

  const listView = (
    <View style={{ gap: spacing["3"] }}>
      {categories.length > 1 && (
        <Chips<"all" | CategoryId>
          value={category}
          onChange={(v) => {
            setCategory(v);
            setList(null);
          }}
          options={[{ value: "all", label: t("filterAll") }, ...categories.map((c) => ({ value: c, label: tl(categoryById(c).name) }))]}
        />
      )}
      {list === null ? (
        <AppText color="inkMuted">{t("loading")}</AppText>
      ) : list.length === 0 ? (
        <Notice text={t("noOpenRequests")} />
      ) : (
        list.map((r) => (
          <OpenRequestCard
            key={r.id}
            request={r}
            selected={split && current?.id === r.id}
            onPress={() => (split ? setSelected(r.id) : router.push({ pathname: "/provider/request/[id]", params: { id: r.id } }))}
          />
        ))
      )}
    </View>
  );

  if (!split) {
    return (
      <Screen title={t("tabAvailable")} onRefresh={load}>
        {listView}
      </Screen>
    );
  }

  // الكمبيوتر: قائمة وتفاصيل جنب بعض، وكل جهة تتمرّر لحالها.
  return (
    <Screen title={t("tabAvailable")} width="page" scroll={false}>
      <View style={{ flex: 1, flexDirection: "row", gap: spacing["6"] }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing["6"] }}>
          {listView}
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing["6"] }}>
          {current ? <ProviderRequestPanel requestId={current.id} onChanged={load} /> : <AppText color="inkMuted">{t("pickRequest")}</AppText>}
        </ScrollView>
      </View>
    </Screen>
  );
}
