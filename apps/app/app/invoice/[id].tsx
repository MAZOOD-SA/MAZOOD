// عرض الفاتورة الموحّدة. هذا **نموذج شكلي فقط**: الفاتورة الإلكترونية الحقيقية حسب
// متطلبات هيئة الزكاة والضريبة والجمارك (XML، ختم، رمز QR، اعتماد من الهيئة) تُبنى في المرحلة ٥.
import { spacing } from "@mazood/brand";
import { IconDownload } from "@/components/icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Badge, Button, Card, Divider, Notice, Row } from "@/components/ui";
import { invoiceTotals } from "@/data/invoices";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function InvoiceView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, money, date, code } = useI18n();
  const { state, factory: FACTORY } = useStore();
  const [downloadNote, setDownloadNote] = useState(false);
  const inv = state.invoices.find((i) => i.id === id);

  if (!inv) {
    return (
      <Screen title={t("invoice")} back>
        <AppText color="inkMuted">{t("notFound")}</AppText>
      </Screen>
    );
  }
  const { subtotal, vat, total } = invoiceTotals(inv);

  return (
    <Screen title={t("invoice")} back>
      <Notice text={t("invoiceSample")} />
      <Card style={{ gap: spacing["3"] }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <LogoMark size={28} />
            <AppText variant="h2" weight={700}>
              {t("appName")}
            </AppText>
          </Row>
          <Badge label={inv.status === "paid" ? t("paid") : t("due")} tone={inv.status === "paid" ? "ok" : "new"} />
        </Row>
        <Line label={t("invoiceNumber")} value={code(inv.number)} />
        <Line label={t("issuedAt")} value={date(inv.issuedAt)} />
        <Divider />
        <Line label={t("seller")} value={t("appName")} />
        <Line label={t("buyer")} value={tl(FACTORY.name)} />
        <Line label={t("vatNumber")} value={code(FACTORY.vatNumber)} />
        <Divider />
        {inv.lines.map((l, i) => (
          <Line key={i} label={tl(l.description)} value={money(l.amountHalalas)} />
        ))}
        <Divider />
        <Line label={t("subtotal")} value={money(subtotal)} />
        <Line label={t("vat")} value={money(vat)} />
        <Row style={{ justifyContent: "space-between" }}>
          <AppText variant="body" weight={600}>
            {t("total")}
          </AppText>
          <AppText variant="price">{money(total)}</AppText>
        </Row>
      </Card>
      <Button label={t("downloadInvoice")} icon={IconDownload} variant="secondary" onPress={() => setDownloadNote(true)} />
      {downloadNote && (
        <AppText variant="bodySm" color="inkMuted">
          {t("downloadLater")}
        </AppText>
      )}
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
