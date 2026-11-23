// مكوّنات خاصة بمزوّد: مربع القسم، وبطاقة الطلب، وشارة الحالة.
import { radius, spacing } from "@mazood/brand";
import type { RequestStatus } from "@mazood/shared";
import { Pressable, View } from "react-native";
import { categoryById, type Category } from "@/data/categories";
import type { ServiceRequest } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";
import { CategoryIcon } from "./CategoryIcon";
import { router } from "expo-router";
import { IconClipboardList, IconPlus } from "./icons";
import { AppText, Badge, Button, Card, Row, type BadgeTone } from "./ui";

export function CategoryTile({ category, onPress, compact }: { category: Category; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const { tl } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tl(category.name)}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 96,
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: compact ? 14 : radius.lg,
        padding: compact ? spacing["3"] : spacing["4"],
        gap: compact ? 6 : spacing["2"],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <CategoryIcon category={category} size={compact ? 36 : 44} />
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

/** نص حالة الطلب (للمصنع، أو للمزوّد في «شغلي»). */
export function statusKey(status: RequestStatus, viewer: "factory" | "provider" = "factory"): StringKey {
  switch (status) {
    case "awaiting_offers":
      return "statusAwaiting";
    case "pending_approval":
      return "statusPendingApproval";
    case "accepted":
      return viewer === "provider" ? "statusAcceptedProvider" : "statusAccepted";
    case "in_progress":
      return "statusInProgress";
    case "delivered":
      return viewer === "provider" ? "statusDeliveredProvider" : "statusDelivered";
    case "completed":
      return "statusCompleted";
    case "expired":
      return "statusExpired";
    case "cancelled":
      return "statusCancelled";
    case "disputed":
      return "statusDisputed";
  }
}

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  awaiting_offers: "muted",
  pending_approval: "new",
  accepted: "muted",
  in_progress: "muted",
  delivered: "new",
  completed: "ok",
  expired: "muted",
  cancelled: "bad",
  disputed: "bad",
};

/** شارة حالة الطلب. «بانتظار العروض» تصير «٣ عروض» أول ما توصل عروض. */
export function RequestStatusBadge({ status, offerCount = 0, viewer = "factory" }: { status: RequestStatus; offerCount?: number; viewer?: "factory" | "provider" }) {
  const { t, num } = useI18n();
  if (status === "awaiting_offers" && offerCount > 0) {
    const label = offerCount === 1 ? t("oneOffer") : offerCount === 2 ? t("twoOffers") : t("offersCount", { n: num(offerCount) });
    return <Badge label={label} tone="new" />;
  }
  return <Badge label={t(statusKey(status, viewer))} tone={STATUS_TONE[status]} />;
}

/**
 * بطاقة الطلب في الرئيسية و«طلباتي». الطلب اللي فيه عروض ما انفتحت يبان عليه رقمها.
 * الجديد يبان من الشارة والسطر الثاني (أغمق وأثقل)، مو من إطار ملوّن: الإطار يبقى line دائمًا.
 */
export function RequestCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const { t, tl, relative, num } = useI18n();
  const { colors } = useTheme();
  const cat = categoryById(request.category);
  const fresh = request.newOfferCount ?? 0;
  const unread = request.unreadMessages ?? 0;
  return (
    <Card onPress={onPress} style={{ paddingVertical: spacing["3"], paddingHorizontal: spacing["4"], borderColor: colors.line }}>
      <Row gap="3" style={{ justifyContent: "space-between" }}>
        <CategoryIcon category={cat} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodySm" weight={600} numberOfLines={1}>
            {tl(request.title)}
          </AppText>
          <AppText variant="caption" color={fresh || unread ? "ink" : "inkMuted"} weight={fresh || unread ? 600 : undefined} numberOfLines={1}>
            {fresh
              ? t("newOffersCount", { n: num(fresh) })
              : unread
                ? t("chatUnread", { n: num(unread) })
                : `${tl(cat.name)} · ${relative(request.createdAt)}`}
          </AppText>
        </View>
        <RequestStatusBadge status={request.status} offerCount={request.offerCount ?? 0} />
      </Row>
    </Card>
  );
}

/** ترتيب الطلبات: اللي فيها جديد (عروض أو رسائل) فوق، وبعدها الأحدث. */
export function sortRequests(list: ServiceRequest[]): ServiceRequest[] {
  const fresh = (r: ServiceRequest) => (r.newOfferCount ?? 0) + (r.unreadMessages ?? 0);
  return [...list].sort((a, b) => fresh(b) - fresh(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * «طلباتي» الفاضية: تشرح الخطوة الأولى بدل «ما فيه طلبات»، وفيها زر يفتح طلب جديد.
 * الزر secondary مو كهرماني، لأن الكهرماني «اطلب عرض» موجود فوق في الرئيسية (زر كهرماني واحد في الشاشة).
 */
export function EmptyRequests() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Card style={{ alignItems: "center", gap: spacing["2"], paddingVertical: spacing["6"] }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <IconClipboardList size={24} color={colors.inkMuted} strokeWidth={1.75} />
      </View>
      <AppText weight={700} align="center">
        {t("emptyRequestsTitle")}
      </AppText>
      <AppText variant="bodySm" color="inkMuted" align="center" style={{ maxWidth: 360 }}>
        {t("emptyRequestsBody")}
      </AppText>
      <Button label={t("requestOffer")} icon={IconPlus} variant="secondary" style={{ marginTop: spacing["2"], alignSelf: "center" }} onPress={() => router.push("/request/new")} />
    </Card>
  );
}
