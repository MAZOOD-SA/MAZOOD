// إضافة منتج أو تعديله (/seller/product و/seller/product?id=ID)، وصوره (بعد أول حفظ)، وإخفاؤه وإظهاره.
// نفس قواعد الخادم من @mazood/shared (productBody)، عشان الرسالة تطلع قبل ما نرسل.
import { spacing } from "@mazood/brand";
import { productBody, PRODUCT_MAX_IMAGES, PRODUCT_UNITS, type ProductUnit } from "@mazood/shared";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { MarketProduct } from "@/api/market-types";
import { Field } from "@/components/Field";
import { IconEye, IconEyeOff, IconPhoto, IconPlus, IconTrash } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { ProductImage, useMarketCategories, useUnit } from "@/components/market";
import { AppText, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { compressImageForWeb } from "@/lib/image";
import { parseRiyals } from "@/lib/money";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
const riyalText = (h: number | null | undefined) => (h ? String(h / 100) : "");
type Tier = { qty: string; price: string };

export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, tl } = useI18n();
  const { authed, upload } = useStore();
  const categories = useMarketCategories();
  const unitName = useUnit();
  const [product, setProduct] = useState<MarketProduct | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("other");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("piece");
  const [minQty, setMinQty] = useState("1");
  const [pricing, setPricing] = useState<"fixed" | "quote">("fixed");
  const [price, setPrice] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fill(p: MarketProduct) {
    setProduct(p);
    setName(p.name);
    setCategoryId(p.category.id);
    setDescription(p.description);
    setUnit(p.unit);
    setMinQty(String(p.minOrderQty));
    setPricing(p.pricing);
    setPrice(riyalText(p.unitPriceHalalas));
    setTiers(p.priceTiers.map((x) => ({ qty: String(x.minQty), price: riyalText(x.unitPriceHalalas) })));
  }

  useEffect(() => {
    if (!id) return;
    authed<{ products: MarketProduct[] }>("/v1/market/seller/products")
      .then((r) => {
        const p = r.products.find((x) => x.id === id);
        if (p) fill(p);
      })
      .catch(() => {});
  }, [authed, id]);

  async function save() {
    if (busy) return;
    const input = {
      name: name.trim(),
      categoryId,
      description: description.trim(),
      unit,
      minOrderQty: Number(toLatin(minQty)),
      pricing,
      unitPriceHalalas: pricing === "fixed" ? parseRiyals(price) : null,
      priceTiers: pricing === "fixed" ? tiers.filter((x) => x.qty || x.price).map((x) => ({ minQty: Number(toLatin(x.qty)), unitPriceHalalas: parseRiyals(x.price) ?? 0 })) : [],
    };
    const parsed = productBody.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const f = String(issue.path[0]);
        next[f] = t(
          f === "name" ? "productNameRequired" : f === "description" ? "productDescriptionRequired" : f === "minOrderQty" ? "productMinRequired" : f === "priceTiers" ? "tiersInvalid" : "productPriceRequired",
        );
      }
      return setErrors(next);
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      const r = product
        ? await authed<{ product: MarketProduct }>(`/v1/market/seller/products/${product.id}`, { method: "PUT", body: parsed.data })
        : await authed<{ product: MarketProduct }>("/v1/market/seller/products", { method: "POST", body: parsed.data });
      // منتج جديد: نبقى في الشاشة عشان يضيف الصور.
      if (!product) fill(r.product);
      else router.back();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  async function addImage() {
    if (!product) return;
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const form = new FormData();
    if (Platform.OS === "web" && a.file) form.append("file", await compressImageForWeb(a.file), "product.jpg");
    else form.append("file", { uri: a.uri, name: a.name, type: a.mimeType ?? "image/jpeg" } as unknown as Blob);
    setBusy(true);
    setFailure(null);
    try {
      const res = await upload<{ image: { id: string; url: string } }>(`/v1/market/seller/products/${product.id}/images`, form);
      setProduct({ ...product, images: [...product.images, res.image] });
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  async function removeImage(imageId: string) {
    if (!product) return;
    await authed(`/v1/market/seller/products/${product.id}/images/${imageId}/delete`, { method: "POST" }).catch(() => {});
    setProduct({ ...product, images: product.images.filter((i) => i.id !== imageId) });
  }

  async function toggleHidden() {
    if (!product) return;
    const r = await authed<{ product: MarketProduct }>(`/v1/market/seller/products/${product.id}/${product.status === "hidden" ? "show" : "hide"}`, { method: "POST" }).catch((e) => {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      return null;
    });
    if (r) setProduct(r.product);
  }

  return (
    <Screen
      title={t(product ? "editProduct" : "addProduct")}
      back
      contentStyle={{ gap: spacing["3"] }}
      footer={<Button label={t("saveProduct")} variant="primary" size="lg" full onPress={save} disabled={busy || product?.status === "removed"} />}
    >
      {failure && <Notice text={failure} />}
      {product?.status === "removed" && <Notice text={t("productRemovedReason", { reason: product.removedReason ?? "" })} />}
      <Field label={t("productNameLabel")} value={name} onChangeText={setName} maxLength={120} error={errors.name} />
      <SectionTitle title={t("productCategoryLabel")} />
      <Chips value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c.id, label: tl(c.name) }))} />
      <Field label={t("productDescriptionLabel")} value={description} onChangeText={setDescription} multiline maxLength={3000} error={errors.description} />
      <SectionTitle title={t("productUnitLabel")} />
      <Chips<ProductUnit> value={unit} onChange={setUnit} options={PRODUCT_UNITS.map((u) => ({ value: u, label: unitName(u) }))} />
      <Field label={t("productMinOrderLabel")} value={minQty} onChangeText={setMinQty} keyboardType="number-pad" maxLength={8} error={errors.minOrderQty} ltr />
      <SectionTitle title={t("productPricingLabel")} />
      <Chips<"fixed" | "quote">
        value={pricing}
        onChange={setPricing}
        options={[
          { value: "fixed", label: t("pricingFixed") },
          { value: "quote", label: t("pricingQuote") },
        ]}
      />
      {pricing === "fixed" && (
        <>
          <Field label={t("productPriceLabel")} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={12} error={errors.unitPriceHalalas} ltr />
          <SectionTitle title={t("productTierLabel")} />
          {tiers.map((tier, i) => (
            <Row key={i} gap="2" style={{ alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field label={t("tierQtyLabel")} value={tier.qty} onChangeText={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, qty: v } : x)))} keyboardType="number-pad" ltr />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("tierPriceLabel")} value={tier.price} onChangeText={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, price: v } : x)))} keyboardType="decimal-pad" ltr />
              </View>
              <Button label={t("removeImage")} icon={IconTrash} variant="ghost" onPress={() => setTiers(tiers.filter((_, j) => j !== i))} />
            </Row>
          ))}
          {errors.priceTiers && <AppText variant="caption" color="danger">{errors.priceTiers}</AppText>}
          {tiers.length < 5 && <Button label={t("priceTiers")} icon={IconPlus} variant="ghost" onPress={() => setTiers([...tiers, { qty: "", price: "" }])} />}
        </>
      )}
      {product && (
        <Card style={{ gap: spacing["2"] }}>
          <SectionTitle title={t("productImages")} />
          <Row gap="2" style={{ flexWrap: "wrap" }}>
            {product.images.map((img) => (
              <View key={img.id} style={{ gap: spacing["1"], alignItems: "center" }}>
                <ProductImage url={img.url} size={88} />
                <Button label={t("removeImage")} variant="ghost" tone="danger" onPress={() => removeImage(img.id)} />
              </View>
            ))}
          </Row>
          {product.images.length < PRODUCT_MAX_IMAGES && product.status !== "removed" && (
            <Button label={t("addImage")} icon={IconPhoto} variant="secondary" disabled={busy} onPress={addImage} />
          )}
        </Card>
      )}
      {product && product.status !== "removed" && (
        <Button
          label={t(product.status === "hidden" ? "showProduct" : "hideProduct")}
          icon={product.status === "hidden" ? IconEye : IconEyeOff}
          variant="secondary"
          onPress={toggleHidden}
        />
      )}
    </Screen>
  );
}
