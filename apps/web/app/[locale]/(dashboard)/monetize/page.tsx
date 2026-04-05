"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  BarChart3,
  Loader2,
  Users,
  ShoppingBag,
  Handshake,
  Link2,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useHealth, useAdvice, useForecast } from "@/hooks/use-monetize";

const channelIcons: Record<string, typeof DollarSign> = {
  membership: Users,
  digitalProduct: ShoppingBag,
  brandDeal: Handshake,
  affiliate: Link2,
  subscription: DollarSign,
};

const impactColors: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function formatCurrency(value: number): string {
  if (value >= 10000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

// ─── Health Panel ───

function HealthPanel() {
  const t = useTranslations("monetize");
  const [period, setPeriod] = useState("30d");
  const { data, isLoading } = useHealth(period);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const GrowthIcon = data.growthRate > 0 ? ArrowUpRight : data.growthRate < 0 ? ArrowDownRight : Minus;
  const growthColor = data.growthRate > 0 ? "text-green-600" : data.growthRate < 0 ? "text-red-600" : "text-gray-500";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["30d", "90d"].map((p) => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {p === "30d" ? t("period30d") : t("period90d")}
          </Button>
        ))}
      </div>

      {/* Total Revenue */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("totalRevenue")}</p>
              <p className="text-3xl font-bold">{formatCurrency(data.totalRevenue)}</p>
            </div>
            <div className={`flex items-center gap-1 ${growthColor}`}>
              <GrowthIcon className="h-5 w-5" />
              <span className="text-lg font-semibold">{Math.abs(data.growthRate)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(data.channels) as [string, any][])
          .filter(([key]) => key !== "subscription")
          .map(([key, ch]) => {
            const Icon = channelIcons[key] || DollarSign;
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {t(`channel.${key}`)}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">{ch.percentage}%</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(ch.revenue)}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {key === "membership" && (
                      <>
                        <p>{t("membershipMrr", { mrr: formatCurrency(ch.mrr), members: ch.activeMembers })}</p>
                        <p>{t("churnRate", { rate: ch.churnRate })}</p>
                      </>
                    )}
                    {key === "digitalProduct" && (
                      <>
                        <p>{t("digitalProductSales", { sales: ch.totalSales, avgOrder: formatCurrency(ch.avgOrderValue) })}</p>
                        {ch.topProduct && <p>{t("topSelling", { name: ch.topProduct.name })}</p>}
                      </>
                    )}
                    {key === "brandDeal" && (
                      <>
                        <p>{t("brandDealActive", { deals: ch.activeDeals, avgValue: formatCurrency(ch.avgDealValue) })}</p>
                        <p>{t("conversionRate", { rate: ch.conversionRate })}</p>
                      </>
                    )}
                    {key === "affiliate" && (
                      <>
                        <p>{t("affiliateClicks", { clicks: ch.totalClicks, rate: ch.conversionRate })}</p>
                        {ch.topLink && <p>{t("topLink", { name: ch.topLink.name })}</p>}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

// ─── Advice Panel ───

function AdvicePanel() {
  const t = useTranslations("monetize");
  const { data, isLoading, refetch, isFetching } = useAdvice();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("adviceDescription")}</p>
        <Button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {t("generateAdvice")}
        </Button>
      </div>

      {isLoading || isFetching ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("adviceEmpty")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Suggestions */}
          {data.suggestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">{t("suggestions")}</h3>
              {data.suggestions.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge className={impactColors[s.impact] || ""}>{t(`impact.${s.impact}`)}</Badge>
                        <Badge variant="outline">{t(`category.${s.category}`)}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">{s.description}</p>
                    <p className="text-xs font-medium mb-1">{t("estimatedImpact", { impact: s.estimatedImpact })}</p>
                    {s.steps.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">{t("executionSteps")}</p>
                        <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                          {s.steps.map((step, i) => <li key={i}>{step}</li>)}
                        </ol>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pricing Advice */}
          {Object.keys(data.pricingAdvice).length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">{t("pricingAdvice")}</h3>
              {Object.entries(data.pricingAdvice).map(([key, advice]: [string, any]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t(`channel.${key}`)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {advice.currentTiers && (
                      <div className="mb-2 text-xs">
                        {advice.currentTiers.map((tier: any, i: number) => (
                          <span key={i} className="mr-3">{tier.name}: ${tier.price}{t("perMonth")} ({tier.members} {t("people")})</span>
                        ))}
                      </div>
                    )}
                    {advice.products && (
                      <div className="mb-2 text-xs">
                        {advice.products.map((p: any, i: number) => (
                          <span key={i} className="mr-3">{p.name}: ${p.price} ({p.sales} {t("salesUnit")})</span>
                        ))}
                      </div>
                    )}
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      {advice.suggestions?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Unused Channels */}
          {data.unusedChannels.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">{t("recommendNewChannels")}</h3>
              {data.unusedChannels.map((ch, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{ch.channel}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline">{t(`difficulty.${ch.setupDifficulty}`)}</Badge>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {t("estimatedMonthlyRevenue", { amount: ch.estimatedMonthlyRevenue })}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{ch.reason}</p>
                    {ch.prerequisites.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("prerequisites", { items: ch.prerequisites.join(", ") })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Forecast Panel ───

function ForecastPanel() {
  const t = useTranslations("monetize");
  const { data, isLoading } = useForecast();

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data) return null;

  if (!data.hasEnoughData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t("insufficientData")}</p>
          <p className="text-sm text-muted-foreground">{data.assumptions[0]}</p>
        </CardContent>
      </Card>
    );
  }

  const months = [
    { label: t("nextMonth"), data: data.forecast!.month1 },
    { label: t("twoMonthsLater"), data: data.forecast!.month2 },
    { label: t("threeMonthsLater"), data: data.forecast!.month3 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {months.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(m.data.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(m.data.low)} ~ {formatCurrency(m.data.high)}
              </p>
              <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 relative">
                <div
                  className="absolute h-full rounded-full bg-primary/30"
                  style={{
                    left: `${(m.data.low / m.data.high) * 100}%`,
                    width: `${((m.data.total - m.data.low) / m.data.high) * 100}%`,
                  }}
                />
                <div
                  className="absolute h-full w-1 rounded-full bg-primary"
                  style={{ left: `${(m.data.total / m.data.high) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.assumptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("forecastAssumptions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              {data.assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function MonetizePage() {
  const t = useTranslations("monetize");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList>
          <TabsTrigger value="health" className="gap-2">
            <DollarSign className="h-4 w-4" />
            {t("tabHealth")}
          </TabsTrigger>
          <TabsTrigger value="advice" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            {t("tabAdvice")}
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            {t("tabForecast")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <HealthPanel />
        </TabsContent>

        <TabsContent value="advice">
          <AdvicePanel />
        </TabsContent>

        <TabsContent value="forecast">
          <ForecastPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
