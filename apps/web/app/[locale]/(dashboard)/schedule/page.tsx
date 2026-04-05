"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Calendar, Send, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  usePosts,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  usePublishNow,
  useAiGeneratePost,
} from "@/hooks/use-posts";
import { useVideos, useVideoClips } from "@/hooks/use-videos";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Post } from "@/lib/types";

const platformOptions = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TWITTER", label: "Twitter" },
  { value: "THREADS", label: "Threads" },
];

export default function SchedulePage() {
  const t = useTranslations("schedule");

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    DRAFT: { label: t("status.draft"), variant: "outline" },
    SCHEDULED: { label: t("status.scheduled"), variant: "default" },
    PUBLISHING: { label: t("status.publishing"), variant: "secondary" },
    PUBLISHED: { label: t("status.published"), variant: "secondary" },
    FAILED: { label: t("status.failed"), variant: "destructive" },
    CANCELLED: { label: t("status.cancelled"), variant: "outline" },
  };

  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editPost, setEditPost] = useState<Post | null>(null);

  // Form state
  const [contentText, setContentText] = useState("");
  const [platform, setPlatform] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedClipId, setSelectedClipId] = useState("");

  // Video & clip data for the selector
  const { data: videosData } = useVideos();
  const { data: clipsData } = useVideoClips(selectedVideoId || undefined);

  const statusFilter = tab === "all" ? undefined : tab.toUpperCase();
  const { data, isLoading } = usePosts({ status: statusFilter });
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();
  const publishNow = usePublishNow();
  const aiGenerate = useAiGeneratePost();

  const posts = data?.items ?? [];

  const resetForm = () => {
    setContentText("");
    setPlatform("");
    setScheduledAt("");
    setSelectedVideoId("");
    setSelectedClipId("");
  };

  const handleCreate = () => {
    if (!platform) {
      toast.error(t("toast.selectPlatform"));
      return;
    }
    createPost.mutate(
      {
        contentText: contentText || undefined,
        platforms: [{ platform }],
        clipId: selectedClipId || undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("toast.postCreated"));
          setCreateOpen(false);
          resetForm();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleAiGenerate = () => {
    if (!platform) {
      toast.error(t("toast.selectPlatformFirst"));
      return;
    }
    aiGenerate.mutate(
      { platforms: [platform], tone: "professional", clipId: selectedClipId || undefined },
      {
        onSuccess: (result) => {
          setContentText(result.content);
          toast.success(t("toast.aiGenerated"));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const openEdit = (post: Post) => {
    setEditPost(post);
    setContentText(post.contentText || "");
    setPlatform(post.platforms?.[0]?.platform || "");
    setScheduledAt(post.scheduledAt ? post.scheduledAt.slice(0, 16) : "");
  };

  const handleUpdate = () => {
    if (!editPost) return;
    updatePost.mutate(
      {
        id: editPost.id,
        data: {
          contentText: contentText || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(t("toast.postUpdated"));
          setEditPost(null);
          resetForm();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addPost")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
          <TabsTrigger value="draft">{t("tabs.draft")}</TabsTrigger>
          <TabsTrigger value="scheduled">{t("tabs.scheduled")}</TabsTrigger>
          <TabsTrigger value="published">{t("tabs.published")}</TabsTrigger>
          <TabsTrigger value="failed">{t("tabs.failed")}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : !posts.length ? (
            <EmptyState
              icon={Calendar}
              title={t("empty.title")}
              description={t("empty.description")}
              actionLabel={t("addPost")}
              onAction={() => { resetForm(); setCreateOpen(true); }}
            />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const status = statusLabels[post.status] ?? { label: post.status, variant: "outline" as const };
                const canEdit = ["DRAFT", "SCHEDULED"].includes(post.status);
                const platformLabel = post.platforms?.map((p) => p.platform).join(", ") || "—";
                return (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {post.contentText?.slice(0, 60) || t("noContent")}
                        </p>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant="outline">{platformLabel}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {post.scheduledAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(post.scheduledAt).toLocaleString("zh-TW")}
                          </span>
                        )}
                        <span>{new Date(post.createdAt).toLocaleDateString("zh-TW")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(post)}>
                            {t("actions.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              publishNow.mutate(post.id, {
                                onSuccess: () => toast.success(t("toast.published")),
                                onError: (e) => toast.error(e.message),
                              });
                            }}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(post.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog
        open={createOpen || !!editPost}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditPost(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editPost ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("form.platform")}</Label>
              <Select value={platform} onValueChange={setPlatform} disabled={!!editPost}>
                <SelectTrigger>
                  <SelectValue placeholder={t("form.selectPlatform")} />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Video & Clip selector — required for YouTube */}
            {!editPost && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("form.videoOptional")}</Label>
                  <Select
                    value={selectedVideoId}
                    onValueChange={(v) => { setSelectedVideoId(v); setSelectedClipId(""); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("form.selectVideo")} />
                    </SelectTrigger>
                    <SelectContent>
                      {videosData?.data?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.title} ({v.durationSeconds ?? 0}s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("form.clip")}</Label>
                  <Select
                    value={selectedClipId}
                    onValueChange={setSelectedClipId}
                    disabled={!selectedVideoId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedVideoId ? t("form.selectClip") : t("form.selectVideoFirst")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clipsData?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title} ({c.durationSeconds ?? 0}s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("form.content")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiGenerate.isPending}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {aiGenerate.isPending ? t("form.aiGenerating") : t("form.aiGenerate")}
                </Button>
              </div>
              <Textarea
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder={t("form.contentPlaceholder")}
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("form.scheduledAtOptional")}</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditPost(null);
                resetForm();
              }}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={editPost ? handleUpdate : handleCreate}
              disabled={createPost.isPending || updatePost.isPending}
            >
              {(createPost.isPending || updatePost.isPending) ? t("actions.processing") : editPost ? t("actions.update") : t("actions.create")}
            </Button>
          </DialogFooter>
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
        loading={deletePost.isPending}
        onConfirm={() => {
          if (deleteId) {
            deletePost.mutate(deleteId, {
              onSuccess: () => {
                toast.success(t("toast.postDeleted"));
                setDeleteId(null);
              },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
