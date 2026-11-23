// السوق في لوحة الإدارة: المنتجات (إخفاء المخالف مع السبب وإرجاعه)، والاشتراكات وتسجيل الدفعات (المالية)،
// والباقات وسعرها (المدير). كل تبويب يظهر بس لمن عنده صلاحيته، والخادم يفحص كل إجراء.
// الإجراءات المكتوبة: docs/admin/procedures/remove-product.md و record-payment.md
import { spacing } from "@mazood/brand";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActionNotices, ReasonDialog } from "@/components/admin";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { dayIso } from "@/components/DocSlotCard";
import { Field } from "@/components/Field";
import { IconCash, IconEyeOff, IconRefresh } from "@/components/icons";
import { Screen } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useAction, useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type Product = { id: string; name: string; status: "active" | "hidden" | "removed"; removedReason: string | null; sellerName: string | null };
type Subscription = { sellerId: string; name: string | null; sellerStatus: string; endsAt: string | null; active: boolean; lastPaidOn: string | null };
type Plan = { id: string; audience: string; nameAr: string; nameEn: string; monthlyPriceHalalas: number; maxProducts: number | null; active: boolean };
type Tab = "products" | "subscriptions" | "plans";

const riyalsToHalalas = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const todayIso = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export default function MarketAdminScreen() {
  const { t } = useI18n();
  const allowed = useCan();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tabs: { value: Tab; label: string }[] = [
    ...(allowed("market.moderate") ? [{ value: "products" as const, label: t("productsTab") }] : []),
    ...(allowed("subscriptions.manage") ? [{ value: "subscriptions" as const, label: t("subscriptionsTab") }] : []),
    ...(allowed("subscriptions.manage") ? [{ value: "plans" as const, label: t("plansTab") }] : []),
  ];
  const [tab, setTab] = useState<Tab>("products");
  // الصلاحيات توصل من الخادم بعد أول عرض، فنختار التبويب (من الرابط، أو أول تبويب مسموح) لما تجهز.
  const allowedTabs = tabs.map((x) => x.value).join();
  useEffect(() => {
    const list = allowedTabs.split(",") as Tab[];
    const wanted = list.find((x) => x === params.tab) ?? list[0];
    if (wanted) setTab((cur) => (list.includes(cur) && !params.tab ? cur : wanted));
  }, [allowedTabs, params.tab]);

  return (
    <Screen title={t("navMarketAdmin")} back>
      {tabs.length === 0 ? <Notice text={t("noAdminSections")} /> : <Chips value={tab} onChange={setTab} options={tabs} />}
      {tab === "products" && allowed("market.moderate") && <ProductsTab />}
      {tab === "subscriptions" && allowed("subscriptions.manage") && <SubscriptionsTab />}
      {tab === "plans" && allowed("subscriptions.manage") && <PlansTab canEdit={allowed("plans.manage")} />}
    </Screen>
  );
}

