// «أجهزتي»: قراءة الأجهزة الداخلة وتسجيل خروجها.
import type { SessionDto } from "@mazood/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const KEY = ["sessions"] as const;

export function useSessions() {
  return useQuery({ queryKey: KEY, queryFn: () => api<SessionDto[]>("GET", "/sessions") });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api("POST", `/sessions/${id}/revoke`),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ revoked: number }>("POST", "/sessions/revoke-others"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
