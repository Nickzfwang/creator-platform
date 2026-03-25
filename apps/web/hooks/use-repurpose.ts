"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ─── Types ───

export interface RepurposeItem {
  id: string;
  type: "SOCIAL_POST" | "SHORT_VIDEO_SUGGESTION" | "EMAIL";
  status: "GENERATED" | "EDITED" | "SCHEDULED" | "DISCARDED";
  platform: string | null;
  style: string | null;
  content: Record<string, unknown>;
  originalContent: Record<string, unknown>;
  editedContent: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  postId: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepurposeJob {
  id: string;
  videoId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  items: RepurposeItem[];
}

interface RepurposeJobResponse {
  job: RepurposeJob | null;
}

interface ScheduleResult {
  scheduled: Array<{
    itemId: string;
    postId: string;
    platform: string;
    status: string;
  }>;
  failed: Array<{
    itemId: string;
    reason: string;
  }>;
}

// ─── Hooks ───

export function useRepurposeJob(videoId: string | undefined) {
  return useQuery({
    queryKey: ["repurpose", videoId],
    queryFn: () =>
      api<RepurposeJobResponse>(`/v1/content-repurpose/video/${videoId}`),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      // Poll every 5s while generating
      if (job?.status === "PENDING" || job?.status === "PROCESSING") {
        return 5000;
      }
      return false;
    },
  });
}

export function useTriggerRepurpose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api<{ jobId: string; status: string; message: string }>(
        `/v1/content-repurpose/video/${videoId}/generate`,
        { method: "POST" },
      ),
    onSuccess: (_data, videoId) => {
      qc.invalidateQueries({ queryKey: ["repurpose", videoId] });
    },
  });
}

export function useUpdateRepurposeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { editedContent?: Record<string, unknown>; status?: "DISCARDED" };
    }) =>
      api(`/v1/content-repurpose/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repurpose"] });
    },
  });
}

export function useResetRepurposeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api(`/v1/content-repurpose/items/${itemId}/reset`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repurpose"] });
    },
  });
}

export function useRegenerateRepurposeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api(`/v1/content-repurpose/items/${itemId}/regenerate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repurpose"] });
    },
  });
}

export function useScheduleRepurposeItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { itemIds: string[]; scheduledAt?: string }) =>
      api<ScheduleResult>("/v1/content-repurpose/items/schedule", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repurpose"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useCreateCampaignFromItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { targetTags?: string[]; scheduledAt?: string };
    }) =>
      api(`/v1/content-repurpose/items/${itemId}/create-campaign`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repurpose"] });
    },
  });
}
