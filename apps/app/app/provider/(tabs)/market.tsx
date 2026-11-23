// تبويب «السوق» للمزوّد (القرار ٥٦): نفس شاشة تصفّح السوق، وفوقها رابط لطلباته من السوق.
// المزوّد يشتري من المصانع بحسابه هو (مثل مزوّد النظافة يطلب منظفات). الخادم يتأكد إنه موثّق.
import { router } from "expo-router";
import { IconClipboardList } from "@/components/icons";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { MarketBrowse } from "@/screens/MarketBrowse";

export default function ProviderMarketTab() {
  const { t } = useI18n();
  return <MarketBrowse top={<Button label={t("myPurchases")} icon={IconClipboardList} variant="secondary" onPress={() => router.push("/provider/purchases")} />} />;
}
