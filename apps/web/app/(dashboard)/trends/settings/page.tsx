"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Hash,
  Plus,
  Trash2,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

interface Keyword {
  id: string;
  keyword: string;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
}

interface TrendSettings {
  inAppKeywordHit: boolean;
  inAppViralAlert: boolean;
  inAppDailySummary: boolean;
  emailKeywordHit: boolean;
  emailViralAlert: boolean;
  emailDailySummary: boolean;
}

const MAX_KEYWORDS = 20;

const notificationOptions: {
  key: keyof TrendSettings;
  label: string;
  group: string;
}[] = [
  { key: "inAppKeywordHit", label: "關鍵字命中", group: "站內通知" },
  { key: "inAppViralAlert", label: "爆紅警報", group: "站內通知" },
  { key: "inAppDailySummary", label: "每日摘要", group: "站內通知" },
  { key: "emailKeywordHit", label: "關鍵字命中", group: "Email 通知" },
  { key: "emailViralAlert", label: "爆紅警報", group: "Email 通知" },
  { key: "emailDailySummary", label: "每日摘要", group: "Email 通知" },
];

export default function TrendSettingsPage() {
  const [newKeyword, setNewKeyword] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // --- Keywords ---
  const { data: keywords = [], isLoading: keywordsLoading } = useQuery({
    queryKey: ["trends", "keywords"],
    queryFn: () => api<Keyword[]>("/v1/trends/keywords"),
  });

  const addKeywordMutation = useMutation({
    mutationFn: (keyword: string) =>
      api<Keyword>("/v1/trends/keywords", {
        method: "POST",
        body: JSON.stringify({ keyword }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trends", "keywords"] });
      setNewKeyword("");
      toast.success("關鍵字已新增");
    },
    onError: () => toast.error("新增關鍵字失敗"),
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/trends/keywords/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trends", "keywords"] });
      setDeletingId(null);
      toast.success("關鍵字已刪除");
    },
    onError: () => {
      setDeletingId(null);
      toast.error("刪除關鍵字失敗");
    },
  });

  // --- Settings ---
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["trends", "settings"],
    queryFn: () => api<TrendSettings>("/v1/trends/settings"),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (patch: Partial<TrendSettings>) =>
      api<TrendSettings>("/v1/trends/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["trends", "settings"], data);
      toast.success("設定已儲存");
    },
    onError: () => toast.error("更新設定失敗"),
  });

  function handleAddKeyword() {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (keywords.length >= MAX_KEYWORDS) {
      toast.error(`最多只能新增 ${MAX_KEYWORDS} 個關鍵字`);
      return;
    }
    addKeywordMutation.mutate(trimmed);
  }

  function handleDeleteKeyword(id: string) {
    if (deletingId === id) {
      deleteKeywordMutation.mutate(id);
    } else {
      setDeletingId(id);
    }
  }

  function handleToggle(key: keyof TrendSettings, value: boolean) {
    updateSettingsMutation.mutate({ [key]: value });
  }

  const groupedOptions = notificationOptions.reduce(
    (acc, opt) => {
      if (!acc[opt.group]) acc[opt.group] = [];
      acc[opt.group].push(opt);
      return acc;
    },
    {} as Record<string, typeof notificationOptions>,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/trends"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回趨勢雷達
      </Link>

      <PageHeader
        title="趨勢設定"
        description="管理追蹤關鍵字和通知偏好"
      />

      {/* Keywords Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-5 w-5 text-blue-600" />
            追蹤關鍵字
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add keyword input */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="輸入關鍵字..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddKeyword();
              }}
              disabled={addKeywordMutation.isPending}
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleAddKeyword}
              disabled={
                !newKeyword.trim() ||
                addKeywordMutation.isPending ||
                keywords.length >= MAX_KEYWORDS
              }
            >
              {addKeywordMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              新增
            </Button>
          </div>

          {/* Quota */}
          <p className="text-xs text-muted-foreground">
            {keywords.length} / {MAX_KEYWORDS} 個關鍵字
          </p>

          {/* Keyword tags */}
          {keywordsLoading ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : keywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              尚未設定追蹤關鍵字，新增關鍵字後系統會自動追蹤相關趨勢。
            </p>
          ) : (
            <div className="space-y-2">
              {keywords.map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{kw.keyword}</Badge>
                    <span className="text-xs text-muted-foreground">
                      命中 {kw.hitCount} 次
                    </span>
                    {kw.lastHitAt && (
                      <span className="text-xs text-muted-foreground">
                        最後命中：
                        {new Date(kw.lastHitAt).toLocaleDateString("zh-TW")}
                      </span>
                    )}
                  </div>
                  <Button
                    variant={deletingId === kw.id ? "destructive" : "ghost"}
                    size="sm"
                    onClick={() => handleDeleteKeyword(kw.id)}
                    onBlur={() => setDeletingId(null)}
                    disabled={deleteKeywordMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingId === kw.id && (
                      <span className="ml-1">確認刪除</span>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-5 w-5 text-amber-600" />
            通知偏好
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : (
            Object.entries(groupedOptions).map(([group, options]) => (
              <div key={group} className="space-y-3">
                <h3 className="text-sm font-semibold">{group}</h3>
                <div className="space-y-3">
                  {options.map((opt) => (
                    <div
                      key={opt.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-muted-foreground">
                        {opt.label}
                      </span>
                      <Switch
                        checked={settings?.[opt.key] ?? false}
                        onCheckedChange={(checked) =>
                          handleToggle(opt.key, checked)
                        }
                        disabled={updateSettingsMutation.isPending}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
