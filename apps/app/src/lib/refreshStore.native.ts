// حفظ مفتاح التجديد: نسخة الجوال (iPhone وAndroid).
// يُحفظ في الخزنة الآمنة للجهاز (Keychain في iPhone، وKeystore في Android)، مو في التخزين العادي.
import type { ClientKind } from "@mazood/shared";
import * as SecureStore from "expo-secure-store";

export const clientKind: ClientKind = "native";

const KEY = "mazood.refreshToken";
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function loadRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token, OPTIONS);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    // ما فيه مفتاح أصلًا.
  }
}
