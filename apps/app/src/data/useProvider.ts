// يجيب بيانات المزوّد الداخل من الخادم، ويحدّثها كل ما رجعت الشاشة للواجهة.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ApiClientError } from "@/api/client";
import { errorKey, type ErrorKey } from "@/api/mapping";
import type { ProviderView } from "./provider-types";
import { useStore } from "./store";

export function useProvider() {
  const { authed } = useStore();
  const [provider, setProvider] = useState<ProviderView | null | undefined>(undefined);
  const [error, setError] = useState<ErrorKey | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await authed<{ provider: ProviderView | null }>("/v1/provider/me");
      setProvider(r.provider);
      setError(null);
    } catch (e) {
      setError(errorKey(e instanceof ApiClientError ? e.code : "server"));
    }
  }, [authed]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { provider, setProvider, error, reload };
}
