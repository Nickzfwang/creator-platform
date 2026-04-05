import { Test, TestingModule } from '@nestjs/testing';
import { SocialPlatform } from '@prisma/client';
import { SocialSyncService } from '../social-sync.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { YouTubeApiService } from '../youtube-api.service';
import { TwitterApiService } from '../twitter-api.service';
import { MetaApiService } from '../meta-api.service';
import { TikTokApiService } from '../tiktok-api.service';

const mockPrisma = () => ({
  socialAccount: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  platformAnalytics: {
    upsert: jest.fn(),
  },
});

const mockEncryption = () => ({
  encrypt: jest.fn((v: string) => `enc_${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc_', '')),
});

const mockYoutubeApi = () => ({
  getChannelStats: jest.fn(),
  getRecentVideoStats: jest.fn(),
  refreshAccessToken: jest.fn(),
});

const mockTwitterApi = () => ({
  getUserInfo: jest.fn(),
  getRecentTweetMetrics: jest.fn(),
  refreshAccessToken: jest.fn(),
});

const mockMetaApi = () => ({
  getPageInsights: jest.fn(),
  getInstagramMetrics: jest.fn(),
});

const mockTiktokApi = () => ({
  getUserInfo: jest.fn(),
  getVideoList: jest.fn(),
  refreshAccessToken: jest.fn(),
});

describe('SocialSyncService', () => {
  let service: SocialSyncService;
  let prisma: ReturnType<typeof mockPrisma>;
  let encryption: ReturnType<typeof mockEncryption>;
  let youtubeApi: ReturnType<typeof mockYoutubeApi>;
  let twitterApi: ReturnType<typeof mockTwitterApi>;
  let metaApi: ReturnType<typeof mockMetaApi>;
  let tiktokApi: ReturnType<typeof mockTiktokApi>;

  beforeEach(async () => {
    prisma = mockPrisma();
    encryption = mockEncryption();
    youtubeApi = mockYoutubeApi();
    twitterApi = mockTwitterApi();
    metaApi = mockMetaApi();
    tiktokApi = mockTiktokApi();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: YouTubeApiService, useValue: youtubeApi },
        { provide: TwitterApiService, useValue: twitterApi },
        { provide: MetaApiService, useValue: metaApi },
        { provide: TikTokApiService, useValue: tiktokApi },
      ],
    }).compile();

    service = module.get(SocialSyncService);
  });

  const makeAccount = (overrides: Partial<{
    id: string; userId: string; tenantId: string; platform: SocialPlatform;
    platformUserId: string; accessToken: string; refreshToken: string | null;
    tokenExpiresAt: Date | null;
  }> = {}) => ({
    id: 'acc-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    platform: SocialPlatform.YOUTUBE,
    platformUserId: 'UC123',
    accessToken: 'enc_valid-token',
    refreshToken: 'enc_refresh-token',
    tokenExpiresAt: new Date(Date.now() + 86400_000), // future = valid
    ...overrides,
  });

  // ─── syncSingleAccount ───

  describe('syncSingleAccount', () => {
    it('should sync YouTube account and upsert analytics', async () => {
      const account = makeAccount();
      youtubeApi.getChannelStats.mockResolvedValue({
        subscriberCount: 1000, viewCount: 50000, videoCount: 100,
      });
      youtubeApi.getRecentVideoStats.mockResolvedValue({
        videos: [{ id: 'v1', title: 'Video 1', views: 5000, likes: 200, comments: 30 }],
        totalLikes: 200, totalComments: 30, engagementRate: 4.6,
      });

      await service.syncSingleAccount(account);

      expect(prisma.platformAnalytics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            followers: 1000,
            views: 50000,
            likes: 200,
            comments: 30,
          }),
        }),
      );
      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ followerCount: 1000 }),
        }),
      );
    });

    it('should sync Twitter account', async () => {
      const account = makeAccount({ platform: SocialPlatform.TWITTER, platformUserId: 'tw-1' });
      twitterApi.getUserInfo.mockResolvedValue({
        id: 'tw-1', username: 'tester', followersCount: 500,
      });
      twitterApi.getRecentTweetMetrics.mockResolvedValue({
        tweets: [{ id: 't1', text: 'hello', impressions: 1000, likes: 50 }],
        totalLikes: 50, totalRetweets: 10, engagementRate: 6.0,
      });

      await service.syncSingleAccount(account);

      expect(prisma.platformAnalytics.upsert).toHaveBeenCalled();
    });

    it('should sync Facebook account', async () => {
      const account = makeAccount({ platform: SocialPlatform.FACEBOOK, platformUserId: 'page-1' });
      metaApi.getPageInsights.mockResolvedValue({
        followers: 2000, totalReach: 10000, engagementRate: 3.5,
      });

      await service.syncSingleAccount(account);

      expect(metaApi.getPageInsights).toHaveBeenCalledWith('valid-token', 'page-1');
    });

    it('should sync Instagram account', async () => {
      const account = makeAccount({ platform: SocialPlatform.INSTAGRAM, platformUserId: 'ig-1' });
      metaApi.getInstagramMetrics.mockResolvedValue({
        followers: 3000, mediaCount: 50, engagementRate: 5.2,
        recentMedia: [
          { id: 'm1', caption: 'post', likeCount: 100, commentsCount: 20 },
        ],
      });

      await service.syncSingleAccount(account);

      expect(metaApi.getInstagramMetrics).toHaveBeenCalledWith('valid-token', 'ig-1');
    });

    it('should sync TikTok account', async () => {
      const account = makeAccount({ platform: SocialPlatform.TIKTOK, platformUserId: 'tt-1' });
      tiktokApi.getUserInfo.mockResolvedValue({
        openId: 'tt-1', displayName: 'creator', followerCount: 8000,
      });
      tiktokApi.getVideoList.mockResolvedValue({
        videos: [{ id: 'v1', title: 'dance', views: 50000, likes: 3000, comments: 200, shares: 500 }],
        totalViews: 50000, engagementRate: 7.4,
      });

      await service.syncSingleAccount(account);

      expect(prisma.platformAnalytics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ followers: 8000 }),
        }),
      );
    });

    it('should return zeros for Threads (not implemented)', async () => {
      const account = makeAccount({ platform: SocialPlatform.THREADS });

      await service.syncSingleAccount(account);

      expect(prisma.platformAnalytics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            followers: 0, views: 0, likes: 0, comments: 0, shares: 0,
          }),
        }),
      );
    });

    it('should auto-refresh expired YouTube token', async () => {
      const account = makeAccount({
        tokenExpiresAt: new Date(Date.now() - 3600_000), // expired
      });
      youtubeApi.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access', refreshToken: 'new-refresh',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      youtubeApi.getChannelStats.mockResolvedValue({
        subscriberCount: 100, viewCount: 500, videoCount: 10,
      });
      youtubeApi.getRecentVideoStats.mockResolvedValue({
        videos: [], totalLikes: 0, totalComments: 0, engagementRate: 0,
      });

      await service.syncSingleAccount(account);

      expect(youtubeApi.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: expect.objectContaining({
            accessToken: 'enc_new-access',
          }),
        }),
      );
    });

    it('should skip sync if token expired and no refresh token', async () => {
      const account = makeAccount({
        tokenExpiresAt: new Date(Date.now() - 3600_000),
        refreshToken: null,
      });

      await service.syncSingleAccount(account);

      expect(youtubeApi.getChannelStats).not.toHaveBeenCalled();
      expect(prisma.platformAnalytics.upsert).not.toHaveBeenCalled();
    });

    it('should skip Meta platforms with expired tokens (no refresh)', async () => {
      const account = makeAccount({
        platform: SocialPlatform.FACEBOOK,
        tokenExpiresAt: new Date(Date.now() - 3600_000),
        refreshToken: 'enc_some-token',
      });

      await service.syncSingleAccount(account);

      expect(metaApi.getPageInsights).not.toHaveBeenCalled();
    });
  });

  // ─── syncAllAccounts ───

  describe('syncAllAccounts', () => {
    it('should sync all active accounts', async () => {
      const accounts = [
        makeAccount({ id: 'acc-1', platform: SocialPlatform.YOUTUBE }),
        makeAccount({ id: 'acc-2', platform: SocialPlatform.TWITTER }),
      ];
      prisma.socialAccount.findMany.mockResolvedValue(accounts);

      youtubeApi.getChannelStats.mockResolvedValue({ subscriberCount: 0, viewCount: 0, videoCount: 0 });
      youtubeApi.getRecentVideoStats.mockResolvedValue({ videos: [], totalLikes: 0, totalComments: 0, engagementRate: 0 });
      twitterApi.getUserInfo.mockResolvedValue({ id: 'tw-1', username: 'u', followersCount: 0 });
      twitterApi.getRecentTweetMetrics.mockResolvedValue({ tweets: [], totalLikes: 0, totalRetweets: 0, engagementRate: 0 });

      await service.syncAllAccounts();

      expect(prisma.platformAnalytics.upsert).toHaveBeenCalledTimes(2);
    });

    it('should continue syncing even if one account fails', async () => {
      const accounts = [
        makeAccount({ id: 'acc-1', platform: SocialPlatform.YOUTUBE }),
        makeAccount({ id: 'acc-2', platform: SocialPlatform.TWITTER }),
      ];
      prisma.socialAccount.findMany.mockResolvedValue(accounts);

      youtubeApi.getChannelStats.mockRejectedValue(new Error('API down'));
      twitterApi.getUserInfo.mockResolvedValue({ id: 'tw-1', username: 'u', followersCount: 0 });
      twitterApi.getRecentTweetMetrics.mockResolvedValue({ tweets: [], totalLikes: 0, totalRetweets: 0, engagementRate: 0 });

      await service.syncAllAccounts();

      // Twitter should still be synced even though YouTube failed
      expect(prisma.platformAnalytics.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ─── syncUserAccounts ───

  describe('syncUserAccounts', () => {
    it('should return per-account results', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        makeAccount({ id: 'acc-1', platform: SocialPlatform.YOUTUBE }),
      ]);
      youtubeApi.getChannelStats.mockResolvedValue({ subscriberCount: 100, viewCount: 500, videoCount: 10 });
      youtubeApi.getRecentVideoStats.mockResolvedValue({ videos: [], totalLikes: 0, totalComments: 0, engagementRate: 0 });

      const result = await service.syncUserAccounts('user-1', 'tenant-1');

      expect(result.syncedAt).toBeDefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('success');
    });

    it('should report errors per account', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        makeAccount({ id: 'acc-1', platform: SocialPlatform.YOUTUBE }),
      ]);
      youtubeApi.getChannelStats.mockRejectedValue(new Error('Quota exceeded'));

      const result = await service.syncUserAccounts('user-1', 'tenant-1');

      expect(result.results[0].status).toBe('error');
      expect(result.results[0].error).toContain('Quota exceeded');
    });
  });

  // ─── getSyncStatus ───

  describe('getSyncStatus', () => {
    it('should return status with token state and next sync', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{
        id: 'acc-1',
        platform: 'YOUTUBE',
        platformUsername: 'Channel',
        lastSyncedAt: new Date(),
        tokenExpiresAt: new Date(Date.now() + 86400_000),
      }]);

      const result = await service.getSyncStatus('user-1', 'tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].tokenStatus).toBe('valid');
      expect(result[0].nextSyncAt).toBeDefined();
    });

    it('should handle accounts with null lastSyncedAt', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{
        id: 'acc-1',
        platform: 'TWITTER',
        platformUsername: 'user',
        lastSyncedAt: null,
        tokenExpiresAt: null,
      }]);

      const result = await service.getSyncStatus('user-1', 'tenant-1');

      expect(result[0].lastSyncedAt).toBeNull();
      expect(result[0].tokenStatus).toBe('valid'); // null expiry = valid
    });
  });
});
