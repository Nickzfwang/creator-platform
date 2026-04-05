"use client";

import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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

type SortKey = "newest" | "oldest" | "price_asc" | "price_desc" | "popular";

export default function PublicStorePage() {
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled");
  const t = useTranslations("publicStore");

  const [buyDialog, setBuyDialog] = useState<Product | null>(null);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");

  // Filter & sort state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const TYPE_LABELS: Record<string, string> = {
    PDF: "PDF",
    TEMPLATE: t("typeTemplate"),
    PRESET: t("typePreset"),
    EBOOK: t("typeEbook"),
    VIDEO_COURSE: t("typeVideoCourse"),
    AUDIO: t("typeAudio"),
    OTHER: t("typeOther"),
  };

  const SORT_LABELS: Record<SortKey, string> = {
    newest: t("sortNewest"),
    oldest: t("sortOldest"),
    price_asc: t("sortPriceAsc"),
    price_desc: t("sortPriceDesc"),
    popular: t("sortPopular"),
  };

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
      <title>{t("storeTitle")}</title>
      <meta name="description" content={t("metaDescription")} />
      <meta property="og:title" content={t("storeTitle")} />
      <meta property="og:description" content={t("metaDescriptionShort")} />
      <meta property="og:type" content="website" />

      <div className="mx-auto max-w-4xl px-4 py-12">
        {cancelled && (
          <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {t("paymentCancelled")}
          </div>
        )}

        <div className="mb-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">{t("storeTitle")}</h1>
          <p className="mt-1 text-muted-foreground">{t("storeSubtitle")}</p>
        </div>

        {/* Search & Filter Bar */}
        {products && products.length > 0 && (
          <div className="mb-6 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
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
                  {t("categoryAll")}
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
                {t("resultsFound", { count: filteredProducts.length })}
                {search && <span>{t("searchQuery", { query: search })}</span>}
              </p>
            )}
          </div>
        )}

        {!products?.length ? (
          <div className="text-center text-muted-foreground py-20">
            {t("noProducts")}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            {t("noMatchingProducts")}
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
                      {t("buy")}
                    </Button>
                  </div>

                  {product.salesCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t("soldCount", { count: product.salesCount })}
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
              <DialogTitle>{t("purchaseTitle", { name: buyDialog?.name ?? "" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <span className="text-2xl font-bold text-primary">NT${buyDialog?.price}</span>
              </div>
              <div className="space-y-2">
                <Label>{t("emailLabel")}</Label>
                <Input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("nameLabel")}</Label>
                <Input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBuyDialog(null)}>{t("cancelButton")}</Button>
              <Button onClick={handlePurchase} disabled={purchase.isPending || !buyerEmail.trim()}>
                {purchase.isPending ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {t("processing")}</>
                ) : (
                  <><ExternalLink className="mr-1 h-4 w-4" /> {t("goToPayment")}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
