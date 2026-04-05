"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Radar, RefreshCw, Sparkles, ExternalLink, Lightbulb, TrendingUp, Filter, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TrendTopic {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  source: string;
  sourcePlatform: string;
  category: string;
  relevanceScore: number;
  contentIdeas: string[];
  url: string | null;
  phase: "NEW" | "RISING" | "PEAK" | "DECLINING";
  isCrossPlatform: boolean;
  firstSeenAt: string;
}

interface TrendReport {
  topics: TrendTopic[];
  aiAnalysis: string;
  generatedAt: string;
  sources: string[];
  nextRefreshAt: string;
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

const platformFilterKeys = [
  { key: "platformAll", value: "all" },
  { key: "platformYouTube", value: "API_YOUTUBE_TRENDING" },
  { key: "platformTikTok", value: "SCRAPER_TIKTOK" },
  { key: "platformThreads", value: "SCRAPER_THREADS" },
  { key: "platformDcard", value: "API_DCARD" },
  { key: "platformReddit", value: "RSS_REDDIT" },
  { key: "platformClaudeCode", value: "RSS_CLAUDE_CODE" },
  { key: "platformMedia", value: "rss" },
] as const;

const phaseFilterKeys = [
  { key: "phasePeak", value: "PEAK" },
  { key: "phaseRising", value: "RISING" },
  { key: "phaseNew", value: "NEW" },
  { key: "phaseDeclining", value: "DECLINING" },
] as const;

const phaseBadgeConfig: Record<TrendTopic["phase"], { key: string; className: string }> = {
  NEW: { key: "phaseNew", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  RISING: { key: "phaseRising", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  PEAK: { key: "phasePeakBadge", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  DECLINING: { key: "phaseDeclining", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
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

// Platforms that have their own dedicated filter tab — exclude from "媒體"
const dedicatedPlatforms = new Set([
  "API_YOUTUBE_TRENDING",
  "SCRAPER_TIKTOK",
  "SCRAPER_THREADS",
  "API_DCARD",
  "RSS_REDDIT",
  "RSS_CLAUDE_CODE",
]);

function matchesPlatformFilter(sourcePlatform: string, filterValue: string): boolean {
  if (filterValue === "all") return true;
  if (filterValue === "rss") {
    // "媒體" = RSS sources that don't have their own tab
    return sourcePlatform.startsWith("RSS_") && !dedicatedPlatforms.has(sourcePlatform);
  }
  return sourcePlatform === filterValue;
}

export default function TrendsPage() {
  const t = useTranslations("trends");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activePlatform, setActivePlatform] = useState<string>("all");
  const [activePhase, setActivePhase] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ["trends"],
    queryFn: () => api<TrendReport>("/v1/trends"),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api<{ success: boolean; jobId: string }>("/v1/trends/refresh", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("refreshStarted"));
      // Poll for new data after background job completes
      const poll = setInterval(async () => {
        try {
          const fresh = await api<TrendReport>("/v1/trends");
          // Check if snapshot is newer than current (job finished)
          if (!report?.generatedAt || fresh.generatedAt > report.generatedAt) {
            queryClient.setQueryData(["trends"], fresh);
            clearInterval(poll);
            toast.success(t("refreshComplete", { count: fresh.topics.length }));
          }
        } catch { /* ignore polling errors */ }
      }, 5000);
      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(poll), 120000);
    },
    onError: (err: Error & { detail?: string }) =>
      toast.error(err.detail || err.message || t("refreshError")),
  });

  const isRefreshing = refreshMutation.isPending;

  const categories = report?.topics
    ? [...new Set(report.topics.map((t) => t.category))]
    : [];

  const filteredTopics = report?.topics?.filter((t) => {
    if (activeCategory !== "all" && t.category !== activeCategory) return false;
    if (activePlatform !== "all" && !matchesPlatformFilter(t.sourcePlatform, activePlatform)) return false;
    if (activePhase !== "all" && t.phase !== activePhase) return false;
    return true;
  }) ?? [];

  const nextRefreshLabel = report?.nextRefreshAt
    ? t("nextRefresh", { time: new Date(report.nextRefreshAt).toLocaleString("zh-TW") })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <div className="flex items-center gap-2">
            {nextRefreshLabel && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {nextRefreshLabel}
              </span>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link href="/trends/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? t("scanning") : t("rescan")}
            </Button>
          </div>
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
                {t("scanningOverlay")}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {t("scanningOverlayDetail")}
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
              <p className="text-sm font-medium">{t("loadingScan")}</p>
              <p className="text-xs text-muted-foreground">{t("loadingScanDetail")}</p>
            </div>
          </CardContent>
        </Card>
      ) : report?.aiAnalysis ? (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-5 w-5 text-emerald-600" />
              {t("todaySummary")}
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
              <span>{t("dataSources")}</span>
              {report.sources.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {s}
                </Badge>
              ))}
              <span className="ml-auto">
                {t("updatedAt", { time: new Date(report.generatedAt).toLocaleString("zh-TW") })}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Filter Bar */}
      {!isLoading && report?.topics && report.topics.length > 0 && (
        <div className="space-y-3">
          {/* Platform Filters */}
          <div className="flex flex-wrap gap-2">
            {platformFilterKeys.map((pf) => (
              <Button
                key={pf.value}
                variant={activePlatform === pf.value ? "default" : "outline"}
                size="sm"
                onClick={() => setActivePlatform(pf.value)}
              >
                {t(pf.key)}
              </Button>
            ))}
          </div>

          {/* Phase Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activePhase === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActivePhase("all")}
            >
              {t("allPhases")}
            </Button>
            {phaseFilterKeys.map((pf) => (
              <Button
                key={pf.value}
                variant={activePhase === pf.value ? "default" : "outline"}
                size="sm"
                onClick={() => setActivePhase(pf.value)}
              >
                {t(pf.key)}
              </Button>
            ))}
          </div>

          {/* Category Filters */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeCategory === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory("all")}
              >
                <Filter className="mr-1 h-3 w-3" />
                {t("allCategories", { count: report?.topics?.length ?? 0 })}
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
        </div>
      )}

      {/* Trend Topics */}
      {filteredTopics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTopics.map((topic) => {
            const phaseConfig = phaseBadgeConfig[topic.phase];
            return (
              <Card key={topic.id} className="transition-shadow hover:shadow-md">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${categoryColors[topic.category] ?? ""}`}
                        >
                          {topic.category}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${phaseConfig.className}`}
                        >
                          {t(phaseConfig.key)}
                        </Badge>
                        {topic.isCrossPlatform && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
                          >
                            {t("crossPlatformHot")}
                          </Badge>
                        )}
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
                      <span className="text-muted-foreground">{t("creatorRelevance")}</span>
                    </div>
                    <ScoreBar score={topic.relevanceScore} />
                  </div>

                  {/* Content Ideas */}
                  {topic.contentIdeas?.length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                        <Lightbulb className="h-3 w-3" />
                        {t("contentIdeas")}
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

                  {/* Detail Link */}
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/trends/${topic.fingerprint}`}>
                        {t("viewDetails")}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isError && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-12 text-center">
            <Radar className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{t("loadError")}</p>
            <Button variant="outline" className="mt-3" onClick={() => refreshMutation.mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !isRefreshing && filteredTopics.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Radar className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
            <Button variant="outline" className="mt-3" onClick={() => refreshMutation.mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("startScan")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
