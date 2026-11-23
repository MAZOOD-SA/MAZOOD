// التنبيهات. فتح الشاشة يعلّم كل التنبيهات كمقروءة.
import { radius, spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { LIVE } from "@/api/client";
import { Screen } from "@/components/layout";
import { AppText, Card, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Notifications() {
  const { t, tl, relative } = useI18n();
  const { colors } = useTheme();
  const { state, dispatch, authed } = useStore();
  // نحفظ أيها كانت غير مقروءة قبل ما نعلّمها، عشان تبان مميزة في هذي الزيارة.
  const [unreadIds] = useState(() => new Set(state.notifications.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "markNotificationsRead" });
      // في الوضع الحقيقي نبلغ الخادم بعد (في التجريبي ما فيه مسار للتنبيهات، فنتجاهل الخطأ).
      if (LIVE) authed("/v1/notifications/read", { method: "POST", body: {} }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [dispatch, authed]);

  return (
    <Screen title={t("notifications")} back>
      {state.notifications.length === 0 ? (
        <AppText color="inkMuted">{t("noNotifications")}</AppText>
      ) : (
        state.notifications.map((n) => (
          <Card
            key={n.id}
            onPress={n.href ? () => router.push(n.href as never) : n.requestId ? () => router.push(`/request/${n.requestId}`) : undefined}
            style={{ paddingVertical: spacing["3"], backgroundColor: unreadIds.has(n.id) ? colors.surfaceAlt : colors.surface }}
          >
            <Row style={{ alignItems: "flex-start" }}>
              {unreadIds.has(n.id) && <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.ink, marginTop: 8 }} />}
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
