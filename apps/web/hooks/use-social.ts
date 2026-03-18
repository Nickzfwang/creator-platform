"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAccessToken } from "@/lib/api";
import type { SocialAccount } from "@/lib/types";

export function useSocialAccounts() {
  return useQuery({
    queryKey: ["social-accounts"],
    queryFn: async () => {
      const res = await api<{ data: SocialAccount[] } | SocialAccount[]>("/v1/social/accounts");
      // Handle both { data: [...] } and direct array responses
      return Array.isArray(res) ? res : res.data ?? [];
    },
  });
}

export function useConnectPlatform() {
  return useMutation({
    mutationFn: (platform: string) => {
      // The backend GET /connect/:platform requires JWT and does a server-side redirect to OAuth
      // Pass the token as a query param since browser redirect can't set Authorization header
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const token = getAccessToken();
      const url = `${baseUrl}/v1/social/connect/${platform.toLowerCase()}${token ? `?token=${token}` : ""}`;
      window.location.href = url;
      // Return a never-resolving promise since the page will navigate away
      return new Promise<void>(() => {});
    },
  });
}

export function useDisconnectAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      api(`/v1/social/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-accounts"] });
    },
  });
}

export function useSyncAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/v1/social/sync", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-accounts"] });
    },
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ["social", "sync-status"],
    queryFn: () =>
      api<
        Array<{
          accountId: string;
          platform: string;
          lastSyncAt: string | null;
          tokenStatus: string;
          nextSync: string | null;
        }>
      >("/v1/social/sync/status"),
  });
}
