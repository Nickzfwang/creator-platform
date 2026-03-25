"use client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
const assetUrl = (path: string) => path?.startsWith('http') ? path : `${BACKEND_URL}${path}`;

import { useState, useRef } from "react";
import { Plus, Upload, Trash2, Film, Scissors, Clock, Sparkles, Play, Share2, Loader2, Copy, Check, FileText, Smartphone, Download, Captions, Megaphone, RefreshCw, Mail, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { useVideos, useCreateVideo, useDeleteVideo, useDirectUpload, useVideoClips, useGenerateClips, useGenerateShort, useGenerateAllShorts, useGenerateSubtitles } from "@/hooks/use-videos";
import { useAiGeneratePost } from "@/hooks/use-posts";
import {
  useRepurposeJob,
  useTriggerRepurpose,
  useUpdateRepurposeItem,
  useResetRepurposeItem,
  useRegenerateRepurposeItem,
  useScheduleRepurposeItems,
  useCreateCampaignFromItem,
  type RepurposeItem,
} from "@/hooks/use-repurpose";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CardsSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Video } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
// Strip /api suffix to get the server root for static files
const API_HOST = API_BASE.replace(/\/api\/?$/, "");

function resolveVideoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  // Local upload path like /uploads/videos/xxx.mov → http://localhost:4000/uploads/videos/xxx.mov
  return `${API_HOST}${url}`;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  UPLOADING: { label: "上傳中", variant: "outline" },
  UPLOADED: { label: "已上傳", variant: "secondary" },
  PROCESSING: { label: "AI 處理中", variant: "default" },
  PROCESSED: { label: "已完成", variant: "secondary" },
  FAILED: { label: "失敗", variant: "destructive" },
};

