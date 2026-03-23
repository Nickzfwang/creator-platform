"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/types";

export interface Bot {
  id: string;
  name: string;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  systemPrompt: string | null;
  isPublic: boolean;
  accessTier: string;
  knowledgeBaseId: string | null;
  totalConversations: number;
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

export interface BotConversation {
  id: string;
  botId: string;
  userId: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  chunkCount: number;
  createdAt: string;
}

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: () => api<PaginatedResponse<Bot>>("/v1/bots"),
  });
}

export function useBot(id: string | undefined) {
  return useQuery({
    queryKey: ["bots", id],
    queryFn: () => api<Bot>(`/v1/bots/${id}`),
    enabled: !!id,
  });
}

export function useCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      welcomeMessage?: string;
      systemPrompt?: string;
      isPublic?: boolean;
      knowledgeBaseId?: string;
      avatarUrl?: string;
    }) =>
      api<Bot>("/v1/bots", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useUpdateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        welcomeMessage?: string;
        systemPrompt?: string;
        isPublic?: boolean;
        knowledgeBaseId?: string;
        avatarUrl?: string;
      };
    }) =>
      api<Bot>(`/v1/bots/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["bots", id] });
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useDeleteBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/v1/bots/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useBotConversations(botId: string | undefined) {
  return useQuery({
    queryKey: ["bots", botId, "conversations"],
    queryFn: () =>
      api<PaginatedResponse<BotConversation>>(
        `/v1/bots/${botId}/conversations`,
      ),
    enabled: !!botId,
  });
}

export function useBotChat() {
  return useMutation({
    mutationFn: ({
      botId,
      message,
      conversationId,
    }: {
      botId: string;
      message: string;
      conversationId?: string;
    }) =>
      api<{ reply: string; conversationId: string }>(
        `/v1/bots/${botId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message, conversationId }),
        },
      ),
  });
}

// ─── Knowledge Base ───

export function useKnowledgeBases() {
  return useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => api<PaginatedResponse<KnowledgeBase>>("/v1/knowledge-bases"),
  });
}

export function useCreateKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; sourceType?: string }) =>
      api<KnowledgeBase>("/v1/knowledge-bases", {
        method: "POST",
        body: JSON.stringify({ ...data, sourceType: data.sourceType || "MANUAL" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

export function useIngestKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api(`/v1/knowledge-bases/${id}/ingest`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/v1/knowledge-bases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}
