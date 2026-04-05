"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  ExternalLink,
  Lightbulb,
  Flame,
  TrendingDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TrendHistory {
  fingerprint: string;
  title: string;
  currentPhase: "NEW" | "RISING" | "PEAK" | "DECLINING";
  history: { date: string; relevanceScore: number; snapshotId: string }[];
  firstSeenAt: string;
  peakScore: number;
  peakDate: string;
}

const phaseBadge: Record<
  TrendHistory["currentPhase"],
  { label: string; className: string }
> = {
  NEW: {
    label: "\uD83C\uDD95 \u65B0\u8DA8\u52E2",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  RISING: {
    label: "\uD83D\uDCC8 \u4E0A\u5347\u4E2D",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  PEAK: {
    label: "\uD83D\uDD25 \u9AD8\u5CF0",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  DECLINING: {
    label: "\uD83D\uDCC9 \u8870\u9000\u4E2D",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
};

const phaseExplanation: Record<TrendHistory["currentPhase"], string> = {
  NEW: "\u9019\u662F\u4E00\u500B\u65B0\u51FA\u73FE\u7684\u8DA8\u52E2\uFF0C\u5C1A\u5728\u89C0\u5BDF\u968E\u6BB5\u3002\u5EFA\u8B70\u6301\u7E8C\u8FFD\u8E64\uFF0C\u82E5\u8207\u4F60\u7684\u5167\u5BB9\u9818\u57DF\u76F8\u95DC\uFF0C\u53EF\u4EE5\u63D0\u524D\u4F48\u5C40\u3002",
  RISING:
    "\u8DA8\u52E2\u6B63\u5728\u4E0A\u5347\uFF0C\u95DC\u6CE8\u5EA6\u9010\u6F38\u589E\u52A0\u3002\u73FE\u5728\u662F\u88FD\u4F5C\u76F8\u95DC\u5167\u5BB9\u7684\u597D\u6642\u6A5F\uFF0C\u80FD\u5920\u642D\u4E0A\u8DA8\u52E2\u7684\u4E0A\u5347\u6CE2\u3002",
  PEAK: "\u8DA8\u52E2\u5DF2\u9054\u5230\u9AD8\u5CF0\uFF0C\u95DC\u6CE8\u5EA6\u6700\u9AD8\u3002\u7ACB\u5373\u767C\u5E03\u76F8\u95DC\u5167\u5BB9\u53EF\u4EE5\u7372\u5F97\u6700\u5927\u66DD\u5149\uFF0C\u4F46\u8ACB\u6CE8\u610F\u7AF6\u722D\u4E5F\u6700\u6FC0\u70C8\u3002",
  DECLINING:
    "\u8DA8\u52E2\u5DF2\u958B\u59CB\u8870\u9000\uFF0C\u95DC\u6CE8\u5EA6\u4E0B\u964D\u4E2D\u3002\u53EF\u4EE5\u505A\u7E3D\u7D50\u6027\u5167\u5BB9\uFF0C\u4F46\u4E0D\u5EFA\u8B70\u5927\u91CF\u6295\u5165\u8CC7\u6E90\u3002",
};

function getBarColor(score: number): string {
  if (score >= 0.7) return "bg-green-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-gray-400";
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function TrendDetailPage() {
  const params = useParams<{ fingerprint: string }>();

  const { data: trend, isLoading } = useQuery({
    queryKey: ["trends", params.fingerprint],
    queryFn: () =>
      api<TrendHistory>(`/v1/trends/${params.fingerprint}/history`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href="/trends"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回趨勢雷達
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">載入中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!trend) {
    return (
      <div className="space-y-6">
        <Link
          href="/trends"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回趨勢雷達
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">找不到此趨勢資料</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phase = phaseBadge[trend.currentPhase];
  const trackedDays = daysSince(trend.firstSeenAt);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/trends"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回趨勢雷達
      </Link>

      {/* Title + Phase */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{trend.title}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className={phase.className}>
              {phase.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              已追蹤 {trackedDays} 天
            </span>
          </div>
        </div>
        <Button asChild>
          <Link href="/strategy">
            <Calendar className="mr-2 h-4 w-4" />
            排入內容日曆
          </Link>
        </Button>
      </div>

      {/* 14-Day History Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            14 天趨勢走勢
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 sm:gap-2" style={{ height: 200 }}>
            {trend.history.map((point, idx) => {
              const heightPct = Math.max(point.relevanceScore * 100, 2);
              const color = getBarColor(point.relevanceScore);
              const dateLabel = new Date(point.date).toLocaleDateString(
                "zh-TW",
                { month: "numeric", day: "numeric" },
              );
              const showLabel = idx % 2 === 0;

              return (
                <div
                  key={point.snapshotId}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {Math.round(point.relevanceScore * 100)}
                  </span>
                  <div
                    className="relative flex w-full items-end"
                    style={{ height: 160 }}
                  >
                    <div
                      className={`w-full rounded-t ${color} transition-all`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] text-muted-foreground ${showLabel ? "" : "invisible"}`}
                  >
                    {dateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Peak Info + Phase Explanation */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-orange-500" />
              高峰數據
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">最高分數</span>
              <span className="text-lg font-bold">
                {Math.round(trend.peakScore * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">高峰日期</span>
              <span className="text-sm font-medium">
                {new Date(trend.peakDate).toLocaleDateString("zh-TW")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">首次發現</span>
              <span className="text-sm font-medium">
                {new Date(trend.firstSeenAt).toLocaleDateString("zh-TW")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              階段分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className={`mb-3 ${phase.className}`}>
              {phase.label}
            </Badge>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {phaseExplanation[trend.currentPhase]}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
