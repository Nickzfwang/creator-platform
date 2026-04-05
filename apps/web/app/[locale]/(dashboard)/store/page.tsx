"use client";

import { useState } from "react";
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

const typeLabels: Record<string, string> = {
  PDF: "📄 PDF",
  TEMPLATE: "📐 模板",
  PRESET: "🎨 Preset",
  EBOOK: "📖 電子書",
  VIDEO_COURSE: "🎬 影片課程",
  AUDIO: "🎵 音檔",
  OTHER: "📦 其他",
};

export default function StorePage() {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const aiRegenerate = useAiRegenerateProduct();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", productType: "PDF", price: 0, tags: "" });

  const handleCreate = () => {
    if (!form.name.trim()) return toast.error("請輸入商品名稱");
    if (form.price <= 0) return toast.error("請設定價格");

    createProduct.mutate(
      {
        name: form.name,
        description: form.description || undefined,
        productType: form.productType,
        price: form.price,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()) : [],
      },
      {
        onSuccess: () => {
          toast.success("商品已建立，AI 已生成描述");
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
        onSuccess: () => toast.success(product.isPublished ? "已下架" : "已上架"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const totalRevenue = products?.reduce((sum, p) => sum + p.totalRevenue, 0) ?? 0;
  const totalSales = products?.reduce((sum, p) => sum + p.salesCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="數位商品商店"
        description="販售 PDF、模板、Preset、電子書等數位商品"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新增商品
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
                <p className="text-xs text-muted-foreground">商品數</p>
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
                <p className="text-xs text-muted-foreground">總營收</p>
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
                <p className="text-xs text-muted-foreground">總銷量</p>
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
          title="尚無數位商品"
          description="新增您的第一個數位商品，AI 會自動生成吸引人的商品描述"
          actionLabel="新增商品"
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
                    {product.isPublished ? "上架中" : "未上架"}
                  </Badge>
                </div>

                {/* AI Description */}
                {product.aiDescription && (
                  <div className="mt-2 rounded-md bg-purple-50 p-2 dark:bg-purple-950/30">
                    <p className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                      <Sparkles className="h-3 w-3" /> AI 文案
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
                  <span>{product.salesCount} 銷量</span>
                  <span>NT${product.totalRevenue.toLocaleString()} 營收</span>
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
                    {product.isPublished ? "下架" : "上架"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={aiRegenerate.isPending}
                    onClick={() => aiRegenerate.mutate(product.id, {
                      onSuccess: () => toast.success("AI 已重新生成文案"),
                      onError: (e) => toast.error(e.message),
                    })}
                  >
                    {aiRegenerate.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                    AI 重寫
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
          <DialogHeader><DialogTitle>新增數位商品</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>商品名稱</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：Lightroom 風格 Preset 套組" />
            </div>
            <div className="space-y-2">
              <Label>商品類型</Label>
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
              <Label>價格（NT$）</Label>
              <Input type="number" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="299" />
            </div>
            <div className="space-y-2">
              <Label>簡短描述（選填，AI 會自動生成完整文案）</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="簡單描述商品特色..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>標籤（逗號分隔）</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="攝影, Lightroom, Preset" />
            </div>
            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI 會根據商品資訊自動生成行銷文案和 SEO 標籤
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={createProduct.isPending}>
              {createProduct.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> AI 生成中...</> : "建立商品"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除商品"
        description="確定要刪除此商品嗎？所有訂單記錄也會一併刪除。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteProduct.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteProduct.mutate(deleteId, {
              onSuccess: () => { toast.success("商品已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
