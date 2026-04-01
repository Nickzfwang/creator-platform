"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShoppingBag, Tag, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

export default function PublicStorePage() {
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled");

  const [buyDialog, setBuyDialog] = useState<Product | null>(null);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");

  const { data: products, isLoading } = useQuery({
    queryKey: ["public-store", userId],
    queryFn: () => api<Product[]>(`/v1/products/store/${userId}`, { skipAuth: true }),
    enabled: !!userId,
  });

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
    <div className="mx-auto max-w-4xl px-4 py-12">
      {cancelled && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Payment was cancelled. You can try again below.
        </div>
      )}

      <div className="mb-8 text-center">
        <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="text-2xl font-bold">Digital Products</h1>
        <p className="mt-1 text-muted-foreground">Browse and purchase digital products</p>
      </div>

      {!products?.length ? (
        <div className="text-center text-muted-foreground py-20">
          No products available yet.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {products.map((product) => (
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
                    Purchase
                  </Button>
                </div>

                {product.salesCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {product.salesCount} sold
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
            <DialogTitle>Purchase: {buyDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <span className="text-2xl font-bold text-primary">NT${buyDialog?.price}</span>
            </div>
            <div className="space-y-2">
              <Label>Email (for receiving download link)</Label>
              <Input
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyDialog(null)}>Cancel</Button>
            <Button onClick={handlePurchase} disabled={purchase.isPending || !buyerEmail.trim()}>
              {purchase.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                <><ExternalLink className="mr-1 h-4 w-4" /> Proceed to Payment</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
