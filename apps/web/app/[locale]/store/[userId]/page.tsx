"use client";

import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShoppingBag, Tag, Loader2, ExternalLink, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Product {
  id: string;
  name: string;
  description: string | null;
  aiDescription: string | null;
  productType: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  coverImageUrl: string | null;
  tags: string[];
  aiTags: string[];
  salesCount: number;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  PDF: "PDF",
  TEMPLATE: "模板",
  PRESET: "預設集",
  EBOOK: "電子書",
  VIDEO_COURSE: "影片課程",
  AUDIO: "音檔",
  OTHER: "其他",
};

type SortKey = "newest" | "oldest" | "price_asc" | "price_desc" | "popular";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "最新上架",
  oldest: "最早上架",
  price_asc: "價格低到高",
  price_desc: "價格高到低",
  popular: "最多人買",
};

export default function PublicStorePage() {
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled");

  const [buyDialog, setBuyDialog] = useState<Product | null>(null);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");

  // Filter & sort state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const { data: products, isLoading } = useQuery({
    queryKey: ["public-store", userId],
    queryFn: () => api<Product[]>(`/v1/products/store/${userId}`, { skipAuth: true }),
    enabled: !!userId,
  });

  // Derive available categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const types = [...new Set(products.map((p) => p.productType))];
    return types.sort();
  }, [products]);

  // Apply search, filter, and sort
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = [...products];

    // Category filter
    if (category !== "all") {
      result = result.filter((p) => p.productType === category);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.aiDescription?.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.aiTags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort
    switch (sort) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "price_asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "popular":
        result.sort((a, b) => b.salesCount - a.salesCount);
        break;
    }

    return result;
  }, [products, category, search, sort]);

  const purchase = useMutation({
    mutationFn: (data: { productId: string; buyerEmail: string; buyerName?: string }) =>
      api<{ orderId: string; checkoutUrl: string }>(
        `/v1/products/${data.productId}/purchase`,
        { method: "POST", body: JSON.stringify({ buyerEmail: data.buyerEmail, buyerName: data.buyerName }), skipAuth: true },
      ),
  });

  const handlePurchase = () => {
    if (!buyDialog || !buyerEmail.trim()) return;
    purchase.mutate(
      { productId: buyDialog.id, buyerEmail, buyerName: buyerName || undefined },
      {
        onSuccess: (res) => {
          if (res.checkoutUrl) {
            window.location.href = res.checkoutUrl;
          }
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* SEO Meta Tags */}
      <title>{`數位商品商店`}</title>
      <meta name="description" content="瀏覽並購買創作者的數位商品 — 模板、課程、電子書等" />
      <meta property="og:title" content="數位商品商店" />
      <meta property="og:description" content="瀏覽並購買創作者的數位商品" />
      <meta property="og:type" content="website" />

      <div className="mx-auto max-w-4xl px-4 py-12">
        {cancelled && (
          <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            付款已取消，您可以重新選購。
          </div>
        )}

        <div className="mb-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">數位商品商店</h1>
          <p className="mt-1 text-muted-foreground">瀏覽並購買數位商品</p>
        </div>

        {/* Search & Filter Bar */}
        {products && products.length > 0 && (
          <div className="mb-6 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋商品名稱、描述、標籤..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter Tabs */}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={category === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory("all")}
                >
                  全部
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    variant={category === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategory(cat)}
                  >
                    {TYPE_LABELS[cat] || cat}
                  </Button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <div className="ml-auto flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results count */}
            {(search || category !== "all") && (
              <p className="text-sm text-muted-foreground">
                找到 {filteredProducts.length} 個商品
                {search && <span>（搜尋：{search}）</span>}
              </p>
            )}
          </div>
        )}

        {!products?.length ? (
          <div className="text-center text-muted-foreground py-20">
            目前尚無商品上架
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            找不到符合條件的商品
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {product.coverImageUrl && (
                  <div className="aspect-video bg-muted">
                    <img src={product.coverImageUrl} alt={product.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-lg leading-tight">{product.name}</h3>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {TYPE_LABELS[product.productType] || product.productType}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {product.aiDescription || product.description || ""}
                  </p>

                  {(product.tags.length > 0 || product.aiTags.length > 0) && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {[...product.tags, ...product.aiTags].slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          <Tag className="mr-1 h-3 w-3" />{tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-primary">
                        NT${product.price}
                      </span>
                      {product.compareAtPrice && product.compareAtPrice > product.price && (
                        <span className="text-sm text-muted-foreground line-through">
                          NT${product.compareAtPrice}
                        </span>
                      )}
                    </div>
                    <Button onClick={() => { setBuyDialog(product); setBuyerEmail(""); setBuyerName(""); }}>
                      購買
                    </Button>
                  </div>

                  {product.salesCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      已售出 {product.salesCount} 份
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Purchase Dialog */}
        <Dialog open={!!buyDialog} onOpenChange={() => setBuyDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>購買：{buyDialog?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <span className="text-2xl font-bold text-primary">NT${buyDialog?.price}</span>
              </div>
              <div className="space-y-2">
                <Label>Email（用於接收下載連結）</Label>
                <Input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>姓名（選填）</Label>
                <Input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="您的姓名"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBuyDialog(null)}>取消</Button>
              <Button onClick={handlePurchase} disabled={purchase.isPending || !buyerEmail.trim()}>
                {purchase.isPending ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 處理中...</>
                ) : (
                  <><ExternalLink className="mr-1 h-4 w-4" /> 前往付款</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
