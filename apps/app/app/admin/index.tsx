// الصفحة الرئيسية للوحة الإدارة: قائمة التوثيق (الأقدم أول)، والمستندات اللي تنتهي قريبًا، وكل المزوّدين.
import { spacing } from "@mazood/brand";
import type { DocType, ProviderStatus } from "@mazood/shared";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { IconHistory, IconLogout, IconUsers, IconSettings } from "@/components/icons";
import { dayIso } from "@/components/DocSlotCard";
import { HeaderIconButton, Screen } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { DOC_LABELS, PROVIDER_STATUS, STAFF_ROLE_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type QueueItem = { id: string; tradeName: string; categories: string[]; status: ProviderStatus; waitingSince: string | null; pendingDocs: number };
type ExpiringItem = { documentId: string; docType: DocType; expiresOn: string; providerId: string; tradeName: string; expired: boolean };
type ProviderItem = { id: string; tradeName: string; categories: string[]; status: ProviderStatus };
type Tab = "queue" | "expiring" | "all";

export default function AdminHome() {
  const { t, tl, relative, date, num } = useI18n();
  const settingsButton = <HeaderIconButton icon={IconSettings} label={t("openSettings")} onPress={() => router.push("/admin/settings")} />;
  const { staffRole, signOut } = useStore();
  const allowed = useCan();
  const canReview = allowed("providers.review");
  const [tab, setTab] = useState<Tab>(canReview ? "queue" : "all");
  const queue = useLoad<{ queue: QueueItem[] }>(canReview && tab === "queue" ? "/v1/admin/queue" : null);
  const expiring = useLoad<{ expiring: ExpiringItem[] }>(canReview && tab === "expiring" ? "/v1/admin/expiring" : null);
  const all = useLoad<{ providers: ProviderItem[] }>(allowed("providers.view") && tab === "all" ? "/v1/admin/providers" : null);
  const cats = (cs: string[]) => cs.map((c) => tl(categoryById(c as CategoryId).name)).join(" · ");
  const open = (id: string) => router.push({ pathname: "/admin/provider/[id]", params: { id } });

  const tabs: { value: Tab; label: string }[] = [
    ...(canReview ? [{ value: "queue" as const, label: t("queueTitle") }, { value: "expiring" as const, label: t("expiringTitle") }] : []),
    ...(allowed("providers.view") ? [{ value: "all" as const, label: t("allProviders") }] : []),
  ];
  const err = queue.error ?? expiring.error ?? all.error;

  return (
    <Screen title={t("adminTitle")} headerAction={settingsButton}>
      <Row style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <AppText color="inkMuted">{staffRole ? tl(STAFF_ROLE_LABELS[staffRole]) : ""}</AppText>
        <Row>
          {allowed("staff.manage") && <Button label={t("staffTitle")} icon={IconUsers} variant="secondary" onPress={() => router.push("/admin/staff")} />}
          {allowed("audit.view") && <Button label={t("auditTitle")} icon={IconHistory} variant="secondary" onPress={() => router.push("/admin/audit")} />}
        </Row>
      </Row>

      {tabs.length === 0 ? <Notice text={t("noAdminSections")} /> : <Chips value={tab} onChange={setTab} options={tabs} />}
      {err && <Notice text={t(err)} />}

      {tab === "queue" && queue.data && (
        <View style={{ gap: spacing["2"] }}>
          {queue.data.queue.length === 0 && <AppText color="inkMuted">{t("queueEmpty")}</AppText>}
          {queue.data.queue.map((q) => (
            <Card key={q.id} onPress={() => open(q.id)} style={{ gap: spacing["1"] }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText weight={600} style={{ flex: 1 }}>
                  {q.tradeName}
                </AppText>
                <Badge label={q.status === "verified" ? t("renewal") : tl(PROVIDER_STATUS[q.status].label)} tone="new" />
              </Row>
              <AppText variant="bodySm" color="inkMuted">
                {cats(q.categories)}
              </AppText>
              <AppText variant="caption" color="inkMuted">
                {q.waitingSince ? `${t("waitingSince")} ${relative(q.waitingSince)}` : ""} · {t("pendingDocs")}: {num(q.pendingDocs)}
              </AppText>
            </Card>
          ))}
        </View>
      )}

      {tab === "expiring" && expiring.data && (
        <View style={{ gap: spacing["2"] }}>
          {expiring.data.expiring.length === 0 && <AppText color="inkMuted">{t("expiringEmpty")}</AppText>}
          {expiring.data.expiring.map((e) => (
            <Card key={e.documentId} onPress={() => open(e.providerId)} style={{ gap: spacing["1"] }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText weight={600} style={{ flex: 1 }}>
                  {e.tradeName}
                </AppText>
                <Badge label={e.expired ? t("expired") : t("expiringSoon")} tone={e.expired ? "bad" : "new"} />
              </Row>
              <AppText variant="bodySm" color="inkMuted">
                {tl(DOC_LABELS[e.docType])} · {date(dayIso(e.expiresOn))}
              </AppText>
            </Card>
          ))}
        </View>
      )}

      {tab === "all" && all.data && (
        <View style={{ gap: spacing["2"] }}>
          {all.data.providers.length === 0 && <AppText color="inkMuted">{t("noProviders")}</AppText>}
          {all.data.providers.map((p) => (
            <Card key={p.id} onPress={() => open(p.id)} style={{ gap: spacing["1"] }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText weight={600} style={{ flex: 1 }}>
                  {p.tradeName}
                </AppText>
                <Badge label={tl(PROVIDER_STATUS[p.status].label)} tone={PROVIDER_STATUS[p.status].tone} />
              </Row>
              <AppText variant="bodySm" color="inkMuted">
                {cats(p.categories)}
              </AppText>
            </Card>
          ))}
        </View>
      )}

      <Button
        label={t("signOut")}
        variant="ghost"
        icon={IconLogout}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
