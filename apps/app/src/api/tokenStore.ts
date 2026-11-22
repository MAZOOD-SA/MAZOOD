// حفظ رمز الجلسة على الجهاز.
//   - الجوال: في الخزنة المشفّرة للنظام (Keychain في iPhone وKeystore في Android).
//   - الموقع: في تخزين المتصفح. أضعف من الخزنة، فالجلسة محدودة بـ ٣٠ يوم، والخادم
//     يقدر يلغيها. قبل الإطلاق (المرحلة ٨) ننقل الموقع لملف تعريف (cookie) محمي.
//     القرار وأسبابه في docs/decisions.md.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "mazood.session";

export async function loadToken(): Promise<string | null> {
  try {
    return Platform.OS === "web" ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (token) await AsyncStorage.setItem(KEY, token);
      else await AsyncStorage.removeItem(KEY);
    } else if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ما انحفظ: المستخدم بيحتاج يدخل مرة ثانية بعد ما يقفل التطبيق، بس التطبيق يكمل عادي.
  }
}
