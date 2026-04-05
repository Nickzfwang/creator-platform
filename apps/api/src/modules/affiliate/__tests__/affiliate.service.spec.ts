import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AffiliateService } from '../affiliate.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = () => ({
  affiliateLink: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  affiliateEvent: {
    create: jest.fn().mockReturnValue(Promise.resolve({ id: 'evt-1' })),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
});

const makeLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1', userId: 'user-1', tenantId: 'tenant-1',
  originalUrl: 'https://example.com/product', trackingCode: 'abc123',
  shortUrl: '/r/abc123', productName: 'Product A',
  commissionRate: 0.1, clickCount: 10, conversionCount: 2,
  revenueTotal: 500, isActive: true, createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('AffiliateService', () => {
  let service: AffiliateService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffiliateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AffiliateService);
  });

  describe('createLink', () => {
    it('should create a link with tracking code', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(null); // code available
      prisma.affiliateLink.create.mockResolvedValue(makeLink());

      const result = await service.createLink('user-1', 'tenant-1', {
        originalUrl: 'https://example.com/product',
        productName: 'Product A',
      });

      expect(result.trackingCode).toBe('abc123');
      expect(result.shortUrl).toBe('/r/abc123');
    });
  });

  describe('findAll', () => {
    it('should return paginated links', async () => {
      prisma.affiliateLink.findMany.mockResolvedValue([makeLink()]);

      const result = await service.findAll('user-1', 'tenant-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should detect hasMore', async () => {
      const items = Array.from({ length: 3 }, (_, i) => makeLink({ id: `link-${i}` }));
      prisma.affiliateLink.findMany.mockResolvedValue(items);

      const result = await service.findAll('user-1', 'tenant-1', { limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return link with events summary', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue({
        ...makeLink(), _count: { events: 15 },
      });
      prisma.affiliateEvent.groupBy.mockResolvedValue([
        { eventType: 'CLICK', _count: 10, _sum: { revenueAmount: null } },
        { eventType: 'PURCHASE', _count: 3, _sum: { revenueAmount: 300 } },
      ]);

      const result = await service.findById('user-1', 'tenant-1', 'link-1');

      expect(result.totalEvents).toBe(15);
      expect(result.recentEventsSummary).toHaveLength(2);
    });

    it('should throw NotFoundException', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(null);
      await expect(service.findById('user-1', 'tenant-1', 'link-x')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for wrong user', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue({
        ...makeLink({ userId: 'other' }), _count: { events: 0 },
      });
      await expect(service.findById('user-1', 'tenant-1', 'link-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update link fields', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());
      prisma.affiliateLink.update.mockResolvedValue(makeLink({ productName: 'Updated' }));

      const result = await service.update('user-1', 'tenant-1', 'link-1', { productName: 'Updated' });
      expect(result.productName).toBe('Updated');
    });

    it('should throw NotFoundException', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(null);
      await expect(service.update('user-1', 'tenant-1', 'link-x', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink({ userId: 'other' }));
      await expect(service.update('user-1', 'tenant-1', 'link-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());

      await service.deactivate('user-1', 'tenant-1', 'link-1');

      expect(prisma.affiliateLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe('handleRedirect', () => {
    it('should return originalUrl', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());

      const url = await service.handleRedirect('abc123', { ip: '1.2.3.4' });
      expect(url).toBe('https://example.com/product');
    });

    it('should throw NotFoundException for unknown code', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(null);
      await expect(service.handleRedirect('unknown', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('createEvent', () => {
    it('should create PURCHASE event and update counters', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());
      prisma.affiliateEvent.create.mockResolvedValue({
        id: 'evt-1', linkId: 'link-1', eventType: 'PURCHASE',
        revenueAmount: 100, createdAt: new Date('2026-01-15'),
      });

      const result = await service.createEvent({
        trackingCode: 'abc123', eventType: 'PURCHASE' as any, revenueAmount: 100,
      });

      expect(result.eventType).toBe('PURCHASE');
      expect(prisma.affiliateLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversionCount: { increment: 1 },
            revenueTotal: { increment: 100 },
          }),
        }),
      );
    });

    it('should create REFUND event and decrement counters', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());
      prisma.affiliateEvent.create.mockResolvedValue({
        id: 'evt-2', linkId: 'link-1', eventType: 'REFUND',
        revenueAmount: 50, createdAt: new Date(),
      });

      await service.createEvent({
        trackingCode: 'abc123', eventType: 'REFUND' as any, revenueAmount: 50,
      });

      expect(prisma.affiliateLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversionCount: { decrement: 1 },
            revenueTotal: { decrement: 50 },
          }),
        }),
      );
    });

    it('should reject CLICK events', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(makeLink());

      await expect(
        service.createEvent({ trackingCode: 'abc123', eventType: 'CLICK' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown tracking code', async () => {
      prisma.affiliateLink.findUnique.mockResolvedValue(null);
      await expect(
        service.createEvent({ trackingCode: 'unknown', eventType: 'PURCHASE' as any }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      prisma.affiliateLink.findMany
        .mockResolvedValueOnce([{ id: 'link-1', productName: 'P1' }]) // userLinks
        .mockResolvedValueOnce([{ id: 'link-1', productName: 'P1', clickCount: 100, conversionCount: 5, revenueTotal: 500 }]); // topLinks
      prisma.affiliateEvent.groupBy.mockResolvedValue([
        { eventType: 'CLICK', _count: 100, _sum: { revenueAmount: null } },
        { eventType: 'PURCHASE', _count: 5, _sum: { revenueAmount: 500 } },
      ]);
      prisma.affiliateEvent.findMany.mockResolvedValue([]);

      const result = await service.getStats('user-1', 'tenant-1');

      expect(result.totalClicks).toBe(100);
      expect(result.totalConversions).toBe(5);
      expect(result.totalRevenue).toBe(500);
      expect(result.conversionRate).toBe(5);
    });

    it('should return zeros when no links', async () => {
      prisma.affiliateLink.findMany.mockResolvedValue([]);

      const result = await service.getStats('user-1', 'tenant-1');

      expect(result.totalClicks).toBe(0);
      expect(result.conversionRate).toBe(0);
    });
  });
});
