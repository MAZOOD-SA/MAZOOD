// صفحة البائع (سوق المنتجات) لموظف التوثيق: السجل التجاري وقائمة تحقق، والتوثيق أو الرفض مع السبب،
// والإيقاف ورفعه (المدير)، ودفعات الاشتراك للاطلاع. الإجراء المكتوب: docs/admin/procedures/verify-seller.md
import { spacing } from "@mazood/brand";
import type { ProviderStatus } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ActionNotices, OpenFileButton, ReasonDialog } from "@/components/admin";
import { dayIso } from "@/components/DocSlotCard";
import { Fact } from "@/components/flow";
import { IconBan, IconCheck, IconRefresh, IconX } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Row } from "@/components/ui";
import { PROVIDER_STATUS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useAction, useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";

type SellerView = {
  seller: {
    id: string;
    name: string | null;
    commercialRegister: string | null;
    vatNumber: string | null;
    status: ProviderStatus;
    statusReason: string | null;
    document: { id: string; status: string; expiresOn: string; rejectReason: string | null } | null;
    documentValid: boolean;
    subscription: { endsAt: string } | null;
    listed: boolean;
  };
  payments: { amountHalalas: number; paidOn: string; reference: string; recordedAt: string }[];
};

const CHECKS: StringKey[] = ["sellerCheckName", "sellerCheckNumber", "sellerCheckValid"];

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, date, money, digits } = useI18n();
  const { authed } = useStore();
  const allowed = useCan();
  const { data, error, reload } = useLoad<SellerView>(`/v1/admin/market/sellers/${id}`);
  const { busy, failure, done, run } = useAction(reload);
  const [checked, setChecked] = useState<Set<StringKey>>(new Set());
  const [dialog, setDialog] = useState<"reject" | "suspend" | "reinstate" | null>(null);
  const s = data?.seller;
  const pending = s?.status === "pending" && s.document?.status === "pending";
  const allChecked = CHECKS.every((c) => checked.has(c));

  const post = (path: string, body: object, ok: string) =>
    run(() => authed(`/v1/admin/market/sellers/${id}/${path}`, { method: "POST", body }), ok);

  return (
    <Screen
      title={s?.name ?? t("sellerTitle")}
      back
      footer={
        pending && allowed("sellers.review") ? (
          <Row style={{ flexWrap: "wrap" }}>
            <Button label={t("verifySeller")} icon={IconCheck} variant="primary" disabled={!allChecked || busy} onPress={() => post("decision", { decision: "verify" }, t("sellerVerified"))} />
            <Button label={t("rejectSeller")} icon={IconX} variant="secondary" tone="danger" disabled={busy} onPress={() => setDialog("reject")} />
          </Row>
        ) : undefined
      }
    >
      <ActionNotices error={error ? t(error) : null} failure={failure} done={done} />
      {s && (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            <Badge label={tl(PROVIDER_STATUS[s.status].label)} tone={s.status === "pending" ? "new" : PROVIDER_STATUS[s.status].tone} />
            <Badge label={s.listed ? t("sellerListed") : t("sellerNotListed")} tone={s.listed ? "ok" : "muted"} />
          </Row>
          {s.statusReason && <AppText variant="bodySm" color="inkMuted">{s.statusReason}</AppText>}

          <Card style={{ gap: spacing["2"] }}>
            <Fact label={t("sellerRegister")} value={s.commercialRegister ? digits(s.commercialRegister) : "—"} ltr />
            <Fact label={t("sellerVat")} value={s.vatNumber ? digits(s.vatNumber) : "—"} ltr />
            {s.document ? (
              <>
                <AppText variant="bodySm" color="inkMuted">
                  {t("sellerDocExpires", { date: date(dayIso(s.document.expiresOn)) })}
                </AppText>
                <OpenFileButton linkPath={`/v1/admin/market/seller-documents/${s.document.id}/link`} label={t("openRegister")} />
              </>
            ) : (
              <AppText color="inkMuted">{t("sellerNoDoc")}</AppText>
            )}
          </Card>

          {pending && allowed("sellers.review") && (
            <>
              <SectionTitle title={t("checklistTitle")} />
              <View style={{ gap: spacing["2"] }}>
                {CHECKS.map((c) => {
                  const on = checked.has(c);
                  return (
                    <Card
                      key={c}
                      onPress={() =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(c);
                          else next.add(c);
                          return next;
                        })
                      }
                    >
                      <Row style={{ alignItems: "center" }}>
                        <Badge label={on ? "✓" : " "} tone={on ? "ok" : "muted"} />
                        <AppText style={{ flex: 1 }}>{t(c)}</AppText>
                      </Row>
                    </Card>
                  );
                })}
              </View>
            </>
          )}

          {allowed("providers.suspend") && (s.status === "verified" || s.status === "suspended") && (
            <Button
              label={s.status === "suspended" ? t("reinstateSeller") : t("suspendSeller")}
              icon={s.status === "suspended" ? IconRefresh : IconBan}
              variant="ghost"
              tone={s.status === "suspended" ? "default" : "danger"}
              onPress={() => setDialog(s.status === "suspended" ? "reinstate" : "suspend")}
            />
          )}

          <SectionTitle title={t("paymentsTitle")} />
          {data.payments.length === 0 && <AppText color="inkMuted">{t("noPayments")}</AppText>}
          {data.payments.map((p) => (
            <Card key={p.recordedAt} style={{ gap: 2 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText weight={600}>{money(p.amountHalalas)}</AppText>
                <AppText variant="caption" color="inkMuted">
                  {date(dayIso(p.paidOn))}
                </AppText>
              </Row>
              <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: "auto" }}>
                {p.reference}
              </AppText>
            </Card>
          ))}
        </>
      )}

      <ReasonDialog
        visible={dialog !== null}
        title={dialog === "reject" ? t("rejectSeller") : dialog === "suspend" ? t("suspendSeller") : t("reinstateSeller")}
        confirmLabel={dialog === "reject" ? t("rejectSeller") : dialog === "suspend" ? t("suspendSeller") : t("reinstateSeller")}
        minLength={3}
        danger={dialog !== "reinstate"}
        busy={busy}
        error={failure}
        onCancel={() => setDialog(null)}
        onSubmit={async (reason) => {
          const ok =
            dialog === "reject"
              ? await post("decision", { decision: "reject", reason }, t("sellerRejected"))
              : dialog === "suspend"
                ? await post("suspend", { reason }, t("sellerSuspended"))
                : await post("reinstate", { reason }, t("sellerReinstated"));
          if (ok) setDialog(null);
          return ok;
        }}
      />
    </Screen>
  );
}
