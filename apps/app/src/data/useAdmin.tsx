// أدوات شاشات الإدارة: صلاحيات الموظف، وتحميل أي بيانات من الخادم مع إعادة التحميل، وتنفيذ إجراء مع رسالته.
import type { Permission } from "@mazood/shared";
import { can } from "@mazood/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ApiClientError } from "@/api/client";
import { errorKey, type ErrorKey } from "@/api/mapping";
import { useI18n } from "@/i18n/I18nProvider";
import { useStore } from "./store";

/**
 * هل الموظف الحالي عنده الصلاحية؟ (لإخفاء الأزرار بس. الخادم هو اللي يقرر فعليًا.)
 * نستخدم الصلاحيات اللي رجعها الخادم (بعد تعديلات المالك)، ولو ما وصلت للحين: الجدول الافتراضي.
 */
export function useCan() {
  const { staffRole, staffPermissions } = useStore();
  return useCallback(
    (p: Permission) => (staffPermissions ? staffPermissions.includes(p) : can(staffRole, p)),
    [staffRole, staffPermissions],
  );
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

/**
 * تنفيذ إجراء إداري: يمنع الضغط مرتين، ويطلع رسالة نجاح أو سبب الرفض بكلام واضح.
 * run يرجّع true لو نجح (عشان الشاشة تقفل النافذة أو تمسح الحقول). ok نص ثابت، أو دالة تبني النص من رد الخادم.
 */
export function useAction(after?: () => Promise<unknown> | void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok: string | ((result: T) => string)): Promise<boolean> => {
      setBusy(true);
      setFailure(null);
      setDone(null);
      try {
        const result = await fn();
        setDone(typeof ok === "function" ? ok(result) : ok);
        await after?.();
        return true;
      } catch (e) {
        setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [after, t],
  );
  return { busy, failure, done, run, setFailure };
}
