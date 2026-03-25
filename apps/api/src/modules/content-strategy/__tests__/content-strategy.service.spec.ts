import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ContentStrategyService } from '../content-strategy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { TrendRadarService } from '../../trend-radar/trend-radar.service';

describe('ContentStrategyService', () => {
  let service: ContentStrategyService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let trendRadarService: jest.Mocked<TrendRadarService>;

  const mockUserId = '00000000-0000-0000-0000-000000000001';
  const mockTenantId = '00000000-0000-0000-0000-000000000002';
  const mockSuggestionId = '00000000-0000-0000-0000-000000000003';

  const mockQueue = { add: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentStrategyService,
        {
          provide: PrismaService,
          useValue: {
            topicSuggestion: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            contentCalendar: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            competitor: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            post: {
              create: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn((fns) => Promise.all(fns)),
          },
        },
        {
          provide: AiService,
          useValue: {
            generateJson: jest.fn(),
            generateEmbedding: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            getTopContent: jest.fn().mockResolvedValue({ items: [] }),
            getOverview: jest.fn().mockResolvedValue({ metrics: {} }),
          },
        },
        {
          provide: TrendRadarService,
          useValue: {
            getTrends: jest.fn().mockResolvedValue({ topics: [] }),
          },
        },
        {
          provide: getQueueToken('content-strategy'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get(ContentStrategyService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
    analyticsService = module.get(AnalyticsService);
    trendRadarService = module.get(TrendRadarService);
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions with AI and save to DB', async () => {
      const mockAiResult = {
        suggestions: [
          {
            title: '2026 AI 趨勢解析',
            description: '分析最新 AI 發展',
            reasoning: '根據趨勢數據，AI 話題持續升溫',
            dataSource: 'TREND',
            performanceScore: 8.5,
            confidenceLevel: 'HIGH',
            confidenceReason: '多個數據來源交叉驗證',
            suggestedDate: '2026-04-01',
            suggestedPlatforms: ['YOUTUBE'],
            tags: ['AI', '科技'],
            relatedTrends: ['GPT-5'],
            competitorRef: null,
          },
        ],
      };

      (aiService.generateJson as jest.Mock).mockResolvedValue(mockAiResult);

      const mockRecord = {
        id: 'gen-id',
        ...mockAiResult.suggestions[0],
        userId: mockUserId,
        tenantId: mockTenantId,
        batchId: expect.any(String),
        dataSource: 'TREND',
        confidenceLevel: 'HIGH',
        performanceScore: 8.5,
        isAdopted: false,
        isDismissed: false,
        createdAt: new Date(),
      };

      (prisma.$transaction as jest.Mock).mockResolvedValue([mockRecord]);

      const result = await service.generateSuggestions(mockUserId, mockTenantId, {
        count: 5,
        niche: '科技',
      });

      expect(result.batchId).toBeDefined();
      expect(result.suggestions).toHaveLength(1);
      expect(aiService.generateJson).toHaveBeenCalledTimes(1);
    });

    it('should throw when new user has no niche', async () => {
      (analyticsService.getTopContent as jest.Mock).mockRejectedValue(new Error('no data'));
      (analyticsService.getOverview as jest.Mock).mockRejectedValue(new Error('no data'));

      await expect(
        service.generateSuggestions(mockUserId, mockTenantId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when AI returns empty', async () => {
      (aiService.generateJson as jest.Mock).mockResolvedValue({ suggestions: [] });

      await expect(
        service.generateSuggestions(mockUserId, mockTenantId, { niche: '科技' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listSuggestions', () => {
    it('should return paginated suggestions', async () => {
      const mockItems = Array.from({ length: 3 }, (_, i) => ({
        id: `id-${i}`,
        title: `Topic ${i}`,
        createdAt: new Date(2026, 2, 25 - i),
      }));

      (prisma.topicSuggestion.findMany as jest.Mock).mockResolvedValue(mockItems);

      const result = await service.listSuggestions(mockUserId, mockTenantId, undefined, 20);

      expect(result.data).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should handle hasMore correctly', async () => {
      const mockItems = Array.from({ length: 3 }, (_, i) => ({
        id: `id-${i}`,
        title: `Topic ${i}`,
        createdAt: new Date(2026, 2, 25 - i),
      }));

      (prisma.topicSuggestion.findMany as jest.Mock).mockResolvedValue(mockItems);

      const result = await service.listSuggestions(mockUserId, mockTenantId, undefined, 2);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it('should throw on invalid cursor', async () => {
      await expect(
        service.listSuggestions(mockUserId, mockTenantId, 'not-a-date'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('adoptSuggestion', () => {
    it('should create calendar item and mark suggestion as adopted', async () => {
      const mockSuggestion = {
        id: mockSuggestionId,
        userId: mockUserId,
        tenantId: mockTenantId,
        title: 'Test Topic',
        description: 'Test desc',
        suggestedPlatforms: ['YOUTUBE'],
        isAdopted: false,
        isDismissed: false,
      };

      (prisma.topicSuggestion.findFirst as jest.Mock).mockResolvedValue(mockSuggestion);
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        { ...mockSuggestion, isAdopted: true },
        { id: 'cal-1', title: 'Test Topic', status: 'PLANNED' },
      ]);

      const result = await service.adoptSuggestion(mockSuggestionId, mockUserId, mockTenantId, {
        scheduledDate: '2026-04-01',
      });

      expect(result.suggestion.isAdopted).toBe(true);
      expect(result.calendarItem.status).toBe('PLANNED');
    });

    it('should throw when suggestion not found', async () => {
      (prisma.topicSuggestion.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.adoptSuggestion('nonexistent', mockUserId, mockTenantId, {
          scheduledDate: '2026-04-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when suggestion already adopted', async () => {
      (prisma.topicSuggestion.findFirst as jest.Mock).mockResolvedValue({
        id: mockSuggestionId,
        isAdopted: true,
        isDismissed: false,
      });

      await expect(
        service.adoptSuggestion(mockSuggestionId, mockUserId, mockTenantId, {
          scheduledDate: '2026-04-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dismissSuggestion', () => {
    it('should mark suggestion as dismissed', async () => {
      (prisma.topicSuggestion.findFirst as jest.Mock).mockResolvedValue({
        id: mockSuggestionId,
      });
      (prisma.topicSuggestion.update as jest.Mock).mockResolvedValue({
        id: mockSuggestionId,
        isDismissed: true,
      });

      const result = await service.dismissSuggestion(mockSuggestionId, mockUserId, mockTenantId);
      expect(result.isDismissed).toBe(true);
    });

    it('should throw when suggestion not found', async () => {
      (prisma.topicSuggestion.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.dismissSuggestion('nonexistent', mockUserId, mockTenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Calendar CRUD', () => {
    it('should create a calendar item', async () => {
      const mockItem = {
        id: 'cal-1',
        title: 'New Topic',
        status: 'PLANNED',
        scheduledDate: new Date('2026-04-01'),
      };
      (prisma.contentCalendar.create as jest.Mock).mockResolvedValue(mockItem);

      const result = await service.createCalendarItem(mockUserId, mockTenantId, {
        title: 'New Topic',
        scheduledDate: '2026-04-01',
      });

      expect(result.title).toBe('New Topic');
      expect(result.status).toBe('PLANNED');
    });

    it('should get calendar items by date range', async () => {
      (prisma.contentCalendar.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getCalendar(mockUserId, mockTenantId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result.items).toEqual([]);
    });

    it('should validate status transitions', async () => {
      (prisma.contentCalendar.findFirst as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'SUGGESTED',
        userId: mockUserId,
        tenantId: mockTenantId,
      });

      // SUGGESTED → PLANNED: valid
      (prisma.contentCalendar.update as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'PLANNED',
      });
      const result = await service.updateCalendarItem('cal-1', mockUserId, mockTenantId, {
        status: 'PLANNED' as any,
      });
      expect(result.status).toBe('PLANNED');
    });

    it('should reject invalid status transitions', async () => {
      (prisma.contentCalendar.findFirst as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'SUGGESTED',
        userId: mockUserId,
        tenantId: mockTenantId,
      });

      // SUGGESTED → PUBLISHED: invalid
      await expect(
        service.updateCalendarItem('cal-1', mockUserId, mockTenantId, {
          status: 'PUBLISHED' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject PUBLISHED without videoId', async () => {
      (prisma.contentCalendar.findFirst as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'IN_PRODUCTION',
        videoId: null,
        userId: mockUserId,
        tenantId: mockTenantId,
      });

      await expect(
        service.updateCalendarItem('cal-1', mockUserId, mockTenantId, {
          status: 'PUBLISHED' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent deleting PUBLISHED items', async () => {
      (prisma.contentCalendar.findFirst as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'PUBLISHED',
        userId: mockUserId,
        tenantId: mockTenantId,
      });

      await expect(
        service.deleteCalendarItem('cal-1', mockUserId, mockTenantId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent deleting MEASURED items', async () => {
      (prisma.contentCalendar.findFirst as jest.Mock).mockResolvedValue({
        id: 'cal-1',
        status: 'MEASURED',
        userId: mockUserId,
        tenantId: mockTenantId,
      });

      await expect(
        service.deleteCalendarItem('cal-1', mockUserId, mockTenantId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReview', () => {
    it('should return review summary', async () => {
      (prisma.topicSuggestion.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', isAdopted: true, dataSource: 'TREND' },
        { id: 's2', isAdopted: false, dataSource: 'HISTORY' },
      ]);
      (prisma.contentCalendar.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', status: 'PUBLISHED', suggestion: null },
      ]);

      const result = await service.getReview(mockUserId, mockTenantId, 'month');

      expect(result.summary.totalSuggested).toBe(2);
      expect(result.summary.totalAdopted).toBe(1);
      expect(result.summary.adoptionRate).toBe(0.5);
      expect(result.summary.totalPublished).toBe(1);
    });
  });
});
