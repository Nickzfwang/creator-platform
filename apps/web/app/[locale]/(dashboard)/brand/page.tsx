"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

const STATUS_KEYS = ["DRAFT", "PROPOSAL_SENT", "NEGOTIATING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  PROPOSAL_SENT: "secondary",
  NEGOTIATING: "default",
  CONFIRMED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

const DEAL_TYPE_KEYS = ["SPONSORED_POST", "BRAND_AMBASSADOR", "PRODUCT_REVIEW", "AFFILIATE", "EVENT", "OTHER"] as const;

export default function BrandPage() {
  const t = useTranslations("brand");
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

  const getDealTypeLabel = (value: string) =>
    DEAL_TYPE_KEYS.includes(value as any)
      ? t(`dealType.${value}`)
      : value;

  const getStatusLabel = (status: string) =>
    STATUS_KEYS.includes(status as any)
      ? t(`status.${status}`)
      : status;

  const handleCreate = () => {
    if (!brandName.trim() || !dealType) {
      toast.error(t("validation.requiredFields"));
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
        onSuccess: () => { toast.success(t("toast.created")); setCreateOpen(false); resetForm(); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleStatusChange = (deal: BrandDeal, newStatus: string) => {
    updateDeal.mutate(
      { id: deal.id, data: { status: newStatus } },
      {
        onSuccess: (updated) => {
          toast.success(t("toast.statusUpdated"));
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
        onSuccess: () => toast.success(t("toast.proposalGenerated")),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const activeDeals = pipeline?.activeDeals ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addDeal")}
          </Button>
        }
      />

      {/* Pipeline Stats */}
      {pipelineLoading ? (
        <CardsSkeleton count={3} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("stats.activeDeals")} value={activeDeals} icon={Handshake} />
          <StatCard
            label={t("stats.completedDeals")}
            value={pipeline?.pipeline?.COMPLETED ?? 0}
            icon={TrendingUp}
          />
          <StatCard
            label={t("stats.totalRevenue")}
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
          title={t("empty.title")}
          description={t("empty.description")}
          actionLabel={t("addDeal")}
          onAction={() => { resetForm(); setCreateOpen(true); }}
        />
      ) : (
        <div className="space-y-3">
          {data.data.map((deal) => {
            const variant = statusVariants[deal.status] ?? "outline";
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
                      <Badge variant={variant}>{getStatusLabel(deal.status)}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{getDealTypeLabel(deal.dealType)}</span>
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
          <DialogHeader><DialogTitle>{t("createDialog.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("form.brandName")}</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={t("form.brandName")} />
            </div>
            <div className="space-y-2">
              <Label>{t("form.dealType")}</Label>
              <Select value={dealType} onValueChange={setDealType}>
                <SelectTrigger><SelectValue placeholder={t("form.selectType")} /></SelectTrigger>
                <SelectContent>
                  {DEAL_TYPE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>{t(`dealType.${key}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("form.budgetMin")}</Label>
                <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("form.budgetMax")}</Label>
                <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("form.notes")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createDeal.isPending}>{t("action.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailDeal} onOpenChange={() => setDetailDeal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailDeal?.brandName}</DialogTitle>
            <DialogDescription>
              {detailDeal ? getDealTypeLabel(detailDeal.dealType) : ""}
            </DialogDescription>
          </DialogHeader>
          {detailDeal && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={statusVariants[detailDeal.status] ?? "outline"}>
                  {getStatusLabel(detailDeal.status)}
                </Badge>
              </div>

              {detailDeal.budgetRange && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("detail.budgetRange")}</p>
                  <p className="font-medium">
                    NT${detailDeal.budgetRange.min.toLocaleString()} - {detailDeal.budgetRange.max.toLocaleString()}
                  </p>
                </div>
              )}

              {detailDeal.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("form.notes")}</p>
                  <p className="text-sm">{detailDeal.notes}</p>
                </div>
              )}

              {detailDeal.aiProposal && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("detail.aiProposal")}</p>
                  <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                    {detailDeal.aiProposal}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {detailDeal.status === "DRAFT" && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange(detailDeal, "PROPOSAL_SENT")}>
                      {t("action.markProposalSent")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenProposal(detailDeal.id)}
                      disabled={generateProposal.isPending}
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      {generateProposal.isPending ? t("action.generating") : t("action.aiGenerate")}
                    </Button>
                  </>
                )}
                {detailDeal.status === "PROPOSAL_SENT" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "NEGOTIATING")}>
                    {t("action.startNegotiation")}
                  </Button>
                )}
                {detailDeal.status === "NEGOTIATING" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "CONFIRMED")}>
                    {t("action.confirmDeal")}
                  </Button>
                )}
                {detailDeal.status === "CONFIRMED" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "IN_PROGRESS")}>
                    {t("action.startExecution")}
                  </Button>
                )}
                {detailDeal.status === "IN_PROGRESS" && (
                  <Button size="sm" onClick={() => handleStatusChange(detailDeal, "COMPLETED")}>
                    {t("action.markCompleted")}
                  </Button>
                )}
                {!["COMPLETED", "CANCELLED"].includes(detailDeal.status) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(detailDeal, "CANCELLED")}
                    >
                      {t("action.cancelDeal")}
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
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description")}
        confirmLabel={t("action.delete")}
        variant="destructive"
        loading={deleteDeal.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteDeal.mutate(deleteId, {
              onSuccess: () => { toast.success(t("toast.deleted")); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
