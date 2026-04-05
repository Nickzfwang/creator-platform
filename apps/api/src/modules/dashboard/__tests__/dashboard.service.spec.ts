import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { PaymentService } from '../../payment/payment.service';

const mockPrisma = () => ({
  platformAnalytics: { findMany: jest.fn() },
  socialAccount: { findMany: jest.fn() },
  post: { findMany: jest.fn(), count: jest.fn() },
});

const mockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

const mockPaymentService = () => ({
  getCurrentSubscription: jest.fn().mockResolvedValue({
    subscription: { id: 'sub-1', plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: new Date().toISOString() },
    usage: { videosUsed: 1, videosLimit: 5, postsUsed: 3, postsLimit: 20, botMessagesUsed: 0, botMessagesLimit: 100 },
    percentages: { videos: 20, posts: 15, botMessages: 0, brandDeals: 0 },
  }),
});

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;
  let payment: ReturnType<typeof mockPaymentService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    redis = mockRedis();
    payment = mockPaymentService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: PaymentService, useValue: payment },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  describe('getOverview', () => {
    it('should return cached result if available', async () => {
      const cached = { metrics: { totalFollowers: 100 } };
      redis.get.mockResolvedValue(cached);

      const result = await service.getOverview('user-1', 'tenant-1');
      expect(result).toEqual(cached);
      expect(prisma.platformAnalytics.findMany).not.toHaveBeenCalled();
    });

    it('should compute overview from analytics data', async () => {
      redis.get.mockResolvedValue(null);
      const date = new Date('2026-03-15');
      prisma.platformAnalytics.findMany
        .mockResolvedValueOnce([ // current
          { date, followers: 100, views: 500, revenue: 10, engagementRate: 5.0, topContent: null, socialAccountId: 'sa-1' },
        ])
        .mockResolvedValueOnce([ // previous
          { date, followers: 80, views: 300, revenue: 5, engagementRate: 4.0, topContent: null, socialAccountId: 'sa-1' },
        ]);
      prisma.socialAccount.findMany.mockResolvedValue([{ id: 'sa-1', platform: 'YOUTUBE' }]);

      const result = await service.getOverview('user-1', 'tenant-1');

      expect(result.metrics.totalFollowers).toBe(100);
      expect(result.metrics.totalViews).toBe(500);
      expect(result.metrics.followersChange).toBe(20); // 100-80
      expect(result.trends).toBeDefined();
      expect(result.platformBreakdown).toBeDefined();
      expect(redis.set).toHaveBeenCalled();
    });

    it('should handle empty analytics', async () => {
      redis.get.mockResolvedValue(null);
      prisma.platformAnalytics.findMany.mockResolvedValue([]);
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getOverview('user-1', 'tenant-1');

      expect(result.metrics.totalFollowers).toBe(0);
      expect(result.metrics.totalViews).toBe(0);
      expect(result.trends).toEqual([]);
    });
  });

  describe('getRecentPosts', () => {
    it('should return scheduled posts', async () => {
      prisma.post.findMany.mockResolvedValue([{
        id: 'post-1', contentText: 'Hello',
        platforms: ['YOUTUBE', 'TWITTER'], status: 'SCHEDULED',
        scheduledAt: new Date('2026-04-10'), type: 'TEXT',
        mediaUrls: [], clip: null,
      }]);

      const result = await service.getRecentPosts('user-1', 'tenant-1');

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].platforms).toEqual(['YOUTUBE', 'TWITTER']);
      expect(result.posts[0].thumbnailUrl).toBeNull();
    });

    it('should handle non-array platforms', async () => {
      prisma.post.findMany.mockResolvedValue([{
        id: 'post-1', contentText: 'Hello',
        platforms: 'invalid', status: 'SCHEDULED',
        scheduledAt: null, type: 'TEXT', mediaUrls: [], clip: null,
      }]);

      const result = await service.getRecentPosts('user-1', 'tenant-1');
      expect(result.posts[0].platforms).toEqual([]);
    });

    it('should return empty when no scheduled posts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.getRecentPosts('user-1', 'tenant-1');
      expect(result.posts).toEqual([]);
    });
  });

  describe('getQuickStats', () => {
    it('should return today stats and subscription info', async () => {
      prisma.platformAnalytics.findMany.mockResolvedValue([
        { views: 50, followers: 5, revenue: 1.5, engagementRate: 3.0 },
      ]);
      prisma.post.count.mockResolvedValue(2);
      prisma.socialAccount.findMany.mockResolvedValue([
        { platform: 'YOUTUBE', platformUsername: 'MyCh', isActive: true, lastSyncedAt: new Date() },
      ]);

      const result = await service.getQuickStats('user-1', 'tenant-1');

      expect(result.today.views).toBe(50);
      expect(result.today.postsPublished).toBe(2);
      expect(result.subscription.plan).toBe('FREE');
      expect(result.subscription.usage.videosUsed).toBe(1);
      expect(result.connectedPlatforms).toHaveLength(1);
      expect(result.connectedPlatforms[0].platform).toBe('YOUTUBE');
    });

    it('should handle no analytics data', async () => {
      prisma.platformAnalytics.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getQuickStats('user-1', 'tenant-1');

      expect(result.today.views).toBe(0);
      expect(result.today.newFollowers).toBe(0);
      expect(result.connectedPlatforms).toEqual([]);
    });
  });
});
