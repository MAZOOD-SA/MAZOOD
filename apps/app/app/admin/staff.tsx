// إدارة الموظفين: إضافة موظف بدوره، وإيقافه (يسحب صلاحيته فورًا ويلغي جلساته).
// المدير العام يضيف ويوقف كل الأدوار ما عدا المدير العام والمالك. إضافة مدير عام قرار المالك.
import { spacing } from "@mazood/brand";
import { canManageRole, normalizeSaudiMobile, STAFF_ROLES, type StaffRole } from "@mazood/shared";
import { useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Field } from "@/components/Field";
import { IconPlus } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { STAFF_ROLE_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type StaffRow = { userId: string; name: string | null; phone: string; role: StaffRole; active: boolean };

export default function StaffScreen() {
  const { t, tl, digits } = useI18n();
  const { authed, staffRole } = useStore();
  const { data, error, reload } = useLoad<{ staff: StaffRow[] }>("/v1/admin/staff");
  const assignable = STAFF_ROLES.filter((r) => staffRole && canManageRole(staffRole, r));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>(assignable[assignable.length - 1] ?? "support");
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      await fn();
      setDone(ok);
      await reload();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  function add() {
    const n = normalizeSaudiMobile(phone);
    if (!n) return setFailure(t("phoneInvalid"));
    if (name.trim().length < 2) return setFailure(t("nameRequired"));
    run(() => authed("/v1/admin/staff", { method: "POST", body: { phone: n, role, name: name.trim() } }), t("staffAdded")).then(() => {
      setName("");
      setPhone("");
    });
  }

  return (
    <Screen
      title={t("staffTitle")}
      back
      footer={<Button label={t("addStaff")} icon={IconPlus} variant="accent" size="lg" full onPress={add} disabled={busy} />}
    >
      {error && <Notice text={t(error)} />}
      {failure && <Notice text={failure} />}
      {done && <Notice text={done} />}

      <SectionTitle title={t("addStaff")} />
      <Field label={t("staffName")} value={name} onChangeText={setName} maxLength={80} />
      <Field label={t("phoneLabel")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05XXXXXXXX" ltr />
      <Chips value={role} onChange={setRole} options={assignable.map((r) => ({ value: r, label: tl(STAFF_ROLE_LABELS[r]) }))} />
      <AppText variant="caption" color="inkMuted">
        {t("staffAddHint")}
      </AppText>

      <SectionTitle title={t("staffList")} />
      <View style={{ gap: spacing["2"] }}>
        {data?.staff.map((s) => (
          <Card key={s.userId} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {s.name ?? "—"}
              </AppText>
              <Badge label={s.active ? tl(STAFF_ROLE_LABELS[s.role]) : t("inactive")} tone={s.active ? "ok" : "muted"} />
            </Row>
            <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: "auto" }}>
              {digits(s.phone)}
            </AppText>
            {s.active && staffRole && canManageRole(staffRole, s.role) && (
              <Button
                label={t("deactivate")}
                variant="ghost"
                tone="danger"
                disabled={busy}
                onPress={() => run(() => authed(`/v1/admin/staff/${s.userId}/deactivate`, { method: "POST" }), t("staffDeactivated"))}
              />
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
