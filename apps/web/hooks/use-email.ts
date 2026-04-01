"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useEmailStats() {
  return useQuery({
    queryKey: ["email", "stats"],
    queryFn: () =>
      api<{
        totalSubscribers: number;
        activeSubscribers: number;
        totalCampaigns: number;
        sentCampaigns: number;
        totalSent: number;
        averageOpenRate: number;
        averageClickRate: number;
      }>("/v1/email/stats"),
  });
}

export function useSubscribers(tag?: string) {
  return useQuery({
    queryKey: ["email", "subscribers", tag],
    queryFn: () =>
      api<{
        subscribers: Array<{
          id: string; email: string; name: string | null;
          source: string | null; tags: string[]; isActive: boolean; createdAt: string;
        }>;
        total: number;
        activeCount: number;
      }>(`/v1/email/subscribers${tag ? `?tag=${tag}` : ""}`),
  });
}

export function useAddSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; name?: string; tags?: string[] }) =>
      api("/v1/email/subscribers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email"] }),
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["email", "campaigns"],
    queryFn: () =>
      api<Array<{
        id: string; name: string; type: string; status: string;
        sentCount: number; openCount: number; clickCount: number;
        createdAt: string; _count: { emails: number };
      }>>("/v1/email/campaigns"),
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ["email", "campaigns", id],
    queryFn: () =>
      api<{
        id: string; name: string; type: string; status: string;
        emails: Array<{ id: string; subject: string; body: string; sortOrder: number; delayDays: number }>;
      }>(`/v1/email/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/v1/email/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email"] }),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      api<{ queued: boolean; subscriberCount: number; emailCount: number }>(
        `/v1/email/campaigns/${campaignId}/send`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email"] }),
  });
}

export function useAiGenerateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      purpose: string; productName?: string; tone?: string; emailCount?: number;
    }) => api<{
      id: string; name: string;
      emails: Array<{ id: string; subject: string; body: string; delayDays: number }>;
    }>("/v1/email/ai/generate-sequence", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email"] }),
  });
}

export function useAiGenerateSingle() {
  return useMutation({
    mutationFn: (data: { purpose: string; context?: string; tone?: string }) =>
      api<{ subject: string; body: string; previewText: string }>(
        "/v1/email/ai/generate-single", { method: "POST", body: JSON.stringify(data) },
      ),
  });
}
