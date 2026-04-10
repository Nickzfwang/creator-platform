"use client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
const assetUrl = (path: string) => path?.startsWith('http') ? path : `${BACKEND_URL}${path}`;

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, Upload, Trash2, Film, Scissors, Clock, Sparkles, Play, Share2, Loader2, Copy, Check, FileText, Smartphone, Download, Captions, Megaphone, RefreshCw, Mail, Video as VideoIcon, Wrench, ListChecks, BookOpen, Clipboard } from "lucide-react";
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
import {
  useDetectFillers,
  useCutFillers,
  useGenerateChapters,
  useUpdateChapters,
  useGenerateScriptSummary,
  useMultiPlatform,
  type FillerMark,
  type Chapter,
  type ScriptSummary,
  type MultiPlatformResult,
} from "@/hooks/use-post-production";
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

function fmt(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VideoClipsPanel({ videoId, onRepurpose }: { videoId: string; onRepurpose?: (clipId: string, clipTitle: string) => void }) {
  const t = useTranslations("videos");
  const { data: clips, isLoading } = useVideoClips(videoId);
  const generateClips = useGenerateClips();
  const generateShort = useGenerateShort();
  const generateAllShorts = useGenerateAllShorts();
  const [shortResult, setShortResult] = useState<{ title: string; outputUrl: string; suggestedCaption: string; hashtags: string[] } | null>(null);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Scissors className="h-4 w-4" /> {t("clips.title")}
        </h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            generateClips.mutate(
              { videoId },
              {
                onSuccess: () => toast.success(t("toast.clipsGenerated")),
                onError: (e) => toast.error(e.message),
              },
            );
          }}
          disabled={generateClips.isPending}
        >
          <Sparkles className="mr-1 h-3 w-3" />
          {generateClips.isPending ? t("clips.generating") : t("clips.generateBtn")}
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
                    toast.success(t("toast.shortsGenerated", { count: res.length }));
                    if (res.length > 0) setShortResult(res[0]);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            }}
            disabled={generateAllShorts.isPending}
          >
            <Smartphone className="mr-1 h-3 w-3" />
            {generateAllShorts.isPending ? t("clips.generating") : t("clips.generateAllShorts")}
          </Button>
        )}
      </div>
      {!clips?.length ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Scissors className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("clips.empty")}</p>
          <p className="text-xs text-muted-foreground">{t("clips.emptyHint")}</p>
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
                  {clip.status === "READY" ? t("clips.statusReady") : clip.status}
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
                          toast.success(t("toast.shortGenerated"));
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    );
                  }}
                  title={t("clips.generateShortTitle")}
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
            <h4 className="text-sm font-semibold text-green-900 dark:text-green-100">{t("clips.shortGenerated")}</h4>
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
                <Download className="h-3 w-3" /> {t("clips.downloadShort")}
              </a>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(
                    shortResult.suggestedCaption + "\n\n" + shortResult.hashtags.map(t => `#${t}`).join(" ")
                  );
                  toast.success(t("toast.captionCopied"));
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> {t("clips.copyCopy")}
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

// ─── Post-Production Tools Panel ───

