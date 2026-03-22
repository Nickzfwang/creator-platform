"use client";

import { useState } from "react";
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

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "草稿", variant: "outline" },
  SCHEDULED: { label: "已排程", variant: "default" },
  PUBLISHING: { label: "發布中", variant: "secondary" },
  PUBLISHED: { label: "已發布", variant: "secondary" },
  FAILED: { label: "失敗", variant: "destructive" },
  CANCELLED: { label: "已取消", variant: "outline" },
};

const platformOptions = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TWITTER", label: "Twitter" },
  { value: "THREADS", label: "Threads" },
];

export default function SchedulePage() {
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
      toast.error("請選擇平台");
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
          toast.success("貼文已建立");
          setCreateOpen(false);
          resetForm();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleAiGenerate = () => {
    if (!platform) {
      toast.error("請先選擇平台");
      return;
    }
    aiGenerate.mutate(
      { platforms: [platform], tone: "professional", clipId: selectedClipId || undefined },
      {
        onSuccess: (result) => {
          setContentText(result.content);
          toast.success("AI 內容已生成");
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
          toast.success("貼文已更新");
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
        title="排程管理"
        description="建立、排程並管理跨平台社群貼文"
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            新增貼文
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="draft">草稿</TabsTrigger>
          <TabsTrigger value="scheduled">已排程</TabsTrigger>
          <TabsTrigger value="published">已發布</TabsTrigger>
          <TabsTrigger value="failed">失敗</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : !posts.length ? (
            <EmptyState
              icon={Calendar}
              title="尚無貼文"
              description="建立您的第一篇社群貼文"
              actionLabel="新增貼文"
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
                          {post.contentText?.slice(0, 60) || "無內容"}
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
                            編輯
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              publishNow.mutate(post.id, {
                                onSuccess: () => toast.success("已發布"),
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
            <DialogTitle>{editPost ? "編輯貼文" : "新增貼文"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>平台</Label>
              <Select value={platform} onValueChange={setPlatform} disabled={!!editPost}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇平台" />
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
                  <Label>影片（選填）</Label>
                  <Select
                    value={selectedVideoId}
                    onValueChange={(v) => { setSelectedVideoId(v); setSelectedClipId(""); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇影片" />
                    </SelectTrigger>
                    <SelectContent>
                      {videosData?.data?.map((v: { id: string; title: string; durationSeconds: number }) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.title} ({v.durationSeconds}s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>片段 Clip</Label>
                  <Select
                    value={selectedClipId}
                    onValueChange={setSelectedClipId}
                    disabled={!selectedVideoId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedVideoId ? "選擇片段" : "先選影片"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clipsData?.map((c: { id: string; title: string; durationSeconds: number }) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title} ({c.durationSeconds}s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>內容</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiGenerate.isPending}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {aiGenerate.isPending ? "生成中..." : "AI 生成"}
                </Button>
              </div>
              <Textarea
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder="貼文內容"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>排程時間（選填）</Label>
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
              取消
            </Button>
            <Button
              onClick={editPost ? handleUpdate : handleCreate}
              disabled={createPost.isPending || updatePost.isPending}
            >
              {(createPost.isPending || updatePost.isPending) ? "處理中..." : editPost ? "更新" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除貼文"
        description="確定要刪除此貼文嗎？此操作無法復原。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deletePost.isPending}
        onConfirm={() => {
          if (deleteId) {
            deletePost.mutate(deleteId, {
              onSuccess: () => {
                toast.success("貼文已刪除");
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
