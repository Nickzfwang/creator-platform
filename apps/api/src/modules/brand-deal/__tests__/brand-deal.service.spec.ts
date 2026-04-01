import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DealStatus } from '@prisma/client';
import { BrandDealService } from '../brand-deal.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

describe('BrandDealService', () => {
  let service: BrandDealService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;

  const userId = 'user-1';
  const tenantId = 'tenant-1';

  const mockDeal = (overrides: Partial<any> = {}) => ({
    id: 'deal-1',
    userId,
    tenantId,
    brandName: 'TestBrand',
    dealType: 'SPONSORED_POST',
    brandContact: { name: 'Alice', email: 'alice@brand.com' },
    budgetRange: { min: 10000, max: 50000, currency: 'TWD' },
    deliverables: ['1 YouTube video', '2 IG stories'],
    timelineStart: new Date('2026-04-01'),
    timelineEnd: new Date('2026-04-30'),
    notes: 'Test deal',
    status: DealStatus.DRAFT,
    actualRevenue: null,
    aiProposal: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandDealService,
        {
          provide: PrismaService,
          useValue: {
            brandDeal: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              groupBy: jest.fn(),
              aggregate: jest.fn(),
            },
            socialAccount: { findMany: jest.fn() },
            video: { count: jest.fn() },
            membership: { count: jest.fn() },
          },
        },
        {
          provide: AiService,
          useValue: { chat: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(BrandDealService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
  });

  // ─── Status transitions ───

  describe('update — status transitions', () => {
    it('should allow DRAFT → PROPOSAL_SENT', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(mockDeal());
      (prisma.brandDeal.update as jest.Mock).mockResolvedValue(
        mockDeal({ status: DealStatus.PROPOSAL_SENT }),
      );

      const result = await service.update(userId, tenantId, 'deal-1', {
        status: DealStatus.PROPOSAL_SENT,
      });

      expect(result.status).toBe(DealStatus.PROPOSAL_SENT);
    });

    it('should reject invalid transition DRAFT → COMPLETED', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(mockDeal());

      await expect(
        service.update(userId, tenantId, 'deal-1', { status: DealStatus.COMPLETED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow full pipeline: DRAFT → PROPOSAL_SENT → NEGOTIATING → CONFIRMED → IN_PROGRESS → COMPLETED', async () => {
      const transitions: DealStatus[] = [
        DealStatus.PROPOSAL_SENT,
        DealStatus.NEGOTIATING,
        DealStatus.CONFIRMED,
        DealStatus.IN_PROGRESS,
        DealStatus.COMPLETED,
      ];

      let currentStatus: DealStatus = DealStatus.DRAFT;
      for (const nextStatus of transitions) {
        (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(
          mockDeal({ status: currentStatus }),
        );
        (prisma.brandDeal.update as jest.Mock).mockResolvedValue(
          mockDeal({ status: nextStatus }),
        );

        const result = await service.update(userId, tenantId, 'deal-1', { status: nextStatus });
        expect(result.status).toBe(nextStatus);
        currentStatus = nextStatus;
      }
    });

    it('should not allow any transition from COMPLETED', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(
        mockDeal({ status: DealStatus.COMPLETED }),
      );

      await expect(
        service.update(userId, tenantId, 'deal-1', { status: DealStatus.DRAFT }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── remove ───

  describe('remove', () => {
    it('should delete DRAFT deal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(mockDeal());

      await service.remove(userId, tenantId, 'deal-1');

      expect(prisma.brandDeal.delete).toHaveBeenCalledWith({ where: { id: 'deal-1' } });
    });

    it('should throw BadRequestException for IN_PROGRESS deal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(
        mockDeal({ status: DealStatus.IN_PROGRESS }),
      );

      await expect(service.remove(userId, tenantId, 'deal-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for COMPLETED deal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(
        mockDeal({ status: DealStatus.COMPLETED }),
      );

      await expect(service.remove(userId, tenantId, 'deal-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for another user\'s deal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(
        mockDeal({ userId: 'other-user' }),
      );

      await expect(service.remove(userId, tenantId, 'deal-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── generateProposal ───

  describe('generateProposal', () => {
    it('should gather creator stats, call AI, and save proposal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(mockDeal());
      (prisma.socialAccount.findMany as jest.Mock).mockResolvedValue([
        { platform: 'YOUTUBE', platformUsername: 'creator', followerCount: 50000 },
      ]);
      (prisma.video.count as jest.Mock).mockResolvedValue(42);
      (prisma.membership.count as jest.Mock).mockResolvedValue(100);
      (prisma.brandDeal.update as jest.Mock).mockResolvedValue({});

      const mockProposal = '# TestBrand × Creator 合作提案\n\n提案內容...';
      (aiService.chat as jest.Mock).mockResolvedValue(mockProposal);

      const result = await service.generateProposal(userId, tenantId, {
        dealId: 'deal-1',
        tone: 'professional',
      });

      expect(result.dealId).toBe('deal-1');
      expect(result.proposal).toBe(mockProposal);
      expect(result.tokensUsed).toBeGreaterThan(0);

      // Verify AI was called with creator context
      expect(aiService.chat).toHaveBeenCalledWith(
        expect.stringContaining('品牌合作提案'),
        expect.stringContaining('TestBrand'),
        expect.objectContaining({ model: 'gpt-4o' }),
      );

      // Verify proposal was saved
      expect(prisma.brandDeal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
        data: { aiProposal: mockProposal },
      });
    });

    it('should throw NotFoundException for non-existent deal', async () => {
      (prisma.brandDeal.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.generateProposal(userId, tenantId, { dealId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPipelineStats ───

  describe('getPipelineStats', () => {
    it('should aggregate deal counts and revenue', async () => {
      (prisma.brandDeal.groupBy as jest.Mock).mockResolvedValue([
        { status: DealStatus.DRAFT, _count: 3 },
        { status: DealStatus.IN_PROGRESS, _count: 2 },
        { status: DealStatus.COMPLETED, _count: 5 },
      ]);
      (prisma.brandDeal.aggregate as jest.Mock).mockResolvedValue({
        _sum: { actualRevenue: 250000 },
      });

      const result = await service.getPipelineStats(userId, tenantId);

      expect(result.totalDeals).toBe(10);
      expect(result.totalRevenue).toBe(250000);
      expect(result.activeDeals).toBe(2); // only IN_PROGRESS
      expect(result.pipeline).toEqual({
        DRAFT: 3,
        IN_PROGRESS: 2,
        COMPLETED: 5,
      });
    });
  });
});
