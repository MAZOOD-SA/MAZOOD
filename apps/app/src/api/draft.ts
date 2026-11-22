// مسودة الطلب الجديد: تنحفظ على الجهاز تلقائيًا وقت الكتابة، فلو طلع المستخدم قبل الإرسال
// يلقاها لما يرجع. تنمسح بعد الإرسال، وعند تسجيل الخروج.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { When } from "@mazood/shared";

const KEY = "mazood.draft.request";

export type RequestDraft = { category: string | null; typeId: string | null; details: string; location: string; when: When };

export async function loadDraft(): Promise<RequestDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RequestDraft) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(d: RequestDraft): Promise<void> {
  try {
    // مسودة فاضية ما تستاهل تنحفظ.
    if (!d.details.trim() && !d.category) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // ما انحفظت: الكتابة تكمل عادي، بس ما تبقى لو طلع.
  }
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
