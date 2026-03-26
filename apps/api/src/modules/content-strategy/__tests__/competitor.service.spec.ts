import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { CompetitorService } from '../competitor.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

describe('CompetitorService', () => {
  let service: CompetitorService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;

  const mockUserId = '00000000-0000-0000-0000-000000000001';
  const mockTenantId = '00000000-0000-0000-0000-000000000002';
  const mockCompetitorId = '00000000-0000-0000-0000-000000000003';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitorService,
        {
          provide: PrismaService,
          useValue: {
            competitor: {
              count: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
            },
            competitorVideo: {
              createMany: jest.fn(),
              findMany: jest.fn(),
              upsert: jest.fn(),
            },
            subscription: {
              findFirst: jest.fn(),
            },
            $transaction: jest.fn((fns) => Promise.all(fns)),
          },
        },
        {
          provide: AiService,
          useValue: {
            generateJson: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CompetitorService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
  });

  describe('addCompetitor', () => {
    it('should add a competitor with valid YouTube URL', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ plan: 'PRO' });
      (prisma.competitor.count as jest.Mock).mockResolvedValue(0);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(null);

      const mockCompetitor = {
        id: mockCompetitorId,
        channelId: '@testchannel',
        channelName: 'Channel @testchannel',
        channelUrl: 'https://www.youtube.com/@testchannel',
      };
      (prisma.competitor.create as jest.Mock).mockResolvedValue(mockCompetitor);
      (prisma.competitorVideo.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.addCompetitor(
        mockUserId,
        mockTenantId,
        'https://www.youtube.com/@testchannel',
      );

      expect(result.channelId).toBe('@testchannel');
      expect(prisma.competitor.create).toHaveBeenCalled();
    });

    it('should throw on invalid URL', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ plan: 'FREE' });
      (prisma.competitor.count as jest.Mock).mockResolvedValue(0);

      await expect(
        service.addCompetitor(mockUserId, mockTenantId, 'https://www.google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when exceeding plan limit', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ plan: 'FREE' });
      (prisma.competitor.count as jest.Mock).mockResolvedValue(3);

      await expect(
        service.addCompetitor(mockUserId, mockTenantId, 'https://www.youtube.com/@test'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw on duplicate channel', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ plan: 'PRO' });
      (prisma.competitor.count as jest.Mock).mockResolvedValue(0);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
        id: mockCompetitorId,
        tenantId: mockTenantId,
      });

      await expect(
        service.addCompetitor(mockUserId, mockTenantId, 'https://www.youtube.com/@testchannel'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listCompetitors', () => {
    it('should return competitors with quota', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ plan: 'STARTER' });
      (prisma.competitor.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockCompetitorId,
          channelId: '@test',
          channelUrl: 'https://youtube.com/@test',
          channelName: 'Test Channel',
          channelAvatar: null,
          subscriberCount: 50000,
          videoCount: 100,
          lastSyncedAt: new Date(),
          videos: [{ viewCount: 10000 }, { viewCount: 20000 }],
          _count: { videos: 5 },
        },
      ]);

      const result = await service.listCompetitors(mockUserId, mockTenantId);

      expect(result.competitors).toHaveLength(1);
      expect(result.competitors[0].avgViews).toBe(15000);
      expect(result.quota).toEqual({ used: 1, max: 5 });
    });
  });

  describe('getCompetitorVideos', () => {
    it('should return paginated videos', async () => {
      (prisma.competitor.findFirst as jest.Mock).mockResolvedValue({
        id: mockCompetitorId,
        userId: mockUserId,
        tenantId: mockTenantId,
      });
      (prisma.competitorVideo.findMany as jest.Mock).mockResolvedValue([
        { id: 'v1', title: 'Video 1', publishedAt: new Date() },
      ]);

      const result = await service.getCompetitorVideos(
        mockCompetitorId,
        mockUserId,
        mockTenantId,
      );

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should throw when competitor not found', async () => {
      (prisma.competitor.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getCompetitorVideos('nonexistent', mockUserId, mockTenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCompetitor', () => {
    it('should delete a competitor', async () => {
      (prisma.competitor.findFirst as jest.Mock).mockResolvedValue({
        id: mockCompetitorId,
        userId: mockUserId,
        tenantId: mockTenantId,
      });
      (prisma.competitor.delete as jest.Mock).mockResolvedValue({});

      await service.removeCompetitor(mockCompetitorId, mockUserId, mockTenantId);

      expect(prisma.competitor.delete).toHaveBeenCalledWith({
        where: { id: mockCompetitorId },
      });
    });

    it('should throw when competitor not found', async () => {
      (prisma.competitor.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeCompetitor('nonexistent', mockUserId, mockTenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCompetitorAnalysis', () => {
    it('should return empty analysis when no competitors', async () => {
      (prisma.competitor.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getCompetitorAnalysis(mockUserId, mockTenantId);

      expect(result.analysis).toContain('尚未追蹤');
      expect(result.topTopics).toEqual([]);
    });

    it('should return AI analysis when competitors exist', async () => {
      (prisma.competitor.findMany as jest.Mock).mockResolvedValue([
        {
          channelName: 'Test',
          videos: [
            { title: 'Video 1', viewCount: 10000, publishedAt: new Date() },
          ],
        },
      ]);
      (aiService.generateJson as jest.Mock).mockResolvedValue({
        analysis: '## 分析報告\n競品近期主打 AI 主題',
        topTopics: ['AI', '科技'],
        opportunities: ['教育類內容'],
      });

      const result = await service.getCompetitorAnalysis(mockUserId, mockTenantId);

      expect(result.analysis).toContain('分析報告');
      expect(result.topTopics).toContain('AI');
      expect(result.opportunities).toContain('教育類內容');
    });
  });
});
