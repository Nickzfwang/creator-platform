"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, ShoppingBag, Sparkles, Eye, EyeOff, Package, DollarSign, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useAiRegenerateProduct, type DigitalProduct } from "@/hooks/use-products";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function StorePage() {
  const t = useTranslations("store");

  const typeLabels: Record<string, string> = {
    PDF: t("typeLabels.pdf"),
    TEMPLATE: t("typeLabels.template"),
    PRESET: t("typeLabels.preset"),
    EBOOK: t("typeLabels.ebook"),
    VIDEO_COURSE: t("typeLabels.videoCourse"),
    AUDIO: t("typeLabels.audio"),
    OTHER: t("typeLabels.other"),
  };

  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const aiRegenerate = useAiRegenerateProduct();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", productType: "PDF", price: 0, tags: "" });

  const handleCreate = () => {
    if (!form.name.trim()) return toast.error(t("validation.nameRequired"));
    if (form.price <= 0) return toast.error(t("validation.priceRequired"));

    createProduct.mutate(
      {
        name: form.name,
        description: form.description || undefined,
        productType: form.productType,
        price: form.price,
        tags: form.tags ? form.tags.split(",").map((tag) => tag.trim()) : [],
      },
      {
        onSuccess: () => {
          toast.success(t("toast.created"));
          setCreateOpen(false);
          setForm({ name: "", description: "", productType: "PDF", price: 0, tags: "" });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const togglePublish = (product: DigitalProduct) => {
    updateProduct.mutate(
      { id: product.id, data: { isPublished: !product.isPublished } },
      {
        onSuccess: () => toast.success(product.isPublished ? t("toast.unpublished") : t("toast.published")),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const totalRevenue = products?.reduce((sum, p) => sum + p.totalRevenue, 0) ?? 0;
  const totalSales = products?.reduce((sum, p) => sum + p.salesCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t("addProduct")}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900"><Package className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{t("stats.productCount")}</p>
                <p className="text-xl font-bold">{products?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900"><DollarSign className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{t("stats.totalRevenue")}</p>
                <p className="text-xl font-bold">NT${totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900"><ShoppingBag className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{t("stats.totalSales")}</p>
                <p className="text-xl font-bold">{totalSales}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse"><CardContent className="pt-5"><div className="h-20 rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : !products?.length ? (
        <EmptyState
          icon={ShoppingBag}
          title={t("empty.title")}
          description={t("empty.description")}
          actionLabel={t("addProduct")}
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              {/* Cover */}
              <div className="flex h-32 items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950">
                <span className="text-4xl">{typeLabels[product.productType]?.split(" ")[0] || "📦"}</span>
              </div>
              <CardContent className="pt-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold line-clamp-1">{product.name}</h3>
                    <p className="text-lg font-bold text-primary mt-1">NT${product.price.toLocaleString()}</p>
                    {product.compareAtPrice && (
                      <span className="text-xs text-muted-foreground line-through">NT${product.compareAtPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <Badge variant={product.isPublished ? "default" : "secondary"}>
                    {product.isPublished ? t("status.published") : t("status.unpublished")}
                  </Badge>
                </div>

                {/* AI Description */}
                {product.aiDescription && (
                  <div className="mt-2 rounded-md bg-purple-50 p-2 dark:bg-purple-950/30">
                    <p className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                      <Sparkles className="h-3 w-3" /> {t("aiCopy")}
                    </p>
                    <p className="text-xs text-purple-900 dark:text-purple-200 line-clamp-3">{product.aiDescription}</p>
                  </div>
                )}

                {/* Tags */}
                {product.aiTags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {product.aiTags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("productStats.sales", { count: product.salesCount })}</span>
                  <span>{t("productStats.revenue", { amount: product.totalRevenue.toLocaleString() })}</span>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => togglePublish(product)}
                  >
                    {product.isPublished ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                    {product.isPublished ? t("action.unpublish") : t("action.publish")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={aiRegenerate.isPending}
                    onClick={() => aiRegenerate.mutate(product.id, {
                      onSuccess: () => toast.success(t("toast.aiRegenerated")),
                      onError: (e) => toast.error(e.message),
                    })}
                  >
                    {aiRegenerate.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                    {t("action.aiRewrite")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs ml-auto"
                    onClick={() => setDeleteId(product.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dialog.createTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("form.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("form.namePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("form.type")}</Label>
              <Select value={form.productType} onValueChange={(v) => setForm({ ...form, productType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("form.price")}</Label>
              <Input type="number" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="299" />
            </div>
            <div className="space-y-2">
              <Label>{t("form.description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("form.descriptionPlaceholder")} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t("form.tags")}</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t("form.tagsPlaceholder")} />
            </div>
            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> {t("aiHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createProduct.isPending}>
              {createProduct.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {t("action.aiGenerating")}</> : t("action.createProduct")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("dialog.deleteTitle")}
        description={t("dialog.deleteDescription")}
        confirmLabel={t("action.delete")}
        variant="destructive"
        loading={deleteProduct.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteProduct.mutate(deleteId, {
              onSuccess: () => { toast.success(t("toast.deleted")); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
