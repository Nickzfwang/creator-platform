"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MembershipTier, Member, PaginatedResponse } from "@/lib/types";

export function useTiers() {
  return useQuery({
    queryKey: ["membership", "tiers"],
    queryFn: () => api<MembershipTier[]>("/v1/membership/tiers"),
  });
}

export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      priceMonthly: number;
      priceYearly?: number;
      benefits?: string[];
      maxMembers?: number;
      sortOrder?: number;
    }) =>
      api<MembershipTier>("/v1/membership/tiers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["membership", "tiers"] });
    },
  });
}

export function useUpdateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        priceMonthly?: number;
        benefits?: string[];
        maxMembers?: number;
        isActive?: boolean;
      };
    }) =>
      api<MembershipTier>(`/v1/membership/tiers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["membership", "tiers"] });
    },
  });
}

export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/membership/tiers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["membership", "tiers"] });
    },
  });
}

export function useMembers(params: { cursor?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();

  return useQuery({
    queryKey: ["membership", "members", params],
    queryFn: () =>
      api<PaginatedResponse<Member>>(
        `/v1/membership/members${qs ? `?${qs}` : ""}`,
      ),
  });
}

export function useMyMemberships() {
  return useQuery({
    queryKey: ["membership", "my"],
    queryFn: () => api<Member[]>("/v1/membership/my"),
  });
}
