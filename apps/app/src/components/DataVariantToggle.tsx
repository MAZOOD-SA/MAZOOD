// زر فحص للمطوّر: يبدّل النسخة التجريبية بين البيانات العادية وبيانات «أسوأ حالة» (src/demo/server.ts).
// ما يطلع في الخادم الحقيقي أبد، ولا في النسخة التجريبية العادية: بس في وضع التطوير، أو لو الرابط فيه ?data=.
// شكله محايد عمدًا (مو جزء من التصميم): رمادي، تحت في الوسط.
import { Platform, Pressable, Text, View } from "react-native";
import { LIVE } from "@/api/client";
import { demoDataVariant, resetDemoData, type DemoDataVariant } from "@/demo/server";
import { useTheme } from "@/theme/ThemeProvider";

const OPTIONS: { value: DemoDataVariant; label: string }[] = [
  { value: "demo", label: "Demo data" },
  { value: "worst", label: "Worst case" },
  { value: "mixed", label: "Mixed name" },
];

function visible(): boolean {
  if (LIVE || Platform.OS !== "web") return false;
  try {
    return __DEV__ || new URLSearchParams(location.search).has("data");
  } catch {
    return false;
  }
}

export function DataVariantToggle() {
  const { colors } = useTheme();
  if (!visible()) return null;
  const current = demoDataVariant();
  const pick = (v: DemoDataVariant) => {
    resetDemoData();
    location.href = `/login?data=${v}`;
  };
  return (
    <View
      style={{ position: "absolute", bottom: 88, left: 0, right: 0, alignItems: "center", zIndex: 50 }}
      pointerEvents="box-none"
    >
      <View style={{ flexDirection: "row", padding: 3, gap: 2, borderRadius: 999, backgroundColor: colors.line }}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: current === o.value }}
            onPress={() => pick(o.value)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: current === o.value ? colors.surface : "transparent" }}
          >
            <Text style={{ fontSize: 12, color: colors.ink }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
