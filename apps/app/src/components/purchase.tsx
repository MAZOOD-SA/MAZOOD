// تفاصيل طلب الشراء: المنتج والكمية والموعد، ورد المصنع، والتواصل بعد الاتفاق. للمشتري والبائع.
import { spacing } from "@mazood/brand";
import { View } from "react-native";
import type { PurchaseRequest } from "@/api/market-types";
import { SectionTitle } from "@/components/layout";
import { ProductImage, useUnit } from "@/components/market";
import { AppText, Card, Notice, Row } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";

export function PurchaseDetails({ p }: { p: PurchaseRequest }) {
  const { t, num, money, until, digits } = useI18n();
  const unit = useUnit();
  return (
    <>
      <Card style={{ gap: spacing["2"] }}>
        <Row gap="3" style={{ alignItems: "flex-start" }}>
          <ProductImage url={p.product.imageUrl} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight={700}>{p.product.name}</AppText>
            <AppText variant="caption" color="inkMuted">
              {num(p.quantity)} {unit(p.product.unit)} · {t(p.when === "this_month" ? "whenThisMonth" : p.when === "today" ? "whenToday" : p.when === "tomorrow" ? "whenTomorrow" : "whenThisWeek")}
            </AppText>
          </View>
        </Row>
        {p.note && <AppText variant="bodySm">{p.note}</AppText>}
      </Card>
      {p.quote && (
        <Card style={{ gap: spacing["2"] }}>
          <SectionTitle title={t("quoteTitle")} />
          <Line label={t("quoteUnitPrice")} value={money(p.quote.unitPriceHalalas)} />
          <Line label={t("quoteTotal")} value={money(p.quote.totalHalalas)} strong />
          <Line label={t("quoteLeadTime")} value={t("leadDays", { n: num(p.quote.leadTimeDays) })} />
          <Line label={t("quoteDelivery")} value={t(p.quote.deliveryIncluded ? "deliveryIncluded" : "deliveryNotIncluded")} />
          {p.quote.note && <AppText variant="bodySm">{p.quote.note}</AppText>}
          {(p.status === "quoted" || p.status === "expired") && (
            <AppText variant="caption" color="inkMuted">
              {t("quoteValidUntil", { until: until(p.quote.validUntil) })}
            </AppText>
          )}
        </Card>
      )}
      {p.decisionNote && <Notice text={p.decisionNote} />}
      {p.contact && (
        <Card style={{ gap: spacing["2"] }}>
          <SectionTitle title={t("contactTitle")} />
          <AppText weight={600}>{p.contact.name ?? ""}</AppText>
          <AppText style={{ writingDirection: "ltr", alignSelf: "flex-start" }}>{digits(`0${p.contact.phone.slice(4)}`)}</AppText>
          <AppText variant="caption" color="inkMuted">
            {t("contactHint")}
          </AppText>
        </Card>
      )}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant={strong ? "body" : "bodySm"} weight={strong ? 700 : 500}>
        {value}
      </AppText>
    </Row>
  );
}

