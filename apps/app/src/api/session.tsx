// جلسة المستخدم: مين داخل، وبيانات مصنعه، والدخول والخروج.
import type { ConfigDto, FactoryProfileInput, Me, OtpRequestResponse, SessionResponse } from "@mazood/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiToken, setUnauthorizedHandler } from "./client";
import { loadToken, saveToken } from "./tokenStore";

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

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 2_000 } },
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<ConfigDto | null>(null);

  const clear = useCallback(async () => {
    setApiToken(null);
    setMe(null);
    queryClient.clear();
    await saveToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    api<ConfigDto>("GET", "/config").then(setConfig, () => {});
    (async () => {
      const saved = await loadToken();
      if (saved) {
        setApiToken(saved);
        try {
          setMe(await api<Me>("GET", "/me"));
        } catch {
          // الجلسة انتهت أو الخادم ما رد: نرجع لشاشة الدخول.
          await clear();
        }
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
        const s = await api<SessionResponse>("POST", "/auth/otp/verify", { phone, code });
        setApiToken(s.token);
        await saveToken(s.token);
        setMe(s.me);
        return s.me;
      },
      saveFactory: async (input) => {
        const updated = await api<Me>("PUT", "/factory", input);
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
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession لازم يكون داخل SessionProvider");
  return v;
}
