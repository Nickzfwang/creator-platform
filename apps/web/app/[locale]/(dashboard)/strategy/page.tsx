"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Lightbulb,
  Calendar as CalendarIcon,
  Users,
  BarChart3,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  ThumbsDown,
  Check,
  ChevronDown,
  Eye,
  Heart,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSuggestions,
  useGenerateSuggestions,
  useAdoptSuggestion,
  useDismissSuggestion,
  useReplaceSuggestion,
  useCalendar,
  useCreateCalendarItem,
  useUpdateCalendarItem,
  useDeleteCalendarItem,
  useCompetitors,
  useCompetitorVideos,
  useAddCompetitor,
  useRemoveCompetitor,
  useCompetitorAnalysis,
  useStrategyReview,
  type TopicSuggestion,
  type CalendarItem,
  type Competitor,
} from "@/hooks/use-content-strategy";

// ─── Constants ───

const sourceColors: Record<string, string> = {
  HISTORY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  TREND: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  COMPETITOR: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  MIXED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function getSourceLabel(t: (key: string) => string, source: string): string {
  const map: Record<string, string> = {
    HISTORY: t("source.history"),
    TREND: t("source.trend"),
    COMPETITOR: t("source.competitor"),
    MIXED: t("source.mixed"),
  };
  return map[source] || source;
}

const confidenceColors: Record<string, string> = {
  HIGH: "bg-green-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-gray-400",
};

const statusColors: Record<string, string> = {
  SUGGESTED: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  PLANNED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  IN_PRODUCTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PUBLISHED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MEASURED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  DISMISSED: "bg-red-100 text-red-700",
  SKIPPED: "bg-gray-100 text-gray-500",
};

function getStatusLabel(t: (key: string) => string, status: string): string {
  const map: Record<string, string> = {
    SUGGESTED: t("status.suggested"),
    PLANNED: t("status.planned"),
    IN_PRODUCTION: t("status.inProduction"),
    PUBLISHED: t("status.published"),
    MEASURED: t("status.measured"),
    DISMISSED: t("status.dismissed"),
    SKIPPED: t("status.skipped"),
  };
  return map[status] || status;
}

const EMPTY_CALENDAR_ITEMS: CalendarItem[] = [];

// ─── Score Display ───

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-gray-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium">{score.toFixed(1)}</span>
    </div>
  );
}

// ─── Suggestions Panel ───

