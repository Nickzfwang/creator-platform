"use client";

import { Video, Eye, Users, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useVideos } from "@/hooks/use-videos";
import { usePosts } from "@/hooks/use-posts";
import { StatCard } from "@/components/stat-card";
import { CardsSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: videosData, isLoading: videosLoading } = useVideos({
    limit: 5,
  });
  const { data: postsData, isLoading: postsLoading } = usePosts({
    limit: 5,
    status: "SCHEDULED",
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">歡迎回來</h1>

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

      {/* Recent content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent videos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近影片</CardTitle>
          </CardHeader>
          <CardContent>
            {videosLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !videosData?.data?.length ? (
              <p className="text-sm text-muted-foreground">尚無影片</p>
            ) : (
              <div className="space-y-3">
                {videosData.data.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {video.title}
                      </p>
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
          <CardHeader>
            <CardTitle className="text-base">即將發布</CardTitle>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !postsData?.items?.length ? (
              <p className="text-sm text-muted-foreground">尚無排程</p>
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
                      {post.platforms?.map((p) => p.platform).join(", ")}
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
