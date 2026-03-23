"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAccessToken } from "@/lib/api";
import type { Video, VideoClip, PaginatedResponse } from "@/lib/types";

interface VideoListParams {
  cursor?: string;
  limit?: number;
  status?: string;
}

export function useVideos(params: VideoListParams = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  const qs = query.toString();

  return useQuery({
    queryKey: ["videos", params],
    queryFn: () => api<PaginatedResponse<Video>>(`/v1/videos${qs ? `?${qs}` : ""}`),
  });
}

export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: ["videos", id],
    queryFn: () => api<Video>(`/v1/videos/${id}`),
    enabled: !!id,
  });
}

export function useCreateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description?: string }) =>
      api<Video>("/v1/videos", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useUpdateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; description?: string };
    }) =>
      api<Video>(`/v1/videos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["videos", id] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/videos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useVideoClips(videoId: string | undefined) {
  return useQuery({
    queryKey: ["videos", videoId, "clips"],
    queryFn: () => api<VideoClip[]>(`/v1/videos/${videoId}/clips`),
    enabled: !!videoId,
  });
}

export function useGenerateClips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      data,
    }: {
      videoId: string;
      data?: { maxClips?: number; minDuration?: number; maxDuration?: number };
    }) =>
      api(`/v1/videos/${videoId}/clips/generate`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: (_, { videoId }) => {
      qc.invalidateQueries({ queryKey: ["videos", videoId, "clips"] });
    },
  });
}

export function useVideoTranscript(videoId: string | undefined) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript"],
    queryFn: () => api<{ segments: Array<{ start: number; end: number; text: string }> }>(`/v1/videos/${videoId}/transcript`),
    enabled: !!videoId,
  });
}

export function useGenerateSubtitles() {
  return useMutation({
    mutationFn: ({
      videoId,
      data,
    }: {
      videoId: string;
      data?: { language?: string; polish?: boolean };
    }) =>
      api<{
        videoId: string;
        srtUrl: string;
        vttUrl: string;
        segmentCount: number;
        preview: string;
        language: string;
        polished: boolean;
      }>(`/v1/videos/${videoId}/subtitles`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
  });
}

export function useUploadUrl() {
  return useMutation({
    mutationFn: (data: { filename: string; contentType: string; fileSize: number }) =>
      api<{ uploadUrl: string; videoId: string }>("/v1/videos/upload-url", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useGenerateShort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      clipId,
      data,
    }: {
      videoId: string;
      clipId: string;
      data?: { format?: "9:16" | "1:1"; addSubtitles?: boolean; platform?: string };
    }) =>
      api<{
        id: string;
        title: string;
        outputUrl: string;
        format: string;
        durationSeconds: number;
        thumbnailUrl?: string;
        hashtags: string[];
        suggestedCaption: string;
      }>(`/v1/videos/${videoId}/clips/${clipId}/generate-short`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: (_, { videoId }) => {
      qc.invalidateQueries({ queryKey: ["videos", videoId, "clips"] });
    },
  });
}

export function useGenerateAllShorts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      data,
    }: {
      videoId: string;
      data?: { format?: "9:16" | "1:1"; addSubtitles?: boolean; platform?: string };
    }) =>
      api<Array<{
        id: string;
        title: string;
        outputUrl: string;
        format: string;
        durationSeconds: number;
        hashtags: string[];
        suggestedCaption: string;
      }>>(`/v1/videos/${videoId}/generate-all-shorts`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: (_, { videoId }) => {
      qc.invalidateQueries({ queryKey: ["videos", videoId, "clips"] });
    },
  });
}

export function useDirectUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
      const token = getAccessToken();
      const res = await fetch(`${baseUrl}/v1/videos/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || err.message || "Upload failed");
      }
      return res.json() as Promise<{ id: string; status: string; message: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}
