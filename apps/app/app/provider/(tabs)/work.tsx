// شغلي (للمزوّد): عروضي الفعّالة، والمقبولة (بانتظار البدء)، وقيد التنفيذ، والمنتهية.
// لحظة المكافأة: أول مرة يشوف طلب انقبل فيه عرضه، تنرسم علامة صح خضراء (docs/product.md، القسم ٢).
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { JobSummary, MyOffer } from "@/api/types";
import { RequestStatusDot } from "@/components/domain";
import { useAutoRefresh } from "@/components/flow";
import { Grid, Screen, SectionTitle } from "@/components/layout";
import { JobCard } from "@/components/provider";
import { AppText, Badge, Card, Notice, Row } from "@/components/ui";
import { categoryById } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { loadPref, savePref } from "@/lib/prefs";
import { spacing } from "@mazood/brand";
import { View } from "react-native";

const ACTIVE = ["accepted", "in_progress", "delivered", "disputed"];

export default function Work() {
  const { t, tl, money, until } = useI18n();
  const { authed } = useStore();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [seen, setSeen] = useState<Set<string> | null>(null);

  useEffect(() => {
    loadPref("seenJobs").then((v) => setSeen(new Set(v ? (JSON.parse(v) as string[]) : [])));
  }, []);

  const load = useCallback(async () => {
    try {
      const [j, o] = await Promise.all([authed<{ jobs: JobSummary[] }>("/v1/provider/jobs"), authed<{ offers: MyOffer[] }>("/v1/provider/offers")]);
      setJobs(j.jobs);
      setOffers(o.offers.filter((x) => x.status === "active"));
    } catch {
      setJobs((x) => x ?? []);
    }
  }, [authed]);
  useAutoRefresh(load);

  // نسجّل إنه شاف الطلبات المقبولة الجديدة، عشان الحركة ما تتكرر في المرة الجاية.
  useEffect(() => {
    if (!jobs || !seen) return;
    const ids = jobs.map((j) => j.orderId);
    if (ids.some((id) => !seen.has(id))) savePref("seenJobs", JSON.stringify(ids.slice(0, 200)));
  }, [jobs, seen]);

  const active = (jobs ?? []).filter((j) => ACTIVE.includes(j.status));
  const done = (jobs ?? []).filter((j) => !ACTIVE.includes(j.status)).slice(0, 10);
  const open = (j: JobSummary) => router.push({ pathname: "/provider/job/[id]", params: { id: j.orderId } });

  return (
    <Screen title={t("tabWork")} width="page" onRefresh={load}>
      {jobs === null ? (
        <AppText color="inkMuted">{t("loading")}</AppText>
      ) : (
        <>
          <SectionTitle title={t("workActive")} />
          {active.length === 0 ? (
            <Notice text={t("workActiveEmpty")} />
          ) : (
            <Grid minItemWidth={320} max={2}>
              {active.map((j) => (
                <JobCard key={j.orderId} job={j} newlyAccepted={!!seen && !seen.has(j.orderId) && j.status === "accepted"} onPress={() => open(j)} />
              ))}
            </Grid>
          )}

          <SectionTitle title={t("workOffers")} />
          {offers.length === 0 ? (
            <AppText variant="bodySm" color="inkMuted">
              {t("workOffersEmpty")}
            </AppText>
          ) : (
            <Grid minItemWidth={320} max={2}>
              {offers.map((o) => {
                const cat = categoryById(o.request.category);
                const type = cat.types.find((x) => x.id === o.request.typeId);
                return (
                  <Card key={o.id} onPress={() => router.push({ pathname: "/provider/request/[id]", params: { id: o.requestId } })} style={{ gap: spacing["2"] }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <AppText variant="body" weight={600} style={{ flex: 1 }}>
                        {type ? tl(type.name) : tl(cat.name)}
                      </AppText>
                      {o.seenByFactory ? <Badge label={t("factorySawOffer")} tone="ok" /> : <Badge label={t("factoryNotSeen")} tone="muted" />}
                    </Row>
                    <AppText variant="caption" color="inkMuted">
                      {money(o.priceHalalas)} · {t("validUntil", { until: until(o.validUntil) })}
                    </AppText>
                  </Card>
                );
              })}
            </Grid>
          )}

          {done.length > 0 && (
            <View style={{ gap: spacing["3"] }}>
              <SectionTitle title={t("workDone")} />
              <Grid minItemWidth={320} max={2}>
                {done.map((j) => (
                  <Card key={j.orderId} onPress={() => open(j)}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <AppText variant="bodySm" weight={600} style={{ flex: 1 }}>
                        {tl(categoryById(j.category).types.find((x) => x.id === j.typeId)?.name ?? categoryById(j.category).name)}
                      </AppText>
                      <RequestStatusDot status={j.status} viewer="provider" />
                    </Row>
                  </Card>
                ))}
              </Grid>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
