"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Users, Crown, Edit } from "lucide-react";
import { toast } from "sonner";
import {
  useTiers,
  useCreateTier,
  useUpdateTier,
  useDeleteTier,
  useMembers,
} from "@/hooks/use-membership";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CardsSkeleton, TableSkeleton } from "@/components/loading-skeleton";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MembershipTier } from "@/lib/types";

export default function MembersPage() {
  const t = useTranslations("members");
  const { data: tiers, isLoading: tiersLoading } = useTiers();
  const { data: membersData, isLoading: membersLoading } = useMembers();
  const createTier = useCreateTier();
  const updateTier = useUpdateTier();
  const deleteTier = useDeleteTier();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTier, setEditTier] = useState<MembershipTier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [priceMonthly, setPriceMonthly] = useState("");
  const [benefits, setBenefits] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setName(""); setDesc(""); setPriceMonthly(""); setBenefits(""); setMaxMembers(""); setIsActive(true);
  };

  const openEdit = (tier: MembershipTier) => {
    setEditTier(tier);
    setName(tier.name);
    setDesc(tier.description || "");
    setPriceMonthly(String(tier.priceMonthly));
    setBenefits(tier.benefits.join("\n"));
    setMaxMembers(tier.maxMembers ? String(tier.maxMembers) : "");
    setIsActive(tier.isActive);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error(t("validation.nameRequired")); return; }
    if (!priceMonthly || isNaN(Number(priceMonthly))) { toast.error(t("validation.priceInvalid")); return; }

    const payload = {
      name,
      description: desc || undefined,
      priceMonthly: Number(priceMonthly),
      benefits: benefits.split("\n").filter(Boolean),
      maxMembers: maxMembers ? Number(maxMembers) : undefined,
      isActive,
    };

    if (editTier) {
      updateTier.mutate(
        { id: editTier.id, data: payload },
        {
          onSuccess: () => { toast.success(t("toast.tierUpdated")); setEditTier(null); resetForm(); },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      createTier.mutate(payload, {
        onSuccess: () => { toast.success(t("toast.tierCreated")); setCreateOpen(false); resetForm(); },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  const totalMembers = tiers?.reduce((sum, t) => sum + t.memberCount, 0) ?? 0;
  const activeTiers = tiers?.filter((t) => t.isActive).length ?? 0;
  const estimatedRevenue = tiers?.reduce((sum, t) => sum + t.priceMonthly * t.memberCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addTier")}
          </Button>
        }
      />

      {/* Stats */}
      {tiersLoading ? (
        <CardsSkeleton count={3} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("stats.totalMembers")} value={totalMembers} icon={Users} />
          <StatCard label={t("stats.activeTiers")} value={activeTiers} icon={Crown} />
          <StatCard
            label={t("stats.estimatedRevenue")}
            value={`NT$${estimatedRevenue.toLocaleString()}`}
          />
        </div>
      )}

      <Tabs defaultValue="tiers">
        <TabsList>
          <TabsTrigger value="tiers">{t("tabs.tiers")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="mt-4">
          {tiersLoading ? (
            <TableSkeleton />
          ) : !tiers?.length ? (
            <EmptyState
              icon={Crown}
              title={t("empty.tiersTitle")}
              description={t("empty.tiersDescription")}
              actionLabel={t("addTier")}
              onAction={() => { resetForm(); setCreateOpen(true); }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tiers.map((tier) => (
                <Card key={tier.id} className={!tier.isActive ? "opacity-60" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{tier.name}</CardTitle>
                      <Badge variant={tier.isActive ? "default" : "secondary"}>
                        {tier.isActive ? t("status.active") : t("status.inactive")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      NT${tier.priceMonthly.toLocaleString()}
                      <span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
                    </p>
                    {tier.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
                    )}
                    {tier.benefits.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {tier.benefits.map((b, i) => (
                          <li key={i} className="text-sm">✓ {b}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("memberCount", { count: tier.memberCount })}</span>
                      {tier.maxMembers && <span>{t("maxMembers", { count: tier.maxMembers })}</span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(tier)}>
                        <Edit className="mr-1 h-3 w-3" />
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(tier.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          {membersLoading ? (
            <TableSkeleton />
          ) : !membersData?.data?.length ? (
            <EmptyState
              icon={Users}
              title={t("empty.membersTitle")}
              description={t("empty.membersDescription")}
            />
          ) : (
            <div className="space-y-3">
              {membersData.data.map((member) => (
                <div key={member.id} className="flex items-center gap-4 rounded-lg border p-4">
                  <Avatar>
                    <AvatarImage src={member.user?.avatarUrl ?? undefined} />
                    <AvatarFallback>
                      {(member.user?.displayName ?? "??").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{member.user?.displayName}</p>
                    <p className="text-xs text-muted-foreground">{member.user?.email}</p>
                  </div>
                  <Badge variant="outline">{member.tier.name}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString("zh-TW")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog
        open={createOpen || !!editTier}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setEditTier(null); resetForm(); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTier ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("form.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("form.namePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("form.description")}</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("form.optional")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("form.monthlyPrice")}</Label>
                <Input type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} placeholder="99" />
              </div>
              <div className="space-y-2">
                <Label>{t("form.maxMembers")}</Label>
                <Input type="number" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} placeholder={t("form.unlimited")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("form.benefits")}</Label>
              <Textarea
                value={benefits}
                onChange={(e) => setBenefits(e.target.value)}
                placeholder={t("form.benefitsPlaceholder")}
                rows={4}
              />
            </div>
            {editTier && (
              <div className="flex items-center justify-between">
                <Label>{t("form.enableTier")}</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditTier(null); resetForm(); }}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={createTier.isPending || updateTier.isPending}>
              {editTier ? t("update") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("delete.title")}
        description={t("delete.description")}
        confirmLabel={t("delete.confirm")}
        variant="destructive"
        loading={deleteTier.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteTier.mutate(deleteId, {
              onSuccess: () => { toast.success(t("toast.tierDeleted")); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
