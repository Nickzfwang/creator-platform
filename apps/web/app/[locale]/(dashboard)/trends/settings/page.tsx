"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  notifyKeywordHit: boolean;
  notifyViralAlert: boolean;
  notifyDailySummary: boolean;
  emailKeywordHit: boolean;
  emailViralAlert: boolean;
  emailDailySummary: boolean;
}

const MAX_KEYWORDS = 20;

const notificationOptions: {
  key: keyof TrendSettings;
  labelKey: string;
  groupKey: string;
}[] = [
  { key: "notifyKeywordHit", labelKey: "settings.keywordHit", groupKey: "settings.inAppNotify" },
  { key: "notifyViralAlert", labelKey: "settings.viralAlert", groupKey: "settings.inAppNotify" },
  { key: "notifyDailySummary", labelKey: "settings.dailySummary", groupKey: "settings.inAppNotify" },
  { key: "emailKeywordHit", labelKey: "settings.keywordHit", groupKey: "settings.emailNotify" },
  { key: "emailViralAlert", labelKey: "settings.viralAlert", groupKey: "settings.emailNotify" },
  { key: "emailDailySummary", labelKey: "settings.dailySummary", groupKey: "settings.emailNotify" },
];

export default function TrendSettingsPage() {
  const t = useTranslations("trends");
  const [newKeyword, setNewKeyword] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // --- Keywords ---
  const { data: keywordsData, isLoading: keywordsLoading } = useQuery({
    queryKey: ["trends", "keywords"],
    queryFn: () =>
      api<{ keywords: Keyword[]; quota: { used: number; max: number } }>(
        "/v1/trends/keywords",
      ),
  });
  const keywords = Array.isArray(keywordsData?.keywords) ? keywordsData.keywords : [];

  const addKeywordMutation = useMutation({
    mutationFn: (keyword: string) =>
      api<Keyword>("/v1/trends/keywords", {
        method: "POST",
        body: JSON.stringify({ keyword }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trends", "keywords"] });
      setNewKeyword("");
      toast.success(t("settings.keywordAdded"));
    },
    onError: () => toast.error(t("settings.keywordAddError")),
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/trends/keywords/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trends", "keywords"] });
      setDeletingId(null);
      toast.success(t("settings.keywordDeleted"));
    },
    onError: () => {
      setDeletingId(null);
      toast.error(t("settings.keywordDeleteError"));
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
      toast.success(t("settings.settingsSaved"));
    },
    onError: () => toast.error(t("settings.settingsUpdateError")),
  });

  function handleAddKeyword() {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (keywords.length >= MAX_KEYWORDS) {
      toast.error(t("settings.keywordLimitReached", { max: MAX_KEYWORDS }));
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
      if (!acc[opt.groupKey]) acc[opt.groupKey] = [];
      acc[opt.groupKey].push(opt);
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
        {t("backToTrends")}
      </Link>

      <PageHeader
        title={t("settings.pageTitle")}
        description={t("settings.pageDescription")}
      />

      {/* Keywords Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-5 w-5 text-blue-600" />
            {t("settings.trackedKeywords")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add keyword input */}
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("settings.keywordPlaceholder")}
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
              {t("settings.add")}
            </Button>
          </div>

          {/* Quota */}
          <p className="text-xs text-muted-foreground">
            {t("settings.keywordQuota", { used: keywords.length, max: MAX_KEYWORDS })}
          </p>

          {/* Keyword tags */}
          {keywordsLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : keywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.noKeywords")}
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
                      {t("settings.hitCount", { count: kw.hitCount })}
                    </span>
                    {kw.lastHitAt && (
                      <span className="text-xs text-muted-foreground">
                        {t("settings.lastHit", { date: new Date(kw.lastHitAt).toLocaleDateString("zh-TW") })}
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
                      <span className="ml-1">{t("settings.confirmDelete")}</span>
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
            {t("settings.notificationPreferences")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            Object.entries(groupedOptions).map(([groupKey, options]) => (
              <div key={groupKey} className="space-y-3">
                <h3 className="text-sm font-semibold">{t(groupKey)}</h3>
                <div className="space-y-3">
                  {options.map((opt) => (
                    <div
                      key={opt.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-muted-foreground">
                        {t(opt.labelKey)}
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
