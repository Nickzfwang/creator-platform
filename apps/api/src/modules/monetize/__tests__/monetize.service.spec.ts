import { Test, TestingModule } from '@nestjs/testing';
import { MonetizeService } from '../monetize.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { AnalyticsService } from '../../analytics/analytics.service';

describe('MonetizeService', () => {
  let service: MonetizeService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;
  let analyticsService: jest.Mocked<AnalyticsService>;

  const mockUserId = '00000000-0000-0000-0000-000000000001';
  const mockTenantId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizeService,
        {
          provide: PrismaService,
          useValue: {
            membership: { count: jest.fn().mockResolvedValue(0) },
            membershipTier: { findMany: jest.fn().mockResolvedValue([]) },
            digitalProduct: { findMany: jest.fn().mockResolvedValue([]) },
            brandDeal: { findMany: jest.fn().mockResolvedValue([]) },
            affiliateLink: { findMany: jest.fn().mockResolvedValue([]) },
            subscription: { findFirst: jest.fn().mockResolvedValue(null) },
            socialAccount: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: AiService,
          useValue: {
            generateJson: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            getRevenueAnalytics: jest.fn().mockResolvedValue({ total: 0, breakdown: [] }),
          },
        },
      ],
    }).compile();

    service = module.get(MonetizeService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
    analyticsService = module.get(AnalyticsService);
  });

  describe('getHealth', () => {
    it('should return health report with zero revenue for new user', async () => {
      const result = await service.getHealth(mockUserId, mockTenantId);

      expect(result.totalRevenue).toBe(0);
      expect(result.channels.membership.revenue).toBe(0);
      expect(result.channels.digitalProduct.revenue).toBe(0);
      expect(result.channels.brandDeal.revenue).toBe(0);
      expect(result.channels.affiliate.revenue).toBe(0);
      expect(result.period).toBeDefined();
    });

    it('should calculate membership MRR correctly', async () => {
      (prisma.membership.count as jest.Mock)
        .mockResolvedValueOnce(10) // active
        .mockResolvedValueOnce(2); // cancelled recently
      (prisma.membershipTier.findMany as jest.Mock).mockResolvedValue([
        { priceMonthly: 100, memberships: [{ id: '1' }, { id: '2' }, { id: '3' }] },
        { priceMonthly: 300, memberships: [{ id: '4' }, { id: '5' }] },
      ]);

      const result = await service.getHealth(mockUserId, mockTenantId);

      // 3 * 100 + 2 * 300 = 900
      expect(result.channels.membership.revenue).toBe(900);
      expect(result.channels.membership.mrr).toBe(900);
    });

    it('should calculate product revenue from orders', async () => {
      (prisma.digitalProduct.findMany as jest.Mock).mockResolvedValue([
        {
          name: 'Template Pack',
          orders: [{ amount: 29900 }, { amount: 29900 }], // cents
        },
      ]);

      const result = await service.getHealth(mockUserId, mockTenantId);

      expect(result.channels.digitalProduct.revenue).toBe(598); // 29900*2/100
      expect(result.channels.digitalProduct.totalSales).toBe(2);
      expect(result.channels.digitalProduct.topProduct?.name).toBe('Template Pack');
    });

    it('should calculate brand deal revenue from completed deals', async () => {
      (prisma.brandDeal.findMany as jest.Mock).mockResolvedValue([
        { status: 'COMPLETED', actualRevenue: 50000 },
        { status: 'COMPLETED', actualRevenue: 30000 },
        { status: 'IN_PROGRESS', actualRevenue: null },
        { status: 'DRAFT', actualRevenue: null },
      ]);

      const result = await service.getHealth(mockUserId, mockTenantId);

      expect(result.channels.brandDeal.revenue).toBe(80000);
      expect(result.channels.brandDeal.activeDeals).toBe(1);
      expect(result.channels.brandDeal.conversionRate).toBe(50);
    });

    it('should calculate affiliate revenue and conversion rate', async () => {
      (prisma.affiliateLink.findMany as jest.Mock).mockResolvedValue([
        { clickCount: 1000, conversionCount: 50, revenueTotal: 5000, productName: 'Product A' },
        { clickCount: 500, conversionCount: 10, revenueTotal: 1000, productName: 'Product B' },
      ]);

      const result = await service.getHealth(mockUserId, mockTenantId);

      expect(result.channels.affiliate.revenue).toBe(6000);
      expect(result.channels.affiliate.totalClicks).toBe(1500);
      expect(result.channels.affiliate.conversionRate).toBe(4);
      expect(result.channels.affiliate.topLink?.name).toBe('Product A');
    });

    it('should calculate percentage breakdowns correctly', async () => {
      (prisma.affiliateLink.findMany as jest.Mock).mockResolvedValue([
        { clickCount: 100, conversionCount: 10, revenueTotal: 500, productName: 'A' },
      ]);
      (prisma.brandDeal.findMany as jest.Mock).mockResolvedValue([
        { status: 'COMPLETED', actualRevenue: 500 },
      ]);

      const result = await service.getHealth(mockUserId, mockTenantId);

      // Total = 500 + 500 = 1000
      expect(result.channels.affiliate.percentage).toBe(50);
      expect(result.channels.brandDeal.percentage).toBe(50);
    });
  });

  describe('getAdvice', () => {
    it('should return AI suggestions', async () => {
      (aiService.generateJson as jest.Mock).mockResolvedValue({
        suggestions: [
          {
            title: '推出數位商品',
            description: '你尚未使用數位商品管道',
            impact: 'HIGH',
            category: 'NEW_CHANNEL',
            steps: ['製作模板', '設定價格', '推廣'],
            estimatedImpact: '預計月增 $5,000',
          },
        ],
        pricingMembership: null,
        pricingProduct: null,
        unusedChannels: [
          {
            channel: '數位商品',
            reason: '你有穩定粉絲但尚未販售商品',
            estimatedMonthlyRevenue: '$3,000-5,000',
            setupDifficulty: 'EASY',
            prerequisites: ['準備商品內容'],
          },
        ],
      });

      const result = await service.getAdvice(mockUserId, mockTenantId);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].title).toBe('推出數位商品');
      expect(result.unusedChannels).toHaveLength(1);
      expect(result.generatedAt).toBeDefined();
    });

    it('should handle AI failure gracefully', async () => {
      (aiService.generateJson as jest.Mock).mockResolvedValue(null);

      const result = await service.getAdvice(mockUserId, mockTenantId);

      expect(result.suggestions).toEqual([]);
      expect(result.unusedChannels).toEqual([]);
    });
  });

  describe('getForecast', () => {
    it('should return hasEnoughData=false when data insufficient', async () => {
      (analyticsService.getRevenueAnalytics as jest.Mock).mockResolvedValue({
        total: 100,
        breakdown: Array.from({ length: 5 }, (_, i) => ({ date: `2026-03-${i + 1}`, subscription: 10 })),
      });

      const result = await service.getForecast(mockUserId, mockTenantId);

      expect(result.hasEnoughData).toBe(false);
      expect(result.forecast).toBeNull();
    });

    it('should return forecast when data sufficient', async () => {
      (analyticsService.getRevenueAnalytics as jest.Mock).mockResolvedValue({
        total: 3000,
        subscription: 1000,
        membership: 1500,
        affiliate: 500,
        breakdown: Array.from({ length: 30 }, (_, i) => ({
          date: `2026-03-${i + 1}`,
          subscription: 33,
          membership: 50,
          affiliate: 17,
        })),
      });

      const result = await service.getForecast(mockUserId, mockTenantId);

      expect(result.hasEnoughData).toBe(true);
      expect(result.forecast).not.toBeNull();
      expect(result.forecast!.month1.total).toBeGreaterThan(0);
      expect(result.forecast!.month1.low).toBeLessThan(result.forecast!.month1.total);
      expect(result.forecast!.month1.high).toBeGreaterThan(result.forecast!.month1.total);
      expect(result.assumptions.length).toBeGreaterThan(0);
    });

    it('should handle analytics error gracefully', async () => {
      (analyticsService.getRevenueAnalytics as jest.Mock).mockRejectedValue(new Error('fail'));

      const result = await service.getForecast(mockUserId, mockTenantId);

      expect(result.hasEnoughData).toBe(false);
    });
  });
});
