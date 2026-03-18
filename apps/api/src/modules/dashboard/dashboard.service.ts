import { Injectable, Logger } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';

interface PlatformAnalyticsRow {
  date: Date;
  followers: bigint | number;
  views: bigint | number;
  revenue: string | number;
  engagement_rate: number;
}

interface TopContentItem {
  externalId?: string;
  title?: string;
  views?: number;
  likes?: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ─── Overview ───

  async getOverview(
    userId: string,
    tenantId: string,
    period: '7d' | '30d' | '90d' = '30d',
  ) {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    // Current period analytics
    const currentAnalytics = await this.prisma.platformAnalytics.findMany({
      where: {
        tenantId,
        userId,
        date: { gte: startDate, lte: now },
      },
      orderBy: { date: 'asc' },
    });

    // Previous period analytics (for comparison)
    const previousAnalytics = await this.prisma.platformAnalytics.findMany({
      where: {
        tenantId,
        userId,
        date: { gte: prevStartDate, lt: startDate },
      },
    });

    // Aggregate current metrics
    const currentMetrics = this.aggregateMetrics(currentAnalytics);
    const previousMetrics = this.aggregateMetrics(previousAnalytics);

    // Build trends (grouped by date)
    const trendsMap = new Map<string, { followers: number; views: number; revenue: number; engagementRate: number; count: number }>();
    for (const a of currentAnalytics) {
      const dateKey = a.date.toISOString().split('T')[0];
      const existing = trendsMap.get(dateKey) ?? { followers: 0, views: 0, revenue: 0, engagementRate: 0, count: 0 };
      existing.followers += a.followers ?? 0;
      existing.views += a.views ?? 0;
      existing.revenue += Number(a.revenue ?? 0);
      existing.engagementRate += a.engagementRate ?? 0;
      existing.count += 1;
      trendsMap.set(dateKey, existing);
    }
    const trends = Array.from(trendsMap.entries()).map(([date, data]) => ({
      date,
      followers: data.followers,
      views: data.views,
      revenue: Math.round(data.revenue * 100), // USD cents
      engagementRate: data.count > 0 ? Math.round((data.engagementRate / data.count) * 100) / 100 : 0,
    }));

    // Top content — collect from topContent JSON field
    const topContent: { id: string; title: string; platform: string; views: number; likes: number; engagementRate: number; publishedAt: string }[] = [];
    const socialAccounts = await this.prisma.socialAccount.findMany({
      where: { tenantId, userId },
      select: { id: true, platform: true },
    });
    const accountPlatformMap = new Map(socialAccounts.map((sa) => [sa.id, sa.platform]));

    for (const a of currentAnalytics) {
      const items = a.topContent as unknown as TopContentItem[] | null;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.title && item.views !== undefined) {
          topContent.push({
            id: item.externalId ?? '',
            title: item.title,
            platform: accountPlatformMap.get(a.socialAccountId) ?? 'UNKNOWN',
            views: item.views ?? 0,
            likes: item.likes ?? 0,
            engagementRate: (item.views ?? 0) > 0
              ? Math.round(((item.likes ?? 0) / (item.views ?? 1)) * 10000) / 100
              : 0,
            publishedAt: a.date.toISOString(),
          });
        }
      }
    }
    // Sort by engagement rate desc, take top 5
    topContent.sort((a, b) => b.engagementRate - a.engagementRate);
    const top5Content = topContent.slice(0, 5);

    // Platform breakdown
    const platformMap = new Map<string, { followers: number; views: number; revenue: number; engagementRate: number; count: number }>();
    for (const a of currentAnalytics) {
      const platform = accountPlatformMap.get(a.socialAccountId) ?? 'UNKNOWN';
      const existing = platformMap.get(platform) ?? { followers: 0, views: 0, revenue: 0, engagementRate: 0, count: 0 };
      existing.followers += a.followers ?? 0;
      existing.views += a.views ?? 0;
      existing.revenue += Number(a.revenue ?? 0);
      existing.engagementRate += a.engagementRate ?? 0;
      existing.count += 1;
      platformMap.set(platform, existing);
    }
    const platformBreakdown = Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      followers: data.followers,
      views: data.views,
      revenue: Math.round(data.revenue * 100),
      engagementRate: data.count > 0 ? Math.round((data.engagementRate / data.count) * 100) / 100 : 0,
    }));

    return {
      metrics: {
        totalFollowers: currentMetrics.followers,
        followersChange: currentMetrics.followers - previousMetrics.followers,
        followersChangePercent: this.calcChangePercent(currentMetrics.followers, previousMetrics.followers),
        totalViews: currentMetrics.views,
        viewsChange: currentMetrics.views - previousMetrics.views,
        viewsChangePercent: this.calcChangePercent(currentMetrics.views, previousMetrics.views),
        totalRevenue: currentMetrics.revenue,
        revenueChange: currentMetrics.revenue - previousMetrics.revenue,
        revenueChangePercent: this.calcChangePercent(currentMetrics.revenue, previousMetrics.revenue),
        avgEngagementRate: currentMetrics.avgEngagementRate,
        engagementRateChange: Math.round((currentMetrics.avgEngagementRate - previousMetrics.avgEngagementRate) * 100) / 100,
      },
      trends,
      topContent: top5Content,
      platformBreakdown,
    };
  }

  // ─── Recent Posts ───

  async getRecentPosts(userId: string, tenantId: string, limit: number = 5) {
    const posts = await this.prisma.post.findMany({
      where: {
        tenantId,
        userId,
        status: PostStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: {
        id: true,
        contentText: true,
        platforms: true,
        status: true,
        scheduledAt: true,
        type: true,
        mediaUrls: true,
        clip: { select: { thumbnailUrl: true } },
      },
    });

    return {
      posts: posts.map((p) => ({
        id: p.id,
        contentText: p.contentText,
        platforms: Array.isArray(p.platforms) ? p.platforms : [],
        status: p.status,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        type: p.type,
        mediaUrls: p.mediaUrls,
        thumbnailUrl: p.clip?.thumbnailUrl ?? null,
      })),
    };
  }

  // ─── Quick Stats ───

  async getQuickStats(userId: string, tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's analytics
    const todayAnalytics = await this.prisma.platformAnalytics.findMany({
      where: {
        tenantId,
        userId,
        date: { gte: today, lt: tomorrow },
      },
    });

    const todayViews = todayAnalytics.reduce((sum, a) => sum + (a.views ?? 0), 0);
    const todayFollowers = todayAnalytics.reduce((sum, a) => sum + (a.followers ?? 0), 0);
    const todayRevenue = todayAnalytics.reduce((sum, a) => sum + Number(a.revenue ?? 0), 0);

    // Posts published today
    const postsPublished = await this.prisma.post.count({
      where: {
        tenantId,
        userId,
        status: PostStatus.PUBLISHED,
        publishedAt: { gte: today, lt: tomorrow },
      },
    });

    // Subscription info
    const subData = await this.paymentService.getCurrentSubscription(userId, tenantId);

    // Connected platforms
    const socialAccounts = await this.prisma.socialAccount.findMany({
      where: { tenantId, userId },
      select: {
        platform: true,
        platformUsername: true,
        isActive: true,
        lastSyncedAt: true,
      },
    });

    return {
      today: {
        views: todayViews,
        newFollowers: todayFollowers,
        revenue: Math.round(todayRevenue * 100), // USD cents
        postsPublished,
        botMessages: subData.usage.botMessagesUsed,
      },
      subscription: {
        plan: subData.subscription.plan,
        usage: {
          videosUsed: subData.usage.videosUsed,
          videosLimit: subData.usage.videosLimit,
          postsUsed: subData.usage.postsUsed,
          postsLimit: subData.usage.postsLimit,
        },
      },
      connectedPlatforms: socialAccounts.map((sa) => ({
        platform: sa.platform,
        username: sa.platformUsername,
        connected: sa.isActive,
        lastSyncAt: sa.lastSyncedAt?.toISOString() ?? null,
      })),
    };
  }

  // ─── Helpers ───

  private aggregateMetrics(
    analytics: Array<{
      followers: number | null;
      views: number | null;
      revenue: unknown;
      engagementRate: number | null;
    }>,
  ) {
    const followers = analytics.reduce((sum, a) => sum + (a.followers ?? 0), 0);
    const views = analytics.reduce((sum, a) => sum + (a.views ?? 0), 0);
    const revenue = Math.round(analytics.reduce((sum, a) => sum + Number(a.revenue ?? 0), 0) * 100);
    const avgEngagementRate = analytics.length > 0
      ? Math.round(
          (analytics.reduce((sum, a) => sum + (a.engagementRate ?? 0), 0) / analytics.length) * 100,
        ) / 100
      : 0;

    return { followers, views, revenue, avgEngagementRate };
  }

  private calcChangePercent(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }
}
