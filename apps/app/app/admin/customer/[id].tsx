// صفحة العميل: بياناته وحساباته وآخر طلباته. رقم هوية الفرد كامل بس لمن عنده customers.identity (والاطلاع ينسجل)،
// وزر «أكّد الهوية» يدويًا لين يجهز نفاذ. الإجراء المكتوب: docs/admin/procedures/verify-individual-identity.md
import { spacing } from "@mazood/brand";
import type { RequestStatus } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ActionNotices } from "@/components/admin";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RequestStatusBadge } from "@/components/domain";
import { Fact } from "@/components/flow";
import { IconCheck } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Row } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { useStore } from "@/data/store";
import { useAction, useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type CustomerView = {
  customer: {
    id: string;
    kind: "business" | "individual" | null;
    name: string | null;
    commercialRegister: string | null;
    vatNumber: string | null;
    idType: "national_id" | "iqama" | null;
    idNumber: string | null;
    identity: { status: "not_required" | "pending" | "verified"; verifiedAt: string | null; method: string | null };
    profileComplete: boolean;
    members: { phone: string | null; role: "manager" | "member"; active: boolean }[];
    createdAt: string;
  };
  requests: { id: string; category: CategoryId; status: RequestStatus; createdAt: string }[];
};

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, digits, relative } = useI18n();
  const { authed } = useStore();
  const allowed = useCan();
  const { data, error, reload } = useLoad<CustomerView>(`/v1/admin/customers/${id}`);
  const { busy, failure, done, run } = useAction(reload);
  const [confirm, setConfirm] = useState(false);
  const c = data?.customer;
  const canIdentity = allowed("customers.identity");

  return (
    <Screen
      title={c?.name ?? t("customerTitle")}
      back
      footer={
        c?.identity.status === "pending" && canIdentity ? (
          <Button label={t("verifyIdentity")} icon={IconCheck} variant="primary" size="lg" full disabled={busy} onPress={() => setConfirm(true)} />
        ) : undefined
      }
    >
      <ActionNotices error={error ? t(error) : null} failure={failure} done={done} />
      {c && (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            {c.kind && <Badge label={c.kind === "individual" ? t("customerIndividual") : t("customerBusiness")} tone="muted" />}
            {c.identity.status === "pending" && <Badge label={t("identityPending")} tone="new" />}
            {c.identity.status === "verified" && <Badge label={t("identityVerified")} tone="ok" />}
            {!c.profileComplete && <Badge label={t("profileIncomplete")} tone="muted" />}
          </Row>
          <Card style={{ gap: spacing["2"] }}>
            {c.kind === "business" && (
              <>
                <Fact label={t("sellerRegister")} value={c.commercialRegister ? digits(c.commercialRegister) : "—"} ltr />
                <Fact label={t("sellerVat")} value={c.vatNumber ? digits(c.vatNumber) : "—"} ltr />
              </>
            )}
            {c.kind === "individual" && (
              <>
                <Fact label={t("customerIdFull")} value={c.idNumber ? digits(c.idNumber) : "—"} ltr />
                <AppText variant="caption" color="inkMuted">
                  {canIdentity ? t("customerIdViewedHint") : t("customerIdHidden")}
                </AppText>
              </>
            )}
          </Card>

          <SectionTitle title={t("customerMembers")} />
          <View style={{ gap: spacing["2"] }}>
            {c.members.map((m, i) => (
              <Card key={i}>
                <Row style={{ justifyContent: "space-between" }}>
                  <AppText style={{ writingDirection: "ltr", textAlign: "auto", flex: 1 }}>{m.phone ? digits(`0${m.phone.slice(4)}`) : t("deletedUser")}</AppText>
                  <Badge label={!m.active ? t("inactive") : m.role === "manager" ? t("memberManager") : t("memberMember")} tone={m.active ? "muted" : "bad"} />
                </Row>
              </Card>
            ))}
          </View>

          <SectionTitle title={t("customerRequestsTitle")} />
          <View style={{ gap: spacing["2"] }}>
            {data.requests.length === 0 && <AppText color="inkMuted">{t("customerNoRequests")}</AppText>}
            {data.requests.map((r) => (
              <Card key={r.id}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <AppText style={{ flex: 1 }}>{tl(categoryById(r.category).name)}</AppText>
                  <RequestStatusBadge status={r.status} />
                </Row>
                <AppText variant="caption" color="inkMuted">
                  {relative(r.createdAt)}
                </AppText>
              </Card>
            ))}
          </View>
        </>
      )}

      <ConfirmDialog
        visible={confirm}
        title={t("verifyIdentityTitle")}
        body={t("verifyIdentityBody")}
        confirmLabel={t("verifyIdentity")}
        cancelLabel={t("cancelAction")}
        busy={busy}
        error={failure}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (await run(() => authed(`/v1/admin/customers/${id}/verify-identity`, { method: "POST" }), t("identityConfirmed"))) setConfirm(false);
        }}
      />
    </Screen>
  );
}
