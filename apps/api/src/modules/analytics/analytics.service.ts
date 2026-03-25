import { Injectable, Logger } from '@nestjs/common';
import { SocialPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface DateRange {
  start: Date;
  end: Date;
}

export interface ContentItem {
  id: string;
  title: string;
  views: number;
  platform: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Overview (aggregated across all platforms) ───

  async getOverview(userId: string, tenantId: string, period: string = '30d') {
    const { start, end } = this.parsePeriod(period);
    const prevRange = this.previousPeriod(start, end);

    const [current, previous, platformBreakdown] = await Promise.all([
      this.aggregateMetrics(userId, tenantId, start, end),
      this.aggregateMetrics(userId, tenantId, prevRange.start, prevRange.end),
      this.getPlatformBreakdown(userId, tenantId, start, end),
    ]);

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      metrics: {
        followers: current.followers,
        views: current.views,
        likes: current.likes,
        comments: current.comments,
        shares: current.shares,
        engagementRate: current.engagementRate,
      },
      changes: {
        followers: this.calcChangePercent(current.followers, previous.followers),
        views: this.calcChangePercent(current.views, previous.views),
        likes: this.calcChangePercent(current.likes, previous.likes),
        comments: this.calcChangePercent(current.comments, previous.comments),
        shares: this.calcChangePercent(current.shares, previous.shares),
        engagementRate: this.calcChangePercent(current.engagementRate, previous.engagementRate),
      },
      platformBreakdown,
    };
  }

  // ─── Platform-specific analytics ───

  async getPlatformStats(
    userId: string,
    tenantId: string,
    period: string = '30d',
    platform?: SocialPlatform,
  ) {
    const { start, end } = this.parsePeriod(period);

    const where: Prisma.PlatformAnalyticsWhereInput = {
      userId,
      tenantId,
      date: { gte: start, lte: end },
      ...(platform && {
        socialAccount: { platform },
      }),
    };

    const dailyData = await this.prisma.platformAnalytics.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        socialAccount: {
          select: { platform: true, platformUsername: true },
        },
      },
    });

    // Build daily trends
    const trends: Record<string, { date: string; views: number; likes: number; comments: number; shares: number; followers: number }> = {};
    for (const d of dailyData) {
      const dateKey = d.date.toISOString().split('T')[0];
      if (!trends[dateKey]) {
        trends[dateKey] = { date: dateKey, views: 0, likes: 0, comments: 0, shares: 0, followers: 0 };
      }
      trends[dateKey].views += d.views ?? 0;
      trends[dateKey].likes += d.likes ?? 0;
      trends[dateKey].comments += d.comments ?? 0;
      trends[dateKey].shares += d.shares ?? 0;
      trends[dateKey].followers = Math.max(trends[dateKey].followers, d.followers ?? 0);
    }

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      platform: platform ?? 'all',
      dailyTrends: Object.values(trends),
      totals: {
        views: dailyData.reduce((sum, d) => sum + (d.views ?? 0), 0),
        likes: dailyData.reduce((sum, d) => sum + (d.likes ?? 0), 0),
        comments: dailyData.reduce((sum, d) => sum + (d.comments ?? 0), 0),
        shares: dailyData.reduce((sum, d) => sum + (d.shares ?? 0), 0),
      },
    };
  }

  // ─── Cross-platform comparison ───

  async getCrossPlatformComparison(userId: string, tenantId: string, period: string = '30d') {
    const { start, end } = this.parsePeriod(period);

    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, tenantId, isActive: true },
      select: { id: true, platform: true, platformUsername: true, followerCount: true },
    });

    const platformStats = await Promise.all(
      accounts.map(async (account) => {
        const analytics = await this.prisma.platformAnalytics.aggregate({
          where: {
            socialAccountId: account.id,
            date: { gte: start, lte: end },
          },
          _sum: {
            views: true,
            likes: true,
            comments: true,
            shares: true,
          },
          _avg: {
            engagementRate: true,
          },
        });

        return {
          platform: account.platform,
          platformUsername: account.platformUsername,
          followers: account.followerCount ?? 0,
          totalViews: analytics._sum.views ?? 0,
          totalLikes: analytics._sum.likes ?? 0,
          totalComments: analytics._sum.comments ?? 0,
          totalShares: analytics._sum.shares ?? 0,
          avgEngagementRate: Number((analytics._avg.engagementRate ?? 0).toFixed(2)),
        };
      }),
    );

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      platforms: platformStats,
    };
  }

  // ─── Revenue Analytics ───

  async getRevenueAnalytics(userId: string, tenantId: string, period: string = '30d', source: string = 'all') {
    const { start, end } = this.parsePeriod(period);

    const results: {
      subscription: number;
      membership: number;
      affiliate: number;
      total: number;
      breakdown: Array<{ date: string; subscription: number; membership: number; affiliate: number }>;
    } = {
      subscription: 0,
      membership: 0,
      affiliate: 0,
      total: 0,
      breakdown: [],
    };

    // Affiliate revenue
    if (source === 'all' || source === 'affiliate') {
      const affiliateRevenue = await this.prisma.affiliateEvent.aggregate({
        where: {
          link: { userId },
          tenantId,
          eventType: 'PURCHASE',
          createdAt: { gte: start, lte: end },
        },
        _sum: { revenueAmount: true },
      });
      results.affiliate = Number(affiliateRevenue._sum.revenueAmount ?? 0);
    }

    // Membership revenue (count active memberships × tier price as estimate)
    if (source === 'all' || source === 'membership') {
      const memberships = await this.prisma.membership.findMany({
        where: {
          creatorUserId: userId,
          tenantId,
          status: 'ACTIVE',
          createdAt: { lte: end },
        },
        include: {
          tier: { select: { priceMonthly: true } },
        },
      });
      results.membership = memberships.reduce(
        (sum, m) => sum + Number(m.tier.priceMonthly ?? 0),
        0,
      );
    }

    // Subscription revenue — based on plan pricing
    if (source === 'all' || source === 'subscription') {
      const activeSubs = await this.prisma.subscription.findMany({
        where: {
          userId,
          tenantId,
          status: 'ACTIVE',
          plan: { not: 'FREE' },
        },
        select: { plan: true },
      });

      const planPrices: Record<string, number> = {
        STARTER: 29,
        PRO: 79,
        BUSINESS: 199,
      };

      results.subscription = activeSubs.reduce(
        (sum, sub) => sum + (planPrices[sub.plan] ?? 0),
        0,
      );
    }

    results.total = results.subscription + results.membership + results.affiliate;

    // Build daily breakdown for affiliate (the only one with per-day granularity right now)
    if (source === 'all' || source === 'affiliate') {
      const dailyAffiliate = await this.prisma.affiliateEvent.groupBy({
        by: ['createdAt'],
        where: {
          link: { userId },
          tenantId,
          eventType: 'PURCHASE',
          createdAt: { gte: start, lte: end },
        },
        _sum: { revenueAmount: true },
      });

      const dailyMap: Record<string, { subscription: number; membership: number; affiliate: number }> = {};
      for (const d of dailyAffiliate) {
        const dateKey = d.createdAt.toISOString().split('T')[0];
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { subscription: 0, membership: 0, affiliate: 0 };
        }
        dailyMap[dateKey].affiliate += Number(d._sum.revenueAmount ?? 0);
      }
      results.breakdown = Object.entries(dailyMap).map(([date, amounts]) => ({
        date,
        ...amounts,
      }));
    }

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      source,
      ...results,
    };
  }

  // ─── Content Performance Ranking ───

  async getTopContent(userId: string, tenantId: string, period: string = '30d', limit: number = 10) {
    const { start, end } = this.parsePeriod(period);

    const analytics = await this.prisma.platformAnalytics.findMany({
      where: {
        userId,
        tenantId,
        date: { gte: start, lte: end },
        topContent: { not: Prisma.AnyNull },
      },
      select: {
        topContent: true,
        socialAccount: {
          select: { platform: true },
        },
      },
    });

    // Collect top content from all analytics records
    const allContent: ContentItem[] = [];

    for (const a of analytics) {
      const content = a.topContent as unknown as Array<{ id: string; title: string; views: number }>;
      if (Array.isArray(content)) {
        for (const c of content) {
          allContent.push({
            ...c,
            platform: a.socialAccount.platform,
          });
        }
      }
    }

    // Deduplicate by id, sum views
    const contentMap = new Map<string, ContentItem>();
    for (const c of allContent) {
      const existing = contentMap.get(c.id);
      if (existing) {
        existing.views += c.views;
      } else {
        contentMap.set(c.id, { ...c });
      }
    }

    // Sort by views and take top N
    const ranked = Array.from(contentMap.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      content: ranked,
    };
  }

  // ─── Helpers ───

  private async aggregateMetrics(userId: string, tenantId: string, start: Date, end: Date) {
    const result = await this.prisma.platformAnalytics.aggregate({
      where: {
        userId,
        tenantId,
        date: { gte: start, lte: end },
      },
      _sum: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
      },
      _max: {
        followers: true,
      },
      _avg: {
        engagementRate: true,
      },
    });

    return {
      followers: result._max.followers ?? 0,
      views: result._sum.views ?? 0,
      likes: result._sum.likes ?? 0,
      comments: result._sum.comments ?? 0,
      shares: result._sum.shares ?? 0,
      engagementRate: Number((result._avg.engagementRate ?? 0).toFixed(2)),
    };
  }

  private async getPlatformBreakdown(userId: string, tenantId: string, start: Date, end: Date) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, tenantId, isActive: true },
      select: { id: true, platform: true },
    });

    const breakdown: Record<string, { views: number; likes: number; comments: number; shares: number }> = {};

    for (const account of accounts) {
      const agg = await this.prisma.platformAnalytics.aggregate({
        where: {
          socialAccountId: account.id,
          date: { gte: start, lte: end },
        },
        _sum: {
          views: true,
          likes: true,
          comments: true,
          shares: true,
        },
      });

      breakdown[account.platform] = {
        views: agg._sum.views ?? 0,
        likes: agg._sum.likes ?? 0,
        comments: agg._sum.comments ?? 0,
        shares: agg._sum.shares ?? 0,
      };
    }

    return breakdown;
  }

  private parsePeriod(period: string, startDate?: string, endDate?: string): DateRange {
    const end = endDate ? new Date(endDate) : new Date();
    let start: Date;

    if (startDate) {
      start = new Date(startDate);
    } else {
      start = new Date(end);
      const days = parseInt(period) || 30;
      start.setDate(start.getDate() - days);
    }

    return { start, end };
  }

  private previousPeriod(start: Date, end: Date): DateRange {
    const duration = end.getTime() - start.getTime();
    return {
      start: new Date(start.getTime() - duration),
      end: new Date(start.getTime()),
    };
  }

  private calcChangePercent(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }
}
