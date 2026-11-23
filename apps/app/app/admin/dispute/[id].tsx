// تفاصيل البلاغ لخدمة العملاء: وش صار، والطرفين، والملاحظات (منها الداخلية)، وقراءة المحادثة (تنسجل)، والقرار.
// الإجراء المكتوب: docs/admin/procedures/handle-dispute.md و read-dispute-chat.md
import { spacing } from "@mazood/brand";
import type { ChatView, DisputeReason } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { TimelineEvent } from "@/api/types";
import { ActionNotices, ReasonDialog } from "@/components/admin";
import { Field } from "@/components/Field";
import { Fact, Timeline } from "@/components/flow";
import { IconGavel, IconMessage, IconPlus } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Row } from "@/components/ui";
import { DISPUTE_REASON_LABEL } from "@/data/dispute-labels";
import { useStore } from "@/data/store";
import { useAction, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";

type DisputeView = {
  dispute: {
    id: string;
    number: number;
    reason: DisputeReason;
    details: string | null;
    openedBy: "factory" | "provider" | "system";
    status: "open" | "closed";
    resolution: string | null;
    openedAt: string;
    closedAt: string | null;
    priceHalalas: number;
    factory: { name: string | null; contactPhone: string | null };
    provider: { tradeName: string; contactPhone: string | null };
  };
  notes: { by: string; body: string; internal: boolean; at: string }[];
  timeline: TimelineEvent[];
};

type Decision = "complete" | "cancel" | "resume";
const DECISIONS: { value: Decision; label: StringKey }[] = [
  { value: "resume", label: "resolveResume" },
  { value: "complete", label: "resolveComplete" },
  { value: "cancel", label: "resolveCancel" },
];

export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, num, money, relative, digits } = useI18n();
  const { authed } = useStore();
  const { data, error, reload } = useLoad<DisputeView>(`/v1/admin/disputes/${id}`);
  const { busy, failure, done, run } = useAction(reload);
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState<"internal" | "visible">("internal");
  const [chat, setChat] = useState<ChatView | null>(null);
  const [resolving, setResolving] = useState(false);
  const [decision, setDecision] = useState<Decision>("resume");
  const d = data?.dispute;
  const phone = (p: string | null) => (p ? digits(`0${p.slice(4)}`) : "—");
  const by = (role: string) => (role === "factory" ? t("openedByCustomer") : role === "provider" ? t("openedByProvider") : role === "system" ? t("openedBySystem") : t("staffAccount"));

  return (
    <Screen
      title={d ? t("disputeNumber", { n: num(d.number) }) : t("navDisputes")}
      back
      footer={
        d?.status === "open" ? <Button label={t("resolveDispute")} icon={IconGavel} variant="primary" size="lg" full disabled={busy} onPress={() => setResolving(true)} /> : undefined
      }
    >
      <ActionNotices error={error ? t(error) : null} failure={resolving ? null : failure} done={done} />
      {d && data && (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            <Badge label={d.status === "open" ? t("disputeOpen") : t("disputeClosed")} tone={d.status === "open" ? "bad" : "muted"} />
            <Badge label={t(DISPUTE_REASON_LABEL[d.reason])} tone="muted" />
          </Row>
          <AppText variant="bodySm" color="inkMuted">
            {t("disputeOpenedBy", { who: by(d.openedBy) })} · {relative(d.openedAt)}
          </AppText>
          {d.details && (
            <Card style={{ gap: spacing["1"] }}>
              <AppText variant="caption" color="inkMuted">
                {t("disputeDetailsTitle")}
              </AppText>
              <AppText>{d.details}</AppText>
            </Card>
          )}
          {d.resolution && (
            <Card>
              <AppText>{d.resolution}</AppText>
            </Card>
          )}

          <SectionTitle title={t("disputeParties")} />
          <Card style={{ gap: spacing["2"] }}>
            <Fact label={t("openedByCustomer")} value={`${d.factory.name ?? "—"} · ${phone(d.factory.contactPhone)}`} />
            <Fact label={t("openedByProvider")} value={`${d.provider.tradeName} · ${phone(d.provider.contactPhone)}`} />
            <Fact label={t("admAgreedPrice")} value={money(d.priceHalalas)} />
          </Card>

          <SectionTitle title={t("disputeNotes")} />
          <View style={{ gap: spacing["2"] }}>
            {data.notes.map((n, i) => (
              <Card key={i} style={{ gap: 2 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <AppText variant="caption" color="inkMuted">
                    {by(n.by)} · {relative(n.at)}
                  </AppText>
                  {n.internal && <Badge label={t("noteInternal")} tone="new" />}
                </Row>
                <AppText>{n.body}</AppText>
              </Card>
            ))}
          </View>
          <Field label={t("noteBody")} value={note} onChangeText={setNote} multiline maxLength={1000} />
          <Chips
            value={internal}
            onChange={setInternal}
            options={[
              { value: "internal", label: t("noteInternalToggle") },
              { value: "visible", label: t("noteVisibleToggle") },
            ]}
          />
          <Button
            label={t("admAddNote")}
            icon={IconPlus}
            variant="secondary"
            disabled={busy || note.trim().length < 3}
            onPress={async () => {
              const ok = await run(
                () => authed(`/v1/admin/disputes/${id}/notes`, { method: "POST", body: { body: note.trim(), internal: internal === "internal" } }),
                t("noteAdded"),
              );
              if (ok) setNote("");
            }}
          />

          <SectionTitle title={t("readChat")} />
          {chat ? (
            <View style={{ gap: spacing["2"] }}>
              {chat.items.filter((x) => x.kind === "message").length === 0 && <AppText color="inkMuted">{t("chatEmpty")}</AppText>}
              {chat.items.map((m) =>
                m.kind === "message" ? (
                  <Card key={m.id} style={{ gap: 2 }}>
                    <AppText variant="caption" color="inkMuted">
                      {m.from === "customer" ? t("admChatFromCustomer") : t("admChatFromProvider")} · {relative(m.at)}
                    </AppText>
                    <AppText>{m.body}</AppText>
                  </Card>
                ) : null,
              )}
            </View>
          ) : (
            <>
              <AppText variant="caption" color="inkMuted">
                {t("readChatHint")}
              </AppText>
              <Button
                label={t("readChat")}
                icon={IconMessage}
                variant="secondary"
                disabled={busy}
                onPress={() => run(async () => setChat(await authed<ChatView>(`/v1/admin/disputes/${id}/messages`)), "")}
              />
            </>
          )}

          <SectionTitle title={t("timelineTitle")} />
          <Timeline events={data.timeline} />
        </>
      )}

      <ReasonDialog
        visible={resolving}
        title={t("resolveDispute")}
        confirmLabel={t("resolveDispute")}
        minLength={3}
        busy={busy}
        error={failure}
        onCancel={() => setResolving(false)}
        onSubmit={async (reason) => {
          const ok = await run(() => authed(`/v1/admin/disputes/${id}/resolve`, { method: "POST", body: { decision, note: reason } }), t("disputeResolved"));
          if (ok) setResolving(false);
          return ok;
        }}
      >
        <Chips value={decision} onChange={setDecision} options={DECISIONS.map((x) => ({ value: x.value, label: t(x.label) }))} />
        <AppText variant="caption" color="inkMuted">
          {t("resolveNote")}
        </AppText>
      </ReasonDialog>
    </Screen>
  );
}
