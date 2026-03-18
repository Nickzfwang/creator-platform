"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalyticsOverview, RevenueAnalytics } from "@/lib/types";

interface AnalyticsParams {
  period?: "7d" | "30d" | "90d" | "365d";
  startDate?: string;
  endDate?: string;
}

function buildQuery(params: AnalyticsParams) {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  return query.toString();
}

export function useOverview(params: AnalyticsParams = {}) {
  return useQuery({
    queryKey: ["analytics", "overview", params],
    queryFn: () => {
      const qs = buildQuery(params);
      return api<AnalyticsOverview>(
        `/v1/analytics/overview${qs ? `?${qs}` : ""}`,
      );
    },
  });
}

export function usePlatformStats(
  params: AnalyticsParams & { platform?: string } = {},
) {
  return useQuery({
    queryKey: ["analytics", "platform", params],
    queryFn: () => {
      const query = new URLSearchParams();
      if (params.period) query.set("period", params.period);
      if (params.platform) query.set("platform", params.platform);
      const qs = query.toString();
      return api<
        Array<{
          date: string;
          followers: number;
          views: number;
          engagement: number;
          platform: string;
        }>
      >(`/v1/analytics/platform${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useCrossPlatformComparison(params: AnalyticsParams = {}) {
  return useQuery({
    queryKey: ["analytics", "comparison", params],
    queryFn: () => {
      const qs = buildQuery(params);
      return api<
        Array<{
          platform: string;
          accountName: string;
          followers: number;
          totalViews: number;
          totalEngagement: number;
          avgEngagementRate: number;
        }>
      >(`/v1/analytics/comparison${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useRevenueAnalytics(
  params: AnalyticsParams & { source?: string } = {},
) {
  return useQuery({
    queryKey: ["analytics", "revenue", params],
    queryFn: () => {
      const query = new URLSearchParams();
      if (params.period) query.set("period", params.period);
      if (params.source) query.set("source", params.source);
      const qs = query.toString();
      return api<RevenueAnalytics>(
        `/v1/analytics/revenue${qs ? `?${qs}` : ""}`,
      );
    },
  });
}

export function useTopContent(params: AnalyticsParams = {}) {
  return useQuery({
    queryKey: ["analytics", "top-content", params],
    queryFn: () => {
      const qs = buildQuery(params);
      return api<
        Array<{
          title: string;
          platform: string;
          views: number;
          engagement: number;
          url: string;
        }>
      >(`/v1/analytics/top-content${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useAiInsights(params: AnalyticsParams = {}) {
  return useQuery({
    queryKey: ["analytics", "ai-insights", params],
    queryFn: () => {
      const qs = buildQuery(params);
      return api<{ insights: string; period: string; generatedAt: string }>(
        `/v1/analytics/ai-insights${qs ? `?${qs}` : ""}`,
      );
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to avoid excessive API calls
    refetchOnWindowFocus: false,
  });
}
