// «بانتظارك»: أول صفحة في لوحة الإدارة. كل موظف يشوف عدد اللي ينتظره في أقسامه بس (الخادم يرجّع null للباقي).
// وفي الجوال (بدون قائمة جانبية) تحتها قائمة الأقسام اللي يقدر يفتحها.
import { spacing } from "@mazood/brand";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import { StatTile } from "@/components/admin";
import { IconLogout } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { navItemsFor } from "@/components/nav";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { STAFF_ROLE_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useLayout } from "@/lib/layout";
import { useTheme } from "@/theme/ThemeProvider";

type Overview = {
  providersQueue: number | null;
  sellersQueue: number | null;
  identityPending: number | null;
  openDisputes: number | null;
  pendingDeletions: number | null;
  subscriptionsDue: number | null;
};

// كل بطاقة: الرقم، وعنوانها، والشاشة اللي تفتحها.
const CARDS: { key: keyof Overview; label: StringKey; href: Href }[] = [
  { key: "providersQueue", label: "ovProviders", href: "/admin/verification" },
  { key: "sellersQueue", label: "ovSellers", href: "/admin/verification" },
  { key: "identityPending", label: "ovIdentity", href: "/admin/customers?identity=pending" },
  { key: "openDisputes", label: "ovDisputes", href: "/admin/disputes" },
  { key: "pendingDeletions", label: "ovDeletions", href: "/admin/deletions" },
  { key: "subscriptionsDue", label: "ovSubscriptions", href: "/admin/market?tab=subscriptions" },
];

export default function AdminOverview() {
  const { t, tl, num } = useI18n();
  const { colors } = useTheme();
  const { staffRole, signOut } = useStore();
  const allowed = useCan();
  const { sidebar } = useLayout();
  const { data, error } = useLoad<Overview>("/v1/admin/overview");
  const cards = data ? CARDS.filter((c) => data[c.key] !== null) : [];
  const waiting = cards.some((c) => (data?.[c.key] ?? 0) > 0);
  // في الجوال: الأقسام نفسها اللي في القائمة الجانبية (ما عدا هذي الصفحة).
  const sections = navItemsFor("staff", t, allowed).filter((i) => i.href !== "/admin");

  return (
    <Screen title={t("navOverview")}>
      <AppText color="inkMuted">{staffRole ? tl(STAFF_ROLE_LABELS[staffRole]) : ""}</AppText>
      {error && <Notice text={t(error)} />}
      <AppText variant="bodySm" color="inkMuted">
        {t("overviewHint")}
      </AppText>
      {data && !waiting && <Notice text={t("ovAllClear")} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
        {cards.map((c) => (
          <StatTile key={c.key} label={t(c.label)} value={num(data![c.key] ?? 0)} onPress={() => router.push(c.href)} />
        ))}
      </View>

      {!sidebar && sections.length > 0 && (
        <>
          <SectionTitle title={t("adminTitle")} />
          <View style={{ gap: spacing["2"] }}>
            {sections.map((s) => (
              <Card key={String(s.href)} onPress={() => router.push(s.href)}>
                <Row style={{ alignItems: "center" }}>
                  <s.icon size={20} color={colors.inkMuted} strokeWidth={1.75} />
                  <AppText weight={600}>{s.label}</AppText>
                </Row>
              </Card>
            ))}
          </View>
        </>
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