function SuggestionsPanel() {
  const t = useTranslations("strategy");
  const [preference, setPreference] = useState<string>("MIXED");
  const { data, isLoading } = useSuggestions();
  const generateMut = useGenerateSuggestions();
  const adoptMut = useAdoptSuggestion();
  const dismissMut = useDismissSuggestion();
  const replaceMut = useReplaceSuggestion();

  const suggestions = data?.data || [];

  const handleGenerate = () => {
    generateMut.mutate(
      { preference, count: 7 },
      {
        onSuccess: () => toast.success(t("toast.suggestionsGenerated")),
        onError: (err) => toast.error(t("toast.generateFailed", { error: err.message })),
      },
    );
  };

  const handleAdopt = (s: TopicSuggestion) => {
    const date = s.suggestedDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    adoptMut.mutate(
      { id: s.id, dto: { scheduledDate: date, targetPlatforms: s.suggestedPlatforms } },
      {
        onSuccess: () => toast.success(t("toast.adoptedToCalendar")),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["MIXED", "HISTORY", "TREND", "COMPETITOR"] as const).map((p) => (
            <Button
              key={p}
              variant={preference === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPreference(p)}
            >
              {getSourceLabel(t, p)}
            </Button>
          ))}
        </div>
        <Button onClick={handleGenerate} disabled={generateMut.isPending}>
          {generateMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {t("suggestions.generateButton")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">{t("suggestions.empty")}</p>
            <p className="text-sm text-muted-foreground mb-4">{t("suggestions.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {suggestions.filter((s) => !s.isDismissed && !s.isAdopted).map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                  <Badge className={sourceColors[s.dataSource]}>
                    {getSourceLabel(t, s.dataSource)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("suggestions.performanceScore")}</p>
                    <ScoreBar score={s.performanceScore} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("suggestions.confidenceLevel")}</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${confidenceColors[s.confidenceLevel]}`} />
                      <span className="text-xs">{s.confidenceLevel === "HIGH" ? t("confidence.high") : s.confidenceLevel === "MEDIUM" ? t("confidence.medium") : t("confidence.low")}</span>
                      {s.confidenceReason && (
                        <span className="text-xs text-muted-foreground">- {s.confidenceReason}</span>
                      )}
                    </div>
                  </div>
                </div>

                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-3 w-3" />
                    {t("suggestions.reasoning")}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="mt-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {s.reasoning}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm" onClick={() => handleAdopt(s)} disabled={adoptMut.isPending}>
                  <Check className="mr-1 h-3 w-3" />
                  {t("suggestions.adopt")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissMut.mutate(s.id, { onSuccess: () => toast.success(t("toast.dismissed")), onError: (err: Error) => toast.error(err.message) })}
                >
                  <ThumbsDown className="mr-1 h-3 w-3" />
                  {t("suggestions.dismiss")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => replaceMut.mutate(s.id, { onSuccess: () => toast.success(t("toast.replaced")), onError: (err: Error) => toast.error(err.message) })}
                  disabled={replaceMut.isPending}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {t("suggestions.replace")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calendar Panel ───

function CalendarPanel() {
  const t = useTranslations("strategy");
  const [{ startDate, endDate, now }] = useState(() => {
    const n = new Date();
    return {
      startDate: new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split("T")[0],
      endDate: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().split("T")[0],
      now: n,
    };
  });

  const { data, isLoading } = useCalendar(startDate, endDate);
  const updateMut = useUpdateCalendarItem();
  const deleteMut = useDeleteCalendarItem();
  const createMut = useCreateCalendarItem();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");

  const items = data?.items ?? EMPTY_CALENDAR_ITEMS;

  // Group by week
  const weekGroups = useMemo(() => {
    const groups: Record<string, CalendarItem[]> = {};
    for (const item of items) {
      const d = new Date(item.scheduledDate);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().split("T")[0];
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleAdd = () => {
    if (!newTitle || !newDate) return;
    createMut.mutate(
      { title: newTitle, scheduledDate: newDate },
      {
        onSuccess: () => {
          toast.success(t("toast.calendarItemAdded"));
          setShowAdd(false);
          setNewTitle("");
          setNewDate("");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          {t("calendar.monthTitle", { year: now.getFullYear(), month: now.getMonth() + 1 })}
        </h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3 w-3" />
              {t("calendar.addManually")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("calendar.addDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder={t("calendar.titlePlaceholder")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              <Button onClick={handleAdd} disabled={createMut.isPending} className="w-full">
                {t("calendar.addButton")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("calendar.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("calendar.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weekGroups.map(([weekStart, weekItems]) => (
            <div key={weekStart}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {t("calendar.weekOf", { date: weekStart })}
              </h4>
              <div className="space-y-2">
                {weekItems.map((item) => (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-muted-foreground w-20">
                          {new Date(item.scheduledDate).toLocaleDateString("zh-TW", {
                            month: "short",
                            day: "numeric",
                            weekday: "short",
                          })}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{item.title}</p>
                          <div className="flex gap-1 mt-1">
                            {item.targetPlatforms.map((p) => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[item.status] || ""}>
                          {getStatusLabel(t, item.status)}
                        </Badge>
                        {item.status !== "PUBLISHED" && item.status !== "MEASURED" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("common.delete")}
                            onClick={() =>
                              deleteMut.mutate(item.id, {
                                onSuccess: () => toast.success(t("toast.deleted")),
                                onError: (err: Error) => toast.error(err.message),
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {item.status === "MEASURED" && item.actualViews !== null && (
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {item.actualViews?.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {item.actualLikes?.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {item.actualComments?.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Competitor Panel ───

function CompetitorPanel() {
  const t = useTranslations("strategy");
  const { data, isLoading } = useCompetitors();
  const analysisQuery = useCompetitorAnalysis();
  const addMut = useAddCompetitor();
  const removeMut = useRemoveCompetitor();
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: videosData } = useCompetitorVideos(selectedId);
  const [showAdd, setShowAdd] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");

  const competitors = data?.competitors || [];
  const quota = data?.quota || { used: 0, max: 3 };

  const handleAdd = () => {
    if (!channelUrl) return;
    addMut.mutate(channelUrl, {
      onSuccess: () => {
        toast.success(t("toast.competitorAdded"));
        setShowAdd(false);
        setChannelUrl("");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("competitors.quota", { used: quota.used, max: quota.max })}
        </p>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={quota.used >= quota.max}>
              <Plus className="mr-1 h-3 w-3" />
              {t("competitors.addChannel")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("competitors.addDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder={t("competitors.channelUrlPlaceholder")}
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
              />
              <Button onClick={handleAdd} disabled={addMut.isPending} className="w-full">
                {addMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("competitors.addButton")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("competitors.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("competitors.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitors.map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-colors ${selectedId === c.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedId(selectedId === c.id ? "" : c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {c.channelName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{c.channelName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.subscriberCount ? t("competitors.subscriberCount", { count: (c.subscriberCount / 1000).toFixed(1) }) : t("competitors.subscriberUnknown")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t("competitors.untrack")}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMut.mutate(c.id, {
                        onSuccess: () => toast.success(t("toast.untracked")),
                        onError: (err: Error) => toast.error(err.message),
                      });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{t("competitors.recentVideos", { count: c.recentVideoCount })}</span>
                  {c.avgViews !== null && (
                    <span>{t("competitors.avgViews", { count: (c.avgViews / 1000).toFixed(1) })}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Selected competitor videos */}
      {selectedId && videosData?.data && videosData.data.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t("competitors.recentVideosList")}</h4>
          {videosData.data.map((v) => (
            <Card key={v.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{v.title}</p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{new Date(v.publishedAt).toLocaleDateString("zh-TW")}</span>
                    {v.viewCount !== null && <span>{t("competitors.viewCount", { count: v.viewCount.toLocaleString() })}</span>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* AI Analysis */}
      {competitors.length > 0 && analysisQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("competitors.aiAnalysis")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-sm">{analysisQuery.data.analysis}</p>
            </div>
            {analysisQuery.data.opportunities.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-1">{t("competitors.opportunities")}</p>
                <div className="flex flex-wrap gap-1">
                  {analysisQuery.data.opportunities.map((o, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {o}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Review Panel ───

function ReviewPanel() {
  const t = useTranslations("strategy");
  const [period, setPeriod] = useState("month");
  const { data, isLoading } = useStrategyReview(period);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { value: "month", label: t("review.thisMonth") },
          { value: "quarter", label: t("review.thisQuarter") },
        ].map((p) => (
          <Button
            key={p.value}
            variant={period === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{data.summary.totalSuggested}</p>
                <p className="text-xs text-muted-foreground">{t("review.totalSuggested")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{data.summary.totalAdopted}</p>
                <p className="text-xs text-muted-foreground">{t("review.totalAdopted")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">
                  {(data.summary.adoptionRate * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">{t("review.adoptionRate")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{data.summary.totalPublished}</p>
                <p className="text-xs text-muted-foreground">{t("review.totalPublished")}</p>
              </CardContent>
            </Card>
          </div>

          {data.topPerformers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("review.topPerformers")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.topPerformers.map((tp, i) => (
                    <div key={tp.calendarItemId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium">{tp.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("review.predictedScore", { score: tp.predictedScore })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{t("review.actualViews", { count: tp.actualViews.toLocaleString() })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.sourceBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("review.sourceBreakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.sourceBreakdown.map((s) => (
                    <div key={s.source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={sourceColors[s.source]}>
                          {getSourceLabel(t, s.source)}
                        </Badge>
                        <span className="text-sm">{t("review.suggestionCount", { count: s.count })}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("review.adoptionRateValue", { rate: (s.adoptionRate * 100).toFixed(0) })}
                        {s.avgActualViews !== null && ` | ${t("review.avgViews", { count: (s.avgActualViews / 1000).toFixed(1) })}`}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("review.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("review.emptyHint")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function StrategyPage() {
  const t = useTranslations("strategy");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Tabs defaultValue="suggestions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            {t("tabs.suggestions")}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            {t("tabs.calendar")}
          </TabsTrigger>
          <TabsTrigger value="competitors" className="gap-2">
            <Users className="h-4 w-4" />
            {t("tabs.competitors")}
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("tabs.review")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          <SuggestionsPanel />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarPanel />
        </TabsContent>

        <TabsContent value="competitors">
          <CompetitorPanel />
        </TabsContent>

        <TabsContent value="review">
          <ReviewPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
