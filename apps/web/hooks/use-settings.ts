"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Tenant, ApiKeyRecord, WebhookRecord } from "@/lib/types";

// ─── Tenant Settings ───

export function useTenant() {
  return useQuery({
    queryKey: ["tenant"],
    queryFn: () => api<Tenant>("/v1/tenant"),
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name?: string;
      logoUrl?: string;
      themeConfig?: Record<string, unknown>;
    }) =>
      api<Tenant>("/v1/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
    },
  });
}

export function useTenantBranding() {
  return useQuery({
    queryKey: ["tenant", "branding"],
    queryFn: () =>
      api<{
        name: string;
        logoUrl: string | null;
        themeConfig: Record<string, unknown> | null;
      }>("/v1/tenant/branding"),
  });
}

// ─── API Keys ───

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api<ApiKeyRecord[]>("/v1/api-gateway/keys"),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; scopes?: string[] }) =>
      api<ApiKeyRecord & { key: string }>("/v1/api-gateway/keys", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      api(`/v1/api-gateway/keys/${keyId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

// ─── Webhooks ───

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api<WebhookRecord[]>("/v1/api-gateway/webhooks"),
  });
}

export function useWebhookEvents() {
  return useQuery({
    queryKey: ["webhook-events"],
    queryFn: () => api<string[]>("/v1/api-gateway/webhooks/events"),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      url: string;
      events: string[];
      description?: string;
    }) =>
      api<WebhookRecord & { secret: string }>("/v1/api-gateway/webhooks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) =>
      api(`/v1/api-gateway/webhooks/${webhookId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

// ─── Rate Limits ───

export function useRateLimits() {
  return useQuery({
    queryKey: ["rate-limits"],
    queryFn: () =>
      api<{
        plan: string;
        limits: { requestsPerMinute: number; requestsPerDay: number };
        isCustom: boolean;
      }>("/v1/api-gateway/rate-limits"),
  });
}
