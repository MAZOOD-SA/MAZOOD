// حالة الاتصال بالخادم، عشان نعرض شريط «لا يوجد اتصال» ونقول للمستخدم إن البيانات المعروضة
// آخر نسخة محفوظة. تتحدّث تلقائيًا من نتيجة كل طلب للخادم (client.ts).
import { useSyncExternalStore } from "react";

let online = true;
const listeners = new Set<() => void>();

export function setServerReachable(value: boolean) {
  if (online === value) return;
  online = value;
  listeners.forEach((l) => l());
}

export function useServerReachable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => online,
    () => true,
  );
}
