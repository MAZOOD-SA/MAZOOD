// الصلاحيات (للمالك بس): مين يشوف كل قسم. المالك عنده كل شي دائمًا، والمقفولة قرارات المالك وما تتغيّر
// (العمولة، والصلاحيات نفسها، وإضافة الموظفين). التعديل ينطبق فورًا وينسجل في السجل.
// الإجراء المكتوب: docs/admin/procedures/change-permissions.md
import { spacing } from "@mazood/brand";
import type { Permission, PermissionMap, StaffRole } from "@mazood/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActionNotices } from "@/components/admin";
import { Screen } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Row } from "@/components/ui";
import { STAFF_ROLE_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useAction, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";

type PermView = { roles: StaffRole[]; permissions: Permission[]; defaults: PermissionMap; current: PermissionMap; locked: Permission[] };

export default function PermissionsScreen() {
  const { t, tl } = useI18n();
  const { authed } = useStore();
  const { data, error, reload } = useLoad<PermView>("/v1/admin/permissions");
  const { busy, failure, done, run } = useAction(reload);
  const [draft, setDraft] = useState<Record<string, StaffRole[]>>({});
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.permissions.map((p) => [p, [...data.current[p]]])));
  }, [data]);

  const editableRoles = (data?.roles ?? []).filter((r) => r !== "owner");
  const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
  const changed = !!data && data.permissions.some((p) => !same(draft[p] ?? [], data.current[p]));

  function toggle(p: Permission, r: StaffRole) {
    setDraft((d) => {
      const cur = d[p] ?? [];
      return { ...d, [p]: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] };
    });
  }

  return (
    <Screen
      title={t("navPermissions")}
      back
      footer={
        <Row style={{ flexWrap: "wrap" }}>
          <Button
            label={t("savePermissions")}
            variant="primary"
            disabled={busy || !changed}
            onPress={() => {
              const editable = Object.fromEntries(Object.entries(draft).filter(([p]) => !data?.locked.includes(p as Permission)));
              run(() => authed("/v1/admin/permissions", { method: "PUT", body: { rolePermissions: editable } }), t("permissionsSaved"));
            }}
          />
          <Button
            label={t("resetPermissions")}
            variant="ghost"
            disabled={busy}
            onPress={() => run(() => authed("/v1/admin/permissions", { method: "PUT", body: { rolePermissions: {} } }), t("permissionsSaved"))}
          />
        </Row>
      }
    >
      <ActionNotices error={error ? t(error) : null} failure={failure} done={done} />
      <AppText variant="bodySm" color="inkMuted">
        {t("permissionsHint")}
      </AppText>
      <View style={{ gap: spacing["2"] }}>
        {data?.permissions.map((p) => {
          const locked = data.locked.includes(p);
          const roles = draft[p] ?? [];
          const isDefault = same(roles, data.defaults[p].includes("owner") ? data.defaults[p] : ["owner", ...data.defaults[p]]);
          return (
            <Card key={p} style={{ gap: spacing["2"] }}>
              <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <AppText weight={600} style={{ flex: 1 }}>
                  {t(`perm.${p}` as StringKey)}
                </AppText>
                {locked ? <Badge label={t("permissionLocked")} tone="muted" /> : !isDefault && <Badge label={t("permissionChanged")} tone="new" />}
              </Row>
              {locked ? (
                <AppText variant="bodySm" color="inkMuted">
                  {roles.map((r) => tl(STAFF_ROLE_LABELS[r])).join(" · ")}
                </AppText>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
                  {editableRoles.map((r) => (
                    <Chips key={r} value={roles.includes(r) ? r : null} onChange={() => toggle(p, r)} options={[{ value: r, label: tl(STAFF_ROLE_LABELS[r]) }]} />
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
