"use client";

import { useState } from "react";
import { Globe, Wifi, WifiOff, Play, Loader2, ExternalLink, Sparkles, Star, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BrowseStatus {
  connected: boolean;
  message: string;
}

interface SavedPost {
  platform: string;
  author: string;
  content: string;
  url: string;
  likes?: number;
  comments?: number;
  imageUrl?: string;
  aiSummary: string;
  aiCategory: string;
  aiTags: string[];
  relevanceScore: number;
}

interface BrowseResult {
  id: string;
  platform: string;
  totalPosts: number;
  posts: SavedPost[];
  startedAt: string;
  completedAt: string;
}

const platforms = [
  { id: "facebook", name: "Facebook", icon: "📘", color: "bg-blue-500" },
  { id: "youtube", name: "YouTube", icon: "▶️", color: "bg-red-500" },
  { id: "threads", name: "Threads", icon: "🧵", color: "bg-gray-800" },
];

export default function AutoBrowsePage() {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const queryClient = useQueryClient();

  const { data: status, isLoading: checkingStatus } = useQuery({
    queryKey: ["browse-status"],
    queryFn: () => api<BrowseStatus>("/v1/auto-browse/status"),
    refetchInterval: 10000,
  });

  const browseMutation = useMutation({
    mutationFn: (platform: string) =>
      api<BrowseResult>("/v1/auto-browse/run", {
        method: "POST",
        body: JSON.stringify({ platform, maxPosts: 10, scrollCount: 5 }),
      }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      toast.success(`已收集 ${data.totalPosts} 則精華內容`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isConnected = status?.connected ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 自動瀏覽"
        description="連接你的 Chrome 瀏覽器，AI 自動幫你滑社群、擷取精華內容"
      />

      {/* Connection Status */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isConnected ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {isConnected ? (
              <Wifi className="h-6 w-6 text-green-600" />
            ) : (
              <WifiOff className="h-6 w-6 text-red-600" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {isConnected ? "✅ Chrome 已連線" : "⚠️ 尚未連接 Chrome"}
            </h3>
            <p className="text-xs text-muted-foreground whitespace-pre-line">
              {status?.message || "檢查中..."}
            </p>
          </div>
          {!isConnected && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-mono text-muted-foreground">
                Mac 啟動指令：
              </p>
              <p className="mt-1 text-xs font-mono select-all">
                open -a &quot;Google Chrome&quot; --args --remote-debugging-port=9222
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Selection */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">選擇要瀏覽的平台</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {platforms.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                !isConnected ? "opacity-50 pointer-events-none" : ""
              } ${browseMutation.isPending ? "pointer-events-none" : ""}`}
            >
              <CardContent className="flex flex-col items-center gap-3 pt-6">
                <span className="text-4xl">{p.icon}</span>
                <p className="font-semibold">{p.name}</p>
                <Button
                  size="sm"
                  disabled={!isConnected || browseMutation.isPending}
                  onClick={() => browseMutation.mutate(p.id)}
                  className="w-full"
                >
                  {browseMutation.isPending && browseMutation.variables === p.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI 正在瀏覽...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      開始瀏覽
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {browseMutation.isPending && (
        <Card className="border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-purple-500" />
              <Globe className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-purple-700" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-purple-900 dark:text-purple-100">
                AI 正在幫你瀏覽社群...
              </p>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">
                自動滾動頁面、擷取貼文、AI 分析摘要中
              </p>
              <p className="mt-2 text-xs text-purple-500">
                通常需要 30-60 秒，請勿關閉 Chrome
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !browseMutation.isPending && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              從 {result.platform} 收集了 {result.totalPosts} 則精華內容
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(result.completedAt).toLocaleTimeString("zh-TW")}
            </div>
          </div>
          <div className="space-y-3">
            {result.posts.map((post, i) => (
              <Card key={i} className="transition-shadow hover:shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    {/* Relevance Score */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                          post.relevanceScore >= 80
                            ? "bg-green-500"
                            : post.relevanceScore >= 60
                            ? "bg-yellow-500"
                            : "bg-gray-400"
                        }`}
                      >
                        {post.relevanceScore}
                      </div>
                      <span className="mt-1 text-[10px] text-muted-foreground">參考值</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Author + Category */}
                      <div className="flex items-center gap-2 mb-1">
                        {post.author && (
                          <span className="text-xs font-medium">{post.author}</span>
                        )}
                        {post.aiCategory && (
                          <Badge variant="secondary" className="text-[10px]">
                            {post.aiCategory}
                          </Badge>
                        )}
                      </div>

                      {/* AI Summary */}
                      <div className="rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 p-2.5 dark:from-purple-950/20 dark:to-blue-950/20">
                        <p className="flex items-center gap-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 mb-1">
                          <Sparkles className="h-3 w-3" /> AI 摘要
                        </p>
                        <p className="text-sm leading-relaxed">
                          {post.aiSummary}
                        </p>
                      </div>

                      {/* Original content preview */}
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {post.content.slice(0, 150)}
                      </p>

                      {/* Tags + Link */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {post.aiTags?.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {post.url && (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            原文 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            💡 所有內容已自動存入「收藏庫」，可隨時查看
          </p>
        </div>
      )}
    </div>
  );
}
