import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocialPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { YouTubeApiService } from './youtube-api.service';

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

      if (account.platform === SocialPlatform.YOUTUBE) {
        const newTokens = await this.youtubeApi.refreshAccessToken(refreshToken);
        accessToken = newTokens.accessToken;

        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: this.encryption.encrypt(newTokens.accessToken),
            tokenExpiresAt: newTokens.expiresAt,
            ...(newTokens.refreshToken !== refreshToken
              ? { refreshToken: this.encryption.encrypt(newTokens.refreshToken!) }
              : {}),
          },
        });

        this.logger.log(`Auto-refreshed token for account ${account.id}`);
      } else {
        this.logger.warn(`Token expired for account ${account.id}, refresh not implemented for ${account.platform}`);
        return;
      }
    }

    // Fetch metrics from platform API
    const metrics = await this.fetchPlatformMetrics(account.platform, accessToken);

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
  ): Promise<PlatformMetrics> {
    if (platform === SocialPlatform.YOUTUBE) {
      const stats = await this.youtubeApi.getChannelStats(accessToken);
      return {
        followers: stats.subscriberCount,
        views: stats.viewCount,
        likes: 0,
        comments: 0,
        shares: 0,
        engagementRate: 0,
        topContent: [],
      };
    }

    // Other platforms not yet implemented — return zeros
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
