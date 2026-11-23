// مكوّنات السوق المشتركة: بطاقة المنتج، والسعر، وصورة المنتج، وبطاقة طلب الشراء وشارته.
// الألوان والمسافات من التوكنز بس (القاعدة ١ في CLAUDE.md).
import { radius, spacing } from "@mazood/brand";
import type { ProductUnit, PurchaseStatus } from "@mazood/shared";
import { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { fileUrl } from "@/api/client";
import type { MarketCategory, MarketProduct, PurchaseRequest } from "@/api/market-types";
import { IconBuildingFactory2, IconPackage } from "@/components/icons";
import { AppText, Badge, Card, Row, VerifiedBadge, type BadgeTone } from "@/components/ui";
import { useStore } from "@/data/store";
import type { StringKey } from "@/i18n/strings";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** اسم الوحدة («طبلية»، «طن»...). */
export function useUnit() {
  const { t } = useI18n();
  return (u: ProductUnit | string) => t(`unit_${u}` as StringKey);
}

/** السعر كما يطلع في البطاقة وصفحة المنتج: «٣٥٫٠٠ ر.س للطبلية» أو «السعر عند الطلب». */
export function PriceText({ product, size = "body" }: { product: Pick<MarketProduct, "pricing" | "unitPriceHalalas" | "unit">; size?: "body" | "h2" }) {
  const { t, money } = useI18n();
  const unit = useUnit();
  if (product.pricing !== "fixed" || !product.unitPriceHalalas) {
    return (
      <AppText variant={size === "h2" ? "h2" : "bodySm"} weight={600} color="inkMuted">
        {t("priceOnRequest")}
      </AppText>
    );
  }
  return (
    <AppText variant={size === "h2" ? "h2" : "body"} weight={700}>
      {money(product.unitPriceHalalas)}{" "}
      <AppText variant="bodySm" color="inkMuted">
        {t("perUnit", { unit: unit(product.unit) })}
      </AppText>
    </AppText>
  );
}

/** صورة المنتج، أو أيقونة بدل الصورة لو ما فيه. */
export function ProductImage({ url, size, maxHeight }: { url: string | null | undefined; size: number | "full"; maxHeight?: number }) {
  const { colors } = useTheme();
  const box = size === "full" ? { width: "100%" as const, aspectRatio: 4 / 3, maxHeight } : { width: size, height: size };
  if (url) return <Image source={{ uri: fileUrl(url) }} style={[box, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
      <IconPackage size={size === "full" ? 48 : Math.max(20, size / 2.5)} color={colors.inkMuted} strokeWidth={1.5} />
    </View>
  );
}

export function ProductCard({ product, onPress, showStatus }: { product: MarketProduct; onPress: () => void; showStatus?: boolean }) {
  const { t, tl, num } = useI18n();
  const unit = useUnit();
  return (
    <Card onPress={onPress} style={{ gap: spacing["2"] }}>
      <ProductImage url={product.images[0]?.url} size="full" />
      <AppText weight={700} numberOfLines={2}>
        {product.name}
      </AppText>
      <PriceText product={product} />
      <AppText variant="caption" color="inkMuted">
        {t("minOrder", { n: num(product.minOrderQty), unit: unit(product.unit) })}
      </AppText>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <AppText variant="caption" color="inkMuted" numberOfLines={1} style={{ flex: 1 }}>
          {product.seller.name ?? ""} {product.category.name ? `· ${tl(product.category.name)}` : ""}
        </AppText>
        {showStatus && product.status !== "active" && (
          <Badge label={t(product.status === "hidden" ? "productHidden" : "productRemoved")} tone={product.status === "hidden" ? "muted" : "bad"} />
        )}
      </Row>
    </Card>
  );
}

/** حالة طلب الشراء كما يشوفها المشتري أو البائع. */
export function PurchaseStatusBadge({ status, viewer }: { status: PurchaseStatus; viewer: "buyer" | "seller" }) {
  const { t } = useI18n();
  const tone: BadgeTone =
    status === "accepted" || status === "received"
      ? "ok"
      : (viewer === "buyer" && status === "quoted") || (viewer === "seller" && (status === "pending" || status === "revision_requested"))
        ? "new"
        : status === "declined" || status === "rejected" || status === "cancelled" || status === "expired"
          ? "muted"
          : "muted";
  return <Badge label={t(`${viewer === "buyer" ? "purchaseStatus" : "sellerStatus"}_${status}` as StringKey)} tone={tone} />;
}

export function PurchaseCard({ purchase, viewer, onPress }: { purchase: PurchaseRequest; viewer: "buyer" | "seller"; onPress: () => void }) {
  const { t, num, relative, money } = useI18n();
  const unit = useUnit();
  return (
    <Card onPress={onPress} style={{ gap: spacing["2"] }}>
      <Row gap="3" style={{ alignItems: "flex-start" }}>
        <ProductImage url={purchase.product.imageUrl} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight={600} numberOfLines={1}>
            {purchase.product.name}
          </AppText>
          <AppText variant="caption" color="inkMuted">
            {num(purchase.quantity)} {unit(purchase.product.unit)} ·{" "}
            {viewer === "buyer" ? purchase.seller.name ?? "" : t(purchase.buyer?.kind === "individual" ? "customerIndividual" : "customerBusiness")} · {relative(purchase.createdAt)}
          </AppText>
        </View>
        <PurchaseStatusBadge status={purchase.status} viewer={viewer} />
      </Row>
      {purchase.quote && (
        <AppText variant="bodySm" weight={600}>
          {t("quoteTotal")}: {money(purchase.quote.totalHalalas)}
        </AppText>
      )}
    </Card>
  );
}

/** بطاقة البائع في صفحة المنتج: الاسم وشارة «موثّق» (القاعدة ٥) والتقييم. */
export function SellerLine({ name, rating, onPress }: { name: string | null; rating?: { average: number; count: number } | null; onPress?: () => void }) {
  const { t, num } = useI18n();
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={{ gap: spacing["1"] }}>
      <AppText variant="caption" color="inkMuted">
        {t("soldBy")}
      </AppText>
      <Row gap="2" style={{ flexWrap: "wrap" }}>
        <IconBuildingFactory2 size={20} color={colors.inkMuted} strokeWidth={1.75} />
        <AppText weight={700}>{name ?? ""}</AppText>
        <VerifiedBadge />
        {rating && (
          <AppText variant="caption" color="inkMuted">
            ★ {num(rating.average)} ({num(rating.count)})
          </AppText>
        )}
      </Row>
    </Card>
  );
}

/** تصنيفات المنتجات (تنقرى مرة وحدة وتنحفظ في الذاكرة). */
let categoriesCache: MarketCategory[] | null = null;
export function useMarketCategories(): MarketCategory[] {
  const { authed } = useStore();
  const [cats, setCats] = useState<MarketCategory[]>(categoriesCache ?? []);
  useEffect(() => {
    if (categoriesCache) return;
    authed<{ categories: MarketCategory[] }>("/v1/market/categories")
      .then((r) => {
        categoriesCache = r.categories;
        setCats(r.categories);
      })
      .catch(() => {});
  }, [authed]);
  return cats;
}

/**
 * هل المنشأة فعّلت البيع؟ (عشان يظهر تبويب «متجري»). نتذكر آخر جواب في الذاكرة،
 * و`refreshSeller()` تحدّثه بعد التفعيل.
 */
let sellerEnabledCache: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();
export function setSellerEnabled(v: boolean) {
  sellerEnabledCache = v;
  listeners.forEach((l) => l(v));
}
export function useSellerEnabled(): boolean {
  const { authed, role, factory, state } = useStore();
  const [enabled, setEnabled] = useState(sellerEnabledCache ?? false);
  const load = useCallback(() => {
    if (!state.signedIn || role !== "factory" || factory.kind !== "business") return setSellerEnabled(false);
    authed<{ seller: unknown }>("/v1/market/seller")
      .then((r) => setSellerEnabled(!!r.seller))
      .catch(() => {});
  }, [authed, role, factory.kind, state.signedIn]);
  useEffect(() => {
    listeners.add(setEnabled);
    load();
    return () => {
      listeners.delete(setEnabled);
    };
  }, [load]);
  return enabled;
}
