"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Flame, Target, BarChart3, Megaphone, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Notification {
  id: string;
  type: "TREND_KEYWORD_HIT" | "TREND_VIRAL_ALERT" | "TREND_DAILY_SUMMARY" | "SYSTEM";
  title: string;
  body: string;
  metadata: Record<string, any>;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

const typeIcons: Record<Notification["type"], React.ReactNode> = {
  TREND_VIRAL_ALERT: <Flame className="h-5 w-5 text-orange-500" />,
  TREND_KEYWORD_HIT: <Target className="h-5 w-5 text-blue-500" />,
  TREND_DAILY_SUMMARY: <BarChart3 className="h-5 w-5 text-emerald-500" />,
  SYSTEM: <Megaphone className="h-5 w-5 text-purple-500" />,
};

const LIMIT = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("notifications");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const typeLabels: Record<Notification["type"], string> = {
    TREND_VIRAL_ALERT: t("typeViralAlert"),
    TREND_KEYWORD_HIT: t("typeKeywordHit"),
    TREND_DAILY_SUMMARY: t("typeDailySummary"),
    SYSTEM: t("typeSystem"),
  };

  function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return t("justNow");

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("minutesAgo", { count: minutes });

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hoursAgo", { count: hours });

    const days = Math.floor(hours / 24);
    return t("daysAgo", { count: days });
  }

  const { data: queryData, isLoading, isFetching } = useQuery({
    queryKey: ["notifications", unreadOnly, cursor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (cursor) params.set("cursor", cursor);
      if (unreadOnly) params.set("unreadOnly", "true");
      return api<NotificationsResponse>(`/v1/notifications?${params}`);
    },
  });

  // Sync query data to local state
  useEffect(() => {
    if (!queryData) return;
    if (cursor) {
      setAllItems(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const fresh = queryData.data.filter(n => !existingIds.has(n.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    } else {
      setAllItems(queryData.data);
    }
    setHasMore(queryData.hasMore);
  }, [queryData, cursor]);

  const unreadCountQuery = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api<{ count: number }>("/v1/notifications/unread-count"),
    refetchInterval: 30000,
  });

  const readAllMutation = useMutation({
    mutationFn: () => api("/v1/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      setAllItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      toast.success(t("markAllReadSuccess"));
    },
    onError: () => toast.error(t("operationFailed")),
  });

  const readOneMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/notifications/${id}/read`, { method: "POST" }),
    onSuccess: (_data, id) => {
      setAllItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      );
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const handleFilterChange = useCallback((onlyUnread: boolean) => {
    setUnreadOnly(onlyUnread);
    setCursor(null);
    setAllItems([]);
    setHasMore(false);
  }, []);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        readOneMutation.mutate(notification.id);
      }
      if (notification.linkUrl) {
        router.push(notification.linkUrl);
      }
    },
    [readOneMutation, router],
  );

  const handleLoadMore = useCallback(() => {
    if (allItems.length > 0) {
      setCursor(allItems[allItems.length - 1].id);
    }
  }, [allItems]);

  const unreadCount = unreadCountQuery.data?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Button
            variant="outline"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending || unreadCount === 0}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            {t("markAllRead")}
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={!unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange(false)}
        >
          <Bell className="mr-1 h-3 w-3" />
          {t("filterAll")}
        </Button>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange(true)}
        >
          {t("filterUnread")}
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Notification List */}
      {isLoading && allItems.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : allItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {unreadOnly ? t("noUnread") : t("noNotifications")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allItems.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                !notification.isRead ? "border-l-2 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/10" : ""
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="flex items-start gap-3 py-4">
                {/* Type Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {typeIcons[notification.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {typeLabels[notification.type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(notification.createdAt)}
                    </span>
                    {!notification.isRead && (
                      <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug">
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                      {notification.body}
                    </p>
                  )}
                </div>

                {/* Read indicator */}
                {notification.isRead && (
                  <div className="mt-0.5 flex-shrink-0">
                    <Check className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isFetching ? t("loadingMore") : t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
