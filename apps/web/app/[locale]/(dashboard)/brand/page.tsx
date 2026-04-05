"use client";

import { useState } from "react";
import { Plus, Trash2, Handshake, Sparkles, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  useBrandDeals,
  useCreateBrandDeal,
  useUpdateBrandDeal,
  useDeleteBrandDeal,
  usePipelineStats,
  useGenerateProposal,
} from "@/hooks/use-brand-deals";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatCard } from "@/components/stat-card";
import { CardsSkeleton, TableSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import type { BrandDeal } from "@/lib/types";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "草稿", variant: "outline" },
  PROPOSAL_SENT: { label: "已提案", variant: "secondary" },
  NEGOTIATING: { label: "洽談中", variant: "default" },
  CONFIRMED: { label: "已確認", variant: "default" },
  IN_PROGRESS: { label: "進行中", variant: "default" },
  COMPLETED: { label: "已完成", variant: "secondary" },
  CANCELLED: { label: "已取消", variant: "destructive" },
};

const dealTypes = [
  { value: "SPONSORED_POST", label: "贊助貼文" },
  { value: "BRAND_AMBASSADOR", label: "品牌大使" },
  { value: "PRODUCT_REVIEW", label: "產品評測" },
  { value: "AFFILIATE", label: "聯盟行銷" },
  { value: "EVENT", label: "活動合作" },
  { value: "OTHER", label: "其他" },
];

export default function BrandPage() {
  const { data, isLoading } = useBrandDeals();
  const { data: pipeline, isLoading: pipelineLoading } = usePipelineStats();
  const createDeal = useCreateBrandDeal();
  const updateDeal = useUpdateBrandDeal();
  const deleteDeal = useDeleteBrandDeal();
  const generateProposal = useGenerateProposal();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailDeal, setDetailDeal] = useState<BrandDeal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form
  const [brandName, setBrandName] = useState("");
  const [dealType, setDealType] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setBrandName(""); setDealType(""); setBudgetMin(""); setBudgetMax(""); setNotes("");
  };

  const handleCreate = () => {
    if (!brandName.trim() || !dealType) {
      toast.error("請填寫品牌名稱和合作類型");
      return;
    }
    createDeal.mutate(
      {
        brandName,
        dealType,
        budgetRange: budgetMin && budgetMax
          ? { min: Number(budgetMin), max: Number(budgetMax), currency: "TWD" }
          : undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => { toast.success("品牌合作已建立"); setCreateOpen(false); resetForm(); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleStatusChange = (deal: BrandDeal, newStatus: string) => {
    updateDeal.mutate(
      { id: deal.id, data: { status: newStatus } },
      {
        onSuccess: (updated) => {
          toast.success("狀態已更新");
          setDetailDeal(updated);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleGenProposal = (dealId: string) => {
    generateProposal.mutate(
      { dealId, tone: "professional" },
      {
        onSuccess: () => toast.success("提案已生成"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const activeDeals = pipeline?.activeDeals ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="品牌合作"
        description="管理品牌合作邀約和提案"
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            新增合作
          </Button>
        }
      />

      {/* Pipeline Stats */}
      {pipelineLoading ? (
        <CardsSkeleton count={3} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="進行中案件" value={activeDeals} icon={Handshake} />
          <StatCard
            label="已完成案件"
            value={pipeline?.pipeline?.COMPLETED ?? 0}
            icon={TrendingUp}
          />
          <StatCard
            label="總收入"
            value={`NT$${(pipeline?.totalRevenue ?? 0).toLocaleString()}`}
            icon={DollarSign}
          />
        </div>
      )}

      {/* Deal List */}
      {isLoading ? (
        <TableSkeleton />
      ) : !data?.data?.length ? (
        <EmptyState
          icon={Handshake}
          title="尚無品牌合作"
          description="新增品牌合作案件，追蹤從提案到結案的完整流程"
          actionLabel="新增合作"
          onAction={() => { resetForm(); setCreateOpen(true); }}
        />
      ) : (
        <div className="space-y-3">
          {data.data.map((deal) => {
            const status = statusLabels[deal.status] ?? { label: deal.status, variant: "outline" as const };
            return (
              <Card
                key={deal.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setDetailDeal(deal)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{deal.brandName}</p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{dealTypes.find((d) => d.value === deal.dealType)?.label ?? deal.dealType}</span>
                      {deal.budgetRange && (
                        <span>
                          NT${deal.budgetRange.min.toLocaleString()} - {deal.budgetRange.max.toLocaleString()}
                        </span>
                      )}
                      <span>{new Date(deal.createdAt).toLocaleDateString("zh-TW")}</span>
                    </div>
                  </div>
                  {deal.actualRevenue !== null && deal.actualRevenue > 0 && (
                    <p className="text-sm font-medium text-green-600">
                      NT${deal.actualRevenue.toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增品牌合作</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>品牌名稱</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="品牌名稱" />
            </div>
            <div className="space-y-2">
              <Label>合作類型</Label>
              <Select value={dealType} onValueChange={setDealType}>
                <SelectTrigger><SelectValue placeholder="選擇類型" /></SelectTrigger>
                <SelectContent>
                  {dealTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>預算下限 (NT$)</Label>
                <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>預算上限 (NT$)</Label>
                <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>備註</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={createDeal.isPending}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailDeal} onOpenChange={() => setDetailDeal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailDeal?.brandName}</DialogTitle>
            <DialogDescription>
              {dealTypes.find((d) => d.value === detailDeal?.dealType)?.label}
            </DialogDescription>
          </DialogHeader>
          {detailDeal && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={statusLabels[detailDeal.status]?.variant ?? "outline"}>
                  {statusLabels[detailDeal.status]?.label ?? detailDeal.status}
                </Badge>
              </div>

              {detailDeal.budgetRange && (
                <div>
                  <p className="text-sm text-muted-foreground">預算範圍</p>
                  <p className="font-medium">
                    NT${detailDeal.budgetRange.min.toLocaleString()} - {detailDeal.budgetRange.max.toLocaleString()}
                  </p>
                </div>
              )}

              {detailDeal.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">備註</p>
                  <p className="text-sm">{detailDeal.notes}</p>
                </div>
              )}

              {detailDeal.aiProposal && (
                <div>
                  <p className="text-sm text-muted-foreground">AI 提案</p>
                  <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                    {detailDeal.aiProposal}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {detailDeal.status === "DRAFT" && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange(detailDeal, "PROPOSAL_SENT")}>
                      標記為已提案
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenProposal(detailDeal.id)}
                      disabled={generateProposal.isPending}
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      {generateProposal.isPending ? "生成中..." : "AI 生成提案"}
                    </Button>
                  </>
                )}
                {detailDeal.status === "PROPOSAL_SENT" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "NEGOTIATING")}>
                    進入洽談
                  </Button>
                )}
                {detailDeal.status === "NEGOTIATING" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "CONFIRMED")}>
                    確認合作
                  </Button>
                )}
                {detailDeal.status === "CONFIRMED" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "IN_PROGRESS")}>
                    開始執行
                  </Button>
                )}
                {detailDeal.status === "IN_PROGRESS" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "COMPLETED")}>
                    標記完成
                  </Button>
                )}
                {!["COMPLETED", "CANCELLED"].includes(detailDeal.status) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(detailDeal, "CANCELLED")}
                    >
                      取消合作
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDetailDeal(null); setDeleteId(detailDeal.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除品牌合作"
        description="確定要刪除此品牌合作案件嗎？"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteDeal.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteDeal.mutate(deleteId, {
              onSuccess: () => { toast.success("已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
