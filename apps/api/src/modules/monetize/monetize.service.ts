import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';

interface ChannelHealth {
  revenue: number;
  percentage: number;
  [key: string]: unknown;
}

@Injectable()
export class MonetizeService {
  private readonly logger = new Logger(MonetizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // ─── 收入健診 ───

  async getHealth(userId: string, tenantId: string, period: string = '30d') {
    const days = period === '90d' ? 90 : 30;
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const prevStart = new Date(start.getTime() - days * 86400000);

    // Parallel data collection
    const [
      membershipData,
      productData,
      brandData,
      affiliateData,
      subscriptionData,
      prevRevenueData,
    ] = await Promise.all([
      this.getMembershipHealth(userId, tenantId, start),
      this.getProductHealth(userId, start),
      this.getBrandDealHealth(userId, tenantId, start),
      this.getAffiliateHealth(userId, tenantId, period),
      this.getSubscriptionHealth(userId, tenantId),
      this.analyticsService.getRevenueAnalytics(userId, tenantId, period).catch(() => null),
    ]);

    const totalRevenue =
      membershipData.revenue + productData.revenue + brandData.revenue +
      affiliateData.revenue + subscriptionData.revenue;

    // Calculate previous period total for growth
    const previousTotalRevenue = prevRevenueData
      ? (prevRevenueData as any)?.total ?? 0
      : 0;

    const growthRate = previousTotalRevenue > 0
      ? ((totalRevenue - previousTotalRevenue) / previousTotalRevenue) * 100
      : 0;

    // Percentage calculation
    const calcPct = (val: number) => totalRevenue > 0 ? Math.round((val / totalRevenue) * 1000) / 10 : 0;

    return {
      period: { start: start.toISOString(), end: now.toISOString() },
      totalRevenue,
      previousTotalRevenue,
      growthRate: Math.round(growthRate * 10) / 10,
      channels: {
        membership: { ...membershipData, percentage: calcPct(membershipData.revenue) },
        digitalProduct: { ...productData, percentage: calcPct(productData.revenue) },
        brandDeal: { ...brandData, percentage: calcPct(brandData.revenue) },
        affiliate: { ...affiliateData, percentage: calcPct(affiliateData.revenue) },
        subscription: { ...subscriptionData, percentage: calcPct(subscriptionData.revenue) },
      },
    };
  }

  // ─── AI 建議 ───

  async getAdvice(userId: string, tenantId: string) {
    const health = await this.getHealth(userId, tenantId, '30d');

    // Get membership tiers and product data for pricing
    const [tiers, products, followerCount] = await Promise.all([
      this.prisma.membershipTier.findMany({
        where: { userId, tenantId, isActive: true },
        include: { _count: { select: { memberships: { where: { status: 'ACTIVE' } } } } },
      }),
      this.prisma.digitalProduct.findMany({
        where: { userId, isPublished: true },
        select: { name: true, price: true, salesCount: true, totalRevenue: true },
      }),
      this.getFollowerCount(userId, tenantId),
    ]);

    // Determine unused channels
    const usedChannels = new Set<string>();
    if (health.channels.membership.revenue > 0 || tiers.length > 0) usedChannels.add('membership');
    if (health.channels.digitalProduct.revenue > 0 || products.length > 0) usedChannels.add('digitalProduct');
    if (health.channels.brandDeal.revenue > 0) usedChannels.add('brandDeal');
    if (health.channels.affiliate.revenue > 0) usedChannels.add('affiliate');

    const context = JSON.stringify({
      totalRevenue: health.totalRevenue,
      growthRate: health.growthRate,
      channels: health.channels,
      tiers: tiers.map(t => ({
        name: t.name,
        priceMonthly: Number(t.priceMonthly),
        activeMembers: t._count.memberships,
      })),
      products: products.map(p => ({
        name: p.name,
        price: p.price / 100, // cents to TWD
        sales: p.salesCount,
      })),
      followerCount,
      usedChannels: Array.from(usedChannels),
    }, null, 2);

    const aiResult = await this.aiService.generateJson<{
      suggestions: {
        title: string;
        description: string;
        impact: string;
        category: string;
        steps: string[];
        estimatedImpact: string;
      }[];
      pricingMembership: string[] | null;
      pricingProduct: string[] | null;
      unusedChannels: {
        channel: string;
        reason: string;
        estimatedMonthlyRevenue: string;
        setupDifficulty: string;
        prerequisites: string[];
      }[];
    }>(
      `你是一位專業的創作者變現顧問。根據以下收入數據，提供具體的變現優化建議。

要求：
1. suggestions: 3-5 條可執行的建議，每條含 title、description、impact (HIGH/MEDIUM/LOW)、category (PRICING/GROWTH/RETENTION/NEW_CHANNEL/OPTIMIZATION)、steps (具體步驟)、estimatedImpact (預期影響的量化描述)
2. pricingMembership: 如果有會員方案，給出 1-3 條定價建議；沒有則 null
3. pricingProduct: 如果有數位商品，給出 1-3 條定價建議；沒有則 null
4. unusedChannels: 推薦尚未使用的變現管道，每個含 channel、reason、estimatedMonthlyRevenue、setupDifficulty (EASY/MEDIUM/HARD)、prerequisites

建議必須基於具體數據，不要泛泛而談。如果數據不足，優先建議收集數據的步驟。

回傳 JSON 格式。`,
      context,
    );

    // Build pricing advice
    const pricingAdvice: Record<string, unknown> = {};
    if (tiers.length > 0) {
      pricingAdvice.membership = {
        currentTiers: tiers.map(t => ({
          name: t.name,
          price: Number(t.priceMonthly),
          members: t._count.memberships,
        })),
        suggestions: aiResult?.pricingMembership || ['目前數據不足，建議先累積 3 個月數據再調整'],
      };
    }
    if (products.length > 0) {
      pricingAdvice.digitalProduct = {
        products: products.map(p => ({
          name: p.name,
          price: p.price / 100,
          sales: p.salesCount,
        })),
        suggestions: aiResult?.pricingProduct || ['目前數據不足，建議先觀察 1 個月銷售趨勢'],
      };
    }

    return {
      suggestions: (aiResult?.suggestions || []).map((s, i) => ({
        id: `adv-${i}`,
        ...s,
      })),
      pricingAdvice,
      unusedChannels: aiResult?.unusedChannels || [],
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 收入預測 ───

  async getForecast(userId: string, tenantId: string) {
    // Get last 90 days of revenue data
    const revenueData = await this.analyticsService.getRevenueAnalytics(
      userId, tenantId, '90d',
    ).catch(() => null) as any;

    if (!revenueData?.breakdown || revenueData.breakdown.length < 14) {
      return {
        hasEnoughData: false,
        forecast: null,
        assumptions: ['需要至少 14 天的收入歷史才能進行預測'],
        generatedAt: new Date().toISOString(),
      };
    }

    // Simple linear trend calculation
    const dailyRevenue = revenueData.breakdown.map((d: any) => ({
      date: d.date,
      total: (d.subscription || 0) + (d.membership || 0) + (d.affiliate || 0),
    }));

    const n = dailyRevenue.length;
    const avgDailyRevenue = dailyRevenue.reduce((sum: number, d: any) => sum + d.total, 0) / n;

    // Calculate trend (simple slope)
    const midpoint = Math.floor(n / 2);
    const firstHalfAvg = dailyRevenue.slice(0, midpoint).reduce((s: number, d: any) => s + d.total, 0) / midpoint;
    const secondHalfAvg = dailyRevenue.slice(midpoint).reduce((s: number, d: any) => s + d.total, 0) / (n - midpoint);
    const trendMultiplier = firstHalfAvg > 0 ? secondHalfAvg / firstHalfAvg : 1;

    // Project 3 months
    const month1Base = avgDailyRevenue * 30;
    const month2Base = month1Base * trendMultiplier;
    const month3Base = month2Base * trendMultiplier;

    // Confidence interval (wider for further months)
    const variance = 0.15;

    const forecast = {
      month1: {
        total: Math.round(month1Base),
        low: Math.round(month1Base * (1 - variance)),
        high: Math.round(month1Base * (1 + variance)),
        breakdown: {
          membership: Math.round(month1Base * (revenueData.membership || 0) / Math.max(revenueData.total, 1)),
          digitalProduct: 0,
          brandDeal: 0,
          affiliate: Math.round(month1Base * (revenueData.affiliate || 0) / Math.max(revenueData.total, 1)),
          subscription: Math.round(month1Base * (revenueData.subscription || 0) / Math.max(revenueData.total, 1)),
        },
      },
      month2: {
        total: Math.round(month2Base),
        low: Math.round(month2Base * (1 - variance * 1.5)),
        high: Math.round(month2Base * (1 + variance * 1.5)),
        breakdown: {},
      },
      month3: {
        total: Math.round(month3Base),
        low: Math.round(month3Base * (1 - variance * 2)),
        high: Math.round(month3Base * (1 + variance * 2)),
        breakdown: {},
      },
    };

    const assumptions = [
      `基於近 ${n} 天的收入數據`,
      `日均收入 $${avgDailyRevenue.toFixed(0)}`,
      trendMultiplier > 1
        ? `收入呈上升趨勢 (+${((trendMultiplier - 1) * 100).toFixed(1)}%)`
        : trendMultiplier < 1
          ? `收入呈下降趨勢 (${((trendMultiplier - 1) * 100).toFixed(1)}%)`
          : '收入持平',
      '預測基於歷史趨勢線性外推，實際結果可能受季節性和外部因素影響',
    ];

    return {
      hasEnoughData: true,
      forecast,
      assumptions,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Private Helpers ───

  private async getMembershipHealth(userId: string, tenantId: string, since: Date) {
    const [activeMemberships, tiers] = await Promise.all([
      this.prisma.membership.count({
        where: { creatorUserId: userId, tenantId, status: 'ACTIVE' },
      }),
      this.prisma.membershipTier.findMany({
        where: { userId, tenantId, isActive: true },
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
        },
      }),
    ]);

    const mrr = tiers.reduce((sum, t) => sum + Number(t.priceMonthly) * t.memberships.length, 0);
    const cancelledRecently = await this.prisma.membership.count({
      where: {
        creatorUserId: userId,
        tenantId,
        status: 'CANCELLED',
        cancelledAt: { gte: since },
      },
    });
    const totalEver = activeMemberships + cancelledRecently;
    const churnRate = totalEver > 0 ? cancelledRecently / totalEver : 0;

    return {
      revenue: mrr,
      mrr,
      activeMembers: activeMemberships,
      churnRate: Math.round(churnRate * 1000) / 10,
      avgRevenuePerMember: activeMemberships > 0 ? Math.round(mrr / activeMemberships) : 0,
    };
  }

  private async getProductHealth(userId: string, since: Date) {
    const products = await this.prisma.digitalProduct.findMany({
      where: { userId, isPublished: true },
      include: {
        orders: {
          where: { createdAt: { gte: since }, status: 'COMPLETED' },
          select: { amount: true },
        },
      },
    });

    const totalSales = products.reduce((sum, p) => sum + p.orders.length, 0);
    const totalRevenue = products.reduce(
      (sum, p) => sum + p.orders.reduce((s, o) => s + o.amount, 0),
      0,
    ) / 100; // cents to TWD

    const topProduct = products.length > 0
      ? products.sort((a, b) => b.orders.length - a.orders.length)[0]
      : null;

    return {
      revenue: totalRevenue,
      totalSales,
      avgOrderValue: totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0,
      topProduct: topProduct
        ? { name: topProduct.name, sales: topProduct.orders.length }
        : null,
    };
  }

  private async getBrandDealHealth(userId: string, tenantId: string, since: Date) {
    const deals = await this.prisma.brandDeal.findMany({
      where: { userId, tenantId },
      select: { status: true, actualRevenue: true, createdAt: true },
    });

    const completedDeals = deals.filter(d => d.status === 'COMPLETED');
    const revenue = completedDeals.reduce((sum, d) => sum + Number(d.actualRevenue || 0), 0);
    const activeDeals = deals.filter(d =>
      ['CONFIRMED', 'IN_PROGRESS'].includes(d.status),
    ).length;
    const totalDeals = deals.length;
    const conversionRate = totalDeals > 0
      ? completedDeals.length / totalDeals
      : 0;

    return {
      revenue,
      activeDeals,
      avgDealValue: completedDeals.length > 0 ? Math.round(revenue / completedDeals.length) : 0,
      conversionRate: Math.round(conversionRate * 1000) / 10,
    };
  }

  private async getAffiliateHealth(userId: string, tenantId: string, period: string) {
    const links = await this.prisma.affiliateLink.findMany({
      where: { userId, tenantId, isActive: true },
      select: {
        clickCount: true,
        conversionCount: true,
        revenueTotal: true,
        productName: true,
      },
    });

    const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);
    const totalConversions = links.reduce((sum, l) => sum + l.conversionCount, 0);
    const totalRevenue = links.reduce((sum, l) => sum + Number(l.revenueTotal), 0);
    const conversionRate = totalClicks > 0 ? totalConversions / totalClicks : 0;

    const topLink = links.length > 0
      ? links.sort((a, b) => Number(b.revenueTotal) - Number(a.revenueTotal))[0]
      : null;

    return {
      revenue: totalRevenue,
      totalClicks,
      conversionRate: Math.round(conversionRate * 1000) / 10,
      topLink: topLink
        ? { name: topLink.productName || 'Unknown', revenue: Number(topLink.revenueTotal) }
        : null,
    };
  }

  private async getSubscriptionHealth(userId: string, tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, tenantId, status: 'ACTIVE' },
      select: { plan: true },
    });

    // Platform subscription is a cost, not revenue — include for completeness
    return {
      revenue: 0, // This is what the creator pays, not earns
      plan: sub?.plan || 'FREE',
    };
  }

  private async getFollowerCount(userId: string, tenantId: string): Promise<number> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, tenantId, isActive: true },
      select: { followerCount: true },
    });
    return accounts.reduce((sum, a) => sum + (a.followerCount || 0), 0);
  }
}
