// التخزين المؤقت المحلي (القرار ١٥ في docs/decisions.md).
//
// وش يسوي: آخر نسخة من الطلبات والعروض تنحفظ على الجهاز، فلما يفتح المستخدم التطبيق
// تظهر فورًا، والتطبيق يحدّثها من الخادم في الخلفية. والخادم يبقى هو المرجع دائمًا:
// أي إجراء (قبول، وإلغاء...) يروح للخادم وينتظر رده.
//
// حماية البيانات (PDPL):
//   - نحفظ الطلبات والعروض بس. لا مستندات ولا هويات ولا بيانات الجلسة.
//   - أي نسخة أقدم من ٢٤ ساعة ما تنعرض.
//   - كل شي ينمسح عند تسجيل الخروج، وعند دخول مستخدم ثاني على نفس الجهاز.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** يتغيّر لما يتغيّر شكل البيانات، فالنسخ القديمة المحفوظة تنتجاهل. */
export const CACHE_VERSION = "2.5";
const CACHE_KEY = "mazood.cache";

/** الاستعلامات اللي مسموح تنحفظ على الجهاز. */
const PERSISTABLE = new Set(["requests", "request"]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2_000,
      // لازم يكون أكبر من أو يساوي مدة الحفظ، وإلا تنمسح البيانات من الذاكرة قبل ما تنحفظ.
      gcTime: CACHE_MAX_AGE_MS,
    },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY, throttleTime: 1000 });

export const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string } }) =>
      q.state.status === "success" && PERSISTABLE.has(String(q.queryKey[0])),
  },
};

/** يمسح كل البيانات المحفوظة: من الذاكرة ومن الجهاز. */
export async function clearLocalCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
