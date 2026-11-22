// الطلب المتاح ونموذج العرض (في الجوال). في الكمبيوتر نفس اللوحة تظهر جنب القائمة.
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/layout";
import { ProviderRequestPanel } from "@/components/provider";
import { useI18n } from "@/i18n/I18nProvider";

export default function ProviderRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  return (
    <Screen title={t("requestDetails")} back>
      <ProviderRequestPanel requestId={id} />
    </Screen>
  );
}
