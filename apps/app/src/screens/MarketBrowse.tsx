// تصفّح السوق: البحث والتصنيفات والمنتجات. نفس الشاشة في تبويب «السوق» (/shop) وفي الصفحة العامة (/market)
// اللي تنفتح بدون دخول (للتسويق والظهور في محركات البحث)، وفي تبويب «السوق» للمزوّد (القرار ٥٧).
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ProductList } from "@/api/market-types";
import { Field } from "@/components/Field";
import { Grid, Screen } from "@/components/layout";
import { ProductCard, useMarketCategories } from "@/components/market";
import { AppText, Button, Card, Chips } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

/** top: شي يظهر فوق البحث (مثل رابط «طلباتي من السوق» عند المزوّد). */
export function MarketBrowse({ publicPage, top }: { publicPage?: boolean; top?: ReactNode }) {
  const { t, tl } = useI18n();
  const { authed, state } = useStore();
  const categories = useMarketCategories();
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<ProductList | null>(null);
  const [page, setPage] = useState(0);
  const latest = useRef(0);

  const load = useCallback(
    async (nextPage = 0) => {
      const ticket = ++latest.current;
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category !== "all") params.set("category", category);
      if (nextPage) params.set("page", String(nextPage));
      const r = await authed<ProductList>(`/v1/market/products?${params.toString()}`).catch(() => null);
      // نتجاهل الرد القديم لو المستخدم كتب حرف ثاني قبل ما يوصل.
      if (!r || ticket !== latest.current) return;
      setPage(nextPage);
      setData((prev) => (nextPage && prev ? { ...r, products: [...prev.products, ...r.products] } : r));
    },
    [authed, q, category],
  );

  // البحث بعد ما يوقف الكتابة ثلث ثانية.
  useEffect(() => {
    const id = setTimeout(() => load(0), 300);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <Screen title={t("marketTitle")} back={publicPage && state.signedIn} width="page" onRefresh={() => load(0)} contentStyle={{ gap: spacing["3"] }}>
      <AppText color="inkMuted">{t("marketSubtitle")}</AppText>
      {top}
      <Field label={t("marketSearch")} value={q} onChangeText={setQ} maxLength={80} returnKeyType="search" />
      <Chips
        value={category}
        onChange={setCategory}
        scroll
        options={[{ value: "all", label: t("marketAll") }, ...categories.map((c) => ({ value: c.id, label: tl(c.name) }))]}
      />
      {data?.comingSoon ? (
        <Card style={{ gap: spacing["2"] }}>
          <AppText variant="h2" weight={700}>
            {t("marketComingSoon")}
          </AppText>
          <AppText color="inkMuted">{t("marketComingSoonHint")}</AppText>
          <Button label={t("loginTitle")} variant="primary" onPress={() => router.push("/login")} />
        </Card>
      ) : data && data.products.length === 0 ? (
        <AppText color="inkMuted">{t("marketEmpty")}</AppText>
      ) : (
        <Grid minItemWidth={160} max={4}>
          {(data?.products ?? []).map((p) => (
            <ProductCard key={p.id} product={p} onPress={() => router.push(`/market/${p.id}`)} />
          ))}
        </Grid>
      )}
      {data?.hasMore && <Button label={t("marketLoadMore")} variant="secondary" onPress={() => load(page + 1)} />}
    </Screen>
  );
}
