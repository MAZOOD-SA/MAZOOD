// حفظ رمز الجلسة على الجهاز.
//   - الجوال: في الخزنة المشفّرة للنظام (Keychain في iPhone وKeystore في Android).
//   - الموقع: **ما نحفظ الرمز أبدًا.** الخادم يحطه في ملف تعريف محمي (HttpOnly) ما يقدر
//     كود الصفحة يقراه (القرار ١٥ في docs/decisions.md).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Me } from "@mazood/shared";
import { Platform } from "react-native";

const KEY = "mazood.session";

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      // نسخ قديمة من الموقع كانت تحفظ الرمز في تخزين المتصفح: نمسحه.
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ما انحفظ: المستخدم بيحتاج يدخل مرة ثانية بعد ما يقفل التطبيق، بس التطبيق يكمل عادي.
  }
}

// نسخة من بيانات الحساب (الجوال واسم المصنع) عشان التطبيق يفتح فورًا وحتى بدون اتصال.
// تنمسح عند تسجيل الخروج. ما فيها أي رمز دخول.
const ME_KEY = "mazood.me";

export async function loadCachedMe(): Promise<Me | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

export async function saveCachedMe(me: Me | null): Promise<void> {
  try {
    if (me) await AsyncStorage.setItem(ME_KEY, JSON.stringify(me));
    else await AsyncStorage.removeItem(ME_KEY);
  } catch {
    // ما انحفظت: الفتح الجاي يكون أبطأ شوي بس.
  }
}
