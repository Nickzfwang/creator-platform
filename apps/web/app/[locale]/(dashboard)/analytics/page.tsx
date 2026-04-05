"use client";

import { useState } from "react";
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
        title="數據分析"
        description="追蹤跨平台表現和收入"
        action={
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">過去 7 天</SelectItem>
              <SelectItem value="30d">過去 30 天</SelectItem>
              <SelectItem value="90d">過去 90 天</SelectItem>
              <SelectItem value="365d">過去一年</SelectItem>
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
            label="總粉絲數"
            value={formatNumber(totalFollowers)}
            change={followerGrowth}
            icon={Users}
          />
          <StatCard
            label="總觀看次數"
            value={formatNumber(totalViews)}
            change={viewsGrowth}
            icon={Eye}
          />
          <StatCard
            label="總互動數"
            value={formatNumber(totalEngagement)}
            icon={TrendingUp}
          />
          <StatCard
            label="總收入"
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
              AI 數據洞察
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchInsights()}
              disabled={aiRefetching}
              className="text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              <RefreshCw className={`mr-1 h-3 w-3 ${aiRefetching ? "animate-spin" : ""}`} />
              {aiRefetching ? "分析中..." : "重新分析"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiLoading || aiRefetching ? (
            <div className="flex items-center gap-3 py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
              <span className="text-sm text-muted-foreground">AI 正在分析您的數據...</span>
            </div>
          ) : aiInsights?.insights ? (
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {aiInsights.insights.split("\n").map((line, i) => (
                <p key={i} className={line.trim() === "" ? "h-2" : "mb-1"}>
                  {line}
                </p>
              ))}
              <p className="mt-3 text-xs text-muted-foreground">
                分析時間：{new Date(aiInsights.generatedAt).toLocaleString("zh-TW")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暫無數據可分析，請先連結社群帳號。</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="platform">
        <TabsList>
          <TabsTrigger value="platform">平台分析</TabsTrigger>
          <TabsTrigger value="revenue">收入分析</TabsTrigger>
          <TabsTrigger value="content">熱門內容</TabsTrigger>
        </TabsList>

        {/* Platform Comparison Tab */}
        <TabsContent value="platform" className="mt-4 space-y-6">
          {overviewLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">平台概覽</CardTitle>
              </CardHeader>
              <CardContent>
                {!platformBreakdown.length ? (
                  <p className="text-sm text-muted-foreground">尚無平台數據</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>平台</TableHead>
                        <TableHead className="text-right">粉絲</TableHead>
                        <TableHead className="text-right">觀看</TableHead>
                        <TableHead className="text-right">互動</TableHead>
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
                <CardTitle className="text-base">跨平台比較</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>帳號</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead className="text-right">粉絲</TableHead>
                      <TableHead className="text-right">觀看</TableHead>
                      <TableHead className="text-right">互動率</TableHead>
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
                  label="訂閱收入"
                  value={`NT$${(revenue?.subscription ?? 0).toLocaleString()}`}
                />
                <StatCard
                  label="會員收入"
                  value={`NT$${(revenue?.membership ?? 0).toLocaleString()}`}
                />
                <StatCard
                  label="聯盟行銷收入"
                  value={`NT$${(revenue?.affiliate ?? 0).toLocaleString()}`}
                />
              </div>

              {revenue?.breakdown && revenue.breakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">收入趨勢</CardTitle>
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
                <p className="text-sm text-muted-foreground">尚無內容數據</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">熱門內容</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>標題</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead className="text-right">觀看</TableHead>
                      <TableHead className="text-right">互動</TableHead>
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
