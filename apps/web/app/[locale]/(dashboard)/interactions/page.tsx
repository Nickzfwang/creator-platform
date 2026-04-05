"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquare,
  BarChart3,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  Check,
  Send,
  SmilePlus,
  Frown,
  Meh,
  AlertTriangle,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  useComments,
  useImportComments,
  useGenerateReply,
  useUpdateComment,
  useDeleteComment,
  useInteractionStats,
  type FanComment,
} from "@/hooks/use-interactions";

const categoryColors: Record<string, string> = {
  POSITIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  NEGATIVE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  QUESTION: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  COLLABORATION: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  SPAM: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  NEUTRAL: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const CATEGORY_KEYS: Record<string, string> = {
  POSITIVE: "categoryPositive",
  NEGATIVE: "categoryNegative",
  QUESTION: "categoryQuestion",
  COLLABORATION: "categoryCollaboration",
  SPAM: "categorySpam",
  NEUTRAL: "categoryNeutral",
};

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-500 text-white",
  MEDIUM: "bg-amber-500 text-white",
  LOW: "bg-gray-300 text-gray-700",
};

function SentimentIcon({ sentiment }: { sentiment: number }) {
  if (sentiment > 0.3) return <SmilePlus className="h-4 w-4 text-green-500" />;
  if (sentiment < -0.3) return <Frown className="h-4 w-4 text-red-500" />;
  return <Meh className="h-4 w-4 text-gray-400" />;
}

// ─── Comments Panel ───

