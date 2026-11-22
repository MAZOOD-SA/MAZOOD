// جلسة المستخدم: مين داخل، وبيانات مصنعه، والدخول والخروج.
import type { ConfigDto, FactoryProfileInput, Me, OtpRequestResponse, SessionResponse } from "@mazood/shared";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearLocalCache, persistOptions, queryClient } from "./cache";
import { api, ApiRequestError, IS_WEB, setApiToken, setUnauthorizedHandler } from "./client";
import { deviceName } from "./device";
import { clearDraft } from "./draft";
import { loadCachedMe, loadToken, saveCachedMe, saveToken } from "./tokenStore";

type SessionValue = {
  /** true لين نقرأ الجلسة المحفوظة على الجهاز أول مرة. */
  loading: boolean;
  me: Me | null;
  config: ConfigDto | null;
  requestCode: (phone: string) => Promise<OtpRequestResponse>;
  verifyCode: (phone: string, code: string) => Promise<Me>;
  saveFactory: (input: FactoryProfileInput) => Promise<Me>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<ConfigDto | null>(null);

  const clear = useCallback(async () => {
    setApiToken(null);
    setMe(null);
    await clearLocalCache();
    await clearDraft();
    await saveCachedMe(null);
    await saveToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    api<ConfigDto>("GET", "/config").then(setConfig, () => {});
    (async () => {
      const [saved, cached] = await Promise.all([loadToken(), loadCachedMe()]);
      // الجوال بدون رمز = مو داخل. الموقع ما يعرف إلا لما يسأل الخادم (ملف التعريف ما ينقرى من الصفحة).
      if (!saved && !IS_WEB) return setLoading(false);
      if (saved) setApiToken(saved);
      // فتح فوري: نعرض الحساب المحفوظ على الجهاز، ونتحقق من الخادم في الخلفية.
      if (cached) {
        setMe(cached);
        setLoading(false);
      }
      try {
        const fresh = await api<Me>("GET", "/me");
        setMe(fresh);
        await saveCachedMe(fresh);
      } catch (err) {
        // الجلسة انتهت (٤٠١): client.ts ينادي clear() ويرجّع لشاشة الدخول.
        // ما فيه اتصال: نكمل بالنسخة المحفوظة، والشريط يقول للمستخدم إنه بدون اتصال.
        if (err instanceof ApiRequestError && err.status !== 0 && err.status !== 401) await clear();
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      me,
      config,
      requestCode: (phone) => api<OtpRequestResponse>("POST", "/auth/otp/request", { phone }),
      verifyCode: async (phone, code) => {
        const s = await api<SessionResponse>("POST", "/auth/otp/verify", { phone, code, deviceName: deviceName() });
        // جهاز مشترك: لو دخل مستخدم ثاني، ما يشوف أي بيانات محفوظة من اللي قبله.
        await clearLocalCache();
        if (s.token) {
          setApiToken(s.token);
          await saveToken(s.token);
        }
        await saveCachedMe(s.me);
        setMe(s.me);
        return s.me;
      },
      saveFactory: async (input) => {
        const updated = await api<Me>("PUT", "/factory", input);
        await saveCachedMe(updated);
        setMe(updated);
        return updated;
      },
      signOut: async () => {
        await api("POST", "/auth/logout").catch(() => {});
        await clear();
      },
    }),
    [loading, me, config, clear],
  );

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </PersistQueryClientProvider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession لازم يكون داخل SessionProvider");
  return v;
}
