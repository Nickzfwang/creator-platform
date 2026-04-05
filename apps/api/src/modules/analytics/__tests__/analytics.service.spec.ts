import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

const mockPrisma = () => ({
  platformAnalytics: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  socialAccount: {
    findMany: jest.fn(),
  },
  affiliateEvent: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  membership: { findMany: jest.fn() },
  subscription: { findMany: jest.fn() },
});

const mockRedis = () => ({
  getOrSet: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    prisma = mockPrisma();
    redis = mockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  describe('getOverview', () => {
    it('should return overview with metrics and changes', async () => {
      prisma.platformAnalytics.aggregate.mockResolvedValue({
        _sum: { views: 1000, likes: 100, comments: 50, shares: 20 },
        _max: { followers: 500 },
        _avg: { engagementRate: 5.5 },
      });
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getOverview('user-1', 'tenant-1', '30d');

      expect(result.period).toBeDefined();
      expect(result.metrics.views).toBe(1000);
      expect(result.metrics.followers).toBe(500);
      expect(result.changes).toBeDefined();
    });

    it('should use Redis cache via getOrSet', async () => {
      prisma.platformAnalytics.aggregate.mockResolvedValue({
        _sum: { views: 0, likes: 0, comments: 0, shares: 0 },
        _max: { followers: 0 },
        _avg: { engagementRate: 0 },
      });
      prisma.socialAccount.findMany.mockResolvedValue([]);

      await service.getOverview('user-1', 'tenant-1', '7d');

      expect(redis.getOrSet).toHaveBeenCalledWith(
        'analytics:overview:user-1:7d',
        300,
        expect.any(Function),
      );
    });

    it('should calculate change percentages correctly', async () => {
      // Current period: 200 views, Previous: 100 views → 100% change
      prisma.platformAnalytics.aggregate
        .mockResolvedValueOnce({ _sum: { views: 200, likes: 0, comments: 0, shares: 0 }, _max: { followers: 0 }, _avg: { engagementRate: 0 } })
        .mockResolvedValueOnce({ _sum: { views: 100, likes: 0, comments: 0, shares: 0 }, _max: { followers: 0 }, _avg: { engagementRate: 0 } });
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getOverview('user-1', 'tenant-1');

      expect(result.changes.views).toBe(100);
    });

    it('should handle zero previous metrics', async () => {
      prisma.platformAnalytics.aggregate
        .mockResolvedValueOnce({ _sum: { views: 50, likes: 0, comments: 0, shares: 0 }, _max: { followers: 10 }, _avg: { engagementRate: 0 } })
        .mockResolvedValueOnce({ _sum: { views: 0, likes: 0, comments: 0, shares: 0 }, _max: { followers: 0 }, _avg: { engagementRate: 0 } });
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getOverview('user-1', 'tenant-1');

      expect(result.changes.views).toBe(100); // from 0 → 50 = 100%
    });
  });

  describe('getPlatformStats', () => {
    it('should return daily trends and totals', async () => {
      const date = new Date('2026-03-01');
      prisma.platformAnalytics.findMany.mockResolvedValue([
        { date, views: 100, likes: 10, comments: 5, shares: 2, socialAccount: { platform: 'YOUTUBE', platformUsername: 'ch' } },
        { date, views: 50, likes: 5, comments: 3, shares: 1, socialAccount: { platform: 'TWITTER', platformUsername: 'u' } },
      ]);

      const result = await service.getPlatformStats('user-1', 'tenant-1', '30d');

      expect(result.platform).toBe('all');
      expect(result.totals.views).toBe(150);
      expect(result.totals.likes).toBe(15);
      expect(result.dailyTrends).toHaveLength(1);
    });

    it('should filter by platform when specified', async () => {
      prisma.platformAnalytics.findMany.mockResolvedValue([]);

      await service.getPlatformStats('user-1', 'tenant-1', '30d', 'YOUTUBE' as any);

      expect(prisma.platformAnalytics.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            socialAccount: { platform: 'YOUTUBE' },
          }),
        }),
      );
    });
  });

  describe('getCrossPlatformComparison', () => {
    it('should return per-platform stats', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        { id: 'sa-1', platform: 'YOUTUBE', platformUsername: 'MyCh', followerCount: 1000 },
      ]);
      prisma.platformAnalytics.aggregate.mockResolvedValue({
        _sum: { views: 5000, likes: 300, comments: 100, shares: 50 },
        _avg: { engagementRate: 6.5 },
      });

      const result = await service.getCrossPlatformComparison('user-1', 'tenant-1');

      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0].platform).toBe('YOUTUBE');
      expect(result.platforms[0].followers).toBe(1000);
      expect(result.platforms[0].totalViews).toBe(5000);
    });

    it('should return empty when no accounts', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([]);

      const result = await service.getCrossPlatformComparison('user-1', 'tenant-1');
      expect(result.platforms).toEqual([]);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should aggregate all revenue sources', async () => {
      prisma.affiliateEvent.aggregate.mockResolvedValue({ _sum: { revenueAmount: 500 } });
      prisma.affiliateEvent.groupBy.mockResolvedValue([]);
      prisma.membership.findMany.mockResolvedValue([
        { tier: { priceMonthly: 99 } },
        { tier: { priceMonthly: 199 } },
      ]);
      prisma.subscription.findMany.mockResolvedValue([{ plan: 'PRO' }]);

      const result = await service.getRevenueAnalytics('user-1', 'tenant-1');

      expect(result.affiliate).toBe(500);
      expect(result.membership).toBe(298); // 99 + 199
      expect(result.subscription).toBe(79); // PRO
      expect(result.total).toBe(877);
    });

    it('should filter by source=affiliate', async () => {
      prisma.affiliateEvent.aggregate.mockResolvedValue({ _sum: { revenueAmount: 200 } });
      prisma.affiliateEvent.groupBy.mockResolvedValue([]);

      const result = await service.getRevenueAnalytics('user-1', 'tenant-1', '30d', 'affiliate');

      expect(result.source).toBe('affiliate');
      expect(result.affiliate).toBe(200);
      expect(result.membership).toBe(0);
      expect(result.subscription).toBe(0);
    });
  });

  describe('getTopContent', () => {
    it('should deduplicate and rank content by views', async () => {
      prisma.platformAnalytics.findMany.mockResolvedValue([
        {
          topContent: [{ id: 'v1', title: 'Video A', views: 100 }, { id: 'v2', title: 'Video B', views: 200 }],
          socialAccount: { platform: 'YOUTUBE' },
        },
        {
          topContent: [{ id: 'v1', title: 'Video A', views: 50 }],
          socialAccount: { platform: 'YOUTUBE' },
        },
      ]);

      const result = await service.getTopContent('user-1', 'tenant-1');

      expect(result.content).toHaveLength(2);
      expect(result.content[0].id).toBe('v2'); // 200 views
      expect(result.content[1].views).toBe(150); // 100+50 deduped
    });

    it('should handle empty topContent', async () => {
      prisma.platformAnalytics.findMany.mockResolvedValue([
        { topContent: null, socialAccount: { platform: 'YOUTUBE' } },
      ]);

      const result = await service.getTopContent('user-1', 'tenant-1');
      expect(result.content).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const content = Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, title: `Video ${i}`, views: i * 10 }));
      prisma.platformAnalytics.findMany.mockResolvedValue([
        { topContent: content, socialAccount: { platform: 'YOUTUBE' } },
      ]);

      const result = await service.getTopContent('user-1', 'tenant-1', '30d', 5);
      expect(result.content).toHaveLength(5);
    });
  });
});
