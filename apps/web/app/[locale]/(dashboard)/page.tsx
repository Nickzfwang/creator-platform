"use client";

import Link from "next/link";
import { Video, Eye, Users, DollarSign, Lightbulb, TrendingUp, Calendar, MessageSquare, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useVideos } from "@/hooks/use-videos";
import { usePosts } from "@/hooks/use-posts";
import { StatCard } from "@/components/stat-card";
import { CardsSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { DashboardOverview } from "@/lib/types";

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => api<DashboardOverview>("/v1/dashboard/overview"),
  });
}

function useWeeklyPlan() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return useQuery({
    queryKey: ["calendar", "weekly"],
    queryFn: () =>
      api<{ items: { id: string; title: string; status: string; scheduledDate: string }[] }>(
        `/v1/content-strategy/calendar?startDate=${monday.toISOString().split("T")[0]}&endDate=${sunday.toISOString().split("T")[0]}`,
      ),
  });
}

// ─── Trend Chart ───

function TrendChart({ data }: { data: { date: string; views: number }[] }) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={(d) => new Date(d).toLocaleDateString("zh-TW", { month: "short", day: "numeric" })}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatNumber(v)}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          formatter={(value: number) => [formatNumber(value), "觀看"]}
          labelFormatter={(d) => new Date(d).toLocaleDateString("zh-TW")}
        />
        <Area
          type="monotone"
          dataKey="views"
          stroke="hsl(var(--primary))"
          fill="url(#viewsGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Quick Actions ───

function QuickActions() {
  const actions = [
    { label: "內容策略", href: "/strategy", icon: Lightbulb, color: "text-amber-500" },
    { label: "變現顧問", href: "/monetize", icon: TrendingUp, color: "text-green-500" },
    { label: "粉絲互動", href: "/interactions", icon: MessageSquare, color: "text-blue-500" },
    { label: "排程管理", href: "/schedule", icon: Calendar, color: "text-purple-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link key={a.href} href={a.href}>
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${a.color}`} />
                <span className="text-sm font-medium">{a.label}</span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Weekly Plan Card ───

function WeeklyPlanCard() {
  const { data, isLoading } = useWeeklyPlan();

  if (isLoading) return <Skeleton className="h-24" />;

  const items = data?.items ?? [];
  const planned = items.filter((i) => i.status === "PLANNED" || i.status === "SUGGESTED").length;
  const inProduction = items.filter((i) => i.status === "IN_PRODUCTION").length;

  if (items.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium text-sm">本週內容計畫</p>
          <p className="text-xs text-muted-foreground mt-1">
            {planned > 0 && `${planned} 個待確認`}
            {planned > 0 && inProduction > 0 && " · "}
            {inProduction > 0 && `${inProduction} 個製作中`}
            {planned === 0 && inProduction === 0 && `${items.length} 個項目`}
          </p>
        </div>
        <Link href="/strategy?tab=calendar">
          <Button size="sm" variant="outline">
            查看計畫
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: videosData, isLoading: videosLoading } = useVideos({ limit: 5 });
  const { data: postsData, isLoading: postsLoading } = usePosts({ limit: 5, status: "SCHEDULED" });

  // Build trend data from overview
  const trendData = (overview as any)?.dailyTrends?.map((d: any) => ({
    date: d.date,
    views: d.views ?? 0,
  })) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">歡迎回來</h1>

      {/* Weekly Plan */}
      <WeeklyPlanCard />

      {/* Stats overview */}
      {overviewLoading ? (
        <CardsSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="總粉絲數"
            value={formatNumber(overview?.metrics?.totalFollowers ?? 0)}
            change={overview?.metrics?.followersChangePercent}
            icon={Users}
          />
          <StatCard
            label="總觀看次數"
            value={formatNumber(overview?.metrics?.totalViews ?? 0)}
            change={overview?.metrics?.viewsChangePercent}
            icon={Eye}
          />
          <StatCard
            label="互動率"
            value={`${(overview?.metrics?.avgEngagementRate ?? 0).toFixed(1)}%`}
            icon={Video}
          />
          <StatCard
            label="本月收入"
            value={`NT$${(overview?.metrics?.totalRevenue ?? 0).toLocaleString()}`}
            change={overview?.metrics?.revenueChangePercent}
            icon={DollarSign}
          />
        </div>
      )}

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">觀看趨勢（近 30 天）</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={trendData} />
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">快捷操作</h2>
        <QuickActions />
      </div>

      {/* Recent content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">最近影片</CardTitle>
            <Link href="/videos">
              <Button variant="ghost" size="sm">
                查看全部
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {videosLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !videosData?.data?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">尚無影片，上傳你的第一支影片吧</p>
            ) : (
              <div className="space-y-3">
                {videosData.data.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(video.createdAt).toLocaleDateString("zh-TW")}
                      </p>
                    </div>
                    <Badge variant="secondary">{video.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming posts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">即將發布</CardTitle>
            <Link href="/schedule">
              <Button variant="ghost" size="sm">
                查看全部
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !postsData?.items?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">尚無排程，去排程管理建立吧</p>
            ) : (
              <div className="space-y-3">
                {postsData.items.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {post.contentText?.slice(0, 50) || "無標題"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {post.scheduledAt
                          ? new Date(post.scheduledAt).toLocaleString("zh-TW")
                          : "未排程"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {post.platforms?.map((p: any) => p.platform).join(", ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
