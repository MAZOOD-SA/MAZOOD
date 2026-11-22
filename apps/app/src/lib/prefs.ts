// تفضيلات المستخدم البسيطة على جهازه (اللغة، والوضع الداكن، وطي القائمة الجانبية).
// ممنوع تُحفظ هنا أي بيانات حساسة أو مفاتيح دخول: هذا تخزين عادي غير مشفّر.
import AsyncStorage from "@react-native-async-storage/async-storage";

type PrefKey = "theme" | "locale" | "sidebar";

export async function loadPref(key: PrefKey): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`mazood.${key}`);
  } catch {
    return null;
  }
}

export async function savePref(key: PrefKey, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`mazood.${key}`, value);
  } catch {
    // التفضيل ما انحفظ، والتطبيق يكمل عادي بالقيمة الحالية.
  }
}
