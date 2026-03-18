"use client";

import { useState } from "react";
import { Radar, RefreshCw, Sparkles, ExternalLink, Lightbulb, TrendingUp, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TrendTopic {
  title: string;
  summary: string;
  source: string;
  category: string;
  relevanceScore: number;
  contentIdeas: string[];
  url?: string;
}

interface TrendReport {
  topics: TrendTopic[];
  aiAnalysis: string;
  generatedAt: string;
  sources: string[];
}

const categoryColors: Record<string, string> = {
  "科技": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "生活": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "商業": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "娛樂": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "社會議題": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "創作者經濟": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "國際科技": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "商業科技": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "社群討論": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "新產品": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-gray-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function TrendsPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ["trends"],
    queryFn: () => api<TrendReport>("/v1/trends"),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api<TrendReport>("/v1/trends/refresh", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["trends"], data);
      toast.success("趨勢已重新整理");
    },
    onError: () => toast.error("重新整理失敗，請稍後再試"),
  });

  const isRefreshing = refreshMutation.isPending;

  const categories = report?.topics
    ? [...new Set(report.topics.map((t) => t.category))]
    : [];

  const filteredTopics = report?.topics?.filter(
    (t) => activeCategory === "all" || t.category === activeCategory,
  ) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="趨勢雷達"
        description="AI 自動掃描各大平台，為你整理今日熱門話題和內容靈感"
        action={
          <Button
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "掃描中..." : "重新掃描"}
          </Button>
        }
      />

      {/* Refreshing Overlay */}
      {isRefreshing && (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="relative">
              <Radar className="h-8 w-8 text-emerald-600 animate-pulse" />
              <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                AI 趨勢雷達掃描中...
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                正在從 Dcard、iThome、TechCrunch 等平台抓取最新資料並進行 AI 分析，約需 15-30 秒
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-800">
                  <div className="h-full animate-[loading_2s_ease-in-out_infinite] rounded-full bg-emerald-500" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Summary */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-4 py-8">
            <div className="relative">
              <Radar className="h-8 w-8 text-emerald-600 animate-pulse" />
              <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-medium">AI 正在掃描各大平台的熱門話題...</p>
              <p className="text-xs text-muted-foreground">首次載入需要 15-30 秒，請稍候</p>
            </div>
          </CardContent>
        </Card>
      ) : report?.aiAnalysis ? (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-5 w-5 text-emerald-600" />
              今日趨勢總覽
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {report.aiAnalysis.split("\n").map((line, i) => (
                <p key={i} className={line.trim() === "" ? "h-1" : "mb-1"}>
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>資料來源：</span>
              {report.sources.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {s}
                </Badge>
              ))}
              <span className="ml-auto">
                更新時間：{new Date(report.generatedAt).toLocaleString("zh-TW")}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory("all")}
          >
            <Filter className="mr-1 h-3 w-3" />
            全部 ({report?.topics?.length ?? 0})
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
            >
              {cat} ({report?.topics?.filter((t) => t.category === cat).length})
            </Button>
          ))}
        </div>
      )}

      {/* Trend Topics */}
      {filteredTopics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTopics.map((topic, idx) => (
            <Card key={idx} className="transition-shadow hover:shadow-md">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${categoryColors[topic.category] ?? ""}`}
                      >
                        {topic.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {topic.source}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">
                      {topic.url ? (
                        <a
                          href={topic.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary hover:underline"
                        >
                          {topic.title}
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>
                      ) : (
                        topic.title
                      )}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {topic.summary}
                    </p>
                  </div>
                </div>

                {/* Relevance Score */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">創作者相關度</span>
                  </div>
                  <ScoreBar score={topic.relevanceScore} />
                </div>

                {/* Content Ideas */}
                {topic.contentIdeas?.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                    <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                      <Lightbulb className="h-3 w-3" />
                      內容靈感
                    </p>
                    <ul className="space-y-1">
                      {topic.contentIdeas.map((idea, j) => (
                        <li key={j} className="text-xs text-amber-900 dark:text-amber-200">
                          • {idea}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !isRefreshing && filteredTopics.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Radar className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">尚未載入趨勢資料</p>
            <Button variant="outline" className="mt-3" onClick={() => refreshMutation.mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              開始掃描
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
