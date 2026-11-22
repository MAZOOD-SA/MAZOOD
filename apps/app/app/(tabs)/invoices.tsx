// الفواتير: الطلبات المكتملة مع مبلغها. الفاتورة الضريبية الرسمية (فاتورة) تُبنى في المرحلة ٥،
// والحين نعرض ملخص المبلغ من العرض المقبول، ومكتوب عليه بوضوح إنه مو فاتورة ضريبية.
import { spacing } from "@mazood/brand";
import { withVat } from "@mazood/shared";
import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useRequests } from "@/api/requests";
import { Screen } from "@/components/layout";
import { AppText, Card, Notice, Row } from "@/components/ui";
import { requestTitle } from "@/data/categories";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Invoices() {
  const { t, tl, money, date } = useI18n();
  const { colors } = useTheme();
  const q = useRequests();
  const completed = (q.data ?? []).filter((r) => r.status === "completed" && r.acceptedPriceHalalas !== null);

  return (
    <Screen title={t("invoicesTitle")}>
      <Notice text={t("invoicePreview")} />
      {q.isPending ? (
        <ActivityIndicator color={colors.inkMuted} />
      ) : q.isError ? (
        <AppText variant="bodySm" color="danger">
          {errorMessage(q.error, t)}
        </AppText>
      ) : completed.length === 0 ? (
        <AppText variant="bodySm" color="inkMuted">
          {t("noInvoices")}
        </AppText>
      ) : (
        completed.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/invoice/${r.id}`)} style={{ gap: spacing["2"] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm" weight={600}>
                  {tl(requestTitle(r))}
                </AppText>
                <AppText variant="caption" color="inkMuted">
                  {r.completedAt ? date(r.completedAt) : ""}
                </AppText>
              </View>
              <AppText variant="body" weight={700}>
                {money(withVat(r.acceptedPriceHalalas!))}
              </AppText>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
