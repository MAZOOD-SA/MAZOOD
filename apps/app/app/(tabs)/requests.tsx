// طلباتي: كل طلبات المصنع، مع تصفية حسب المرحلة. اللي فيها عروض جديدة تطلع فوق.
import { router } from "expo-router";
import { useState } from "react";
import { RequestCard, sortRequests } from "@/components/domain";
import { useAutoRefresh } from "@/components/flow";
import { Grid, Screen } from "@/components/layout";
import { AppText, Button, Chips } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { useStore } from "@/data/store";
import type { RequestStatus } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useLayout } from "@/lib/layout";

type Filter = "all" | "open" | "active" | "done";

/** المجموعات: مفتوح للعروض، وجاري (بعد القبول)، ومنتهي (مكتمل أو ملغي أو انتهت مدته). */
const GROUPS: Record<Exclude<Filter, "all">, RequestStatus[]> = {
  open: ["awaiting_offers", "pending_approval"],
  active: ["accepted", "in_progress", "delivered", "disputed"],
  done: ["completed", "cancelled", "expired"],
};

export default function Requests() {
  const { t } = useI18n();
  const { state, refreshRequests } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  useAutoRefresh(refreshRequests);
  const { sidebar } = useLayout();
  const list = sortRequests(state.requests.filter((r) => filter === "all" || GROUPS[filter].includes(r.status)));

  return (
    <Screen
      title={t("tabRequests")}
      width="page"
      onRefresh={refreshRequests}
      // في التابلت والكمبيوتر «طلب جديد» موجود في القائمة الجانبية.
      headerAction={sidebar ? undefined : <Button label={t("newRequestShort")} icon={IconPlus} variant="secondary" onPress={() => router.push("/request/new")} />}
    >
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("filterAll") },
          { value: "open", label: t("filterOpen") },
          { value: "active", label: t("filterActive") },
          { value: "done", label: t("filterDone") },
        ]}
      />
      {list.length === 0 ? (
        <AppText variant="bodySm" color="inkMuted">
          {t("noRequests")}
        </AppText>
      ) : (
        <Grid minItemWidth={320} max={2}>
          {list.map((r) => (
            <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />
          ))}
        </Grid>
      )}
    </Screen>
  );
}
