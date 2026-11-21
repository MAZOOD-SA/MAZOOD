// طلباتي: كل طلبات المصنع (الحقيقية من الخادم والتجريبية)، مع تصفية حسب الحالة.
import { router } from "expo-router";
import { useState } from "react";
import { RequestCard } from "@/components/domain";
import { Screen } from "@/components/layout";
import { AppText, Button, Chips, Notice } from "@/components/ui";
import { pendingOffersFor } from "@/data/reducer";
import { useAllRequests, useRequests } from "@/data/requests";
import { useStore } from "@/data/store";
import type { RequestStatus } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

type Filter = "all" | RequestStatus;

export default function Requests() {
  const { t, locale } = useI18n();
  const { state } = useStore();
  const server = useRequests();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useAllRequests().filter((r) => filter === "all" || r.status === filter);

  return (
    <Screen title={t("tabRequests")}>
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: locale === "ar" ? "الكل" : "All" },
          { value: "awaiting_offers", label: t("statusAwaiting") },
          { value: "in_progress", label: t("statusInProgress") },
          { value: "completed", label: t("statusCompleted") },
          { value: "cancelled", label: t("statusCancelled") },
        ]}
      />
      {server.error && (
        <>
          <Notice text={errorMessage(t, new ApiError(0, server.error))} />
          <Button label={t("retry")} variant="secondary" onPress={() => void server.reload()} />
        </>
      )}
      {list.length === 0 ? (
        <AppText variant="bodySm" color="inkMuted">
          {t("noRequests")}
        </AppText>
      ) : (
        list.map((r) => (
          <RequestCard key={r.id} request={r} pendingOffers={pendingOffersFor(state, r.id).length} onPress={() => router.push(`/request/${r.id}`)} />
        ))
      )}
      {server.hasMore && <Button label={t("loadMore")} variant="ghost" onPress={() => void server.loadMore()} />}
    </Screen>
  );
}
