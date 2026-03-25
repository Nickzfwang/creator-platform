"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ─── Types ───

export interface TopicSuggestion {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  dataSource: "HISTORY" | "TREND" | "COMPETITOR" | "MIXED";
  performanceScore: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  confidenceReason: string;
  suggestedDate: string | null;
  suggestedPlatforms: string[];
  tags: string[];
  relatedTrends: string[];
  competitorRef: string | null;
  isAdopted: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface CalendarItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduledDate: string;
  scheduledTime: string | null;
  targetPlatforms: string[];
  suggestion: TopicSuggestion | null;
  videoId: string | null;
  postId: string | null;
  notes: string | null;
  actualViews: number | null;
  actualLikes: number | null;
  actualComments: number | null;
  actualEngagement: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Competitor {
  id: string;
  channelId: string;
  channelUrl: string;
  channelName: string;
  channelAvatar: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  lastSyncedAt: string | null;
  recentVideoCount: number;
  avgViews: number | null;
}

export interface CompetitorVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string;
  durationSeconds: number | null;
  tags: string[];
}

// ─── Suggestions ───

export function useSuggestions(batchId?: string) {
  return useQuery({
    queryKey: ["suggestions", batchId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (batchId) params.set("batchId", batchId);
      params.set("limit", "20");
      const qs = params.toString();
      return api<{ data: TopicSuggestion[]; nextCursor: string | null; hasMore: boolean }>(
        `/v1/content-strategy/suggestions${qs ? `?${qs}` : ""}`,
      );
    },
  });
}

export function useGenerateSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { preference?: string; count?: number; niche?: string }) =>
      api<{ batchId: string; suggestions: TopicSuggestion[]; generatedAt: string }>(
        "/v1/content-strategy/suggestions/generate",
        { method: "POST", body: JSON.stringify(dto) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  });
}

export function useAdoptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { scheduledDate: string; scheduledTime?: string; targetPlatforms?: string[] } }) =>
      api(`/v1/content-strategy/suggestions/${id}/adopt`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/content-strategy/suggestions/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  });
}

export function useReplaceSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<TopicSuggestion>(`/v1/content-strategy/suggestions/${id}/replace`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  });
}

// ─── Calendar ───

export function useCalendar(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["calendar", startDate, endDate],
    queryFn: () =>
      api<{ items: CalendarItem[] }>(
        `/v1/content-strategy/calendar?startDate=${startDate}&endDate=${endDate}`,
      ),
  });
}

export function useCreateCalendarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { title: string; scheduledDate: string; scheduledTime?: string; targetPlatforms?: string[]; notes?: string }) =>
      api<CalendarItem>("/v1/content-strategy/calendar", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useUpdateCalendarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Record<string, unknown> }) =>
      api<CalendarItem>(`/v1/content-strategy/calendar/${id}`, {
        method: "PATCH",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useDeleteCalendarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/content-strategy/calendar/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

// ─── Competitors ───

export function useCompetitors() {
  return useQuery({
    queryKey: ["competitors"],
    queryFn: () =>
      api<{ competitors: Competitor[]; quota: { used: number; max: number } }>(
        "/v1/content-strategy/competitors",
      ),
  });
}

export function useCompetitorVideos(competitorId: string) {
  return useQuery({
    queryKey: ["competitor-videos", competitorId],
    queryFn: () =>
      api<{ data: CompetitorVideo[]; nextCursor: string | null; hasMore: boolean }>(
        `/v1/content-strategy/competitors/${competitorId}/videos`,
      ),
    enabled: !!competitorId,
  });
}

export function useAddCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelUrl: string) =>
      api("/v1/content-strategy/competitors", {
        method: "POST",
        body: JSON.stringify({ channelUrl }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });
}

export function useRemoveCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/content-strategy/competitors/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });
}

export function useCompetitorAnalysis() {
  return useQuery({
    queryKey: ["competitor-analysis"],
    queryFn: () =>
      api<{ analysis: string; topTopics: string[]; opportunities: string[]; generatedAt: string }>(
        "/v1/content-strategy/competitors/analysis",
      ),
  });
}

// ─── Review ───

export function useStrategyReview(period: string = "month") {
  return useQuery({
    queryKey: ["strategy-review", period],
    queryFn: () =>
      api<{
        period: { start: string; end: string };
        summary: {
          totalSuggested: number;
          totalAdopted: number;
          adoptionRate: number;
          totalPublished: number;
          totalMeasured: number;
          avgPredictionAccuracy: number;
        };
        topPerformers: { calendarItemId: string; title: string; predictedScore: number; actualViews: number; actualEngagement: number }[];
        sourceBreakdown: { source: string; count: number; adoptionRate: number; avgActualViews: number | null }[];
      }>(`/v1/content-strategy/review?period=${period}`),
  });
}

export function useStrategyInsights(period: string = "month") {
  return useQuery({
    queryKey: ["strategy-insights", period],
    queryFn: () =>
      api<{ insights: string; recommendations: string[]; generatedAt: string }>(
        `/v1/content-strategy/review/insights?period=${period}`,
      ),
    enabled: false, // manual trigger
  });
}
