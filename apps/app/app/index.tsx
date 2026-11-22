// نقطة البداية: نقرأ الجلسة المحفوظة، وبعدها نروح للدخول أو للرئيسية.
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/api/session";
import { useTheme } from "@/theme/ThemeProvider";

export default function Index() {
  const { loading, me } = useSession();
  const { colors } = useTheme();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  // دخل بس ما كمّل بيانات المصنع: يكمّلها في نفس شاشة الدخول.
  if (!me.factory) return <Redirect href={{ pathname: "/login", params: { step: "profile" } }} />;
  return <Redirect href="/home" />;
}
