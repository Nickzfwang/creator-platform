import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocialPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { YouTubeApiService } from './youtube-api.service';
import { TwitterApiService } from './twitter-api.service';
import { MetaApiService } from './meta-api.service';
import { TikTokApiService } from './tiktok-api.service';

interface PlatformMetrics {
  followers: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  topContent: Array<{ id: string; title: string; views: number }>;
}

@Injectable()
export class SocialSyncService {
  private readonly logger = new Logger(SocialSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly youtubeApi: YouTubeApiService,
    private readonly twitterApi: TwitterApiService,
    private readonly metaApi: MetaApiService,
    private readonly tiktokApi: TikTokApiService,
  ) {}

  /**
   * Cron job: Sync all active social accounts every 6 hours
   * Pulls follower counts, engagement metrics, and content performance
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async syncAllAccounts() {
    this.logger.log('Starting scheduled social account sync...');

    const activeAccounts = await this.prisma.socialAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        platform: true,
        platformUserId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    });

    this.logger.log(`Found ${activeAccounts.length} active accounts to sync`);

    let successCount = 0;
    let failCount = 0;

    for (const account of activeAccounts) {
      try {
        await this.syncSingleAccount(account);
        successCount++;
      } catch (error) {
        failCount++;
        this.logger.warn(
          `Failed to sync account ${account.id} (${account.platform}): ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(
      `Social sync completed: ${successCount} success, ${failCount} failed out of ${activeAccounts.length} accounts`,
    );
  }

  /**
   * Sync a single social account — can be triggered manually or by cron
   */
  async syncSingleAccount(account: {
    id: string;
    userId: string;
    tenantId: string;
    platform: SocialPlatform;
    platformUserId: string;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
  }) {
    this.logger.debug(`Syncing ${account.platform} account ${account.id}`);

    // Auto-refresh expired token
    let accessToken = this.encryption.decrypt(account.accessToken);

    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      if (!account.refreshToken) {
        this.logger.warn(`Token expired for account ${account.id}, no refresh token available`);
        return;
      }

      const refreshToken = this.encryption.decrypt(account.refreshToken);

      let newTokens: { accessToken: string; refreshToken?: string; expiresAt: Date } | null = null;

      switch (account.platform) {
        case SocialPlatform.YOUTUBE: {
          const yt = await this.youtubeApi.refreshAccessToken(refreshToken);
          newTokens = { accessToken: yt.accessToken, refreshToken: yt.refreshToken, expiresAt: yt.expiresAt };
          break;
        }
        case SocialPlatform.TWITTER: {
          const tw = await this.twitterApi.refreshAccessToken(refreshToken);
          newTokens = { accessToken: tw.accessToken, refreshToken: tw.refreshToken, expiresAt: tw.expiresAt };
          break;
        }
        case SocialPlatform.TIKTOK: {
          const tt = await this.tiktokApi.refreshAccessToken(refreshToken);
          newTokens = { accessToken: tt.accessToken, refreshToken: tt.refreshToken, expiresAt: tt.expiresAt };
          break;
        }
        default:
          // Meta (FB/IG/Threads) tokens last 60 days — no refresh, skip
          this.logger.warn(`Token expired for ${account.platform} account ${account.id}, re-auth required`);
          return;
      }

      if (newTokens) {
        accessToken = newTokens.accessToken;
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: this.encryption.encrypt(newTokens.accessToken),
            tokenExpiresAt: newTokens.expiresAt,
            ...(newTokens.refreshToken && newTokens.refreshToken !== refreshToken
              ? { refreshToken: this.encryption.encrypt(newTokens.refreshToken) }
              : {}),
          },
        });
        this.logger.log(`Auto-refreshed token for account ${account.id}`);
      }
    }

    // Fetch metrics from platform API
    const metrics = await this.fetchPlatformMetrics(account.platform, accessToken, account.platformUserId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert daily analytics
    await this.prisma.platformAnalytics.upsert({
      where: {
        socialAccountId_date: {
          socialAccountId: account.id,
          date: today,
        },
      },
      update: {
        followers: metrics.followers,
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        engagementRate: metrics.engagementRate,
        topContent: metrics.topContent as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: account.userId,
        tenantId: account.tenantId,
        socialAccountId: account.id,
        date: today,
        followers: metrics.followers,
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        engagementRate: metrics.engagementRate,
        topContent: metrics.topContent as unknown as Prisma.InputJsonValue,
      },
    });

    // Update follower count on social account
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        followerCount: metrics.followers,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.debug(`Synced ${account.platform} account ${account.id}: ${metrics.followers} followers`);
  }

  /**
   * Manual sync trigger — syncs all accounts for a specific user
   */
  async syncUserAccounts(userId: string, tenantId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, tenantId, isActive: true },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        platform: true,
        platformUserId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    });

    const results: Array<{ accountId: string; platform: string; status: 'success' | 'error'; error?: string }> = [];

    for (const account of accounts) {
      try {
        await this.syncSingleAccount(account);
        results.push({ accountId: account.id, platform: account.platform, status: 'success' });
      } catch (error) {
        results.push({
          accountId: account.id,
          platform: account.platform,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      syncedAt: new Date().toISOString(),
      results,
    };
  }

  /**
   * Get sync status for user's accounts
   */
  async getSyncStatus(userId: string, tenantId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, tenantId, isActive: true },
      select: {
        id: true,
        platform: true,
        platformUsername: true,
        lastSyncedAt: true,
        tokenExpiresAt: true,
      },
    });

    return accounts.map((a) => ({
      accountId: a.id,
      platform: a.platform,
      platformUsername: a.platformUsername,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      tokenStatus: this.computeTokenStatus(a.tokenExpiresAt),
      nextSyncAt: this.computeNextSync(),
    }));
  }

  /**
   * Fetch metrics from platform API
   * @param platform - social platform
   * @param accessToken - decrypted access token
   */
  private async fetchPlatformMetrics(
    platform: SocialPlatform,
    accessToken: string,
    platformUserId?: string,
  ): Promise<PlatformMetrics> {
    if (platform === SocialPlatform.YOUTUBE) {
      // Fetch channel-level stats
      const stats = await this.youtubeApi.getChannelStats(accessToken);

      // Fetch recent video performance for engagement metrics
      let likes = 0;
      let comments = 0;
      let engagementRate = 0;
      let topContent: Array<{ id: string; title: string; views: number }> = [];

      try {
        const videoStats = await this.youtubeApi.getRecentVideoStats(accessToken, 10);
        likes = videoStats.totalLikes;
        comments = videoStats.totalComments;
        engagementRate = videoStats.engagementRate;
        topContent = videoStats.videos
          .sort((a, b) => b.views - a.views)
          .slice(0, 5)
          .map((v) => ({ id: v.id, title: v.title, views: v.views }));
      } catch (e) {
        this.logger.warn(`Failed to fetch YouTube video stats: ${(e as Error).message}`);
      }

      return {
        followers: stats.subscriberCount,
        views: stats.viewCount,
        likes,
        comments,
        shares: 0,
        engagementRate,
        topContent,
      };
    }

    if (platform === SocialPlatform.TWITTER) {
      try {
        const userInfo = await this.twitterApi.getUserInfo(accessToken);
        const tweetMetrics = await this.twitterApi.getRecentTweetMetrics(
          accessToken, userInfo.id, 10,
        );
        return {
          followers: userInfo.followersCount,
          views: 0, // Twitter doesn't expose total views at account level
          likes: tweetMetrics.totalLikes,
          comments: 0,
          shares: tweetMetrics.totalRetweets,
          engagementRate: tweetMetrics.engagementRate,
          topContent: tweetMetrics.tweets.slice(0, 5).map(t => ({
            id: t.id, title: t.text.slice(0, 80), views: t.impressions,
          })),
        };
      } catch (e) {
        this.logger.warn(`Twitter metrics failed: ${(e as Error).message}`);
        return { followers: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, topContent: [] };
      }
    }

    if (platform === SocialPlatform.FACEBOOK) {
      try {
        // accessToken here is the Page access token (stored during connect)
        const insights = await this.metaApi.getPageInsights(accessToken, platformUserId ?? '');
        return {
          followers: insights.followers,
          views: insights.totalReach,
          likes: 0,
          comments: 0,
          shares: 0,
          engagementRate: insights.engagementRate,
          topContent: [],
        };
      } catch (e) {
        this.logger.warn(`Facebook metrics failed: ${(e as Error).message}`);
        return { followers: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, topContent: [] };
      }
    }

    if (platform === SocialPlatform.INSTAGRAM) {
      try {
        const igMetrics = await this.metaApi.getInstagramMetrics(accessToken, platformUserId ?? '');
        return {
          followers: igMetrics.followers,
          views: 0,
          likes: igMetrics.recentMedia.reduce((s, m) => s + m.likeCount, 0),
          comments: igMetrics.recentMedia.reduce((s, m) => s + m.commentsCount, 0),
          shares: 0,
          engagementRate: igMetrics.engagementRate,
          topContent: igMetrics.recentMedia.slice(0, 5).map(m => ({
            id: m.id, title: m.caption.slice(0, 80), views: m.likeCount,
          })),
        };
      } catch (e) {
        this.logger.warn(`Instagram metrics failed: ${(e as Error).message}`);
        return { followers: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, topContent: [] };
      }
    }

    if (platform === SocialPlatform.TIKTOK) {
      try {
        const ttUser = await this.tiktokApi.getUserInfo(accessToken);
        const ttVideos = await this.tiktokApi.getVideoList(accessToken, 10);
        return {
          followers: ttUser.followerCount,
          views: ttVideos.totalViews,
          likes: ttVideos.videos.reduce((s, v) => s + v.likes, 0),
          comments: ttVideos.videos.reduce((s, v) => s + v.comments, 0),
          shares: ttVideos.videos.reduce((s, v) => s + v.shares, 0),
          engagementRate: ttVideos.engagementRate,
          topContent: ttVideos.videos.slice(0, 5).map(v => ({
            id: v.id, title: v.title.slice(0, 80), views: v.views,
          })),
        };
      } catch (e) {
        this.logger.warn(`TikTok metrics failed: ${(e as Error).message}`);
        return { followers: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, topContent: [] };
      }
    }

    // Threads and other unsupported platforms
    this.logger.warn(`Metrics not implemented for ${platform}, returning zeros`);
    return {
      followers: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      engagementRate: 0,
      topContent: [],
    };
  }

  private computeTokenStatus(
    tokenExpiresAt: Date | null,
  ): 'valid' | 'expiring_soon' | 'expired' {
    if (!tokenExpiresAt) return 'valid';
    const now = Date.now();
    const expiresMs = tokenExpiresAt.getTime();
    if (expiresMs < now) return 'expired';
    if (expiresMs < now + 60 * 60 * 1000) return 'expiring_soon';
    return 'valid';
  }

  private computeNextSync(): string {
    // Next sync is approximately 6 hours from now (cron-based)
    const next = new Date();
    const currentHour = next.getHours();
    const nextSyncHour = Math.ceil(currentHour / 6) * 6;
    next.setHours(nextSyncHour === currentHour ? nextSyncHour + 6 : nextSyncHour, 0, 0, 0);
    return next.toISOString();
  }
}
