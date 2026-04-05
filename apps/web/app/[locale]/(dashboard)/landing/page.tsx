"use client";

import { useState } from "react";
import {
  Globe, Sparkles, Eye, Pencil, Palette, Link2, ExternalLink,
  Loader2, Copy, Check, Layout, Type, Image, MousePointer,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface LandingPage {
  id: string;
  slug: string;
  title: string;
  headline: string | null;
  subheadline: string | null;
  bio: string | null;
  theme: string;
  colorScheme: { primary?: string; secondary?: string; accent?: string; background?: string } | null;
  socialLinks: Array<{ platform: string; url: string }>;
  ctaButtons: Array<{ label: string; url: string; style?: string }>;
  sections: Array<{ type: string; title?: string; content?: string; items?: any[] }>;
  isPublished: boolean;
  viewCount: number;
  createdAt: string;
}

export default function LandingPageEditor() {
  const t = useTranslations("landing");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [niche, setNiche] = useState("");
  const [description, setDescription] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const THEMES = [
    { value: "modern", label: t("themes.modern") },
    { value: "minimal", label: t("themes.minimal") },
    { value: "bold", label: t("themes.bold") },
    { value: "creative", label: t("themes.creative") },
  ];

  const NICHES = [
    t("niches.tech"), t("niches.food"), t("niches.travel"), t("niches.education"),
    t("niches.lifestyle"), t("niches.entertainment"), t("niches.business"),
    t("niches.design"), t("niches.health"), t("niches.music"),
  ];

  const { data: page, isLoading } = useQuery({
    queryKey: ["landing-page"],
    queryFn: () => api<LandingPage | null>("/v1/landing-page/mine"),
  });

  const generateMutation = useMutation({
    mutationFn: (data: { creatorName: string; niche: string; description?: string }) =>
      api<LandingPage>("/v1/landing-page/ai-generate", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landing-page"] });
      setGenerateOpen(false);
      toast.success(t("toast.generated"));
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<LandingPage>) =>
      api<LandingPage>(`/v1/landing-page/${page?.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landing-page"] });
      toast.success(t("toast.updated"));
    },
    onError: (e) => toast.error(e.message),
  });

  const publicUrl = page ? `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"}/p/${page.slug}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success(t("toast.linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No page yet — show generate CTA
  if (!page) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />

        <div className="rounded-lg border border-dashed p-12 text-center">
          <Globe className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">{t("pageDescription")}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {t("emptyState.description")}
          </p>
          <Button size="lg" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="mr-2 h-5 w-5" />
            {t("emptyState.generateButton")}
          </Button>
        </div>

        {/* Generate Dialog */}
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> {t("generateDialog.title")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("generateDialog.nameLabel")}</Label>
                <Input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder={t("generateDialog.namePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("generateDialog.nicheLabel")}</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger><SelectValue placeholder={t("generateDialog.nichePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("generateDialog.descriptionLabel")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("generateDialog.descriptionPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateOpen(false)}>{t("generateDialog.cancel")}</Button>
              <Button
                onClick={() => generateMutation.mutate({ creatorName, niche, description })}
                disabled={!creatorName || !niche || generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("generateDialog.generating")}</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> {t("generateDialog.startGenerate")}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Page exists — show editor
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("editor.viewCount", { slug: page.slug, count: page.viewCount })}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {t("editor.copyLink")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-1 h-4 w-4" /> {t("editor.preview")}
            </Button>
            <Button
              size="sm"
              variant={page.isPublished ? "outline" : "default"}
              onClick={() => updateMutation.mutate({ isPublished: !page.isPublished })}
            >
              {page.isPublished ? t("editor.unpublish") : t("editor.publish")}
            </Button>
          </div>
        }
      />

      {/* Status */}
      <div className="flex items-center gap-3">
        <Badge variant={page.isPublished ? "default" : "secondary"}>
          {page.isPublished ? t("editor.statusPublished") : t("editor.statusDraft")}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {t("editor.theme", { theme: THEMES.find(th => th.value === page.theme)?.label ?? page.theme })}
        </span>
        {page.isPublished && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
            {t("editor.viewPublicPage")} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Content Editor Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Headline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Type className="h-4 w-4" /> {t("editor.headlineTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("editor.mainHeadline")}</Label>
              <Input
                defaultValue={page.headline ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== page.headline) updateMutation.mutate({ headline: e.target.value });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("editor.subHeadline")}</Label>
              <Input
                defaultValue={page.subheadline ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== page.subheadline) updateMutation.mutate({ subheadline: e.target.value });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bio */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4" /> {t("editor.bioTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              defaultValue={page.bio ?? ""}
              rows={4}
              onBlur={(e) => {
                if (e.target.value !== page.bio) updateMutation.mutate({ bio: e.target.value });
              }}
            />
          </CardContent>
        </Card>

        {/* Theme & Colors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" /> {t("editor.themeColorTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select defaultValue={page.theme} onValueChange={(v) => updateMutation.mutate({ theme: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {THEMES.map((th) => (
                  <SelectItem key={th.value} value={th.value}>{th.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {page.colorScheme && (
              <div className="flex gap-2">
                {Object.entries(page.colorScheme).map(([key, color]) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: color as string }} />
                    <span className="text-xs text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CTA Buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MousePointer className="h-4 w-4" /> {t("editor.ctaTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(page.ctaButtons ?? []).map((btn, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <Badge variant={btn.style === "primary" ? "default" : "outline"}>
                    {btn.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{btn.url}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layout className="h-4 w-4" /> {t("editor.sectionsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(page.sections ?? []).map((section: any, i: number) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs uppercase">{section.type}</Badge>
                    <span className="text-sm font-medium">{section.title || t("editor.unnamedSection")}</span>
                  </div>
                </div>
                {section.content && (
                  <p className="text-sm text-muted-foreground">{section.content}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editor.previewTitle")}</DialogTitle>
          </DialogHeader>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ backgroundColor: (page.colorScheme as any)?.background ?? '#ffffff' }}
          >
            {/* Hero */}
            <div className="p-8 text-center" style={{ background: `linear-gradient(135deg, ${(page.colorScheme as any)?.primary ?? '#7c3aed'}, ${(page.colorScheme as any)?.secondary ?? '#2563eb'})` }}>
              <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-white/20 flex items-center justify-center text-3xl text-white font-bold">
                {page.title?.charAt(0) ?? "C"}
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">{page.headline}</h1>
              <p className="text-white/80">{page.subheadline}</p>
              <div className="mt-4 flex justify-center gap-3">
                {(page.ctaButtons ?? []).map((btn, i) => (
                  <button
                    key={i}
                    className={`rounded-full px-6 py-2 text-sm font-medium ${btn.style === 'primary' ? 'bg-white text-gray-900' : 'border border-white/50 text-white'}`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            {page.bio && (
              <div className="p-6 text-center">
                <p className="text-sm leading-relaxed text-gray-600 max-w-lg mx-auto">{page.bio}</p>
              </div>
            )}

            {/* Sections */}
            {(page.sections ?? []).map((section: any, i: number) => (
              <div key={i} className="px-6 py-4 border-t">
                <h3 className="text-lg font-semibold mb-2">{section.title}</h3>
                <p className="text-sm text-gray-600">{section.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
