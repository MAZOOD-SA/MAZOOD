// مراجعة مزوّد: بياناته، ومستنداته مع قائمة التحقق لكل مستند، وقرار التوثيق، والإيقاف.
// خطوات العمل مكتوبة لموظف التوثيق في docs/admin/procedures/verify-provider.md.
import { spacing } from "@mazood/brand";
import type { DocType, ProviderStatus } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { API_URL, ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { DocSlotCard } from "@/components/DocSlotCard";
import { Field } from "@/components/Field";
import { IconBan, IconCheck, IconExternalLink, IconRosetteDiscountCheck, IconX } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Divider, Notice, Row, VerifiedBadge } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { PROVIDER_STATUS } from "@/data/labels";
import type { DocSlotView, DocView } from "@/data/provider-types";
import { useStore } from "@/data/store";
import { useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

type Detail = {
  provider: {
    id: string;
    tradeName: string;
    ownerName: string;
    phone: string;
    idType: "national_id" | "iqama";
    idNumber: string;
    commercialRegister: string;
    categories: string[];
    status: ProviderStatus;
    statusReason: string | null;
    verified: boolean;
    allApprovedValid: boolean;
    documents: DocSlotView[];
  };
  checklists: Record<DocType, { id: string; ar: string; en: string }[]>;
};

export default function AdminProvider() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, digits } = useI18n();
  const { authed } = useStore();
  const allowed = useCan();
  const { data, error, reload } = useLoad<Detail>(id ? `/v1/admin/providers/${id}` : null);
  const [decisionReason, setDecisionReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setFailure(null);
    try {
      await authed(path, { method: "POST", body });
      await reload();
      setDecisionReason("");
      setSuspendReason("");
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  if (!data) {
    return (
      <Screen title={t("providerReviewTitle")} back>
        {error ? <Notice text={t(error)} /> : <AppText color="inkMuted">{t("loading")}</AppText>}
      </Screen>
    );
  }
  const p = data.provider;
  const st = PROVIDER_STATUS[p.status];
  const canReview = allowed("providers.review");
  const showVerify = canReview && p.status === "pending";

  return (
    <Screen
      title={t("providerReviewTitle")}
      back
      footer={
        showVerify ? (
          <Button
            label={t("verifyProvider")}
            icon={IconRosetteDiscountCheck}
            variant="accent"
            size="lg"
            full
            disabled={busy || !p.allApprovedValid}
            onPress={() => act(`/v1/admin/providers/${p.id}/decision`, { decision: "verify" })}
          />
        ) : undefined
      }
    >
      {failure && <Notice text={failure} />}
      <Card style={{ gap: spacing["2"] }}>
        <Row style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <AppText variant="h2" style={{ flexShrink: 1 }}>
            {p.tradeName}
          </AppText>
          {p.verified ? <VerifiedBadge /> : <Badge label={tl(st.label)} tone={st.tone} />}
        </Row>
        <Divider />
        <Info label={t("ownerNameLabel")} value={p.ownerName} />
        <Info label={t("phoneLabel")} value={digits(p.phone ?? "")} ltr />
        <Info label={p.idType === "national_id" ? t("nationalId") : t("iqama")} value={digits(p.idNumber)} ltr />
        <Info label={t("crShort")} value={digits(p.commercialRegister)} ltr />
        <Info label={t("categoriesLabel")} value={p.categories.map((c) => tl(categoryById(c as CategoryId).name)).join(" · ")} />
        {p.statusReason && <Info label={t("lastReason")} value={p.statusReason} />}
      </Card>
      {showVerify && !p.allApprovedValid && <Notice text={t("verifyNeedsAllDocs")} />}

      <SectionTitle title={t("docsTitle")} />
      {p.documents.map((slot) => (
        <DocSlotCard key={slot.docType} slot={slot}>
          {slot.approved && <OpenDoc doc={slot.approved} label={t("openApproved")} />}
          {slot.pending && (
            <PendingReview
              doc={slot.pending}
              checklist={data.checklists[slot.docType]}
              canReview={canReview}
              busy={busy}
              onApprove={(checklist) => act(`/v1/admin/documents/${slot.pending!.id}/review`, { decision: "approve", checklist })}
              onReject={(reason) => act(`/v1/admin/documents/${slot.pending!.id}/review`, { decision: "reject", reason })}
            />
          )}
        </DocSlotCard>
      ))}

      {canReview && p.status === "pending" && (
        <Card style={{ gap: spacing["2"] }}>
          <AppText weight={600}>{t("rejectProviderTitle")}</AppText>
          <Field label={t("reasonForProvider")} value={decisionReason} onChangeText={setDecisionReason} multiline maxLength={500} />
          <Button
            label={t("rejectProvider")}
            icon={IconX}
            variant="secondary"
            tone="danger"
            disabled={busy || decisionReason.trim().length < 5}
            onPress={() => act(`/v1/admin/providers/${p.id}/decision`, { decision: "reject", reason: decisionReason.trim() })}
          />
        </Card>
      )}

      {allowed("providers.suspend") && (
        <Card style={{ gap: spacing["2"] }}>
          <AppText weight={600}>{p.status === "suspended" ? t("reinstateProvider") : t("suspendProvider")}</AppText>
          <Field label={t("reasonInternal")} value={suspendReason} onChangeText={setSuspendReason} multiline maxLength={500} />
          <Button
            label={p.status === "suspended" ? t("reinstateProvider") : t("suspendProvider")}
            icon={IconBan}
            variant="secondary"
            tone={p.status === "suspended" ? "default" : "danger"}
            disabled={busy || suspendReason.trim().length < 5}
            onPress={() => act(`/v1/admin/providers/${p.id}/${p.status === "suspended" ? "reinstate" : "suspend"}`, { reason: suspendReason.trim() })}
          />
        </Card>
      )}
    </Screen>
  );
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <Row style={{ justifyContent: "space-between", gap: spacing["3"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={[{ flexShrink: 1, textAlign: "auto" }, ltr ? { writingDirection: "ltr" } : null]}>
        {value}
      </AppText>
    </Row>
  );
}

/** يطلب رابط مؤقت (٥ دقايق) ويفتح الملف. كل فتح ينكتب في سجل الإجراءات. */
function OpenDoc({ doc, label }: { doc: DocView; label: string }) {
  const { t } = useI18n();
  const { authed } = useStore();
  const allowed = useCan();
  const [failure, setFailure] = useState<string | null>(null);
  if (!allowed("documents.view")) return null;
  return (
    <View style={{ gap: spacing["1"] }}>
      <Button
        label={label}
        icon={IconExternalLink}
        variant="ghost"
        onPress={async () => {
          // في المتصفح نفتح التبويب فورًا (قبل انتظار الخادم)، وإلا يحجبه مانع النوافذ المنبثقة.
          const tab = Platform.OS === "web" ? window.open("about:blank", "_blank") : null;
          try {
            const link = await authed<{ path: string }>(`/v1/admin/documents/${doc.id}/link`);
            const url = `${API_URL}${link.path}`;
            if (tab) {
              tab.opener = null;
              tab.location.href = url;
            } else await Linking.openURL(url);
          } catch (e) {
            tab?.close();
            setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
          }
        }}
      />
      {failure && (
        <AppText variant="bodySm" color="danger">
          {failure}
        </AppText>
      )}
    </View>
  );
}

function PendingReview({
  doc,
  checklist,
  canReview,
  busy,
  onApprove,
  onReject,
}: {
  doc: DocView;
  checklist: { id: string; ar: string; en: string }[];
  canReview: boolean;
  busy: boolean;
  onApprove: (checked: string[]) => void;
  onReject: (reason: string) => void;
}) {
  const { t, tl } = useI18n();
  const { colors } = useTheme();
  const [checked, setChecked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const all = checklist.every((i) => checked.includes(i.id));
  return (
    <View style={{ gap: spacing["2"] }}>
      <OpenDoc doc={doc} label={t("openPending")} />
      {canReview && (
        <>
          <AppText variant="label" weight={600}>
            {t("checklistTitle")}
          </AppText>
          {checklist.map((item) => {
            const on = checked.includes(item.id);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setChecked((c) => (on ? c.filter((x) => x !== item.id) : [...c, item.id]))}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"], paddingVertical: spacing["1"] }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: on ? colors.success : colors.lineStrong,
                    backgroundColor: on ? colors.successSoft : colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {on && <IconCheck size={16} color={colors.success} strokeWidth={2.5} />}
                </View>
                <AppText variant="bodySm" style={{ flex: 1 }}>
                  {tl(item)}
                </AppText>
              </Pressable>
            );
          })}
          <Button label={t("approveDoc")} icon={IconCheck} variant="primary" disabled={busy || !all} onPress={() => onApprove(checked)} />
          <Field label={t("reasonForProvider")} value={reason} onChangeText={setReason} multiline maxLength={500} />
          <Button
            label={t("rejectDoc")}
            icon={IconX}
            variant="secondary"
            tone="danger"
            disabled={busy || reason.trim().length < 5}
            onPress={() => onReject(reason.trim())}
          />
        </>
      )}
    </View>
  );
}
