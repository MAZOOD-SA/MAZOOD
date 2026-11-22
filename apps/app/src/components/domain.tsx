// مكوّنات خاصة بمزوّد: مربع القسم، وبطاقة الطلب، وبطاقة العرض، وشارة الحالة.
import { radius, spacing } from "@mazood/brand";
import { IconStar } from "@/components/icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { OfferDto, RequestDto } from "@mazood/shared";
import { requestTitle, type Category } from "@/data/categories";
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
export function RequestStatusBadge({ request }: { request: Pick<RequestDto, "status" | "pendingOffers" | "cancelRequestStatus"> }) {
  const { t, num } = useI18n();
  if (request.cancelRequestStatus === "pending") return <Badge label={t("statusCancelPending")} tone="muted" />;
  switch (request.status) {
    case "awaiting_offers": {
      const n = request.pendingOffers;
      if (n === 0) return <Badge label={t("statusAwaiting")} tone="muted" />;
      return <Badge label={n === 1 ? t("oneOffer") : n === 2 ? t("twoOffers") : t("offersCount", { n: num(n) })} tone="new" />;
    }
    case "accepted":
      return <Badge label={t("statusAccepted")} tone="muted" />;
    case "in_progress":
      return <Badge label={t("statusInProgress")} tone="muted" />;
    case "completed":
      return <Badge label={t("statusCompleted")} tone="ok" />;
    case "cancelled":
      return <Badge label={t("statusCancelled")} tone="bad" />;
  }
}

export function RequestCard({ request, onPress }: { request: RequestDto; onPress: () => void }) {
  const { t, tl, relative, num } = useI18n();
  const { colors } = useTheme();
  const unseen = request.status === "awaiting_offers" ? request.unseenOffers : 0;
  return (
    <Card onPress={onPress} style={{ paddingVertical: spacing["3"], paddingHorizontal: 14 }}>
      <Row style={{ justifyContent: "space-between" }}>
        {/* نقطة كهرمانية = عروض جديدة ما انفتحت (بدل شاشة التنبيهات المنفصلة). */}
        {unseen > 0 && <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent }} />}
        <View style={{ flex: 1 }}>
          <AppText variant="bodySm" weight={600}>
            {tl(requestTitle(request))}
          </AppText>
          <AppText variant="caption" color="inkMuted" numberOfLines={1}>
            {unseen > 0 ? `${t("newOffers", { n: num(unseen) })} · ` : ""}
            {relative(request.createdAt)}
          </AppText>
        </View>
        <RequestStatusBadge request={request} />
      </Row>
    </Card>
  );
}

/** بطاقة العرض كما في brand/reference.html. */
export function OfferCard({ offer, onAccept, accepted }: { offer: OfferDto; onAccept?: () => void; accepted?: boolean }) {
  const { t, tl, money, num, locale } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const provider = offer.provider;
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