function PostProductionTab({ videoId }: { videoId: string }) {
  const t = useTranslations("videos");
  const detectFillers = useDetectFillers();
  const cutFillers = useCutFillers();
  const generateChapters = useGenerateChapters();
  const updateChapters = useUpdateChapters();
  const generateScriptSummary = useGenerateScriptSummary();
  const multiPlatform = useMultiPlatform();

  const [activeSection, setActiveSection] = useState<"fillers" | "chapters" | "script" | "multiplatform">("fillers");
  const [fillerResult, setFillerResult] = useState<{ fillers: FillerMark[]; totalCount: number; estimatedSavings: number } | null>(null);
  const [selectedFillers, setSelectedFillers] = useState<Set<string>>(new Set());
  const [cutResult, setCutResult] = useState<{ outputUrl: string; originalDuration: number; newDuration: number; removedCount: number } | null>(null);
  const [chapterResult, setChapterResult] = useState<{ chapters: Chapter[]; youtubeFormat: string } | null>(null);
  const [editingChapters, setEditingChapters] = useState<Chapter[] | null>(null);
  const [scriptResult, setScriptResult] = useState<{ summary: ScriptSummary; markdown: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleFiller = (id: string) => {
    setSelectedFillers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFillers = () => {
    if (!fillerResult) return;
    if (selectedFillers.size === fillerResult.fillers.length) {
      setSelectedFillers(new Set());
    } else {
      setSelectedFillers(new Set(fillerResult.fillers.map(f => f.id)));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t("toast.copiedToClipboard"));
    setTimeout(() => setCopied(false), 2000);
  };

  const sectionTabs = [
    { key: "fillers" as const, label: t("postProduction.fillers"), icon: Scissors },
    { key: "chapters" as const, label: t("postProduction.chapters"), icon: ListChecks },
    { key: "script" as const, label: t("postProduction.scriptSummary"), icon: BookOpen },
    { key: "multiplatform" as const, label: t("postProduction.multiPlatform"), icon: Smartphone },
  ];

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Wrench className="h-4 w-4" /> {t("postProduction.title")}
      </h4>

      {/* Section tabs */}
      <div className="flex gap-1 border-b">
        {sectionTabs.map(tab => (
          <button
            key={tab.key}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSection === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveSection(tab.key)}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filler Removal */}
      {activeSection === "fillers" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("postProduction.fillersDesc")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={detectFillers.isPending}
              onClick={() => {
                detectFillers.mutate(videoId, {
                  onSuccess: (res) => {
                    setFillerResult(res);
                    setSelectedFillers(new Set(res.fillers.map(f => f.id)));
                    toast.success(t("toast.fillersDetected", { count: res.totalCount }));
                  },
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              {detectFillers.isPending ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("postProduction.detecting")}</>
              ) : (
                <><Sparkles className="mr-1 h-3 w-3" /> {t("postProduction.detectFillers")}</>
              )}
            </Button>
          </div>

          {fillerResult && (
            <>
              <div className="flex items-center justify-between rounded-md bg-muted/50 p-2 text-xs">
                <span>{t("postProduction.fillerStats", { total: fillerResult.totalCount, selected: selectedFillers.size, savings: fillerResult.estimatedSavings })}</span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={selectAllFillers}>
                  {selectedFillers.size === fillerResult.fillers.length ? t("common.deselectAll") : t("common.selectAll")}
                </Button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {fillerResult.fillers.map(f => (
                  <label key={f.id} className="flex items-start gap-2 rounded p-1.5 hover:bg-muted/50 cursor-pointer text-xs">
                    <Checkbox
                      checked={selectedFillers.has(f.id)}
                      onCheckedChange={() => toggleFiller(f.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground">{f.contextBefore}</span>
                      <span className="font-bold text-red-600 mx-0.5">{f.word}</span>
                      <span className="text-muted-foreground">{f.contextAfter}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {f.startTime.toFixed(1)}s
                    </span>
                  </label>
                ))}
              </div>

              {selectedFillers.size > 0 && (
                <Button
                  size="sm"
                  disabled={cutFillers.isPending}
                  onClick={() => {
                    cutFillers.mutate(
                      { videoId, fillerIds: Array.from(selectedFillers) },
                      {
                        onSuccess: (res) => {
                          setCutResult(res);
                          toast.success(t("toast.cutComplete", { original: res.originalDuration, result: res.newDuration }));
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    );
                  }}
                >
                  {cutFillers.isPending ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("postProduction.cutting")}</>
                  ) : (
                    <><Scissors className="mr-1 h-3 w-3" /> {t("postProduction.cutBtn", { count: selectedFillers.size })}</>
                  )}
                </Button>
              )}

              {cutResult && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs dark:border-green-900 dark:bg-green-950">
                  <p className="font-medium text-green-700 dark:text-green-400">{t("postProduction.cutDone")}</p>
                  <p className="mt-1">{t("postProduction.cutResult", { original: cutResult.originalDuration, result: cutResult.newDuration, saved: Math.round(cutResult.originalDuration - cutResult.newDuration) })}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Chapter Markers */}
      {activeSection === "chapters" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("postProduction.chaptersDesc")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={generateChapters.isPending}
              onClick={() => {
                generateChapters.mutate(videoId, {
                  onSuccess: (res) => {
                    setChapterResult(res);
                    setEditingChapters(null);
                    toast.success(t("toast.chaptersGenerated", { count: res.chapters.length }));
                  },
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              {generateChapters.isPending ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("common.generating")}</>
              ) : (
                <><Sparkles className="mr-1 h-3 w-3" /> {t("postProduction.generateChapters")}</>
              )}
            </Button>
          </div>

          {chapterResult && (
            <>
              <div className="space-y-1">
                {(editingChapters ?? chapterResult.chapters).map((ch, i) => (
                  <div key={ch.id} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-muted-foreground font-mono">
                      {String(Math.floor(ch.startTime / 60)).padStart(2, "0")}:{String(ch.startTime % 60).padStart(2, "0")}
                    </span>
                    {editingChapters ? (
                      <Input
                        className="h-7 text-xs flex-1"
                        value={editingChapters[i].title}
                        onChange={(e) => {
                          const next = [...editingChapters];
                          next[i] = { ...next[i], title: e.target.value };
                          setEditingChapters(next);
                        }}
                      />
                    ) : (
                      <span className="flex-1">{ch.title}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {editingChapters ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingChapters(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={updateChapters.isPending}
                      onClick={() => {
                        updateChapters.mutate(
                          { videoId, chapters: editingChapters },
                          {
                            onSuccess: (res) => {
                              setChapterResult(res);
                              setEditingChapters(null);
                              toast.success(t("toast.chaptersUpdated"));
                            },
                            onError: (e) => toast.error(e.message),
                          },
                        );
                      }}
                    >
                      {t("common.save")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingChapters([...chapterResult.chapters])}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(chapterResult.youtubeFormat)}
                    >
                      {copied ? <Check className="mr-1 h-3 w-3" /> : <Clipboard className="mr-1 h-3 w-3" />}
                      {t("postProduction.copyYoutubeFormat")}
                    </Button>
                  </>
                )}
              </div>

              {!editingChapters && (
                <pre className="max-h-24 overflow-y-auto rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap font-mono">
                  {chapterResult.youtubeFormat}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {/* Script Summary */}
      {/* Multi-Platform Adaptation */}
      {activeSection === "multiplatform" && (
        <MultiPlatformPanel videoId={videoId} />
      )}

      {activeSection === "script" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("postProduction.scriptDesc")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={generateScriptSummary.isPending}
              onClick={() => {
                generateScriptSummary.mutate(videoId, {
                  onSuccess: (res) => {
                    setScriptResult(res);
                    toast.success(t("toast.scriptGenerated", { count: res.summary.sections.length }));
                  },
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              {generateScriptSummary.isPending ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("common.generating")}</>
              ) : (
                <><Sparkles className="mr-1 h-3 w-3" /> {t("postProduction.generateScript")}</>
              )}
            </Button>
          </div>

          {scriptResult && (
            <>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium">{scriptResult.summary.title}</p>
                <p className="text-xs text-muted-foreground">{scriptResult.summary.oneLinerSummary}</p>
                <div className="flex flex-wrap gap-1">
                  {scriptResult.summary.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {scriptResult.summary.sections.map((s, i) => (
                  <div key={i} className="rounded border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.title}</span>
                      <span className="text-[10px] text-muted-foreground">{s.timeRange}</span>
                    </div>
                    <ul className="list-disc pl-4 text-muted-foreground">
                      {s.keyPoints.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                    <div className="flex gap-1">
                      {s.keywords.map(k => (
                        <Badge key={k} variant="outline" className="text-[9px]">{k}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleCopy(scriptResult.markdown)}>
                  {copied ? <Check className="mr-1 h-3 w-3" /> : <Clipboard className="mr-1 h-3 w-3" />}
                  {t("postProduction.copyMarkdown")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([scriptResult.markdown], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `script-summary.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t("toast.markdownDownloaded"));
                  }}
                >
                  <Download className="mr-1 h-3 w-3" /> {t("postProduction.exportMd")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-Platform Panel ───

function MultiPlatformPanel({ videoId }: { videoId: string }) {
  const t = useTranslations("videos");
  const { data: clips } = useVideoClips(videoId);
  const multiPlatform = useMultiPlatform();

  const MULTI_PLATFORMS = [
    { key: "youtube_shorts", label: "YouTube Shorts", format: "9:16" },
    { key: "instagram_reels", label: "Instagram Reels", format: "9:16" },
    { key: "tiktok", label: "TikTok", format: "9:16" },
    { key: "instagram_square", label: t("multiPlatform.igSquare"), format: "1:1" },
  ];

  const [selectedClipId, setSelectedClipId] = useState<string>("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(["youtube_shorts", "instagram_reels", "tiktok"]),
  );
  const [mpResult, setMpResult] = useState<MultiPlatformResult | null>(null);

  const togglePlatform = (key: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("multiPlatform.desc")}</p>

      {/* Clip selector */}
      <div className="space-y-1">
        <label className="text-xs font-medium">{t("multiPlatform.selectClip")}</label>
        <Select value={selectedClipId} onValueChange={setSelectedClipId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={t("multiPlatform.selectClipPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {(clips ?? []).map((clip: any) => (
              <SelectItem key={clip.id} value={clip.id}>
                {clip.title} ({fmt(clip.startTime)} - {fmt(clip.endTime)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Platform checkboxes */}
      <div className="space-y-1">
        <label className="text-xs font-medium">{t("multiPlatform.targetPlatforms")}</label>
        <div className="grid grid-cols-2 gap-2">
          {MULTI_PLATFORMS.map(p => (
            <label key={p.key} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={selectedPlatforms.has(p.key)}
                onCheckedChange={() => togglePlatform(p.key)}
              />
              {p.label}
              <span className="text-[10px] text-muted-foreground">({p.format})</span>
            </label>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <Button
        size="sm"
        disabled={!selectedClipId || selectedPlatforms.size === 0 || multiPlatform.isPending}
        onClick={() => {
          multiPlatform.mutate(
            {
              videoId,
              clipId: selectedClipId,
              platforms: Array.from(selectedPlatforms),
              addSubtitles: true,
            },
            {
              onSuccess: (res) => {
                setMpResult(res);
                toast.success(t("toast.multiPlatformDone", { success: res.results.length, failed: res.failed.length }));
              },
              onError: (e) => toast.error(e.message),
            },
          );
        }}
      >
        {multiPlatform.isPending ? (
          <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("multiPlatform.generatingLong")}</>
        ) : (
          <><Sparkles className="mr-1 h-3 w-3" /> {t("multiPlatform.generateBtn", { count: selectedPlatforms.size })}</>
        )}
      </Button>

      {/* Results */}
      {mpResult && (
        <div className="space-y-2">
          {mpResult.results.map((r) => (
            <div key={r.id} className="rounded border p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.title}</span>
                <Badge variant="secondary" className="text-[10px]">{r.format}</Badge>
              </div>
              {r.suggestedCaption && (
                <p className="text-muted-foreground line-clamp-2">{r.suggestedCaption}</p>
              )}
              {r.hashtags.length > 0 && (
                <p className="text-[10px] text-blue-600 truncate">
                  {r.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
                </p>
              )}
            </div>
          ))}
          {mpResult.failed.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950">
              {mpResult.failed.map((f) => (
                <p key={f.platform} className="text-red-600">{f.platform}: {f.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content Repurpose Panel ───

function RepurposePanel({ videoId }: { videoId: string }) {
  const t = useTranslations("videos");

  const PLATFORM_LABELS: Record<string, string> = {
    YOUTUBE: "YouTube",
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    TWITTER: "X / Twitter",
    THREADS: "Threads",
  };

  const STYLE_LABELS: Record<string, string> = {
    knowledge: t("repurpose.styleKnowledge"),
    story: t("repurpose.styleStory"),
    interactive: t("repurpose.styleInteractive"),
  };

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
            <Megaphone className="h-4 w-4" /> {t("repurpose.title")}
          </h4>
          <Button
            size="sm"
            variant="outline"
            disabled={triggerRepurpose.isPending}
            onClick={() => {
              triggerRepurpose.mutate(videoId, {
                onSuccess: () => toast.success(t("toast.repurposeQueued")),
                onError: (e) => toast.error(e.message),
              });
            }}
          >
            {triggerRepurpose.isPending ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("repurpose.queuing")}</>
            ) : (
              <><Sparkles className="mr-1 h-3 w-3" /> {t("repurpose.generateBtn")}</>
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("repurpose.desc")}
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
          <span className="font-medium">{t("repurpose.processing")}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("repurpose.processingDesc")}
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
            {t("repurpose.failed")}{job.errorMessage || t("repurpose.unknownError")}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              triggerRepurpose.mutate(videoId, {
                onSuccess: () => toast.success(t("toast.repurposeRequeued")),
                onError: (e) => toast.error(e.message),
              });
            }}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> {t("common.regenerate")}
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
          toast.success(t("toast.postsScheduled", { count: result.scheduled.length }));
          if (result.failed.length > 0) {
            toast.error(t("toast.postsScheduleFailed", { count: result.failed.length }));
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
          toast.success(t("toast.saved"));
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
          <Megaphone className="h-4 w-4" /> {t("repurpose.title")}
          <Badge variant="secondary">{t("repurpose.itemCount", { count: items.length })}</Badge>
        </h4>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            triggerRepurpose.mutate(videoId, {
              onSuccess: () => toast.success(t("toast.repurposeRequeued")),
              onError: (e) => toast.error(e.message),
            });
          }}
        >
          <RefreshCw className="mr-1 h-3 w-3" /> {t("common.regenerate")}
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: "posts" as const, label: t("repurpose.tabPosts", { count: socialPosts.length }), icon: Share2 },
          { key: "shorts" as const, label: t("repurpose.tabShorts", { count: shortSuggestions.length }), icon: VideoIcon },
          { key: "email" as const, label: t("repurpose.tabEmail", { count: emailItems.length }), icon: Mail },
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
                <SelectValue placeholder={t("repurpose.platform")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("repurpose.allPlatforms")}</SelectItem>
                {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStyle} onValueChange={setFilterStyle}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder={t("repurpose.style")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("repurpose.allStyles")}</SelectItem>
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
                          <Badge className="text-[10px] bg-yellow-100 text-yellow-800">{t("repurpose.statusEdited")}</Badge>
                        )}
                        {isScheduled && (
                          <Badge className="text-[10px] bg-green-100 text-green-800">{t("repurpose.statusScheduled")}</Badge>
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
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              regenerateItem.mutate(item.id, {
                                onSuccess: () => toast.success(t("toast.regenerated")),
                                onError: (e) => toast.error(e.message),
                              });
                            }}
                          >
                            {t("repurpose.regen")}
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
              <span className="text-xs font-medium">{t("repurpose.selectedCount", { count: selectedIds.size })}</span>
              <Button
                size="sm"
                disabled={scheduleItems.isPending}
                onClick={handleSchedule}
              >
                {scheduleItems.isPending ? (
                  <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("repurpose.scheduling")}</>
                ) : (
                  <><Clock className="mr-1 h-3 w-3" /> {t("repurpose.createSchedule")}</>
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
            <p className="text-xs text-muted-foreground py-4 text-center">{t("repurpose.noShortSuggestions")}</p>
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
                      <span className="text-[10px] text-muted-foreground">{t("repurpose.reason")}</span>
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
                      <Badge className="text-[10px] bg-green-100 text-green-800 mt-1">{t("repurpose.campaignCreated")}</Badge>
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
                            onSuccess: () => toast.success(t("toast.campaignCreated")),
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
                      {t("repurpose.createCampaign")}
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
            <DialogTitle className="text-sm">{t("repurpose.editPost")}</DialogTitle>
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
                      toast.success(t("toast.resetToOriginal"));
                      setEditingItem(null);
                    },
                    onError: (e) => toast.error(e.message),
                  });
                }}
              >
                {t("repurpose.resetOriginal")}
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" disabled={updateItem.isPending} onClick={handleSaveEdit}>
                  {updateItem.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {t("common.save")}
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
  const t = useTranslations("videos");
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
    toast.success(t("toast.copiedToClipboard"));
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
            {t("repurposeDialog.title")}
          </DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-4">
            <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30">
              <p className="text-sm font-medium text-purple-900 dark:text-purple-200">
                {t("repurposeDialog.clip")}{state.clipTitle}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                {t("repurposeDialog.desc")}
              </p>
            </div>

            {!suggestions && !generatePost.isPending && (
              <div className="text-center py-6">
                <Button onClick={handleGenerate} className="bg-purple-600 hover:bg-purple-700">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("repurposeDialog.generateAll")}
                </Button>
              </div>
            )}

            {generatePost.isPending && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                <span className="text-sm text-muted-foreground">{t("repurposeDialog.generating")}</span>
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
                    {t("common.regenerate")}
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
  const t = useTranslations("videos");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repurpose, setRepurpose] = useState<RepurposeState | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    UPLOADING: { label: t("status.uploading"), variant: "outline" },
    UPLOADED: { label: t("status.uploaded"), variant: "secondary" },
    PROCESSING: { label: t("status.processing"), variant: "default" },
    PROCESSED: { label: t("status.processed"), variant: "secondary" },
    FAILED: { label: t("status.failed"), variant: "destructive" },
  };

  const { data, isLoading } = useVideos();
  const createVideo = useCreateVideo();
  const deleteVideo = useDeleteVideo();
  const directUpload = useDirectUpload();
  const subtitleMutation = useGenerateSubtitles();
  const [subtitleResult, setSubtitleResult] = useState<{ srtUrl: string; vttUrl: string; segmentCount: number; preview: string; source?: "embedded" | "whisper"; contentType?: "speech" | "music" } | null>(null);
  const [subtitleContentType, setSubtitleContentType] = useState<"speech" | "music">("speech");
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>("zh");

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error(t("toast.enterTitle"));
      return;
    }
    createVideo.mutate(
      { title, description },
      {
        onSuccess: () => {
          toast.success(t("toast.videoCreated"));
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
      onSuccess: () => toast.success(t("toast.uploadSuccess")),
      onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.uploadFailed")),
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScriptOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              {t("page.aiScript")}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={directUpload.isPending}
            >
              {directUpload.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("page.uploading")}</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />{t("page.uploadVideo")}</>
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
                <p className="text-lg font-semibold">{t("page.uploadingOverlay")}</p>
                <p className="text-sm text-muted-foreground">{t("page.uploadingOverlayDesc")}</p>
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
          title={t("page.emptyTitle")}
          description={t("page.emptyDescription")}
          actionLabel={t("page.uploadVideo")}
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
                        <Scissors className="h-3 w-3" /> {t("page.clipCount", { count: clipCount })}
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
                    {t("detail.videoNotSupported")}
                  </video>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">{t("detail.status")}</span>
                  <p className="font-medium">{statusMap[selectedVideo.status]?.label ?? selectedVideo.status}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("detail.duration")}</span>
                  <p className="font-medium">{fmt(selectedVideo.durationSeconds)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("detail.createdAt")}</span>
                  <p className="font-medium">{new Date(selectedVideo.createdAt).toLocaleDateString("zh-TW")}</p>
                </div>
              </div>
              {selectedVideo.aiSummary && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                  <p className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                    <Sparkles className="h-3 w-3" /> {t("detail.aiSummary")}
                  </p>
                  <p className="mt-1 text-sm text-blue-900 dark:text-blue-200">{selectedVideo.aiSummary}</p>
                </div>
              )}
              {/* Subtitle Generation */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <Captions className="h-4 w-4" /> {t("subtitle.title")}
                  </h4>
                  <div className="flex items-center gap-2">
                    <select
                      value={subtitleContentType}
                      onChange={(e) => setSubtitleContentType(e.target.value as "speech" | "music")}
                      disabled={subtitleMutation.isPending}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="speech">{t("subtitle.contentType.speech")}</option>
                      <option value="music">{t("subtitle.contentType.music")}</option>
                    </select>
                    <select
                      value={subtitleLanguage}
                      onChange={(e) => setSubtitleLanguage(e.target.value)}
                      disabled={subtitleMutation.isPending}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="zh">中文</option>
                      <option value="yue">粵語</option>
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                    </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={subtitleMutation.isPending}
                    onClick={() => {
                      subtitleMutation.mutate(
                        {
                          videoId: selectedVideo.id,
                          data: {
                            language: subtitleLanguage,
                            contentType: subtitleContentType,
                            polish: subtitleContentType !== "music",
                          },
                        },
                        {
                          onSuccess: (res) => {
                            setSubtitleResult(res);
                            toast.success(t("toast.subtitleGenerated", { count: res.segmentCount }));
                          },
                          onError: (e) => toast.error(e.message),
                        },
                      );
                    }}
                  >
                    {subtitleMutation.isPending ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("subtitle.transcribing")}</>
                    ) : (
                      <><Sparkles className="mr-1 h-3 w-3" /> {t("subtitle.generateBtn")}</>
                    )}
                  </Button>
                  </div>
                </div>
                {subtitleMutation.isPending && (
                  <p className="text-xs text-muted-foreground">{t("subtitle.transcribingDesc")}</p>
                )}
                {subtitleResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="secondary">{t("subtitle.segmentCount", { count: subtitleResult.segmentCount })}</Badge>
                      {subtitleResult.source === "embedded" && (
                        <Badge variant="outline">{t("subtitle.sourceEmbedded")}</Badge>
                      )}
                      {subtitleResult.source === "whisper" && (
                        <Badge variant="outline">{t("subtitle.sourceWhisper")}</Badge>
                      )}
                      <span>{t("subtitle.polished")}</span>
                    </div>
                    <pre className="max-h-32 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{subtitleResult.preview}</pre>
                    <div className="flex gap-2">
                      <a
                        href={`${subtitleResult.srtUrl}`}
                        download
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="h-3 w-3" /> {t("subtitle.downloadSrt")}
                      </a>
                      <a
                        href={`${subtitleResult.vttUrl}`}
                        download
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <Download className="h-3 w-3" /> {t("subtitle.downloadVtt")}
                      </a>
                    </div>
                  </div>
                )}
                {!subtitleResult && !subtitleMutation.isPending && (
                  <p className="text-xs text-muted-foreground">{t("subtitle.desc")}</p>
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

              {/* Post-Production Tools */}
              {selectedVideo.status === "PROCESSED" && (
                <PostProductionTab videoId={selectedVideo.id} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description")}
        confirmLabel={t("deleteDialog.confirm")}
        variant="destructive"
        loading={deleteVideo.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteVideo.mutate(deleteId, {
              onSuccess: () => { toast.success(t("toast.videoDeleted")); setDeleteId(null); },
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
  const t = useTranslations("videos");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("教學");
  const [targetLength, setTargetLength] = useState("10");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) { toast.error(t("toast.enterTopic")); return; }
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
      toast.error(e instanceof Error ? e.message : t("toast.generateFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (script) {
      navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success(t("toast.scriptCopied"));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setScript(null); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            {t("scriptDialog.title")}
          </DialogTitle>
        </DialogHeader>

        {!script ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
              <p className="text-sm text-orange-900 dark:text-orange-200">
                {t("scriptDialog.desc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("scriptDialog.topicLabel")}</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("scriptDialog.topicPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("scriptDialog.styleLabel")}</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="教學">{t("scriptDialog.styleTutorial")}</SelectItem>
                    <SelectItem value="Vlog">{t("scriptDialog.styleVlog")}</SelectItem>
                    <SelectItem value="開箱評測">{t("scriptDialog.styleUnboxing")}</SelectItem>
                    <SelectItem value="故事敘事">{t("scriptDialog.styleStory")}</SelectItem>
                    <SelectItem value="排行榜">{t("scriptDialog.styleRanking")}</SelectItem>
                    <SelectItem value="挑戰">{t("scriptDialog.styleChallenge")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("scriptDialog.lengthLabel")}</Label>
                <Select value={targetLength} onValueChange={setTargetLength}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("scriptDialog.length1")}</SelectItem>
                    <SelectItem value="5">{t("scriptDialog.length5")}</SelectItem>
                    <SelectItem value="10">{t("scriptDialog.length10")}</SelectItem>
                    <SelectItem value="15">{t("scriptDialog.length15")}</SelectItem>
                    <SelectItem value="20">{t("scriptDialog.length20")}</SelectItem>
                    <SelectItem value="30">{t("scriptDialog.length30")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("scriptDialog.audienceLabel")}</Label>
              <Input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={t("scriptDialog.audiencePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("scriptDialog.notesLabel")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("scriptDialog.notesPlaceholder")}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !topic.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("scriptDialog.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("scriptDialog.generateBtn")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-orange-700">
                {t("scriptDialog.resultBadge", { topic, style, length: targetLength })}
              </Badge>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="mr-1 h-3 w-3 text-green-600" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? t("common.copied") : t("common.copy")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setScript(null)}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  {t("common.regenerate")}
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
