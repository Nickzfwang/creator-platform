"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ─── Types ───

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface FillerMark {
  id: string;
  word: string;
  startTime: number;
  endTime: number;
  contextBefore: string;
  contextAfter: string;
}

export interface Chapter {
  id: string;
  title: string;
  startTime: number;
}

export interface ScriptSection {
  title: string;
  timeRange: string;
  startTime: number;
  endTime: number;
  keyPoints: string[];
  keywords: string[];
}

export interface ScriptSummary {
  title: string;
  totalDuration: string;
  sections: ScriptSection[];
  tags: string[];
  oneLinerSummary: string;
}

export interface MultiPlatformResult {
  results: Array<{
    id: string;
    title: string;
    outputUrl: string;
    format: string;
    durationSeconds: number;
    thumbnailUrl?: string;
    hashtags: string[];
    suggestedCaption: string;
  }>;
  failed: Array<{ platform: string; reason: string }>;
}

// ─── Hooks ───

export function useTranscribeWords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api<{ videoId: string; wordCount: number; durationSeconds: number; message: string }>(
        `/v1/videos/${videoId}/transcribe-words`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useDetectFillers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api<{
        videoId: string;
        fillers: FillerMark[];
        totalCount: number;
        estimatedSavings: number;
      }>(`/v1/videos/${videoId}/detect-fillers`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useCutFillers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      fillerIds,
    }: {
      videoId: string;
      fillerIds: string[];
    }) =>
      api<{
        videoId: string;
        outputUrl: string;
        originalDuration: number;
        newDuration: number;
        removedCount: number;
      }>(`/v1/videos/${videoId}/cut-fillers`, {
        method: "POST",
        body: JSON.stringify({ fillerIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useGenerateChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api<{
        videoId: string;
        chapters: Chapter[];
        youtubeFormat: string;
      }>(`/v1/videos/${videoId}/generate-chapters`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useUpdateChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      chapters,
    }: {
      videoId: string;
      chapters: Array<{ id: string; title: string; startTime: number }>;
    }) =>
      api<{ chapters: Chapter[]; youtubeFormat: string }>(
        `/v1/videos/${videoId}/chapters`,
        {
          method: "PATCH",
          body: JSON.stringify({ chapters }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useGenerateScriptSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api<{
        videoId: string;
        summary: ScriptSummary;
        markdown: string;
      }>(`/v1/videos/${videoId}/generate-script-summary`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useMultiPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      videoId: string;
      clipId: string;
      platforms: string[];
      addSubtitles?: boolean;
    }) =>
      api<MultiPlatformResult>("/v1/videos/multi-platform", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}
