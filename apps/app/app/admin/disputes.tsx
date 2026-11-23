// البلاغات لخدمة العملاء: المفتوحة أول والأقدم أول (اللي ينتظر من زمان يتعالج قبل).
import { spacing } from "@mazood/brand";
import type { DisputeReason } from "@mazood/shared";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/layout";
import { AppText, Badge, Card, Chips, Notice, Row } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { DISPUTE_REASON_LABEL } from "@/data/dispute-labels";
import { useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import { isolate } from "@/lib/format";

type Dispute = {
  id: string;
  number: number;
  reason: DisputeReason;
  status: "open" | "closed";
  openedAt: string;
  category: CategoryId;
  factoryName: string | null;
  providerName: string;
};

export default function DisputesScreen() {
  const { t, tl, relative, num, isRTL } = useI18n();
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const { data, error } = useLoad<{ disputes: Dispute[] }>(`/v1/admin/disputes${status === "all" ? "" : `?status=${status}`}`);
  return (
    <Screen title={t("navDisputes")} back>
      {error && <Notice text={t(error)} />}
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          { value: "open", label: t("disputeOpen") },
          { value: "closed", label: t("disputeClosed") },
          { value: "all", label: t("admFilterAll") },
        ]}
      />
      <View style={{ gap: spacing["2"] }}>
        {data?.disputes.length === 0 && <AppText color="inkMuted">{t("disputesEmpty")}</AppText>}
        {data?.disputes.map((d) => (
          <Card key={d.id} onPress={() => router.push({ pathname: "/admin/dispute/[id]", params: { id: d.id } })} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {t("disputeNumber", { n: num(d.number) })} · {t(DISPUTE_REASON_LABEL[d.reason])}
              </AppText>
              <Badge label={d.status === "open" ? t("disputeOpen") : t("disputeClosed")} tone={d.status === "open" ? "bad" : "muted"} />
            </Row>
            <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: isRTL ? "rtl" : "ltr" }}>
              {tl(categoryById(d.category).name)} · {isolate(d.factoryName ?? "—")} ← {isolate(d.providerName)}
            </AppText>
            <AppText variant="caption" color="inkMuted">
              {relative(d.openedAt)}
            </AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
