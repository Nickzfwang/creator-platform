"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  { key: string; className: string }
> = {
  NEW: {
    key: "phaseNew",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  RISING: {
    key: "phaseRising",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  PEAK: {
    key: "phasePeakBadge",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  DECLINING: {
    key: "phaseDeclining",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
};

const phaseExplanationKeys: Record<TrendHistory["currentPhase"], string> = {
  NEW: "detail.phaseExplanationNew",
  RISING: "detail.phaseExplanationRising",
  PEAK: "detail.phaseExplanationPeak",
  DECLINING: "detail.phaseExplanationDeclining",
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
  const t = useTranslations("trends");
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
          {t("backToTrends")}
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
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
          {t("backToTrends")}
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("detail.notFound")}</p>
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
        {t("backToTrends")}
      </Link>

      {/* Title + Phase */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{trend.title}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className={phase.className}>
              {t(phase.key)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t("detail.trackedDays", { days: trackedDays })}
            </span>
          </div>
        </div>
        <Button asChild>
          <Link href="/strategy">
            <Calendar className="mr-2 h-4 w-4" />
            {t("detail.addToCalendar")}
          </Link>
        </Button>
      </div>

      {/* 14-Day History Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            {t("detail.historyChart")}
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
              {t("detail.peakData")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("detail.peakScore")}</span>
              <span className="text-lg font-bold">
                {Math.round(trend.peakScore * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("detail.peakDate")}</span>
              <span className="text-sm font-medium">
                {new Date(trend.peakDate).toLocaleDateString("zh-TW")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("detail.firstSeen")}</span>
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
              {t("detail.phaseAnalysis")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className={`mb-3 ${phase.className}`}>
              {t(phase.key)}
            </Badge>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(phaseExplanationKeys[trend.currentPhase])}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
