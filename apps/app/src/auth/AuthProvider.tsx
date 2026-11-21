// حالة الدخول في التطبيق: جاري التحميل، أو خارج، أو داخل (مع بيانات المستخدم ومصنعه).
// عند فتح التطبيق نحاول نرجّع الجلسة السابقة بمفتاح التجديد، فما يحتاج يدخل كل مرة.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FactoryDto, MeDto } from "@mazood/shared";
import { api, refreshSession, setSessionLostHandler } from "@/lib/api";

type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; me: MeDto };

type AuthValue = {
  state: AuthState;
  /** بيانات المستخدم إذا داخل، وإلا null. */
  me: MeDto | null;
  signedIn: (me: MeDto) => void;
  factorySaved: (factory: FactoryDto) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    setSessionLostHandler(() => setState({ status: "signedOut" }));
    refreshSession()
      .then((me) => setState(me ? { status: "signedIn", me } : { status: "signedOut" }))
      .catch(() => setState({ status: "signedOut" }));
  }, []);

  const signedIn = useCallback((me: MeDto) => setState({ status: "signedIn", me }), []);
  const factorySaved = useCallback(
    (factory: FactoryDto) => setState((s) => (s.status === "signedIn" ? { status: "signedIn", me: { ...s.me, factory } } : s)),
    [],
  );
  const signOut = useCallback(async () => {
    await api.logout();
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ state, me: state.status === "signedIn" ? state.me : null, signedIn, factorySaved, signOut }),
    [state, signedIn, factorySaved, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth لازم يكون داخل AuthProvider");
  return v;
}
