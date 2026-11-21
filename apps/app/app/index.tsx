// نقطة البداية: نرجّع الجلسة السابقة إذا فيه، ثم نوجّه المستخدم:
// خارج → الدخول، وداخل بدون بيانات مصنع → إكمال البيانات، وغيرها → الرئيسية.
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function Index() {
  const { state, me } = useAuth();
  const { colors } = useTheme();
  if (state.status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  return <Redirect href={me.factory ? "/home" : "/complete-profile"} />;
}
