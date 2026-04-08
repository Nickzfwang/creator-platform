"use client";

import { useState } from "react";
import { Globe, Play, Loader2, ExternalLink, Sparkles, Lightbulb, Rss, Search } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface AnalyzedPost {
  platform: string;
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt?: string;
  aiSummary: string;
  aiCategory: string;
  aiTags: string[];
  relevanceScore: number;
  contentIdea?: string;
}

interface ExploreResult {
  id: string;
  source: string;
  totalPosts: number;
  posts: AnalyzedPost[];
  startedAt: string;
  completedAt: string;
}

const CATEGORY_IDS = ["all", "tech", "threads", "tiktok", "global", "lifestyle"] as const;
const CATEGORY_EMOJIS: Record<string, string> = {
  all: "🌐", tech: "💻", threads: "🧵", tiktok: "🎵", global: "🌍", lifestyle: "☕",
};

const categoryColors: Record<string, string> = {
  "科技": "bg-blue-100 text-blue-800",
  "AI": "bg-purple-100 text-purple-800",
  "商業": "bg-amber-100 text-amber-800",
  "生活": "bg-green-100 text-green-800",
  "娛樂": "bg-pink-100 text-pink-800",
  "教育": "bg-indigo-100 text-indigo-800",
  "設計": "bg-violet-100 text-violet-800",
  "行銷": "bg-orange-100 text-orange-800",
  "健康": "bg-emerald-100 text-emerald-800",
  "科技/新創": "bg-cyan-100 text-cyan-800",
  "社群": "bg-rose-100 text-rose-800",
  "時事": "bg-slate-100 text-slate-800",
  "感情": "bg-pink-100 text-pink-800",
  "短影片": "bg-fuchsia-100 text-fuchsia-800",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600 bg-green-50";
  if (score >= 60) return "text-yellow-600 bg-yellow-50";
  return "text-gray-500 bg-gray-50";
}

export default function ExplorePage() {
  const t = useTranslations("browse");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [customUrl, setCustomUrl] = useState("");
  const [results, setResults] = useState<ExploreResult | null>(null);

  const exploreMutation = useMutation({
    mutationFn: (params: { category?: string; customRssUrl?: string }) =>
      api<ExploreResult>("/v1/explore/run", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: (data) => {
      setResults(data);
      toast.success(t("exploreSuccess", { count: data.totalPosts }));
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExplore = () => {
    if (customUrl.trim()) {
      exploreMutation.mutate({ customRssUrl: customUrl.trim() });
    } else {
      exploreMutation.mutate({ category: selectedCategory });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      {/* Category Selection */}
      <Card>
        <CardContent className="pt-5">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t("selectCategory")}</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_IDS.map((id) => (
                  <Button
                    key={id}
                    variant={selectedCategory === id ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedCategory(id); setCustomUrl(""); }}
                  >
                    {CATEGORY_EMOJIS[id]} {t(`categories.${id}`)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex-1 border-t" />
              <span>{t("or")}</span>
              <div className="flex-1 border-t" />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{t("customRssSource")}</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Rss className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={customUrl}
                    onChange={(e) => { setCustomUrl(e.target.value); setSelectedCategory(""); }}
                    placeholder={t("rssPlaceholder")}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleExplore}
              disabled={exploreMutation.isPending}
              className="w-full"
              size="lg"
            >
              {exploreMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("exploring")}
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {t("startExplore")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {t("resultsTitle", { count: results.totalPosts })}
            </h3>
            <span className="text-xs text-muted-foreground">
              {new Date(results.completedAt).toLocaleString("zh-TW")}
            </span>
          </div>

          <div className="space-y-3">
            {results.posts.map((post, idx) => (
              <Card key={idx} className="transition-shadow hover:shadow-md">
                <CardContent className="pt-5">
                  <div className="flex gap-4">
                    {/* Score */}
                    <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${scoreColor(post.relevanceScore)}`}>
                      {post.relevanceScore}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold leading-snug hover:text-primary hover:underline line-clamp-2"
                        >
                          {post.title}
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>
                        {post.aiCategory && (
                          <Badge
                            variant="secondary"
                            className={`flex-shrink-0 text-xs ${categoryColors[post.aiCategory] ?? ""}`}
                          >
                            {post.aiCategory}
                          </Badge>
                        )}
                      </div>

                      {/* Source + Date */}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {post.platform}
                        {post.author ? ` · ${post.author}` : ""}
                        {post.publishedAt ? ` · ${new Date(post.publishedAt).toLocaleDateString("zh-TW")}` : ""}
                      </p>

                      {/* AI Summary */}
                      <div className="mt-2 rounded-md bg-muted/50 p-2">
                        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-0.5">
                          <Sparkles className="h-3 w-3" /> {t("aiSummary")}
                        </p>
                        <p className="text-xs leading-relaxed">{post.aiSummary}</p>
                      </div>

                      {/* Content Idea */}
                      {post.contentIdea && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
                          <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            <span className="font-medium">{t("contentIdea")}</span>
                            {post.contentIdea}
                          </p>
                        </div>
                      )}

                      {/* Tags */}
                      {post.aiTags?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.aiTags.map((tag) => (
                            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !exploreMutation.isPending && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Globe className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-1">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("emptyDescription")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span>🧵 Threads</span>
            <span>🎵 TikTok</span>
            <span>📰 TechNews</span>
            <span>💻 iThome</span>
            <span>🚀 TechCrunch</span>
            <span>🧠 Hacker News</span>
          </div>
        </div>
      )}
    </div>
  );
}
