"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BrandDeal, PipelineStats, PaginatedResponse } from "@/lib/types";

interface BrandDealListParams {
  cursor?: string;
  limit?: number;
  status?: string;
  dealType?: string;
  search?: string;
}

export function useBrandDeals(params: BrandDealListParams = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  if (params.dealType) query.set("dealType", params.dealType);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();

  return useQuery({
    queryKey: ["brand-deals", params],
    queryFn: () =>
      api<PaginatedResponse<BrandDeal>>(
        `/v1/brand-deals${qs ? `?${qs}` : ""}`,
      ),
  });
}

export function useBrandDeal(id: string | undefined) {
  return useQuery({
    queryKey: ["brand-deals", id],
    queryFn: () => api<BrandDeal>(`/v1/brand-deals/${id}`),
    enabled: !!id,
  });
}

export function useCreateBrandDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      brandName: string;
      dealType: string;
      brandContact?: {
        name: string;
        email?: string;
        phone?: string;
        company?: string;
      };
      budgetRange?: { min: number; max: number; currency?: string };
      deliverables?: string[];
      timelineStart?: string;
      timelineEnd?: string;
      notes?: string;
    }) =>
      api<BrandDeal>("/v1/brand-deals", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-deals"] });
    },
  });
}

export function useUpdateBrandDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        brandName?: string;
        dealType?: string;
        status?: string;
        actualRevenue?: number;
        notes?: string;
      };
    }) =>
      api<BrandDeal>(`/v1/brand-deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["brand-deals", id] });
      qc.invalidateQueries({ queryKey: ["brand-deals"] });
      qc.invalidateQueries({ queryKey: ["brand-deals", "pipeline"] });
    },
  });
}

export function useDeleteBrandDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/brand-deals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-deals"] });
      qc.invalidateQueries({ queryKey: ["brand-deals", "pipeline"] });
    },
  });
}

export function usePipelineStats() {
  return useQuery({
    queryKey: ["brand-deals", "pipeline"],
    queryFn: () => api<PipelineStats>("/v1/brand-deals/pipeline"),
  });
}

export function useGenerateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      dealId: string;
      tone?: "professional" | "friendly" | "creative";
      additionalInstructions?: string;
    }) =>
      api<{ proposal: string }>("/v1/brand-deals/generate-proposal", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["brand-deals", dealId] });
    },
  });
}
