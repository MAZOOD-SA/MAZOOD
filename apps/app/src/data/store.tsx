// مخزن بيانات التطبيق. له وضعين:
//  - الوضع التجريبي (بدون EXPO_PUBLIC_API_URL): بيانات وهمية في الذاكرة، ويرجع لأصله عند التحديث.
//  - الوضع الحقيقي: الطلبات والحساب من الخادم. الجلسة تنحفظ على الجهاز وترجع بعد قفل التطبيق.
// الشاشات تقرأ من نفس المخزن في الوضعين، فما تحتاج تعرف أي وضع نشتغل فيه.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { api, ApiClientError, apiUpload, IS_WEB, LIVE } from "@/api/client";
import { clearDraft } from "@/api/draft";
import type { StaffRole } from "@mazood/shared";
import { fromServerRequest, type ServerFactory, type ServerRequest } from "@/api/mapping";
import { clearToken, loadSnapshot, loadToken, saveSnapshot, saveToken } from "@/api/session";
import { categoryById } from "./categories";
import { reducer, type Action, type NewRequestInput, type State } from "./reducer";
import { FACTORY, seedInvoices, seedNotifications, seedOffers, seedRequests, simulatedOffersFor } from "./seed";
import type { Factory } from "./types";

/** كم ثانية بعد رفع الطلب توصل العروض الوهمية (الوضع التجريبي فقط). */
const SIMULATED_OFFER_DELAY_MS = 5000;

export type Role = "factory" | "provider" | "staff";

export type FactoryProfileInput = { name: string; cityId?: string; commercialRegister: string; vatNumber: string };