function ProductsTab() {
  const { t, relative } = useI18n();
  const { authed } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Product["status"]>("all");
  const query = new URLSearchParams();
  if (q.trim().length >= 2) query.set("q", q.trim());
  if (status !== "all") query.set("status", status);
  const qs = query.toString();
  const { data, error, reload } = useLoad<{ products: (Product & { updatedAt: string })[] }>(`/v1/admin/market/products${qs ? `?${qs}` : ""}`);
  const { busy, failure, done, run } = useAction(reload);
  const [target, setTarget] = useState<{ id: string; action: "remove" | "restore" } | null>(null);
  const label = { active: t("productActive"), hidden: t("admProductHidden"), removed: t("admProductRemoved") } as const;

  return (
    <>
      <ActionNotices error={error ? t(error) : null} done={done} />
      <Field label={t("productsSearch")} value={q} onChangeText={setQ} maxLength={60} />
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          { value: "all", label: t("admFilterAll") },
          { value: "active", label: t("productActive") },
          { value: "removed", label: t("admProductRemoved") },
        ]}
      />
      <View style={{ gap: spacing["2"] }}>
        {data?.products.length === 0 && <AppText color="inkMuted">{t("productsEmpty")}</AppText>}
        {data?.products.map((p) => (
          <Card key={p.id} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {p.name}
              </AppText>
              <Badge label={label[p.status]} tone={p.status === "removed" ? "bad" : p.status === "active" ? "ok" : "muted"} />
            </Row>
            <AppText variant="bodySm" color="inkMuted">
              {p.sellerName ?? "—"} · {relative(p.updatedAt)}
            </AppText>
            {p.removedReason && <AppText variant="bodySm">{p.removedReason}</AppText>}
            {p.status === "removed" ? (
              <Button label={t("restoreProduct")} icon={IconRefresh} variant="ghost" onPress={() => setTarget({ id: p.id, action: "restore" })} />
            ) : (
              <Button label={t("removeProduct")} icon={IconEyeOff} variant="ghost" tone="danger" onPress={() => setTarget({ id: p.id, action: "remove" })} />
            )}
          </Card>
        ))}
      </View>
      <ReasonDialog
        visible={target !== null}
        title={target?.action === "restore" ? t("restoreProductTitle") : t("removeProductTitle")}
        confirmLabel={target?.action === "restore" ? t("restoreProduct") : t("removeProduct")}
        minLength={3}
        danger={target?.action === "remove"}
        busy={busy}
        error={failure}
        onCancel={() => setTarget(null)}
        onSubmit={async (reason) => {
          const ok = await run(
            () => authed(`/v1/admin/market/products/${target!.id}/${target!.action}`, { method: "POST", body: { reason } }),
            target!.action === "restore" ? t("productRestoredDone") : t("productRemovedDone"),
          );
          if (ok) setTarget(null);
          return ok;
        }}
      />
    </>
  );
}

function SubscriptionsTab() {
  const { t, date, money, tl } = useI18n();
  const { authed } = useStore();
  const subs = useLoad<{ subscriptions: Subscription[] }>("/v1/admin/market/subscriptions");
  const plans = useLoad<{ plans: Plan[] }>("/v1/admin/market/plans");
  const sellerPlans = (plans.data?.plans ?? []).filter((p) => p.audience === "seller" && p.active);
  const { busy, failure, done, run, setFailure } = useAction(subs.reload);
  const [target, setTarget] = useState<Subscription | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [months, setMonths] = useState("1");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState("");
  const plan = sellerPlans.find((p) => p.id === (planId ?? sellerPlans[0]?.id));
  const monthsN = Number(months);
  const amountH = riyalsToHalalas(amount);
  const expected = plan && Number.isInteger(monthsN) ? plan.monthlyPriceHalalas * monthsN : null;

  function openFor(s: Subscription) {
    setTarget(s);
    setFailure(null);
    setMonths("1");
    setAmount(sellerPlans[0] ? String(sellerPlans[0].monthlyPriceHalalas / 100) : "");
    setPaidOn(todayIso());
    setReference("");
  }

  return (
    <>
      <ActionNotices error={subs.error ? t(subs.error) : null} done={done} />
      <View style={{ gap: spacing["2"] }}>
        {subs.data?.subscriptions.map((s) => (
          <Card key={s.sellerId} style={{ gap: spacing["1"] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText weight={600} style={{ flex: 1 }}>
                {s.name ?? "—"}
              </AppText>
              <Badge
                label={s.active && s.endsAt ? t("subscriptionActiveUntil", { date: date(s.endsAt) }) : s.endsAt ? t("subscriptionEnded") : t("subscriptionNone")}
                tone={s.active ? "ok" : s.endsAt ? "bad" : "muted"}
              />
            </Row>
            {s.lastPaidOn && (
              <AppText variant="caption" color="inkMuted">
                {t("lastPaid", { date: date(dayIso(s.lastPaidOn)) })}
              </AppText>
            )}
            <Button label={t("recordPayment")} icon={IconCash} variant="secondary" onPress={() => openFor(s)} />
          </Card>
        ))}
      </View>

      <ConfirmDialog
        visible={target !== null}
        title={`${t("recordPayment")}: ${target?.name ?? ""}`}
        confirmLabel={t("recordPayment")}
        cancelLabel={t("cancelAction")}
        busy={busy}
        error={failure}
        confirmDisabled={!plan || !Number.isInteger(monthsN) || monthsN < 1 || !Number.isFinite(amountH) || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || reference.trim().length < 2}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          const ok = await run(
            () =>
              authed<{ endsAt: string }>(`/v1/admin/market/sellers/${target!.sellerId}/payments`, {
                method: "POST",
                body: { planId: plan!.id, months: monthsN, amountHalalas: amountH, paidOn, reference: reference.trim() },
              }),
            (r) => t("paymentRecorded", { date: date(r.endsAt) }),
          );
          if (ok) setTarget(null);
        }}
      >
        {sellerPlans.length > 1 && (
          <Chips value={plan?.id ?? null} onChange={setPlanId} options={sellerPlans.map((p) => ({ value: p.id, label: tl({ ar: p.nameAr, en: p.nameEn }) }))} />
        )}
        {plan && (
          <AppText variant="bodySm" color="inkMuted">
            {tl({ ar: plan.nameAr, en: plan.nameEn })} · {t("perMonth", { amount: money(plan.monthlyPriceHalalas) })}
          </AppText>
        )}
        <Field label={t("paymentMonths")} value={months} onChangeText={setMonths} keyboardType="number-pad" maxLength={2} ltr />
        <Field label={t("paymentAmount")} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={10} ltr />
        {expected !== null && Number.isFinite(amountH) && amountH !== expected && (
          <AppText variant="bodySm" color="danger">
            {t("paymentDiffers", { expected: money(expected) })}
          </AppText>
        )}
        <Field label={t("paymentDate")} value={paidOn} onChangeText={setPaidOn} placeholder={t("dateHint")} maxLength={10} ltr />
        <Field label={t("paymentReference")} value={reference} onChangeText={setReference} maxLength={80} ltr />
      </ConfirmDialog>
    </>
  );
}

