"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Post, PostListResponse } from "@/lib/types";

interface PostListParams {
  cursor?: string;
  limit?: number;
  status?: string;
  platform?: string;
}

export function usePosts(params: PostListParams = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  if (params.platform) query.set("platform", params.platform);
  const qs = query.toString();

  return useQuery({
    queryKey: ["posts", params],
    queryFn: () => api<PostListResponse>(`/v1/posts${qs ? `?${qs}` : ""}`),
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ["posts", id],
    queryFn: () => api<Post>(`/v1/posts/${id}`),
    enabled: !!id,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      contentText?: string;
      platforms: Array<{ platform: string; config?: Record<string, unknown> }>;
      scheduledAt?: string;
      clipId?: string;
      hashtags?: string[];
      mediaUrls?: string[];
    }) =>
      api<Post>("/v1/posts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        contentText?: string;
        platforms?: Array<{ platform: string; config?: Record<string, unknown> }>;
        scheduledAt?: string;
        hashtags?: string[];
      };
    }) =>
      api<Post>(`/v1/posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["posts", id] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function usePublishNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<Post>(`/v1/posts/${id}/publish-now`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useAiGeneratePost() {
  return useMutation({
    mutationFn: (data: {
      platforms: string[];
      tone: string;
      clipId?: string;
      additionalContext?: string;
      language?: string;
    }) =>
      api<{
        suggestions: Array<{ platform: string; contentText: string; hashtags: string[] }>;
        content: string;
        hashtags: string[];
      }>("/v1/posts/ai-generate", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useOptimalPostingTimes() {
  return useQuery({
    queryKey: ["posts", "optimal-times"],
    queryFn: () =>
      api<{
        hourDistribution: Record<string, number>;
        dayDistribution: Record<string, number>;
        recommendations: Array<{ day: string; hour: number; score: number }>;
      }>("/v1/posts/optimal-times"),
  });
}