function CommentsPanel() {
  const t = useTranslations("interactions");
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useComments({
    category: filter || undefined,
    search: search || undefined,
  });
  const importMut = useImportComments();
  const replyMut = useGenerateReply();
  const updateMut = useUpdateComment();
  const deleteMut = useDeleteComment();
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replies, setReplies] = useState<{ tone: string; content: string }[]>([]);
  const [editReply, setEditReply] = useState("");

  const comments = data?.data || [];

  const handleImport = () => {
    if (!importText.trim()) return;
    // Parse: each line is "author: content" or just "content"
    const lines = importText.split("\n").filter((l) => l.trim());
    const parsed = lines.map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0 && colonIdx < 30) {
        return {
          authorName: line.slice(0, colonIdx).trim(),
          content: line.slice(colonIdx + 1).trim(),
        };
      }
      return { authorName: t("anonymous"), content: line.trim() };
    });

    importMut.mutate(parsed, {
      onSuccess: (res) => {
        toast.success(t("importSuccess", { count: res.imported }));
        setShowImport(false);
        setImportText("");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleGenerateReply = (commentId: string) => {
    setReplyingId(commentId);
    replyMut.mutate(
      { id: commentId, dto: {} },
      {
        onSuccess: (res) => {
          setReplies(res.replies);
        },
        onError: (err) => {
          toast.error(err.message);
          setReplyingId(null);
        },
      },
    );
  };

  const handleSendReply = (commentId: string, content: string) => {
    updateMut.mutate(
      { id: commentId, dto: { finalReply: content, isReplied: true } },
      {
        onSuccess: () => {
          toast.success(t("replyMarked"));
          setReplyingId(null);
          setReplies([]);
          setEditReply("");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-1">
          <Select value={filter || "ALL"} onValueChange={(v) => setFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t("allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("all")}</SelectItem>
              {Object.entries(CATEGORY_KEYS).map(([k, tKey]) => (
                <SelectItem key={k} value={k}>{t(tKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3 w-3" />
              {t("importComments")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("importComments")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {t("importHint")}
              </p>
              <Textarea
                rows={8}
                placeholder={t("importPlaceholder")}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <Button onClick={handleImport} disabled={importMut.isPending} className="w-full">
                {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("import")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : comments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("noComments")}</p>
            <p className="text-sm text-muted-foreground">{t("noCommentsHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <Card key={c.id} className={c.priority === "HIGH" ? "border-red-300 dark:border-red-700" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{c.authorName}</span>
                      {c.platform && (
                        <Badge variant="outline" className="text-xs">{c.platform}</Badge>
                      )}
                      <Badge className={categoryColors[c.category]}>
                        {CATEGORY_KEYS[c.category] ? t(CATEGORY_KEYS[c.category]) : c.category}
                      </Badge>
                      {c.priority === "HIGH" && (
                        <Badge className={priorityColors.HIGH}>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {t("highPriority")}
                        </Badge>
                      )}
                      <SentimentIcon sentiment={c.sentiment} />
                    </div>
                    <p className="text-sm">{c.content}</p>
                    {c.isReplied && c.finalReply && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/30">
                        <p className="text-xs text-muted-foreground">{t("replied")}:</p>
                        <p className="text-sm text-muted-foreground">{c.finalReply}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    {!c.isReplied && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateReply(c.id)}
                        disabled={replyMut.isPending && replyingId === c.id}
                      >
                        {replyMut.isPending && replyingId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("deleteComment")}
                      onClick={() =>
                        deleteMut.mutate(c.id, {
                          onSuccess: () => toast.success(t("deleted")),
                          onError: (err: Error) => toast.error(err.message),
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Reply panel */}
                {replyingId === c.id && replies.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <p className="text-xs font-medium">{t("aiReplyDraft")}:</p>
                    {replies.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded bg-muted cursor-pointer hover:bg-muted/80"
                        onClick={() => setEditReply(r.content)}
                      >
                        <Badge variant="outline" className="text-xs shrink-0">{r.tone}</Badge>
                        <p className="text-sm">{r.content}</p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Textarea
                        rows={2}
                        value={editReply}
                        onChange={(e) => setEditReply(e.target.value)}
                        placeholder={t("replyPlaceholder")}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={!editReply.trim()}
                        onClick={() => handleSendReply(c.id, editReply)}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {t("confirm")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats Panel ───

function StatsPanel() {
  const t = useTranslations("interactions");
  const [period, setPeriod] = useState("30d");
  const { data, isLoading } = useInteractionStats(period);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["7d", "30d"].map((p) => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {p === "7d" ? t("last7Days") : t("last30Days")}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.totalComments}</p>
            <p className="text-xs text-muted-foreground">{t("totalComments")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.repliedCount}</p>
            <p className="text-xs text-muted-foreground">{t("repliedCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.replyRate}%</p>
            <p className="text-xs text-muted-foreground">{t("replyRate")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{data.avgSentiment.toFixed(2)}</p>
              <SentimentIcon sentiment={data.avgSentiment} />
            </div>
            <p className="text-xs text-muted-foreground">{t("avgSentiment")}</p>
          </CardContent>
        </Card>
      </div>

      {data.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("categoryBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.categoryBreakdown.map((cb) => (
                <div key={cb.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={categoryColors[cb.category]}>
                      {CATEGORY_KEYS[cb.category] ? t(CATEGORY_KEYS[cb.category]) : cb.category}
                    </Badge>
                    <span className="text-sm">{t("countUnit", { count: cb.count })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${cb.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{cb.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.sentimentTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("sentimentTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {data.sentimentTrend.map((d) => {
                const normalized = (d.avgSentiment + 1) / 2; // 0-1
                const height = Math.max(10, normalized * 100);
                const color = d.avgSentiment > 0.3 ? "bg-green-400" : d.avgSentiment < -0.3 ? "bg-red-400" : "bg-gray-400";
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.avgSentiment}`}>
                    <div className={`w-full rounded-t ${color}`} style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{data.sentimentTrend[0]?.date}</span>
              <span>{data.sentimentTrend[data.sentimentTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function InteractionsPage() {
  const t = useTranslations("interactions");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Tabs defaultValue="comments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comments" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("tabComments")}
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("tabStats")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comments">
          <CommentsPanel />
        </TabsContent>

        <TabsContent value="stats">
          <StatsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