type StoreValue = {
  state: State;
  dispatch: (a: Action) => void;
  /** false لين نتأكد هل فيه جلسة محفوظة (عشان ما نوم الشاشة على «الدخول» لحظة ثم نقلبها). */
  ready: boolean;
  /** بيانات المصنع للعرض. في الوضع الحقيقي قد تكون فاضية لين يكمّل المستخدم حسابه. */
  factory: Factory;
  profileComplete: boolean;
  createRequest: (input: Omit<NewRequestInput, "id" | "now">) => Promise<string>;
  cancelRequest: (requestId: string) => Promise<void>;
  /** نوع الحساب الداخل (في الوضع التجريبي دائمًا مصنع). */
  role: Role | null;
  /** دور الموظف في الإدارة، لو كان موظف. */
  staffRole: StaffRole | null;
  /** طلب للخادم بتوكن الجلسة الحالية (لشاشات المزوّد والإدارة). */
  authed: <T>(path: string, opts?: { method?: "GET" | "POST" | "PUT"; body?: unknown }) => Promise<T>;
  upload: <T>(path: string, form: FormData) => Promise<T>;
  /** بعد نجاح التحقق من الرمز في الوضع الحقيقي. يرجّع نوع الحساب عشان نوجّهه لشاشاته.
   *  token: null في الموقع (الجلسة في كوكي محمي). */
  startSession: (token: string | null, phone: string) => Promise<Role>;
  signOut: () => Promise<void>;
  saveProfile: (input: FactoryProfileInput) => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

/** آخر بيانات محفوظة على الجهاز، عشان الفتح يكون فوري. ما فيها رمز دخول. */
type Snapshot = {
  phone: string;
  role: Role;
  staffRole: StaffRole | null;
  factory: ServerFactory | null;
  requests: ServerRequest[];
};

function initialState(): State {
  return LIVE
    ? { signedIn: false, phone: null, requests: [], offers: [], invoices: [], notifications: [], invoiceCounter: 0 }
    : {
        signedIn: false,
        phone: null,
        requests: seedRequests(),
        offers: seedOffers(),
        invoices: seedInvoices(),
        notifications: seedNotifications(),
        invoiceCounter: 127,
      };
}

const EMPTY: Factory = { name: { ar: "", en: "" }, city: { ar: "", en: "" }, commercialRegister: "", vatNumber: "" };

function toFactory(f: ServerFactory): Factory {
  return {
    name: { ar: f.name ?? "", en: f.name ?? "" },
    city: f.city ?? { ar: "", en: "" },
    commercialRegister: f.commercialRegister ?? "",
    vatNumber: f.vatNumber ?? "",
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ready, setReady] = useState(!LIVE);
  const [liveFactory, setLiveFactory] = useState<{ factory: Factory; complete: boolean } | null>(null);
  const [account, setAccount] = useState<{ role: Role; staffRole: StaffRole | null } | null>(LIVE ? null : { role: "factory", staffRole: null });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const token = useRef<string | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    setAccount({ role: snap.role, staffRole: snap.staffRole });
    dispatch({ type: "signIn", phone: snap.phone });
    dispatch({ type: "setRequests", requests: snap.requests.map(fromServerRequest) });
    if (snap.factory) setLiveFactory({ factory: toFactory(snap.factory), complete: snap.factory.profileComplete });
  }, []);

  const loadAccount = useCallback(async (tk: string | null): Promise<Role> => {
    const me = await api<{ user: { phone: string; role: Role; staffRole: StaffRole | null }; factory: ServerFactory | null }>("/v1/me", { token: tk });
    // الطلبات تخص المصنع بس. المزوّد والموظف لهم شاشاتهم اللي تجيب بياناتها.
    const requests =
      me.user.role === "factory" ? (await api<{ requests: ServerRequest[] }>("/v1/requests", { token: tk })).requests : [];
    token.current = tk;
    const snap: Snapshot = { phone: me.user.phone, role: me.user.role, staffRole: me.user.staffRole, factory: me.factory, requests };
    applySnapshot(snap);
    await saveSnapshot(snap);
    return me.user.role;
  }, [applySnapshot]);

  // عند فتح التطبيق: نعرض آخر بيانات محفوظة فورًا، ثم نحدّثها من الخادم في الخلفية.
  useEffect(() => {
    if (!LIVE) return;
    (async () => {
      const saved = await loadToken();
      const snap = await loadSnapshot<Snapshot>();
      // في الجوال بدون رمز محفوظ ما فيه جلسة. في الموقع الجلسة في الكوكي، فنسأل الخادم دائمًا.
      const hasSession = IS_WEB || !!saved;
      if (snap && hasSession) {
        token.current = saved;
        applySnapshot(snap);
        setReady(true);
      }
      if (hasSession) {
        try {
          await loadAccount(saved);
        } catch (e) {
          // الجلسة منتهية أو ملغية: نمسح كل شي محفوظ. أما انقطاع الشبكة فنخلي النسخة المحفوظة
          // (يظهر شريط «لا يوجد اتصال»)، وتتحدّث لما يرجع الاتصال.
          if (e instanceof ApiClientError && e.status === 401) {
            await clearToken();
            await saveSnapshot(null);
            token.current = null;
            setAccount(null);
            setLiveFactory(null);
            dispatch({ type: "signOut" });
          }
        }
      }
      setReady(true);
    })();
  }, [loadAccount, applySnapshot]);

  const createRequest = useCallback<StoreValue["createRequest"]>(
    async (input) => {
      if (LIVE) {
        const res = await api<{ request: ServerRequest }>("/v1/requests", {
          method: "POST",
          token: token.current,
          body: {
            category: input.category,
            typeId: input.typeId,
            details: input.details,
            area: input.area,
            location: input.location.ar,
            when: input.when,
          },
        });
        dispatch({ type: "upsertRequest", request: fromServerRequest(res.request) });
        await clearDraft();
        return res.request.id;
      }
      const id = `r${Date.now().toString(36)}`;
      dispatch({ type: "createRequest", input: { ...input, id, now: new Date().toISOString() } });
      const typeName = categoryById(input.category).types.find((t) => t.id === input.typeId)?.name ?? input.title;
      timers.current.push(
        setTimeout(() => {
          dispatch({ type: "offersArrived", offers: simulatedOffersFor(id, typeName), now: new Date().toISOString() });
        }, SIMULATED_OFFER_DELAY_MS),
      );
      return id;
    },
    [],
  );

  const cancelRequest = useCallback<StoreValue["cancelRequest"]>(async (requestId) => {
    if (LIVE) {
      const res = await api<{ request: ServerRequest }>(`/v1/requests/${requestId}/cancel`, { method: "POST", token: token.current });
      dispatch({ type: "upsertRequest", request: fromServerRequest(res.request) });
      return;
    }
    dispatch({ type: "cancelRequest", requestId });
  }, []);

  const startSession = useCallback<StoreValue["startSession"]>(
    async (tk) => {
      await saveToken(tk);
      return loadAccount(tk);
    },
    [loadAccount],
  );

  const signOut = useCallback<StoreValue["signOut"]>(async () => {
    await clearDraft();
    if (LIVE) {
      // نلغي الجلسة في الخادم (ويمسح كوكي الموقع). لو فشل (مافي شبكة) نمسحها محليًا ونكمل.
      await api("/v1/auth/logout", { method: "POST", token: token.current }).catch(() => {});
      await clearToken();
      await saveSnapshot(null);
      token.current = null;
      setLiveFactory(null);
      setAccount(null);
    }
    dispatch({ type: "signOut" });
  }, []);

  const saveProfile = useCallback<StoreValue["saveProfile"]>(async (input) => {
    const res = await api<{ factory: ServerFactory }>("/v1/factory", { method: "PUT", token: token.current, body: input });
    setLiveFactory({ factory: toFactory(res.factory), complete: res.factory.profileComplete });
  }, []);

  const authed = useCallback(<T,>(path: string, opts: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}) =>
    api<T>(path, { ...opts, token: token.current }), []);
  const upload = useCallback(<T,>(path: string, form: FormData) => apiUpload<T>(path, form, token.current), []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      ready,
      factory: LIVE ? (liveFactory?.factory ?? EMPTY) : FACTORY,
      profileComplete: LIVE ? (liveFactory?.complete ?? false) : true,
      role: account?.role ?? null,
      staffRole: account?.staffRole ?? null,
      authed,
      upload,
      createRequest,
      cancelRequest,
      startSession,
      signOut,
      saveProfile,
    }),
    [state, ready, liveFactory, account, authed, upload, createRequest, cancelRequest, startSession, signOut, saveProfile],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore لازم يكون داخل StoreProvider");
  return v;
}