function PlansTab({ canEdit }: { canEdit: boolean }) {
  const { t, tl, money } = useI18n();
  const { authed } = useStore();
  const { data, error, reload } = useLoad<{ plans: Plan[] }>("/v1/admin/market/plans");
  const { busy, failure, done, run } = useAction(reload);
  const [edits, setEdits] = useState<Record<string, { price: string; max: string }>>({});

  return (
    <>
      <ActionNotices error={error ? t(error) : null} failure={failure} done={done} />
      <View style={{ gap: spacing["2"] }}>
        {data?.plans.map((p) => {
          const e = edits[p.id] ?? { price: String(p.monthlyPriceHalalas / 100), max: p.maxProducts == null ? "" : String(p.maxProducts) };
          const set = (patch: Partial<typeof e>) => setEdits((m) => ({ ...m, [p.id]: { ...e, ...patch } }));
          const price = riyalsToHalalas(e.price);
          const max = e.max.trim() === "" ? null : Number(e.max);
          return (
            <Card key={p.id} style={{ gap: spacing["2"] }}>
              <AppText weight={600}>{tl({ ar: p.nameAr, en: p.nameEn })}</AppText>
              <AppText variant="bodySm" color="inkMuted">
                {t("perMonth", { amount: money(p.monthlyPriceHalalas) })}
              </AppText>
              {canEdit && (
                <>
                  <Field label={t("planPrice")} value={e.price} onChangeText={(v) => set({ price: v })} keyboardType="decimal-pad" maxLength={10} ltr />
                  <Field label={t("planMaxProducts")} value={e.max} onChangeText={(v) => set({ max: v })} keyboardType="number-pad" maxLength={5} ltr />
                  <Button
                    label={t("savePlan")}
                    variant="secondary"
                    disabled={busy || !Number.isFinite(price) || (max !== null && (!Number.isInteger(max) || max < 1))}
                    onPress={() =>
                      run(() => authed(`/v1/admin/market/plans/${p.id}`, { method: "PUT", body: { monthlyPriceHalalas: price, maxProducts: max } }), t("planSaved"))
                    }
                  />
                </>
              )}
            </Card>
          );
        })}
      </View>
    </>
  );
}
