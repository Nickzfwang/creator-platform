"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Send, Bot, User, Loader2, MessageCircle, AlertCircle } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface BotInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  personality: { tone?: string; style?: string; expertise?: string[] } | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function getAnonymousId(): string {
  const key = "bot_anon_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function PublicBotChatPage() {
  const { botId } = useParams<{ botId: string }>();
  const t = useTranslations("publicBot");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch bot info
  const { data: bot, isLoading: botLoading, error: botError } = useQuery({
    queryKey: ["public-bot", botId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/v1/bots/${botId}/public`);
      if (!res.ok) throw new Error("Bot not found");
      return res.json() as Promise<BotInfo>;
    },
    enabled: !!botId,
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`${API_BASE}/v1/bots/${botId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: conversationId ?? undefined,
          anonymousId: getAnonymousId(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send message");
      }
      return res.json() as Promise<{ conversationId: string; reply: string; hasContext: boolean }>;
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, timestamp: new Date().toISOString() },
      ]);
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add welcome message when bot loads
  useEffect(() => {
    if (bot?.welcomeMessage && messages.length === 0) {
      setMessages([
        { role: "assistant", content: bot.welcomeMessage, timestamp: new Date().toISOString() },
      ]);
    }
  }, [bot]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
    ]);
    setInput("");
    chatMutation.mutate(text);
  }, [input, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // Loading state
  if (botLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (botError || !bot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950">
        <AlertCircle className="h-12 w-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-gray-500">{t("notFoundDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {bot.avatarUrl ? (
              <img src={bot.avatarUrl} alt={bot.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <Bot className="h-5 w-5" />
            )}
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-gray-100">{bot.name}</h1>
            {bot.personality?.expertise && bot.personality.expertise.length > 0 && (
              <p className="text-xs text-gray-500">
                {bot.personality.expertise.slice(0, 3).join(" · ")}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">{t("online")}</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <MessageCircle className="h-12 w-12 text-gray-200 dark:text-gray-700 mb-4" />
              <p className="text-gray-400">{t("startConversation")}</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              }`}>
                {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-500 text-white rounded-br-md"
                  : "bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-200 rounded-bl-md"
              }`}>
                {msg.content.split("\n").map((line, k) => (
                  <p key={k} className={k > 0 ? "mt-1.5" : ""}>{line}</p>
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {chatMutation.isPending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {chatMutation.isError && (
            <div className="mx-auto max-w-sm rounded-lg bg-red-50 p-3 text-center text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {t("sendFailed", { error: chatMutation.error.message })}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="sticky bottom-0 border-t bg-white dark:bg-gray-900">
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:bg-gray-800 dark:border-gray-700"
            style={{ maxHeight: 120 }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="pb-2 text-center text-[10px] text-gray-300 dark:text-gray-600">
          Powered by Creator Platform
        </div>
      </footer>
    </div>
  );
}
