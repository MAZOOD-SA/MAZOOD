// مخزن البيانات للنسخة التجريبية: يعيش في ذاكرة الجهاز ويرجع لأصله عند التحديث.
// في المرحلة ٢ يتبدّل باتصال بالخادم، وتبقى الشاشات زي ما هي تقريبًا.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { categoryById } from "./categories";
import { reducer, type Action, type NewRequestInput, type State } from "./reducer";
import { seedInvoices, seedNotifications, seedOffers, seedRequests, simulatedOffersFor } from "./seed";

/** كم ثانية بعد رفع الطلب توصل العروض الوهمية. */
const SIMULATED_OFFER_DELAY_MS = 5000;

type StoreValue = {
  state: State;
  dispatch: (a: Action) => void;
  createRequest: (input: Omit<NewRequestInput, "id" | "now">) => string;
};

const StoreContext = createContext<StoreValue | null>(null);

function initialState(): State {
  return {
    signedIn: false,
    phone: null,
    requests: seedRequests(),
    offers: seedOffers(),
    invoices: seedInvoices(),
    notifications: seedNotifications(),
    invoiceCounter: 127,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const createRequest = useCallback<StoreValue["createRequest"]>((input) => {
    const id = `r${Date.now().toString(36)}`;
    dispatch({ type: "createRequest", input: { ...input, id, now: new Date().toISOString() } });
    const typeName = categoryById(input.category).types.find((t) => t.id === input.typeId)?.name ?? input.title;
    timers.current.push(
      setTimeout(() => {
        dispatch({ type: "offersArrived", offers: simulatedOffersFor(id, typeName), now: new Date().toISOString() });
      }, SIMULATED_OFFER_DELAY_MS),
    );
    return id;
  }, []);

  const value = useMemo(() => ({ state, dispatch, createRequest }), [state, createRequest]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore لازم يكون داخل StoreProvider");
  return v;
}
