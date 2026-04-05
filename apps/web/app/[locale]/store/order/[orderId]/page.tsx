"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle, Download, Loader2, Mail, FileText, Clock, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface OrderDetail {
  id: string;
  productName: string;
  productType: string;
  price: number;
  currency: string;
  buyerEmail: string;
  status: string;
  createdAt: string;
}

export default function OrderSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const token = searchParams.get("token");
  const t = useTranslations("publicStore");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Try to fetch order details (best-effort, may not exist as public endpoint)
  const { data: order } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/products/order/${orderId}?token=${token}`, {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return null;
        return res.json() as Promise<OrderDetail>;
      } catch {
        return null;
      }
    },
    enabled: !!orderId && !!success,
    retry: false,
  });

  const copyOrderId = () => {
    navigator.clipboard.writeText(orderId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    // Let browser handle the download, reset state after delay
    setTimeout(() => setDownloading(false), 5000);
  };

  if (!success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">{t("orderProcessingPayment")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("orderDoNotClose")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const downloadUrl = token
    ? `${API_BASE}/v1/products/download/${orderId}?token=${token}`
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-lg space-y-4">
        {/* Success Card */}
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold">{t("orderPaymentSuccess")}</h1>
            <p className="text-muted-foreground">
              {t("orderThankYou")}
            </p>
          </CardContent>
        </Card>

        {/* Receipt Card */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("orderReceipt")}
            </h2>
            <Separator />

            <div className="space-y-3 text-sm">
              {/* Order ID */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("orderNumber")}</span>
                <div className="flex items-center gap-1.5">
                  <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                    {orderId?.slice(0, 8)}...
                  </code>
                  <button onClick={copyOrderId} className="text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Product info (if available) */}
              {order?.productName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("orderProduct")}</span>
                  <span className="font-medium">{order.productName}</span>
                </div>
              )}

              {order?.productType && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("orderType")}</span>
                  <Badge variant="outline" className="text-xs">{order.productType}</Badge>
                </div>
              )}

              {order?.price !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("orderAmount")}</span>
                  <span className="text-lg font-bold text-primary">
                    NT${order.price}
                  </span>
                </div>
              )}

              {/* Date */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("orderPurchaseTime")}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {order?.createdAt
                    ? new Date(order.createdAt).toLocaleString("zh-TW")
                    : new Date().toLocaleString("zh-TW")}
                </span>
              </div>

              {/* Email */}
              {order?.buyerEmail && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("orderEmail")}</span>
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.buyerEmail}
                  </span>
                </div>
              )}
            </div>

            <Separator />

            {/* Email notification */}
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
              <Mail className="mt-0.5 h-4 w-4 text-blue-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">{t("orderDownloadSent")}</p>
                <p className="text-blue-600/70 dark:text-blue-400/70">
                  {t("orderCheckEmail")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Download Button */}
        {downloadUrl && (
          <Card>
            <CardContent className="p-6">
              <Button asChild className="w-full h-12 text-base" size="lg" onClick={handleDownload}>
                <a href={downloadUrl}>
                  {downloading ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("orderDownloading")}</>
                  ) : (
                    <><Download className="mr-2 h-5 w-5" /> {t("orderDownloadNow")}</>
                  )}
                </a>
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {t("orderDownloadViaEmail")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Back link */}
        <div className="text-center">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("orderBackToStore")}
          </button>
        </div>
      </div>
    </div>
  );
}
