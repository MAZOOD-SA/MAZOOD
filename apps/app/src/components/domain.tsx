// مكوّنات خاصة بمزوّد: مربع القسم، وبطاقة الطلب، وبطاقة العرض، وشارة الحالة.
import { radius, spacing } from "@mazood/brand";
import { IconStar } from "@/components/icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Category } from "@/data/categories";
import { PROVIDERS } from "@/data/seed";
import type { Offer, ServiceRequest } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber } from "@/lib/format";
import { withVat } from "@/lib/money";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText, Badge, Button, Card, Divider, Row, VerifiedBadge } from "./ui";

export function CategoryTile({ category, onPress, compact }: { category: Category; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const { tl } = useI18n();
  const Icon = category.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tl(category.name)}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 96,
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: compact ? 14 : radius.lg,
        padding: compact ? spacing["3"] : spacing["4"],
        gap: compact ? 6 : spacing["2"],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {compact ? (
        <Icon size={22} color={colors.ink} strokeWidth={1.75} />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          <Icon size={24} color={colors.ink} strokeWidth={1.75} />
        </View>
      )}
      <AppText variant={compact ? "caption" : "body"} weight={600} style={compact ? { fontSize: 13, lineHeight: 20 } : undefined}>
        {tl(category.name)}
      </AppText>
      {!compact && (
        <AppText variant="caption" color="inkMuted" style={{ fontSize: 13, lineHeight: 20 }}>
          {tl(category.hint)}
        </AppText>
      )}
    </Pressable>
  );
}

/** شارة حالة الطلب. «بانتظار العروض» تصير «٣ عروض» أول ما توصل عروض. */
export function RequestStatusBadge({ request, pendingOffers }: { request: ServiceRequest; pendingOffers: number }) {
  const { t, num } = useI18n();
  switch (request.status) {
    case "awaiting_offers":
      if (pendingOffers === 0) return <Badge label={t("statusAwaiting")} tone="muted" />;
      if (pendingOffers === 1) return <Badge label={t("oneOffer")} tone="new" />;
      if (pendingOffers === 2) return <Badge label={t("twoOffers")} tone="new" />;
      return <Badge label={t("offersCount", { n: num(pendingOffers) })} tone="new" />;
    case "in_progress":
      return <Badge label={t("statusInProgress")} tone="muted" />;
    case "completed":
      return <Badge label={t("statusCompleted")} tone="ok" />;
    case "cancelled":
      return <Badge label={t("statusCancelled")} tone="bad" />;
  }
}

export function RequestCard({ request, pendingOffers, onPress }: { request: ServiceRequest; pendingOffers: number; onPress: () => void }) {
  const { tl, relative } = useI18n();
  return (
    <Card onPress={onPress} style={{ paddingVertical: spacing["3"], paddingHorizontal: 14 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <AppText variant="bodySm" weight={600}>
            {tl(request.title)}
          </AppText>
          <AppText variant="caption" color="inkMuted">
            {relative(request.createdAt)}
          </AppText>
        </View>
        <RequestStatusBadge request={request} pendingOffers={pendingOffers} />
      </Row>
    </Card>
  );
}

/** بطاقة العرض كما في brand/reference.html. */
export function OfferCard({ offer, onAccept, accepted }: { offer: Offer; onAccept?: () => void; accepted?: boolean }) {
  const { t, tl, money, num, locale } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const provider = PROVIDERS.find((p) => p.id === offer.providerId);
  if (!provider) return null;
  const hasNote = offer.note.ar.length > 0;
  return (
    <Card style={{ gap: spacing["3"] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing["2"] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ flexWrap: "wrap" }}>
            <AppText variant="body" weight={600}>
              {tl(provider.name)}
            </AppText>
            {provider.verified && <VerifiedBadge />}
          </Row>
          <Row gap="1">
            <IconStar size={14} color={colors.inkMuted} strokeWidth={2} />
            <AppText variant="caption" color="inkMuted" style={{ fontSize: 13 }}>
              {formatNumber(provider.ratingTenths / 10, locale, 1)} · {t("completedOrders", { n: num(provider.completedOrders) })}
            </AppText>
          </Row>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AppText variant="price">{money(withVat(offer.priceHalalas))}</AppText>
          <AppText variant="caption" color="inkMuted">
            {t("includesVat")}
          </AppText>
        </View>
      </View>
      <Divider />
      <AppText variant="bodySm" color="inkMuted">
        {tl(offer.summary)}
      </AppText>
      {open && hasNote && (
        <AppText variant="bodySm" color="ink">
          {tl(offer.note)}
        </AppText>
      )}
      {(onAccept || hasNote) && !accepted && (
        <Row>
          {onAccept && <Button label={t("acceptOffer")} variant="primary" onPress={onAccept} />}
          {hasNote && <Button label={open ? t("hideDetails") : t("details")} variant="ghost" onPress={() => setOpen(!open)} />}
        </Row>
      )}
    </Card>
  );
}
