"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "下一支影片拍什麼好？",
  "幫我分析目前的成長策略",
  "如何提高互動率？",
  "品牌合作報價建議",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();

  // Don't render if not logged in
  if (!user) return null;

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const history = messages.slice(-10);
      const res = await api<{ reply: string }>("/v1/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text.trim(), history }),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，目前無法回應，請稍後再試。" },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-gray-950">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">AI 創作助手</p>
                <p className="text-xs opacity-80">隨時為您提供創作建議</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30">
                  <p className="text-sm text-purple-900 dark:text-purple-200">
                    嗨 {user.displayName ?? "創作者"}！👋 我是你的 AI 創作助手「小創」，可以幫你：
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-purple-700 dark:text-purple-300">
                    <li>📊 分析數據和成長策略</li>
                    <li>💡 提供內容靈感和腳本</li>
                    <li>🤝 品牌合作建議</li>
                    <li>💰 變現模式優化</li>
                  </ul>
                </div>
                <p className="text-center text-xs text-muted-foreground">試試以下問題：</p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="rounded-lg border border-purple-200 px-3 py-2 text-left text-xs transition-colors hover:bg-purple-50 dark:border-purple-800 dark:hover:bg-purple-950/30"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {msg.content.split("\n").map((line, j) => (
                        <p key={j} className={j > 0 ? "mt-1" : ""}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      思考中...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入你的問題..."
                disabled={loading}
                className="flex-1 rounded-full border bg-gray-50 px-4 py-2 text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 dark:bg-gray-900"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
