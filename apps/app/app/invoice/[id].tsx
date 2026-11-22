// ملخص مبلغ طلب مكتمل. هذا **مو فاتورة ضريبية**: الفاتورة الإلكترونية الحقيقية حسب متطلبات
// هيئة الزكاة والضريبة والجمارك (رقم تسلسلي، XML، ختم، رمز QR، ربط مع الهيئة) تُبنى في المرحلة ٥،
// بعد ما ينحسم «مين البائع في الفاتورة» (سؤال ٢ في PLAN.md).
import { spacing } from "@mazood/brand";
import { vatOf } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useRequest } from "@/api/requests";
import { useSession } from "@/api/session";
import { SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Badge, Card, Divider, Notice, Row } from "@/components/ui";
import { requestTitle } from "@/data/categories";
import { useI18n } from "@/i18n/I18nProvider";

export default function InvoiceView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, money, date, code } = useI18n();
  const { me } = useSession();
  const q = useRequest(id);
  const r = q.data;

  if (q.isPending) {
    return (
      <Screen title={t("invoice")} back>
        <SkeletonList count={1} />
      </Screen>
    );
  }
  if (!r || r.status !== "completed" || !r.acceptedOffer) {
    return (
      <Screen title={t("invoice")} back>
        <AppText color="inkMuted">{t("notFound")}</AppText>
      </Screen>
    );
  }
  const subtotal = r.acceptedOffer.priceHalalas;
  const vat = vatOf(subtotal);
  const factory = me?.factory;

  return (
    <Screen title={t("invoice")} back>
      <Notice text={t("invoicePreview")} />
      <Card style={{ gap: spacing["3"] }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <LogoMark size={28} />
            <AppText variant="h2" weight={700}>
              {t("appName")}
            </AppText>
          </Row>
          <Badge label={t("statusCompleted")} tone="ok" />
        </Row>
        <Line label={t("requestRef")} value={code(r.id.slice(0, 8).toUpperCase())} />
        {r.completedAt && <Line label={t("completedAt")} value={date(r.completedAt)} />}
        <Divider />
        <Line label={t("seller")} value={tl(r.acceptedOffer.provider.name)} />
        <Line label={t("buyer")} value={factory?.name ?? ""} />
        <Line label={t("vatNumber")} value={factory?.vatNumber ? code(factory.vatNumber) : t("notProvided")} />
        <Divider />
        <Line label={tl(requestTitle(r))} value={money(subtotal)} />
        <Divider />
        <Line label={t("subtotal")} value={money(subtotal)} />
        <Line label={t("vat")} value={money(vat)} />
        <Row style={{ justifyContent: "space-between" }}>
          <AppText variant="body" weight={600}>
            {t("total")}
          </AppText>
          <AppText variant="price">{money(subtotal + vat)}</AppText>
        </Row>
      </Card>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing["3"] }}>
      <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="bodySm" weight={600}>
        {value}
      </AppText>
    </View>
  );
}
