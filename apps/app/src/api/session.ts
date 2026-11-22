// حفظ توكن الجلسة على الجهاز.
// على iPhone وAndroid: في التخزين المشفّر (Keychain / Keystore) عن طريق expo-secure-store.
// على الموقع: في localStorage (المتصفح ما يوفّر تخزين مشفّر)، والتوكن ينتهي بعد ٣٠ يوم ويُلغى عند الخروج.
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

export async function saveToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") await AsyncStorage.setItem(KEY, token);
    else await SecureStore.setItemAsync(KEY, token);
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
