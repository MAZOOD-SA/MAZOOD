// مخزن البيانات التجريبية: الطلبات التجريبية وعروضها وفواتيرها، والتنبيهات.
// يعيش في ذاكرة الجهاز ويرجع لأصله عند التحديث. الطلبات الحقيقية في requests.tsx (من الخادم).
import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { reducer, type Action, type State } from "./reducer";
import { seedInvoices, seedNotifications, seedOffers, seedRequests } from "./seed";

type StoreValue = { state: State; dispatch: (a: Action) => void };

const StoreContext = createContext<StoreValue | null>(null);

function initialState(): State {
  return {
    requests: seedRequests(),
    offers: seedOffers(),
    invoices: seedInvoices(),
    notifications: seedNotifications(),
    invoiceCounter: 127,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** البيانات التجريبية. */
export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore لازم يكون داخل StoreProvider");
  return v;
}
