// طلبات حذف الحساب: اللي ينتظر أول. «نفّذ الحذف» يمسح البيانات الشخصية ويبقي الطلبات والفواتير والسجل،
// و«ارفض» لازم سبب يوصل لصاحب الطلب. الإجراء المكتوب: docs/admin/procedures/process-account-deletion.md
import { spacing } from "@mazood/brand";
import { useState } from "react";
import { View } from "react-native";
import { ActionNotices, ReasonDialog } from "@/components/admin";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconTrash, IconX } from "@/components/icons";
import { Screen } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useAction, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type Deletion = {
  id: string;
  role: "factory" | "provider";
  reason: string | null;
  status: "pending" | "done" | "rejected";
  requestedAt: string;
  note: string | null;
  phone: string | null;
  name: string | null;
  customerKind: "business" | "individual" | null;
};

export default function DeletionsScreen() {
  const { t, relative, digits } = useI18n();
  const { authed } = useStore();
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const { data, error, reload } = useLoad<{ deletions: Deletion[] }>(`/v1/admin/deletions${status === "pending" ? "?status=pending" : ""}`);
  const { busy, failure, done, run } = useAction(reload);
  const [target, setTarget] = useState<{ d: Deletion; action: "complete" | "reject" } | null>(null);
  const statusLabel = { pending: t("admDeletionPending"), done: t("deletionDone"), rejected: t("deletionRejected") } as const;
  const who = (d: Deletion) => (d.role === "provider" ? t("providerWord") : d.customerKind === "individual" ? t("customerIndividual") : t("customerBusiness"));

  return (
    <Screen title={t("navDeletions")} back>
      <ActionNotices error={error ? t(error) : null} done={done} />
      <AppText variant="bodySm" color="inkMuted">
        {t("deletionsHint")}
      </AppText>
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          { value: "pending", label: t("admDeletionPending") },
          { value: "all", label: t("admFilterAll") },
        ]}
      />
      <View style={{ gap: spacing["2"] }}>
        {data?.deletions.length === 0 && <AppText color="inkMuted">{t("deletionsEmpty")}</AppText>}
        {data?.deletions.map((d) => (
          <Card key={d.id} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {d.name ?? t("deletedUser")}
              </AppText>
              <Badge label={statusLabel[d.status]} tone={d.status === "pending" ? "new" : d.status === "done" ? "muted" : "bad"} />
            </Row>
            <AppText variant="bodySm" color="inkMuted">
              {who(d)} · {d.phone ? digits(`0${d.phone.slice(4)}`) : t("deletedUser")} · {relative(d.requestedAt)}
            </AppText>
            {d.reason && <AppText variant="bodySm">{t("deletionReason", { reason: d.reason })}</AppText>}
            {d.note && (
              <AppText variant="bodySm" color="inkMuted">
                {d.note}
              </AppText>
            )}
            {d.status === "pending" && (
              <Row style={{ flexWrap: "wrap" }}>
                <Button label={t("completeDeletion")} icon={IconTrash} variant="secondary" tone="danger" onPress={() => setTarget({ d, action: "complete" })} />
                <Button label={t("rejectDeletion")} icon={IconX} variant="ghost" onPress={() => setTarget({ d, action: "reject" })} />
              </Row>
            )}
          </Card>
        ))}
      </View>

      <ConfirmDialog
        visible={target?.action === "complete"}
        title={t("completeDeletionTitle")}
        body={t("completeDeletionBody")}
        confirmLabel={t("completeDeletion")}
        cancelLabel={t("cancelAction")}
        confirmVariant="secondary"
        busy={busy}
        error={failure}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          if (await run(() => authed(`/v1/admin/deletions/${target!.d.id}/complete`, { method: "POST" }), t("deletionCompleted"))) setTarget(null);
        }}
      />
      <ReasonDialog
        visible={target?.action === "reject"}
        title={t("rejectDeletionTitle")}
        confirmLabel={t("rejectDeletion")}
        busy={busy}
        error={failure}
        onCancel={() => setTarget(null)}
        onSubmit={async (reason) => {
          const ok = await run(() => authed(`/v1/admin/deletions/${target!.d.id}/reject`, { method: "POST", body: { reason } }), t("deletionRejectedDone"));
          if (ok) setTarget(null);
          return ok;
        }}
      />
    </Screen>
  );
}
