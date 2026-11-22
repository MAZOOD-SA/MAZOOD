// أدوات شاشات الإدارة: صلاحيات الموظف، وتحميل أي بيانات من الخادم مع إعادة التحميل.
import type { Permission } from "@mazood/shared";
import { can } from "@mazood/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ApiClientError } from "@/api/client";
import { errorKey, type ErrorKey } from "@/api/mapping";
import { useStore } from "./store";

/** هل الموظف الحالي عنده الصلاحية؟ (لإخفاء الأزرار بس. الخادم هو اللي يقرر فعليًا.) */
export function useCan() {
  const { staffRole } = useStore();
  return (p: Permission) => can(staffRole, p);
}

export function useLoad<T>(path: string | null) {
  const { authed } = useStore();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ErrorKey | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await authed<T>(path));
      setError(null);
    } catch (e) {
      setError(errorKey(e instanceof ApiClientError ? e.code : "server"));
    }
  }, [authed, path]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { data, error, reload };
}
