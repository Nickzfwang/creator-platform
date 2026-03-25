"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FanComment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  platform: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  category: string;
  sentiment: number;
  priority: string;
  isReplied: boolean;
  aiReply: string | null;
  finalReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export function useComments(params: {
  category?: string;
  priority?: string;
  isReplied?: string;
  search?: string;
} = {}) {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.priority) qs.set("priority", params.priority);
  if (params.isReplied) qs.set("isReplied", params.isReplied);
  if (params.search) qs.set("search", params.search);
  qs.set("limit", "30");
  return useQuery({
    queryKey: ["comments", params],
    queryFn: () =>
      api<{ data: FanComment[]; nextCursor: string | null; hasMore: boolean }>(
        `/v1/interactions/comments?${qs.toString()}`,
      ),
  });
}

export function useImportComments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comments: { authorName: string; content: string; platform?: string }[]) =>
      api<{ imported: number }>("/v1/interactions/comments/import", {
        method: "POST",
        body: JSON.stringify({ comments }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments"] }),
  });
}

export function useGenerateReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { knowledgeBaseId?: string; tone?: string } }) =>
      api<{ replies: { tone: string; content: string }[] }>(
        `/v1/interactions/comments/${id}/generate-reply`,
        { method: "POST", body: JSON.stringify(dto) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments"] }),
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { finalReply?: string; isReplied?: boolean; category?: string } }) =>
      api<FanComment>(`/v1/interactions/comments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments"] }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/interactions/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments"] }),
  });
}

export function useInteractionStats(period: string = "30d") {
  return useQuery({
    queryKey: ["interaction-stats", period],
    queryFn: () =>
      api<{
        totalComments: number;
        repliedCount: number;
        replyRate: number;
        avgSentiment: number;
        categoryBreakdown: { category: string; count: number; percentage: number }[];
        sentimentTrend: { date: string; avgSentiment: number; count: number }[];
      }>(`/v1/interactions/stats?period=${period}`),
  });
}
