// الطلبات الحقيقية من الخادم: القائمة، والرفع، والإلغاء.
// الشاشات تعرض الطلبات الحقيقية مع الطلبات التجريبية (useAllRequests)، والتجريبية عليها شارة «تجريبي».
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { typeName, type NewRequestInput, type RequestDto } from "@mazood/shared";
import { useAuth } from "@/auth/AuthProvider";
import { api, ApiError, type ClientErrorCode } from "@/lib/api";
import { useStore } from "./store";
import type { ServiceRequest } from "./types";

/** يحوّل طلب الخادم لشكل الشاشات. النص اللي كتبه المستخدم يظهر نفسه في اللغتين. */
export function fromDto(r: RequestDto): ServiceRequest {
  return {
    id: r.id,
    category: r.category,
    typeId: r.typeId,
    title: typeName(r.category, r.typeId),
    details: { ar: r.details, en: r.details },
    location: { ar: r.location, en: r.location },
    when: r.when,
    createdAt: r.createdAt,
    status: r.status,
    demo: false,
  };
}

type RequestsValue = {
  items: ServiceRequest[];
  loading: boolean;
  error: ClientErrorCode | null;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  create: (input: NewRequestInput) => Promise<ServiceRequest>;
  cancel: (id: string) => Promise<ServiceRequest>;
  /** من القائمة إذا موجود، وإلا من الخادم. */
  fetchOne: (id: string) => Promise<ServiceRequest | null>;
};

const RequestsContext = createContext<RequestsValue | null>(null);

export function RequestsProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const factoryId = me?.factory?.id ?? null;
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  const upsert = useCallback((r: ServiceRequest) => {
    setItems((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list]));
  }, []);

  const reload = useCallback(async () => {
    if (!factoryId) return;
    setLoading(true);
    try {
      const page = await api.listRequests();
      setItems(page.items.map(fromDto));
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "internal");
    } finally {
      setLoading(false);
    }
  }, [factoryId]);

  // أول ما يدخل المستخدم (أو يتغيّر مصنعه)، نجيب طلباته. ولما يطلع، نفضّي القائمة.
  useEffect(() => {
    setItems([]);
    setCursor(null);
    if (factoryId) void reload();
  }, [factoryId, reload]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const page = await api.listRequests(cursor);
    setItems((list) => [...list, ...page.items.map(fromDto).filter((r) => !list.some((x) => x.id === r.id))]);
    setCursor(page.nextCursor);
  }, [cursor]);

  const create = useCallback(
    async (input: NewRequestInput) => {
      const r = fromDto(await api.createRequest(input));
      upsert(r);
      return r;
    },
    [upsert],
  );

  const cancel = useCallback(
    async (id: string) => {
      const r = fromDto(await api.cancelRequest(id));
      upsert(r);
      return r;
    },
    [upsert],
  );

  const fetchOne = useCallback(
    async (id: string) => {
      try {
        const r = fromDto(await api.getRequest(id));
        upsert(r);
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    [upsert],
  );

  const value = useMemo(
    () => ({ items, loading, error, hasMore: !!cursor, reload, loadMore, create, cancel, fetchOne }),
    [items, loading, error, cursor, reload, loadMore, create, cancel, fetchOne],
  );
  return <RequestsContext.Provider value={value}>{children}</RequestsContext.Provider>;
}

export function useRequests(): RequestsValue {
  const v = useContext(RequestsContext);
  if (!v) throw new Error("useRequests لازم يكون داخل RequestsProvider");
  return v;
}

/** الطلبات الحقيقية والتجريبية مع بعض، الأحدث أول. */
export function useAllRequests(): ServiceRequest[] {
  const { items } = useRequests();
  const { state } = useStore();
  return useMemo(() => [...items, ...state.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [items, state.requests]);
}
