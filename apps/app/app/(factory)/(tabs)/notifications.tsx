// التنبيهات. فتح الشاشة يعلّم كل التنبيهات كمقروءة.
import { radius, spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/layout";
import { AppText, Card, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Notifications() {
  const { t, tl, relative } = useI18n();
  const { colors } = useTheme();
  const { state, dispatch } = useStore();
  // نحفظ أيها كانت غير مقروءة قبل ما نعلّمها، عشان تبان مميزة في هذي الزيارة.
  const [unreadIds] = useState(() => new Set(state.notifications.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: "markNotificationsRead" }), 1500);
    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <Screen title={t("notifications")}>
      {state.notifications.length === 0 ? (
        <AppText color="inkMuted">{t("noNotifications")}</AppText>
      ) : (
        state.notifications.map((n) => (
          <Card
            key={n.id}
            onPress={n.requestId ? () => router.push(`/request/${n.requestId}`) : undefined}
            style={{ paddingVertical: spacing["3"], backgroundColor: unreadIds.has(n.id) ? colors.accentSoft : colors.surface }}
          >
            <Row style={{ alignItems: "flex-start" }}>
              {unreadIds.has(n.id) && <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent, marginTop: 8 }} />}
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm" weight={unreadIds.has(n.id) ? 600 : 400}>
                  {tl(n.text)}
                </AppText>
                <AppText variant="caption" color="inkMuted">
                  {relative(n.createdAt)}
                </AppText>
              </View>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
