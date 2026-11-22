// الإعدادات: تنفتح من ترس «حسابي» في الجوال، ومن أسفل القائمة الجانبية في التابلت والكمبيوتر.
// نفس الشاشة للمصنع والمزوّد وفريق الإدارة، وكل واحد يشوف اللي يخصه بس.
// القاعدة: ما نعرض أي خيار ما يشتغل فعلًا («ولا مرة طريق مسدود»). الخيارات الجاية مكتوبة في
// docs/plans/phase-4.md (قسم «التنقّل والإعدادات») مع المرحلة اللي تنضاف فيها.
import { radius, spacing } from "@mazood/brand";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Children, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { LIVE } from "@/api/client";
import {
  IconBuildingFactory2,
  IconChevronLeft,
  IconChevronRight,
  IconInfoCircle,
  IconLanguage,
  IconLogout,
  IconPalette,
} from "@/components/icons";
import { Screen } from "@/components/layout";
import { AppText, Button, Chips, Divider, Notice } from "@/components/ui";
import type { IconComponent } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/lib/format";
import { useLayout } from "@/lib/useLayout";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";

export function SettingsScreen() {
  const { t, locale, setLocale, digits } = useI18n();
  const { mode, setMode } = useTheme();
  const { role, signOut } = useStore();
  const { isPhone } = useLayout();
  const version = Constants.expoConfig?.version ?? "";

  // بيانات الحساب: المصنع يعدّل بياناته في الوضع الحقيقي، والمزوّد يعدّلها من صفحة التسجيل.
  const accountRow =
    role === "factory" && LIVE ? (
      <SettingsRow icon={IconBuildingFactory2} label={t("factoryData")} onPress={() => router.push("/factory-profile")} />
    ) : role === "provider" ? (
      <SettingsRow icon={IconBuildingFactory2} label={t("providerData")} onPress={() => router.push("/provider/profile")} />
    ) : null;

  return (
    <Screen title={t("settingsTitle")} back={isPhone}>
      <SettingsGroup title={t("settingsPreferences")}>
        <SettingsRow icon={IconLanguage} label={t("language")}>
          <Chips<Locale>
            value={locale}
            onChange={setLocale}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
        </SettingsRow>
        <SettingsRow icon={IconPalette} label={t("appearance")}>
          <Chips<ThemeMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "system", label: t("themeSystem") },
              { value: "light", label: t("themeLight") },
              { value: "dark", label: t("themeDark") },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      {accountRow && <SettingsGroup title={t("settingsAccount")}>{accountRow}</SettingsGroup>}

      <SettingsGroup title={t("settingsAbout")}>
        <SettingsRow icon={IconInfoCircle} label={t("aboutApp")} value={`${t("appVersion")} ${digits(version)}`}>
          <AppText variant="bodySm" color="inkMuted">
            {t("aboutAppBody")}
          </AppText>
        </SettingsRow>
      </SettingsGroup>

      {!LIVE && <Notice icon={IconInfoCircle} text={t("prototypeNote")} />}

      <Button
        label={t("signOut")}
        variant="secondary"
        icon={IconLogout}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}

/** مجموعة إعدادات: عنوان صغير، وتحته بطاقة فيها الخيارات بخطوط فاصلة. */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={{ gap: spacing["2"] }}>
      <AppText variant="caption" color="inkMuted" weight={600} style={{ paddingHorizontal: spacing["1"] }}>
        {title}
      </AppText>
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <Divider />}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * سطر إعداد: أيقونة واسم، وعلى الطرف الثاني قيمة أو سهم.
 * لو فيه onPress السطر كله ينضغط ويودّي لشاشة. ولو فيه children تطلع تحت الاسم (مثل أزرار الاختيار).
 */
function SettingsRow({
  icon: Icon,
  label,
  value,
  onPress,
  children,
}: {
  icon: IconComponent;
  label: string;
  value?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  // سهم «ادخل» يشير لنهاية السطر: يسار في العربي، ويمين في الإنجليزي.
  const Chevron = isRTL ? IconChevronLeft : IconChevronRight;
  const content = (
    <View style={{ padding: spacing["4"], gap: spacing["3"] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["3"] }}>
        <Icon size={22} color={colors.inkMuted} strokeWidth={1.75} />
        <AppText variant="body" weight={500} style={{ flex: 1 }}>
          {label}
        </AppText>
        {value !== undefined && (
          <AppText variant="bodySm" color="inkMuted">
            {value}
          </AppText>
        )}
        {onPress && <Chevron size={20} color={colors.inkMuted} strokeWidth={1.75} />}
      </View>
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s) => {
        const { hovered, pressed } = s as { pressed: boolean; hovered?: boolean };
        return { backgroundColor: hovered || pressed ? colors.surfaceAlt : "transparent" };
      }}
    >
      {content}
    </Pressable>
  );
}
