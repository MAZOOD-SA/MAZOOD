// مكوّنات خاصة بمزوّد: مربع القسم، وبطاقة الطلب، وشارة الحالة.
import { radius, spacing } from "@mazood/brand";
import type { RequestStatus } from "@mazood/shared";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { categoryById, type Category } from "@/data/categories";
import type { ServiceRequest } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { arabicCountForm } from "@/lib/format";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";
import { CategoryIcon } from "./CategoryIcon";
import { router } from "expo-router";
import { IconClipboardList, IconPlus } from "./icons";
import { AppText, Badge, Button, Card, Row, focusRing, type BadgeTone } from "./ui";

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
        borderRadius: radius.lg,
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

/**
 * الأقسام في الرئيسية: جدول بخطوط رفيعة بدل مربعات منفصلة، بدون ألوان (قرار ٢٣ نوفمبر ٢٠٢٦).
 * عمودين في الجوال وأربعة في الكمبيوتر. والخانات الفاضية في آخر صف تنملى عشان الخطوط تكمل.
 * الخطوط بين الخانات = خلفية الإطار (line) تبان من فراغ ١px بينها.
 */
export function CategoryGrid({ categories, columns, onPick }: { categories: Category[]; columns: number; onPick: (c: Category) => void }) {
  const { colors } = useTheme();
  const { tl } = useI18n();
  const wide = columns >= 4;
  const rows: (Category | null)[][] = [];
  for (let i = 0; i < categories.length; i += columns) {
    const row: (Category | null)[] = categories.slice(i, i + columns);
    while (row.length < columns) row.push(null);
    rows.push(row);
  }
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.line, gap: 1 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: 1 }}>
          {row.map((c, i) =>
            c ? (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={tl(c.name)}
                onPress={() => onPick(c)}
                style={(state) => [
                  {
                    // flexBasis 0 وminWidth 0: كل الخانات بنفس العرض مهما طال النص، فالخطوط تصطف بين الصفوف.
                    flex: 1,
                    flexBasis: 0,
                    minWidth: 0,
                    minHeight: wide ? 72 : 56,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing["3"],
                    paddingHorizontal: spacing["3"],
                    paddingVertical: spacing["2"],
                    backgroundColor: state.pressed || (state as { hovered?: boolean }).hovered ? colors.surfaceAlt : colors.surfaceRaised,
                  },
                  focusRing(state, colors),
                ]}
              >
                <CategoryIcon category={c} size={24} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodySm" weight={600}>
                    {tl(c.name)}
                  </AppText>
                  {wide && (
                    <AppText variant="caption" color="inkMuted" numberOfLines={1}>
                      {tl(c.hint)}
                    </AppText>
                  )}
                </View>
              </Pressable>
            ) : (
              // نفس الحشوة الأفقية للخانات: الحشوة تنحسب من عرض الخانة، فبدونها الفاضية تطلع أضيق والخطوط تميل.
              <View key={`empty-${i}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, paddingHorizontal: spacing["3"], backgroundColor: colors.surfaceRaised }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** إطار قائمة: حد رفيع وخطوط بين الصفوف، بدل بطاقة منفصلة لكل عنصر. */
export function ListFrame({ children }: { children: ReactNode[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceRaised }}>
      {children.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** صف ينضغط داخل ListFrame: يتظلل خفيف عند الضغط أو المرور بالماوس. */
export function ListRow({ children, onPress, label }: { children: ReactNode; onPress: () => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [
        {
          paddingVertical: spacing["3"],
          paddingHorizontal: spacing["4"],
          backgroundColor: state.pressed || (state as { hovered?: boolean }).hovered ? colors.surfaceAlt : "transparent",
        },
        focusRing(state, colors),
      ]}
    >
      {children}
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
  delivered: "action",
  completed: "ok",
  expired: "muted",
  cancelled: "bad",
  disputed: "bad",
};

/** شارة حالة الطلب. «بانتظار العروض» تصير «٣ عروض» أول ما توصل عروض. */
export function RequestStatusBadge({ status, offerCount = 0, viewer = "factory" }: { status: RequestStatus; offerCount?: number; viewer?: "factory" | "provider" }) {
  const { t, num } = useI18n();
  if (status === "awaiting_offers" && offerCount > 0) {
    const form = arabicCountForm(offerCount);
    const label =
      form === "one" ? t("oneOffer") : form === "two" ? t("twoOffers") : t(form === "few" ? "offersCount" : "offersCountMany", { n: num(offerCount) });
    return <Badge label={label} tone="new" />;
  }
  return <Badge label={t(statusKey(status, viewer))} tone={STATUS_TONE[status]} />;
}

/**
 * صف الطلب في الرئيسية و«طلباتي» (داخل ListFrame). الطلب اللي فيه عروض ما انفتحت يبان عليه رقمها.
 * الجديد يبان من الشارة والسطر الثاني (أغمق وأثقل)، مو من لون.
 */
export function RequestCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const { t, tl, relative, num } = useI18n();
  const cat = categoryById(request.category);
  const fresh = request.newOfferCount ?? 0;
  const unread = request.unreadMessages ?? 0;
  return (
    <ListRow onPress={onPress} label={tl(request.title)}>
      <Row gap="3" style={{ justifyContent: "space-between" }}>
        <CategoryIcon category={cat} size={24} muted />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
        <View style={{ flexShrink: 0 }}>
          <RequestStatusBadge status={request.status} offerCount={request.offerCount ?? 0} />
        </View>
      </Row>
    </ListRow>
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
