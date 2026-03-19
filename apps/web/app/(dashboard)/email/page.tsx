"use client";

import { useState } from "react";
import { Mail, Users, Send, Sparkles, Loader2, Trash2, Eye, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  useEmailStats, useSubscribers, useAddSubscriber,
  useCampaigns, useCampaign, useDeleteCampaign,
  useAiGenerateSequence, useAiGenerateSingle,
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
  const { data: stats } = useEmailStats();
  const { data: subsData } = useSubscribers();
  const { data: campaigns } = useCampaigns();
  const addSubscriber = useAddSubscriber();
  const deleteCampaign = useDeleteCampaign();
  const aiSequence = useAiGenerateSequence();
  const aiSingle = useAiGenerateSingle();

  const [addSubOpen, setAddSubOpen] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [subName, setSubName] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ purpose: "", productName: "", tone: "親切專業", emailCount: 3 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<{ subject: string; body: string } | null>(null);

  const campaignDetail = useCampaign(previewCampaign ?? undefined);

  const handleAddSub = () => {
    if (!subEmail.trim()) return toast.error("請輸入 Email");
    addSubscriber.mutate(
      { email: subEmail, name: subName || undefined },
      {
        onSuccess: () => { toast.success("已新增訂閱者"); setAddSubOpen(false); setSubEmail(""); setSubName(""); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleGenSequence = () => {
    if (!genForm.purpose.trim()) return toast.error("請輸入行銷目的");
    aiSequence.mutate(genForm, {
      onSuccess: (res) => {
        toast.success(`AI 已生成 ${res.emails.length} 封郵件序列`);
        setGenOpen(false);
        setPreviewCampaign(res.id);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Email 行銷"
        description="AI 自動生成郵件序列，管理訂閱者名單"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddSubOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> 新增訂閱者
            </Button>
            <Button onClick={() => setGenOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" /> AI 生成郵件序列
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900"><Users className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-xs text-muted-foreground">訂閱者</p><p className="text-xl font-bold">{stats?.activeSubscribers ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900"><Send className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">已發送</p><p className="text-xl font-bold">{stats?.totalSent ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900"><Eye className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">平均開信率</p><p className="text-xl font-bold">{stats?.averageOpenRate ?? 0}%</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900"><Zap className="h-5 w-5 text-purple-600" /></div>
            <div><p className="text-xs text-muted-foreground">行銷活動</p><p className="text-xl font-bold">{stats?.totalCampaigns ?? 0}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">郵件活動</TabsTrigger>
          <TabsTrigger value="subscribers">訂閱者名單</TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          {!campaigns?.length ? (
            <EmptyState
              icon={Mail}
              title="尚無郵件活動"
              description="讓 AI 幫你生成完整的郵件行銷序列：歡迎信 → 培養信 → 銷售信"
              actionLabel="AI 生成序列"
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
                            {c._count.emails} 封信 · {c.type === "SEQUENCE" ? "自動序列" : "單封"} · {new Date(c.createdAt).toLocaleDateString("zh-TW")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === "SENT" ? "default" : c.status === "SCHEDULED" ? "secondary" : "outline"}>
                          {c.status === "DRAFT" ? "草稿" : c.status === "SENT" ? "已發送" : "已排程"}
                        </Badge>
                        {c.status === "SENT" && (
                          <span className="text-xs text-muted-foreground">
                            {c.sentCount} 寄 · {c.openCount} 開 · {c.clickCount} 點
                          </span>
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
              title="尚無訂閱者"
              description="新增訂閱者到你的郵件名單"
              actionLabel="新增訂閱者"
              onAction={() => setAddSubOpen(true)}
            />
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">姓名</th>
                    <th className="px-4 py-2 text-left font-medium">來源</th>
                    <th className="px-4 py-2 text-left font-medium">狀態</th>
                    <th className="px-4 py-2 text-left font-medium">加入日期</th>
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
                          {sub.isActive ? "活躍" : "取消"}
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
          <DialogHeader><DialogTitle>新增訂閱者</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="fan@example.com" />
            </div>
            <div className="space-y-2">
              <Label>姓名（選填）</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="粉絲名字" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubOpen(false)}>取消</Button>
            <Button onClick={handleAddSub} disabled={addSubscriber.isPending}>
              {addSubscriber.isPending ? "新增中..." : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate Sequence Dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI 生成郵件序列</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>行銷目的</Label>
              <Input value={genForm.purpose} onChange={(e) => setGenForm({ ...genForm, purpose: e.target.value })} placeholder="例：推廣新線上課程、歡迎新會員、限時優惠" />
            </div>
            <div className="space-y-2">
              <Label>商品名稱（選填）</Label>
              <Input value={genForm.productName} onChange={(e) => setGenForm({ ...genForm, productName: e.target.value })} placeholder="例：Lightroom Preset 套組" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>語氣</Label>
                <Select value={genForm.tone} onValueChange={(v) => setGenForm({ ...genForm, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="親切專業">親切專業</SelectItem>
                    <SelectItem value="熱情活潑">熱情活潑</SelectItem>
                    <SelectItem value="正式權威">正式權威</SelectItem>
                    <SelectItem value="輕鬆幽默">輕鬆幽默</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>郵件數量</Label>
                <Select value={String(genForm.emailCount)} onValueChange={(v) => setGenForm({ ...genForm, emailCount: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 封（基本）</SelectItem>
                    <SelectItem value="5">5 封（標準）</SelectItem>
                    <SelectItem value="7">7 封（完整）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI 將生成完整的自動化郵件漏斗：歡迎 → 培養 → 銷售
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>取消</Button>
            <Button onClick={handleGenSequence} disabled={aiSequence.isPending}>
              {aiSequence.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> AI 生成中...</> : "生成序列"}
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
                      <Badge variant="outline" className="text-xs">第 {i + 1} 封</Badge>
                      {email.delayDays > 0 && (
                        <span className="text-xs text-muted-foreground">第 {email.delayDays} 天發送</span>
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除郵件活動"
        description="確定要刪除此郵件活動嗎？所有郵件模板也會一併刪除。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteCampaign.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteCampaign.mutate(deleteId, {
              onSuccess: () => { toast.success("已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
