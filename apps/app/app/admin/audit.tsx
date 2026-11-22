// سجل الإجراءات: مين سوّى وش ومتى. للقراءة فقط، وما ينحذف منه شي.
import { spacing } from "@mazood/brand";
import { useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Screen } from "@/components/layout";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { AUDIT_ACTIONS, STAFF_ROLE_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StaffRole } from "@mazood/shared";

type Entry = { id: string; at: string; actorRole: string | null; actorName: string | null; action: string; entity: string | null; entityId: string | null; details: Record<string, unknown> };

export default function AuditScreen() {
  const { t, tl, date, relative } = useI18n();
  const { authed } = useStore();
  const { data, error } = useLoad<{ entries: Entry[] }>("/v1/admin/audit");
  const [more, setMore] = useState<Entry[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const entries = [...(data?.entries ?? []), ...more];

  const actor = (e: Entry) => {
    const role = e.actorRole && e.actorRole in STAFF_ROLE_LABELS ? tl(STAFF_ROLE_LABELS[e.actorRole as StaffRole]) : e.actorRole === "factory" ? t("factory") : e.actorRole === "provider" ? t("providerWord") : (e.actorRole ?? "");
    return [e.actorName, role].filter(Boolean).join(" · ");
  };

  return (
    <Screen title={t("auditTitle")} back>
      {(error || failure) && <Notice text={failure ?? t(error!)} />}
      <AppText variant="bodySm" color="inkMuted">
        {t("auditHint")}
      </AppText>
      <View style={{ gap: spacing["2"] }}>
        {entries.map((e) => (
          <Card key={e.id} style={{ gap: 2 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {AUDIT_ACTIONS[e.action] ? tl(AUDIT_ACTIONS[e.action]) : e.action}
              </AppText>
              <AppText variant="caption" color="inkMuted">
                {relative(e.at)}
              </AppText>
            </Row>
            <AppText variant="bodySm" color="inkMuted">
              {actor(e)}
            </AppText>
            {typeof e.details.reason === "string" && <AppText variant="bodySm">{e.details.reason}</AppText>}
            <AppText variant="caption" color="inkMuted">
              {date(e.at)}
            </AppText>
          </Card>
        ))}
      </View>
      {entries.length > 0 && entries.length % 100 === 0 && (
        <Button
          label={t("loadMore")}
          variant="secondary"
          onPress={async () => {
            try {
              const r = await authed<{ entries: Entry[] }>(`/v1/admin/audit?before=${entries[entries.length - 1].id}`);
              setMore((m) => [...m, ...r.entries]);
            } catch (err) {
              setFailure(t(errorKey(err instanceof ApiClientError ? err.code : "server")));
            }
          }}
        />
      )}
    </Screen>
  );
}
