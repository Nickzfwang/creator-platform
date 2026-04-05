"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Users, Send, Sparkles, Loader2, Trash2, Eye, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  useEmailStats, useSubscribers, useAddSubscriber,
  useCampaigns, useCampaign, useDeleteCampaign,
  useSendCampaign, useAiGenerateSequence, useAiGenerateSingle,
} from "@/hooks/use-email";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function EmailPage() {
  const t = useTranslations("email");
  const { data: stats } = useEmailStats();
  const { data: subsData } = useSubscribers();
  const { data: campaigns } = useCampaigns();
  const addSubscriber = useAddSubscriber();
  const deleteCampaign = useDeleteCampaign();
  const sendCampaign = useSendCampaign();
  const aiSequence = useAiGenerateSequence();
  const aiSingle = useAiGenerateSingle();

  const [addSubOpen, setAddSubOpen] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [subName, setSubName] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ purpose: "", productName: "", tone: t("toneOptions.friendlyProfessional"), emailCount: 3 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sendId, setSendId] = useState<string | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<{ subject: string; body: string } | null>(null);

  const campaignDetail = useCampaign(previewCampaign ?? undefined);

  const handleAddSub = () => {
    if (!subEmail.trim()) return toast.error(t("validation.emailRequired"));
    addSubscriber.mutate(
      { email: subEmail, name: subName || undefined },
      {
        onSuccess: () => { toast.success(t("toast.subscriberAdded")); setAddSubOpen(false); setSubEmail(""); setSubName(""); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleGenSequence = () => {
    if (!genForm.purpose.trim()) return toast.error(t("validation.purposeRequired"));
    aiSequence.mutate(genForm, {
      onSuccess: (res) => {
        toast.success(t("toast.aiSequenceGenerated", { count: res.emails.length }));
        setGenOpen(false);
        setPreviewCampaign(res.id);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddSubOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t("actions.addSubscriber")}
            </Button>
            <Button onClick={() => setGenOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" /> {t("actions.aiGenerateSequence")}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900"><Users className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-xs text-muted-foreground">{t("stats.subscribers")}</p><p className="text-xl font-bold">{stats?.activeSubscribers ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900"><Send className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">{t("stats.sent")}</p><p className="text-xl font-bold">{stats?.totalSent ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900"><Eye className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">{t("stats.avgOpenRate")}</p><p className="text-xl font-bold">{stats?.averageOpenRate ?? 0}%</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900"><Zap className="h-5 w-5 text-purple-600" /></div>
            <div><p className="text-xs text-muted-foreground">{t("stats.campaigns")}</p><p className="text-xl font-bold">{stats?.totalCampaigns ?? 0}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">{t("tabs.campaigns")}</TabsTrigger>
          <TabsTrigger value="subscribers">{t("tabs.subscribers")}</TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          {!campaigns?.length ? (
            <EmptyState
              icon={Mail}
              title={t("empty.campaignsTitle")}
              description={t("empty.campaignsDescription")}
              actionLabel={t("empty.campaignsAction")}
              onAction={() => setGenOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setPreviewCampaign(c.id)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Mail className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">{c.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {t("campaign.emailCount", { count: c._count.emails })} · {c.type === "SEQUENCE" ? t("campaign.typeSequence") : t("campaign.typeSingle")} · {new Date(c.createdAt).toLocaleDateString("zh-TW")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === "SENT" ? "default" : c.status === "SCHEDULED" ? "secondary" : "outline"}>
                          {c.status === "DRAFT" ? t("campaign.statusDraft") : c.status === "SENT" ? t("campaign.statusSent") : t("campaign.statusScheduled")}
                        </Badge>
                        {c.status === "SENT" && (
                          <span className="text-xs text-muted-foreground">
                            {t("campaign.sentStats", { sent: c.sentCount, opened: c.openCount, clicked: c.clickCount })}
                          </span>
                        )}
                        {c.status === "DRAFT" && (
                          <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSendId(c.id); }}>
                            <Send className="mr-1 h-3 w-3" /> {t("actions.send")}
                          </Button>
                        )}
                        {c.status === "SENDING" && (
                          <Badge variant="secondary" className="text-xs">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t("campaign.statusSending")}
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="space-y-4">
          {!subsData?.subscribers?.length ? (
            <EmptyState
              icon={Users}
              title={t("empty.subscribersTitle")}
              description={t("empty.subscribersDescription")}
              actionLabel={t("actions.addSubscriber")}
              onAction={() => setAddSubOpen(true)}
            />
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">{t("subscriber.name")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("subscriber.source")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("subscriber.status")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("subscriber.joinDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {subsData.subscribers.map((sub) => (
                    <tr key={sub.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{sub.email}</td>
                      <td className="px-4 py-2">{sub.name || "—"}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{sub.source || "manual"}</Badge></td>
                      <td className="px-4 py-2">
                        <Badge variant={sub.isActive ? "default" : "secondary"} className="text-xs">
                          {sub.isActive ? t("subscriber.active") : t("subscriber.unsubscribed")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(sub.createdAt).toLocaleDateString("zh-TW")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Subscriber Dialog */}
      <Dialog open={addSubOpen} onOpenChange={setAddSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dialog.addSubscriberTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="fan@example.com" />
            </div>
            <div className="space-y-2">
              <Label>{t("dialog.nameLabel")}</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder={t("dialog.namePlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={handleAddSub} disabled={addSubscriber.isPending}>
              {addSubscriber.isPending ? t("actions.adding") : t("actions.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate Sequence Dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> {t("dialog.aiGenerateTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("dialog.purposeLabel")}</Label>
              <Input value={genForm.purpose} onChange={(e) => setGenForm({ ...genForm, purpose: e.target.value })} placeholder={t("dialog.purposePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("dialog.productNameLabel")}</Label>
              <Input value={genForm.productName} onChange={(e) => setGenForm({ ...genForm, productName: e.target.value })} placeholder={t("dialog.productNamePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("dialog.toneLabel")}</Label>
                <Select value={genForm.tone} onValueChange={(v) => setGenForm({ ...genForm, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={t("toneOptions.friendlyProfessional")}>{t("toneOptions.friendlyProfessional")}</SelectItem>
                    <SelectItem value={t("toneOptions.enthusiastic")}>{t("toneOptions.enthusiastic")}</SelectItem>
                    <SelectItem value={t("toneOptions.formalAuthoritative")}>{t("toneOptions.formalAuthoritative")}</SelectItem>
                    <SelectItem value={t("toneOptions.casualHumorous")}>{t("toneOptions.casualHumorous")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("dialog.emailCountLabel")}</Label>
                <Select value={String(genForm.emailCount)} onValueChange={(v) => setGenForm({ ...genForm, emailCount: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">{t("dialog.emailCount3")}</SelectItem>
                    <SelectItem value="5">{t("dialog.emailCount5")}</SelectItem>
                    <SelectItem value="7">{t("dialog.emailCount7")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> {t("dialog.aiFunnelHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={handleGenSequence} disabled={aiSequence.isPending}>
              {aiSequence.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {t("actions.aiGenerating")}</> : t("actions.generateSequence")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Preview Dialog */}
      <Dialog open={!!previewCampaign} onOpenChange={() => setPreviewCampaign(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> {campaignDetail.data?.name}
            </DialogTitle>
          </DialogHeader>
          {campaignDetail.data?.emails && (
            <div className="space-y-4">
              {campaignDetail.data.emails.map((email, i) => (
                <div key={email.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{t("preview.emailIndex", { index: i + 1 })}</Badge>
                      {email.delayDays > 0 && (
                        <span className="text-xs text-muted-foreground">{t("preview.sendOnDay", { day: email.delayDays })}</span>
                      )}
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold mb-2">{email.subject}</h4>
                  <div
                    className="prose prose-sm max-w-none text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: email.body }}
                  />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Confirm */}
      <ConfirmDialog
        open={!!sendId}
        onOpenChange={() => setSendId(null)}
        title={t("confirm.sendTitle")}
        description={t("confirm.sendDescription")}
        confirmLabel={t("confirm.sendConfirmLabel")}
        loading={sendCampaign.isPending}
        onConfirm={() => {
          if (sendId) {
            sendCampaign.mutate(sendId, {
              onSuccess: (res) => {
                toast.success(t("toast.sendQueued", { subscriberCount: res.subscriberCount, emailCount: res.emailCount }));
                setSendId(null);
              },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDescription")}
        confirmLabel={t("confirm.deleteConfirmLabel")}
        variant="destructive"
        loading={deleteCampaign.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteCampaign.mutate(deleteId, {
              onSuccess: () => { toast.success(t("toast.deleted")); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
