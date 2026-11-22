// قائمة الفواتير الموحّدة.
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/layout";
import { AppText, Badge, Card, Row } from "@/components/ui";
import { invoiceTotals } from "@/data/invoices";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function Invoices() {
  const { t, tl, money, date, code } = useI18n();
  const { state } = useStore();

  return (
    <Screen title={t("invoicesTitle")}>
      {state.invoices.length === 0 ? (
        <AppText variant="bodySm" color="inkMuted">
          {t("noInvoices")}
        </AppText>
      ) : (
        state.invoices.map((inv) => {
          const request = state.requests.find((r) => r.id === inv.requestId);
          return (
            <Card key={inv.id} onPress={() => router.push(`/invoice/${inv.id}`)} style={{ gap: spacing["2"] }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySm" weight={600}>
                    {request ? tl(request.title) : code(inv.number)}
                  </AppText>
                  <AppText variant="caption" color="inkMuted">
                    {code(inv.number)} · {date(inv.issuedAt)}
                  </AppText>
                </View>
                <View style={{ alignItems: "flex-end", gap: spacing["1"] }}>
                  <AppText variant="body" weight={700}>
                    {money(invoiceTotals(inv).total)}
                  </AppText>
                  <Badge label={inv.status === "paid" ? t("paid") : t("due")} tone={inv.status === "paid" ? "ok" : "new"} />
                </View>
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
