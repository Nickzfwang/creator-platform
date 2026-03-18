"use client";

import { useState } from "react";
import { Bookmark, Star, Trash2, ExternalLink, Filter, Sparkles, Lightbulb, Search } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ContentClip {
  id: string;
  platform: string;
  url: string;
  title: string;
  rawContent: string;
  aiSummary: string | null;
  aiCategory: string | null;
  aiTags: string[];
  author: string | null;
  imageUrl: string | null;
  isStarred: boolean;
  createdAt: string;
}

const platformIcons: Record<string, string> = {
  facebook: "📘", youtube: "▶️", threads: "🧵", instagram: "📷",
  dcard: "💬", twitter: "𝕏", unknown: "🌐",
};

const categoryColors: Record<string, string> = {
  "科技": "bg-blue-100 text-blue-800", "生活": "bg-green-100 text-green-800",
  "商業": "bg-amber-100 text-amber-800", "娛樂": "bg-pink-100 text-pink-800",
  "教育": "bg-indigo-100 text-indigo-800", "設計": "bg-purple-100 text-purple-800",
  "行銷": "bg-orange-100 text-orange-800", "健康": "bg-emerald-100 text-emerald-800",
  "美食": "bg-red-100 text-red-800", "旅遊": "bg-cyan-100 text-cyan-800",
};

export default function ClipsPage() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["clips", filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "starred") params.set("starred", "true");
      else if (filter !== "all") params.set("platform", filter);
      const qs = params.toString();
      return api<{ data: ContentClip[]; hasMore: boolean }>(
        `/v1/clips${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const starMutation = useMutation({
    mutationFn: (clipId: string) =>
      api(`/v1/clips/${clipId}/star`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clips"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (clipId: string) =>
      api(`/v1/clips/${clipId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      toast.success("已刪除收藏");
    },
  });

  const clips = data?.data ?? [];
  const filteredClips = search
    ? clips.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.aiSummary?.toLowerCase().includes(search.toLowerCase()) ||
          c.aiTags?.some((t) => t.includes(search)),
      )
    : clips;

  const platforms = [...new Set(clips.map((c) => c.platform))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="收藏庫"
        description="透過 Chrome 擴充功能收藏的社群精華內容，AI 自動摘要分類"
      />

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋收藏內容..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            全部
          </Button>
          <Button
            variant={filter === "starred" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("starred")}
          >
            <Star className="mr-1 h-3 w-3" /> 星標
          </Button>
          {platforms.map((p) => (
            <Button
              key={p}
              variant={filter === p ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(p)}
            >
              {platformIcons[p] || "🌐"} {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Clips Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-5">
                <div className="h-4 w-3/4 rounded bg-muted mb-3" />
                <div className="h-3 w-full rounded bg-muted mb-2" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClips.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="尚無收藏內容"
          description="安裝 Chrome 擴充功能，在瀏覽 Facebook、YouTube、Threads 時一鍵收藏精華內容"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClips.map((clip) => (
            <Card key={clip.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="pt-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{platformIcons[clip.platform] || "🌐"}</span>
                    {clip.aiCategory && (
                      <Badge
                        variant="secondary"
                        className={`text-xs ${categoryColors[clip.aiCategory] ?? ""}`}
                      >
                        {clip.aiCategory}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => starMutation.mutate(clip.id)}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${clip.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => deleteMutation.mutate(clip.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Title */}
                <a
                  href={clip.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold leading-snug hover:text-primary hover:underline line-clamp-2"
                >
                  {clip.title}
                  <ExternalLink className="ml-1 inline h-3 w-3" />
                </a>

                {/* AI Summary */}
                {clip.aiSummary && (
                  <div className="mt-2 rounded-lg bg-purple-50 p-2.5 dark:bg-purple-950/20">
                    <p className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                      <Sparkles className="h-3 w-3" /> AI 摘要
                    </p>
                    <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                      {clip.aiSummary}
                    </p>
                  </div>
                )}

                {/* Tags */}
                {clip.aiTags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {clip.aiTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{clip.author ? `by ${clip.author}` : ""}</span>
                  <span>{new Date(clip.createdAt).toLocaleDateString("zh-TW")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
