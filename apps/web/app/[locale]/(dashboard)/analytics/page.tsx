"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Eye, TrendingUp, DollarSign, Sparkles, RefreshCw } from "lucide-react";
import {
  useOverview,
  usePlatformStats,
  useCrossPlatformComparison,
  useRevenueAnalytics,
  useTopContent,
  useAiInsights,
} from "@/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CardsSkeleton, TableSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Period = "7d" | "30d" | "90d" | "365d";

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export default function AnalyticsPage() {
  const t = useTranslations("analytics");
  const [period, setPeriod] = useState<Period>("30d");

  const { data: overview, isLoading: overviewLoading } = useOverview({ period });
  const { data: platformStats, isLoading: platformLoading } = usePlatformStats({ period });
  const { data: comparison, isLoading: comparisonLoading } = useCrossPlatformComparison({ period });
  const { data: revenue, isLoading: revenueLoading } = useRevenueAnalytics({ period });
  const { data: topContent, isLoading: topContentLoading } = useTopContent({ period });
  const { data: aiInsights, isLoading: aiLoading, refetch: refetchInsights, isFetching: aiRefetching } = useAiInsights({ period });

  // Map analytics overview response to display values
  const totalFollowers = overview?.metrics?.followers ?? 0;
  const totalViews = overview?.metrics?.views ?? 0;
  const totalEngagement = (overview?.metrics?.likes ?? 0) + (overview?.metrics?.comments ?? 0) + (overview?.metrics?.shares ?? 0);
  const followerGrowth = overview?.changes?.followers ?? 0;
  const viewsGrowth = overview?.changes?.views ?? 0;

  // Platform breakdown from overview
  const platformBreakdown = overview?.platformBreakdown
    ? Object.entries(overview.platformBreakdown).map(([platform, stats]) => ({
        platform,
        followers: stats.followers,
        views: stats.views,
        engagement: stats.likes + stats.comments + stats.shares,
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("period.last7Days")}</SelectItem>
              <SelectItem value="30d">{t("period.last30Days")}</SelectItem>
              <SelectItem value="90d">{t("period.last90Days")}</SelectItem>
              <SelectItem value="365d">{t("period.lastYear")}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Overview Stats */}
      {overviewLoading ? (
        <CardsSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("stats.totalFollowers")}
            value={formatNumber(totalFollowers)}
            change={followerGrowth}
            icon={Users}
          />
          <StatCard
            label={t("stats.totalViews")}
            value={formatNumber(totalViews)}
            change={viewsGrowth}
            icon={Eye}
          />
          <StatCard
            label={t("stats.totalEngagement")}
            value={formatNumber(totalEngagement)}
            icon={TrendingUp}
          />
          <StatCard
            label={t("stats.totalRevenue")}
            value={`NT$${(revenue?.total ?? 0).toLocaleString()}`}
            icon={DollarSign}
          />
        </div>
      )}

      {/* AI Insights */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 dark:border-purple-900 dark:from-purple-950/30 dark:to-blue-950/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              {t("aiInsights.title")}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchInsights()}
              disabled={aiRefetching}
              className="text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              <RefreshCw className={`mr-1 h-3 w-3 ${aiRefetching ? "animate-spin" : ""}`} />
              {aiRefetching ? t("aiInsights.analyzing") : t("aiInsights.reanalyze")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiLoading || aiRefetching ? (
            <div className="flex items-center gap-3 py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
              <span className="text-sm text-muted-foreground">{t("aiInsights.loadingMessage")}</span>
            </div>
          ) : aiInsights?.insights ? (
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {aiInsights.insights.split("\n").map((line, i) => (
                <p key={i} className={line.trim() === "" ? "h-2" : "mb-1"}>
                  {line}
                </p>
              ))}
              <p className="mt-3 text-xs text-muted-foreground">
                {t("aiInsights.analyzedAt", { time: new Date(aiInsights.generatedAt).toLocaleString("zh-TW") })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("aiInsights.clickToAnalyze")}</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="platform">
        <TabsList>
          <TabsTrigger value="platform">{t("tabs.platform")}</TabsTrigger>
          <TabsTrigger value="revenue">{t("tabs.revenue")}</TabsTrigger>
          <TabsTrigger value="content">{t("tabs.content")}</TabsTrigger>
        </TabsList>

        {/* Platform Comparison Tab */}
        <TabsContent value="platform" className="mt-4 space-y-6">
          {overviewLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("platform.overview")}</CardTitle>
              </CardHeader>
              <CardContent>
                {!platformBreakdown.length ? (
                  <p className="text-sm text-muted-foreground">{t("platform.noData")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.platform")}</TableHead>
                        <TableHead className="text-right">{t("table.followers")}</TableHead>
                        <TableHead className="text-right">{t("table.views")}</TableHead>
                        <TableHead className="text-right">{t("table.engagement")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {platformBreakdown.map((p) => (
                        <TableRow key={p.platform}>
                          <TableCell>
                            <Badge variant="outline">{p.platform}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(p.followers)}</TableCell>
                          <TableCell className="text-right">{formatNumber(p.views)}</TableCell>
                          <TableCell className="text-right">{formatNumber(p.engagement)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cross-Platform Comparison */}
          {comparisonLoading ? (
            <TableSkeleton rows={3} />
          ) : comparison?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("platform.crossComparison")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.account")}</TableHead>
                      <TableHead>{t("table.platform")}</TableHead>
                      <TableHead className="text-right">{t("table.followers")}</TableHead>
                      <TableHead className="text-right">{t("table.views")}</TableHead>
                      <TableHead className="text-right">{t("table.engagementRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.accountName}</TableCell>
                        <TableCell><Badge variant="outline">{item.platform}</Badge></TableCell>
                        <TableCell className="text-right">{formatNumber(item.followers)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.totalViews)}</TableCell>
                        <TableCell className="text-right">{item.avgEngagementRate.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="mt-4 space-y-6">
          {revenueLoading ? (
            <CardsSkeleton count={3} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                  label={t("revenue.subscription")}
                  value={`NT$${(revenue?.subscription ?? 0).toLocaleString()}`}
                />
                <StatCard
                  label={t("revenue.membership")}
                  value={`NT$${(revenue?.membership ?? 0).toLocaleString()}`}
                />
                <StatCard
                  label={t("revenue.affiliate")}
                  value={`NT$${(revenue?.affiliate ?? 0).toLocaleString()}`}
                />
              </div>

              {revenue?.breakdown && revenue.breakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("revenue.trend")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {revenue.breakdown.slice(-10).map((item) => (
                        <div key={item.date} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{item.date}</span>
                          <span className="font-medium">NT${item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Top Content Tab */}
        <TabsContent value="content" className="mt-4">
          {topContentLoading ? (
            <TableSkeleton />
          ) : !topContent?.length ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">{t("content.noData")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("content.topContent")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.title")}</TableHead>
                      <TableHead>{t("table.platform")}</TableHead>
                      <TableHead className="text-right">{t("table.views")}</TableHead>
                      <TableHead className="text-right">{t("table.engagement")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topContent.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {item.title}
                        </TableCell>
                        <TableCell><Badge variant="outline">{item.platform}</Badge></TableCell>
                        <TableCell className="text-right">{formatNumber(item.views)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.engagement)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
