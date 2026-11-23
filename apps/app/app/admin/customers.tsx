// العملاء (منشآت وأفراد): بحث بالاسم أو الجوال، وتصفية بالنوع أو «ينتظرون تأكيد الهوية». بدون أرقام الهوية هنا.
import { spacing } from "@mazood/brand";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Badge, Card, Chips, Notice, Row } from "@/components/ui";
import { useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type Customer = {
  id: string;
  kind: "business" | "individual" | null;
  name: string | null;
  profileComplete: boolean;
  identity: "not_required" | "pending" | "verified";
  requestCount: number;
  createdAt: string;
};
type Filter = "all" | "business" | "individual" | "pending";

export default function CustomersScreen() {
  const { t, num, relative } = useI18n();
  const params = useLocalSearchParams<{ identity?: string }>();
  const [filter, setFilter] = useState<Filter>(params.identity === "pending" ? "pending" : "all");
  const [q, setQ] = useState("");
  const query = new URLSearchParams();
  if (filter === "business" || filter === "individual") query.set("kind", filter);
  if (filter === "pending") query.set("identity", "pending");
  if (q.trim().length >= 2) query.set("q", q.trim());
  const qs = query.toString();
  const { data, error } = useLoad<{ customers: Customer[] }>(`/v1/admin/customers${qs ? `?${qs}` : ""}`);

  return (
    <Screen title={t("navCustomers")} back>
      {error && <Notice text={t(error)} />}
      <Field label={t("customersSearch")} value={q} onChangeText={setQ} maxLength={60} />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("admFilterAll") },
          { value: "business", label: t("customerBusiness") },
          { value: "individual", label: t("customerIndividual") },
          { value: "pending", label: t("identityFilterPending") },
        ]}
      />
      <View style={{ gap: spacing["2"] }}>
        {data?.customers.length === 0 && <AppText color="inkMuted">{t("customersEmpty")}</AppText>}
        {data?.customers.map((c) => (
          <Card key={c.id} onPress={() => router.push({ pathname: "/admin/customer/[id]", params: { id: c.id } })} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {c.name ?? "—"}
              </AppText>
              {c.kind && <Badge label={c.kind === "individual" ? t("customerIndividual") : t("customerBusiness")} tone="muted" />}
              {c.identity === "pending" && <Badge label={t("identityPending")} tone="new" />}
              {c.identity === "verified" && <Badge label={t("identityVerified")} tone="ok" />}
              {!c.profileComplete && <Badge label={t("profileIncomplete")} tone="muted" />}
            </Row>
            <AppText variant="caption" color="inkMuted">
              {t("customerRequests", { n: num(c.requestCount) })} · {relative(c.createdAt)}
            </AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