function fmt(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VideoClipsPanel({ videoId, onRepurpose }: { videoId: string; onRepurpose?: (clipId: string, clipTitle: string) => void }) {
  const { data: clips, isLoading } = useVideoClips(videoId);
  const generateClips = useGenerateClips();
  const generateShort = useGenerateShort();
  const generateAllShorts = useGenerateAllShorts();
  const [shortResult, setShortResult] = useState<{ title: string; outputUrl: string; suggestedCaption: string; hashtags: string[] } | null>(null);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Scissors className="h-4 w-4" /> AI 剪輯片段
        </h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            generateClips.mutate(
              { videoId },
              {
                onSuccess: () => toast.success("AI 剪輯片段已生成"),
                onError: (e) => toast.error(e.message),
              },
            );
          }}
          disabled={generateClips.isPending}
        >
          <Sparkles className="mr-1 h-3 w-3" />
          {generateClips.isPending ? "生成中..." : "AI 生成片段"}
        </Button>
        {clips && clips.length > 0 && (
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              generateAllShorts.mutate(
                { videoId, data: { format: "9:16", addSubtitles: true } },
                {
                  onSuccess: (res) => {
                    toast.success(`已生成 ${res.length} 支短影片`);
                    if (res.length > 0) setShortResult(res[0]);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            }}
            disabled={generateAllShorts.isPending}
          >
            <Smartphone className="mr-1 h-3 w-3" />
            {generateAllShorts.isPending ? "生成中..." : "一鍵生成 Shorts"}
          </Button>
        )}
      </div>
      {!clips?.length ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Scissors className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">尚無剪輯片段</p>
          <p className="text-xs text-muted-foreground">點擊「AI 生成片段」讓 AI 自動識別精華</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clips.map((clip) => (
            <div key={clip.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <Play className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{clip.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(clip.startTime)} - {fmt(clip.endTime)}
                    {clip.durationSeconds ? ` (${clip.durationSeconds}s)` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {clip.aiScore != null && (
                  <Badge variant="outline" className="font-mono text-xs">
                    AI {Math.round(clip.aiScore * 100)}%
                  </Badge>
                )}
                <Badge variant={clip.status === "READY" ? "secondary" : "outline"}>
                  {clip.status === "READY" ? "就緒" : clip.status}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-blue-600 hover:text-blue-700"
                  disabled={generateShort.isPending}
                  onClick={() => {
                    generateShort.mutate(
                      { videoId, clipId: clip.id, data: { format: "9:16", addSubtitles: true, platform: "youtube_shorts" } },
                      {
                        onSuccess: (res) => {
                          setShortResult(res);
                          toast.success("短影片已生成！");
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    );
                  }}
                  title="生成直式短影片"
                >
                  {generateShort.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3" />}
                </Button>
                {onRepurpose && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-purple-600 hover:text-purple-700"
                    onClick={() => onRepurpose(clip.id, clip.title)}
                  >
                    <Share2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Short Video Result */}
      {shortResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/20">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone className="h-4 w-4 text-green-700" />
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100">短影片已生成</h4>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{shortResult.title}</p>
            <p className="text-xs text-green-800 dark:text-green-300">{shortResult.suggestedCaption}</p>
            {shortResult.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {shortResult.hashtags.map((tag) => (
                  <span key={tag} className="rounded-full bg-green-200 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <a
                href={`${shortResult.outputUrl}`}
                download={`${shortResult.title || "short"}.mp4`}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                <Download className="h-3 w-3" /> 下載短影片
              </a>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(
                    shortResult.suggestedCaption + "\n\n" + shortResult.hashtags.map(t => `#${t}`).join(" ")
                  );
                  toast.success("文案已複製");
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> 複製文案
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RepurposeState {
  clipId: string;
  clipTitle: string;
  suggestions: Array<{ platform: string; contentText: string; hashtags: string[] }> | null;
}

const PLATFORMS = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "FACEBOOK", "TWITTER"];
const platformLabels: Record<string, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  FACEBOOK: "Facebook",
  TWITTER: "X / Twitter",
};

// ─── Content Repurpose Panel ───

const PLATFORM_LABELS: Record<string, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TWITTER: "X / Twitter",
  THREADS: "Threads",
};

const STYLE_LABELS: Record<string, string> = {
  knowledge: "知識型",
  story: "故事型",
  interactive: "互動型",
};

function RepurposePanel({ videoId }: { videoId: string }) {
  const { data, isLoading } = useRepurposeJob(videoId);
  const triggerRepurpose = useTriggerRepurpose();
  const updateItem = useUpdateRepurposeItem();
  const resetItem = useResetRepurposeItem();
  const regenerateItem = useRegenerateRepurposeItem();
  const scheduleItems = useScheduleRepurposeItems();
  const createCampaign = useCreateCampaignFromItem();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<RepurposeItem | null>(null);
  const [editText, setEditText] = useState("");
  const [activeTab, setActiveTab] = useState<"posts" | "shorts" | "email">("posts");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStyle, setFilterStyle] = useState<string>("all");

  const job = data?.job;

  // No job yet — show trigger button
  if (!job && !isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Megaphone className="h-4 w-4" /> AI 推廣內容
          </h4>
          <Button
            size="sm"
            variant="outline"
            disabled={triggerRepurpose.isPending}
            onClick={() => {
              triggerRepurpose.mutate(videoId, {
                onSuccess: () => toast.success("內容生成已排入佇列"),
                onError: (e) => toast.error(e.message),
              });
            }}
          >
            {triggerRepurpose.isPending ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> 排入中...</>
            ) : (
              <><Sparkles className="mr-1 h-3 w-3" /> 生成推廣內容</>
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          AI 將根據影片內容自動生成 15 則社群貼文、短影片建議和 Email 通知
        </p>
      </div>
    );
  }

  // Loading or processing state
  if (isLoading || job?.status === "PENDING" || job?.status === "PROCESSING") {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="font-medium">AI 正在生成推廣內容...</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          正在分析影片內容並生成多平台社群貼文、短影片建議和 Email 通知，約需 30-60 秒
        </p>
      </div>
    );
  }

  // Failed state
  if (job?.status === "FAILED") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-400">
            推廣內容生成失敗：{job.errorMessage || "未知錯誤"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              triggerRepurpose.mutate(videoId, {
                onSuccess: () => toast.success("重新生成已排入佇列"),
                onError: (e) => toast.error(e.message),
              });
            }}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> 重新生成
          </Button>
        </div>
      </div>
    );
  }

  // Completed — show items
  const items = job?.items ?? [];
  const socialPosts = items.filter((i) => i.type === "SOCIAL_POST");
  const shortSuggestions = items.filter((i) => i.type === "SHORT_VIDEO_SUGGESTION");
  const emailItems = items.filter((i) => i.type === "EMAIL");

  const filteredPosts = socialPosts.filter((p) => {
    if (filterPlatform !== "all" && p.platform !== filterPlatform) return false;
    if (filterStyle !== "all" && p.style !== filterStyle) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSchedule = () => {
    if (selectedIds.size === 0) return;
    scheduleItems.mutate(
      { itemIds: Array.from(selectedIds) },
      {
        onSuccess: (result) => {
          toast.success(`已排程 ${result.scheduled.length} 則貼文`);
          if (result.failed.length > 0) {
            toast.error(`${result.failed.length} 則排程失敗`);
          }
          setSelectedIds(new Set());
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const content = editingItem.content as any;
    updateItem.mutate(
      {
        itemId: editingItem.id,
        data: { editedContent: { ...content, contentText: editText } },
      },
      {
        onSuccess: () => {
          toast.success("已儲存");
          setEditingItem(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Megaphone className="h-4 w-4" /> AI 推廣內容
          <Badge variant="secondary">{items.length} 則</Badge>
        </h4>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            triggerRepurpose.mutate(videoId, {
              onSuccess: () => toast.success("重新生成已排入佇列"),
              onError: (e) => toast.error(e.message),
            });
          }}
        >
          <RefreshCw className="mr-1 h-3 w-3" /> 重新生成
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: "posts" as const, label: `社群貼文 (${socialPosts.length})`, icon: Share2 },
          { key: "shorts" as const, label: `短影片建議 (${shortSuggestions.length})`, icon: VideoIcon },
          { key: "email" as const, label: `Email (${emailItems.length})`, icon: Mail },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Social Posts Tab */}
      {activeTab === "posts" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有平台</SelectItem>
                {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStyle} onValueChange={setFilterStyle}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="風格" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有風格</SelectItem>
                {Object.entries(STYLE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Post Cards */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredPosts.map((item) => {
              const content = item.content as any;
              const isSelected = selectedIds.has(item.id);
              const isScheduled = item.status === "SCHEDULED";
              const isDiscarded = item.status === "DISCARDED";

              return (
                <div
                  key={item.id}
                  className={`rounded-md border p-3 text-sm space-y-1 ${
                    isDiscarded ? "opacity-50" : ""
                  } ${isSelected ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!isScheduled && !isDiscarded && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(item.id)}
                        className="mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {STYLE_LABELS[item.style ?? ""] ?? item.style}
                        </Badge>
                        {item.status === "EDITED" && (
                          <Badge className="text-[10px] bg-yellow-100 text-yellow-800">已編輯</Badge>
                        )}
                        {isScheduled && (
                          <Badge className="text-[10px] bg-green-100 text-green-800">已排程</Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground line-clamp-3 whitespace-pre-wrap">
                        {content?.contentText}
                      </p>
                      {content?.hashtags?.length > 0 && (
                        <p className="text-[10px] text-blue-600 mt-1 truncate">
                          {content.hashtags.slice(0, 8).join(" ")}
                          {content.hashtags.length > 8 && ` +${content.hashtags.length - 8}`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {!isScheduled && !isDiscarded && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              setEditingItem(item);
                              setEditText(content?.contentText ?? "");
                            }}
                          >
                            編輯
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              regenerateItem.mutate(item.id, {
                                onSuccess: () => toast.success("已重新生成"),
                                onError: (e) => toast.error(e.message),
                              });
                            }}
                          >
                            重生
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Batch Schedule Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-md bg-primary/10 p-2">
              <span className="text-xs font-medium">已選 {selectedIds.size} 則</span>
              <Button
                size="sm"
                disabled={scheduleItems.isPending}
                onClick={handleSchedule}
              >
                {scheduleItems.isPending ? (
                  <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> 排程中...</>
                ) : (
                  <><Clock className="mr-1 h-3 w-3" /> 建立排程</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Short Video Suggestions Tab */}
      {activeTab === "shorts" && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {shortSuggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">影片時長不足，無短影片建議</p>
          ) : (
            shortSuggestions.map((item) => {
              const content = item.content as any;
              return (
                <div key={item.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{content?.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {fmt(content?.startTime)} - {fmt(content?.endTime)}
                    </Badge>
                  </div>
                  {content?.transcriptExcerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{content.transcriptExcerpt}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">推薦原因：</span>
                      <span className="text-[10px]">{content?.reason}</span>
                    </div>
                    {content?.suggestedPlatforms && (
                      <div className="flex gap-1">
                        {content.suggestedPlatforms.map((p: string) => (
                          <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Email Tab */}
      {activeTab === "email" && (
        <div className="space-y-3">
          {emailItems.map((item) => {
            const content = item.content as any;
            const isScheduled = item.status === "SCHEDULED";
            return (
              <div key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{content?.subject}</p>
                    {isScheduled && (
                      <Badge className="text-[10px] bg-green-100 text-green-800 mt-1">已建立 Campaign</Badge>
                    )}
                  </div>
                  {!isScheduled && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createCampaign.isPending}
                      onClick={() => {
                        createCampaign.mutate(
                          { itemId: item.id, data: { targetTags: [] } },
                          {
                            onSuccess: () => toast.success("Email Campaign 已建立"),
                            onError: (e) => toast.error(e.message),
                          },
                        );
                      }}
                    >
                      {createCampaign.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="mr-1 h-3 w-3" />
                      )}
                      建立 Campaign
                    </Button>
                  )}
                </div>
                {content?.body && (
                  <div
                    className="max-h-32 overflow-y-auto rounded bg-muted/50 p-2 text-xs"
                    dangerouslySetInnerHTML={{ __html: content.body }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">編輯貼文</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingItem && (
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {PLATFORM_LABELS[editingItem.platform ?? ""] ?? editingItem.platform}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {STYLE_LABELS[editingItem.style ?? ""] ?? editingItem.style}
                </Badge>
              </div>
            )}
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={8}
              className="text-sm"
            />
            <div className="flex justify-between">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!editingItem) return;
                  resetItem.mutate(editingItem.id, {
                    onSuccess: () => {
                      toast.success("已還原為 AI 原始版本");
                      setEditingItem(null);
                    },
                    onError: (e) => toast.error(e.message),
                  });
                }}
              >
                還原原始
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                  取消
                </Button>
                <Button size="sm" disabled={updateItem.isPending} onClick={handleSaveEdit}>
                  {updateItem.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  儲存
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RepurposeDialog({
  state,
  onClose,
}: {
  state: RepurposeState | null;
  onClose: () => void;
}) {
  const generatePost = useAiGeneratePost();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = () => {
    if (!state) return;
    generatePost.mutate(
      { platforms: PLATFORMS, tone: "professional", clipId: state.clipId },
      {
        onSuccess: (data) => {
          if (state) state.suggestions = data.suggestions;
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("已複製到剪貼簿");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Auto-generate on open
  const suggestions = generatePost.data?.suggestions ?? state?.suggestions;

  return (
    <Dialog open={!!state} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-600" />
            一鍵內容再製
          </DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-4">
            <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30">
              <p className="text-sm font-medium text-purple-900 dark:text-purple-200">
                片段：{state.clipTitle}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                AI 將根據此片段為所有平台生成客製化貼文
              </p>
            </div>

            {!suggestions && !generatePost.isPending && (
              <div className="text-center py-6">
                <Button onClick={handleGenerate} className="bg-purple-600 hover:bg-purple-700">
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 生成所有平台貼文
                </Button>
              </div>
            )}

            {generatePost.isPending && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                <span className="text-sm text-muted-foreground">AI 正在為 5 個平台生成客製內容...</span>
              </div>
            )}

            {suggestions && (
              <div className="space-y-3">
                {suggestions.map((s, idx) => (
                  <div key={s.platform} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="font-medium">
                        {platformLabels[s.platform] ?? s.platform}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleCopy(s.contentText + "\n\n" + s.hashtags.join(" "), idx)}
                      >
                        {copiedIdx === idx ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{s.contentText}</p>
                    {s.hashtags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.hashtags.map((tag) => (
                          <span key={tag} className="text-xs text-blue-600 dark:text-blue-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleGenerate} disabled={generatePost.isPending}>
                    <Sparkles className="mr-1 h-3 w-3" />
                    重新生成
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function VideosPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repurpose, setRepurpose] = useState<RepurposeState | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useVideos();
  const createVideo = useCreateVideo();
  const deleteVideo = useDeleteVideo();
  const directUpload = useDirectUpload();
  const subtitleMutation = useGenerateSubtitles();
  const [subtitleResult, setSubtitleResult] = useState<{ srtUrl: string; vttUrl: string; segmentCount: number; preview: string } | null>(null);

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("請輸入影片標題");
      return;
    }
    createVideo.mutate(
      { title, description },
      {
        onSuccess: () => {
          toast.success("影片已建立");
          setCreateOpen(false);
          setTitle("");
          setDescription("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleUpload = async (file: File) => {
    directUpload.mutate(file, {
      onSuccess: () => toast.success("影片上傳成功，AI 已自動剪輯"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "上傳失敗"),
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="影片管理"
        description="上傳影片並使用 AI 自動剪輯精華片段"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScriptOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              AI 腳本
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={directUpload.isPending}
            >
              {directUpload.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />上傳中...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />上傳影片</>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        }
      />

      {/* Upload Loading Overlay */}
      {directUpload.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl bg-white p-8 shadow-2xl dark:bg-gray-900">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-lg font-semibold">影片上傳中...</p>
                <p className="text-sm text-muted-foreground">AI 正在分析並自動生成精華片段</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <CardsSkeleton />
      ) : !data?.data?.length ? (
        <EmptyState
          icon={Film}
          title="尚無影片"
          description="上傳您的第一支影片，AI 將自動為您剪輯精彩片段"
          actionLabel="上傳影片"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.data.map((video) => {
            const status = statusMap[video.status] ?? { label: video.status, variant: "outline" as const };
            const clipCount = video._count?.clips ?? 0;
            return (
              <Card
                key={video.id}
                className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                onClick={() => setSelectedVideo(video)}
              >
                <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                  {video.thumbnailUrl ? (
                    <img src={assetUrl(video.thumbnailUrl)} alt={video.title} className="h-full w-full object-cover" />
                  ) : (
                    <Film className="h-10 w-10 text-slate-400" />
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-80">
                      <Play className="h-5 w-5 pl-0.5" />
                    </div>
                  </div>
                  {video.durationSeconds != null && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      <Clock className="h-3 w-3" />
                      {fmt(video.durationSeconds)}
                    </div>
                  )}
                  <Badge variant={status.variant} className="absolute left-2 top-2">
                    {status.label}
                  </Badge>
                </div>
                <CardContent className="pt-3">
                  <h3 className="line-clamp-1 text-sm font-semibold">{video.title}</h3>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(video.createdAt).toLocaleDateString("zh-TW")}</span>
                    {clipCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Scissors className="h-3 w-3" /> {clipCount} 片段
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(video.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Video Detail Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" /> {selectedVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedVideo && (
            <div className="space-y-4">
              {/* Video Player */}
              {selectedVideo.originalUrl && (
                <div className="overflow-hidden rounded-lg bg-black">
                  <video
                    key={selectedVideo.id}
                    src={resolveVideoUrl(selectedVideo.originalUrl) ?? undefined}
                    controls
                    poster={selectedVideo.thumbnailUrl ? assetUrl(selectedVideo.thumbnailUrl) : undefined}
                    className="w-full"
                    style={{ maxHeight: 360 }}
                    playsInline
                  >
                    您的瀏覽器不支援影片播放
                  </video>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">狀態</span>
                  <p className="font-medium">{statusMap[selectedVideo.status]?.label ?? selectedVideo.status}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">時長</span>
                  <p className="font-medium">{fmt(selectedVideo.durationSeconds)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">建立時間</span>
                  <p className="font-medium">{new Date(selectedVideo.createdAt).toLocaleDateString("zh-TW")}</p>
                </div>
              </div>
              {selectedVideo.aiSummary && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                  <p className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                    <Sparkles className="h-3 w-3" /> AI 摘要
                  </p>
                  <p className="mt-1 text-sm text-blue-900 dark:text-blue-200">{selectedVideo.aiSummary}</p>
                </div>
              )}
              {/* Subtitle Generation */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <Captions className="h-4 w-4" /> AI 字幕生成
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={subtitleMutation.isPending}
                    onClick={() => {
                      subtitleMutation.mutate(
                        { videoId: selectedVideo.id, data: { language: "zh", polish: true } },
                        {
                          onSuccess: (res) => {
                            setSubtitleResult(res);
                            toast.success(`字幕已生成（${res.segmentCount} 段）`);
                          },
                          onError: (e) => toast.error(e.message),
                        },
                      );
                    }}
                  >
                    {subtitleMutation.isPending ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Whisper 轉錄中...</>
                    ) : (
                      <><Sparkles className="mr-1 h-3 w-3" /> 生成字幕</>
                    )}
                  </Button>
                </div>
                {subtitleMutation.isPending && (
                  <p className="text-xs text-muted-foreground">Whisper 正在辨識語音 → GPT 校正斷句中，約需 30-60 秒...</p>
                )}
                {subtitleResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{subtitleResult.segmentCount} 段字幕</Badge>
                      <span>已由 GPT 校正潤飾</span>
                    </div>
                    <pre className="max-h-32 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{subtitleResult.preview}</pre>
                    <div className="flex gap-2">
                      <a
                        href={`${subtitleResult.srtUrl}`}
                        download
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="h-3 w-3" /> 下載 SRT
                      </a>
                      <a
                        href={`${subtitleResult.vttUrl}`}
                        download
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <Download className="h-3 w-3" /> 下載 VTT
                      </a>
                    </div>
                  </div>
                )}
                {!subtitleResult && !subtitleMutation.isPending && (
                  <p className="text-xs text-muted-foreground">使用 OpenAI Whisper 自動辨識影片語音，GPT 校正後生成 SRT/VTT 字幕檔</p>
                )}
              </div>

              <VideoClipsPanel
                videoId={selectedVideo.id}
                onRepurpose={(clipId, clipTitle) => setRepurpose({ clipId, clipTitle, suggestions: null })}
              />

              {/* Content Repurpose Panel */}
              {selectedVideo.status === "PROCESSED" && (
                <RepurposePanel videoId={selectedVideo.id} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除影片"
        description="確定要刪除此影片嗎？此操作無法復原，所有相關片段也會一併刪除。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteVideo.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteVideo.mutate(deleteId, {
              onSuccess: () => { toast.success("影片已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />

      {/* Repurpose Dialog */}
      <RepurposeDialog state={repurpose} onClose={() => setRepurpose(null)} />

      {/* Script Generator Dialog */}
      <ScriptGeneratorDialog open={scriptOpen} onClose={() => setScriptOpen(false)} />
    </div>
  );
}

function ScriptGeneratorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("教學");
  const [targetLength, setTargetLength] = useState("10");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) { toast.error("請輸入影片主題"); return; }
    setLoading(true);
    setScript(null);
    try {
      const res = await api<{ script: string }>("/v1/ai/generate-script", {
        method: "POST",
        body: JSON.stringify({
          topic: topic.trim(),
          style,
          targetLength: parseInt(targetLength) || 10,
          targetAudience: audience || undefined,
          additionalNotes: notes || undefined,
        }),
      });
      setScript(res.script);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (script) {
      navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success("腳本已複製");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setScript(null); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            AI 影片腳本生成
          </DialogTitle>
        </DialogHeader>

        {!script ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
              <p className="text-sm text-orange-900 dark:text-orange-200">
                輸入影片主題，AI 將生成完整的腳本大綱，包含 Hook、段落結構、CTA、拍攝建議和 SEO 關鍵字。
              </p>
            </div>

            <div className="space-y-2">
              <Label>影片主題 *</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例：如何用 AI 工具提升工作效率"
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>影片風格</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="教學">📚 教學型</SelectItem>
                    <SelectItem value="Vlog">📹 Vlog</SelectItem>
                    <SelectItem value="開箱評測">📦 開箱評測</SelectItem>
                    <SelectItem value="故事敘事">📖 故事敘事</SelectItem>
                    <SelectItem value="排行榜">🏆 排行榜 / Top N</SelectItem>
                    <SelectItem value="挑戰">🎯 挑戰型</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>目標時長（分鐘）</Label>
                <Select value={targetLength} onValueChange={setTargetLength}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 分鐘（短影音）</SelectItem>
                    <SelectItem value="5">5 分鐘</SelectItem>
                    <SelectItem value="10">10 分鐘</SelectItem>
                    <SelectItem value="15">15 分鐘</SelectItem>
                    <SelectItem value="20">20 分鐘</SelectItem>
                    <SelectItem value="30">30 分鐘（長片）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>目標觀眾（選填）</Label>
              <Input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="例：18-35 歲科技愛好者"
              />
            </div>

            <div className="space-y-2">
              <Label>補充說明（選填）</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例：想要加入個人經驗分享、要有幽默感"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !topic.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI 生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    生成腳本
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-orange-700">
                主題：{topic} · {style} · {targetLength}分鐘
              </Badge>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="mr-1 h-3 w-3 text-green-600" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? "已複製" : "複製"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setScript(null)}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  重新生成
                </Button>
              </div>
            </div>

            <div className="prose prose-sm max-w-none rounded-lg border bg-white p-5 text-sm leading-relaxed dark:bg-gray-950">
              {script.split("\n").map((line, i) => {
                if (line.startsWith("# ")) return <h2 key={i} className="mt-4 text-lg font-bold">{line.slice(2)}</h2>;
                if (line.startsWith("## ")) return <h3 key={i} className="mt-3 text-base font-semibold">{line.slice(3)}</h3>;
                if (line.startsWith("### ")) return <h4 key={i} className="mt-2 text-sm font-semibold">{line.slice(4)}</h4>;
                if (line.startsWith("- ")) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
                if (line.trim() === "") return <br key={i} />;
                return <p key={i} className="mb-1">{line}</p>;
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
