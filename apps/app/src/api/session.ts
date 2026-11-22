// حفظ الجلسة على الجهاز.
//  - iPhone وAndroid: رمز الجلسة في التخزين المشفّر (Keychain / Keystore) عن طريق expo-secure-store.
//  - الموقع: **ما نحفظ الرمز أبدًا.** الخادم يحطه في كوكي محمي (HttpOnly) ما يقدر كود الصفحة يقراه.
//
// وفوقها نسخة من آخر بيانات (الحساب والطلبات) عشان التطبيق يفتح فورًا، وحتى بدون اتصال.
// النسخة ما فيها أي رمز دخول، وتنمسح عند الخروج.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "mazood.session";
const SNAPSHOT_KEY = "mazood.snapshot";

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
  if (!token || Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // ما انحفظ: المستخدم يبقى داخل لين يقفل التطبيق، وبعدها يدخل من جديد.
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (Platform.OS === "web") await AsyncStorage.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ما نقدر نمسحه: الجلسة تنلغي من الخادم أصلًا.
  }
}

export async function loadSnapshot<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(value: unknown | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(SNAPSHOT_KEY);
    else await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value));
  } catch {
    // ما انحفظت: الفتح الجاي يكون أبطأ شوي بس.
  }
}
