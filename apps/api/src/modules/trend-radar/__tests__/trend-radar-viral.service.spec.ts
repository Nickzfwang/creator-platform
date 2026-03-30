import { Test, TestingModule } from '@nestjs/testing';
import { TrendRadarViralService } from '../trend-radar-viral.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { NotificationService } from '../../notification/notification.service';
import { TrendTopic } from '@prisma/client';

// Mock factories
const mockPrisma = () => ({
  trendUserSettings: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  trendKeyword: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
});

const mockAiService = () => ({
  chat: jest.fn(),
  generateJson: jest.fn(),
});

const mockNotificationService = () => ({
  send: jest.fn(),
});

const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockTenantId = '00000000-0000-0000-0000-000000000010';

function makeTopic(overrides: Partial<TrendTopic> = {}): TrendTopic {
  return {
    id: 'topic-1',
    fingerprint: 'fp-abc',
    title: '測試趨勢',
    summary: '這是一個測試趨勢摘要',
    relevanceScore: 0.5,
    isCrossPlatform: false,
    category: 'TECH',
    platforms: ['YOUTUBE'],
    sourceUrls: [],
    snapshotId: 'snap-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TrendTopic;
}

describe('TrendRadarViralService', () => {
  let service: TrendRadarViralService;
  let prisma: ReturnType<typeof mockPrisma>;
  let aiService: ReturnType<typeof mockAiService>;
  let notificationService: ReturnType<typeof mockNotificationService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    aiService = mockAiService();
    notificationService = mockNotificationService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendRadarViralService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get(TrendRadarViralService);
  });

  // ─── detectViralTrends ───

  describe('detectViralTrends', () => {
    beforeEach(() => {
      aiService.chat.mockResolvedValue('建議切入角度：拍一支解析影片。');
      prisma.trendUserSettings.findMany.mockResolvedValue([
        {
          userId: mockUserId,
          tenantId: mockTenantId,
          emailViralAlert: false,
          user: { email: 'user@example.com' },
        },
      ]);
      notificationService.send.mockResolvedValue({ id: 'notif-1' });
    });

    it('should detect score jump >= 0.3', async () => {
      const current = [makeTopic({ relevanceScore: 0.9 })];
      const previous = [makeTopic({ relevanceScore: 0.5 })];

      await service.detectViralTrends(current, previous);

      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          tenantId: mockTenantId,
          type: 'TREND_VIRAL_ALERT',
        }),
      );
      expect(aiService.chat).toHaveBeenCalled();
    });

    it('should detect first appearance with score >= 0.8', async () => {
      const current = [makeTopic({ fingerprint: 'fp-new', relevanceScore: 0.85 })];
      const previous: TrendTopic[] = [];

      await service.detectViralTrends(current, previous);

      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TREND_VIRAL_ALERT',
          title: expect.stringContaining('爆紅警報'),
        }),
      );
    });

    it('should NOT trigger for small score change', async () => {
      const current = [makeTopic({ relevanceScore: 0.6 })];
      const previous = [makeTopic({ relevanceScore: 0.5 })];

      await service.detectViralTrends(current, previous);

      expect(notificationService.send).not.toHaveBeenCalled();
      expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('should detect cross-platform first detection', async () => {
      const current = [makeTopic({ isCrossPlatform: true, relevanceScore: 0.5 })];
      const previous = [makeTopic({ isCrossPlatform: false, relevanceScore: 0.5 })];

      await service.detectViralTrends(current, previous);

      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TREND_VIRAL_ALERT',
        }),
      );
    });
  });

  // ─── matchKeywords ───

  describe('matchKeywords', () => {
    const topics = [
      makeTopic({ fingerprint: 'fp-1', title: 'ChatGPT 新功能', summary: 'OpenAI 發佈新功能' }),
      makeTopic({ fingerprint: 'fp-2', title: 'Shorts 演算法更新', summary: 'YouTube 更新演算法' }),
    ];

    it('should match keywords via AI semantic analysis', async () => {
      prisma.trendKeyword.findMany.mockResolvedValue([
        {
          id: 'kw-1',
          keyword: 'AI 工具',
          isActive: true,
          userId: mockUserId,
          user: { id: mockUserId, tenantId: mockTenantId, email: 'user@example.com' },
        },
      ]);

      aiService.generateJson.mockResolvedValue({
        matches: [{ keyword: 'ai 工具', topicIndices: [0] }],
      });

      prisma.trendUserSettings.findUnique.mockResolvedValue({
        userId: mockUserId,
        notifyKeywordHit: true,
      });

      notificationService.send.mockResolvedValue({ id: 'notif-1' });
      prisma.trendKeyword.update.mockResolvedValue({});

      await service.matchKeywords(topics);

      expect(aiService.generateJson).toHaveBeenCalled();
      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          type: 'TREND_KEYWORD_HIT',
          title: expect.stringContaining('AI 工具'),
        }),
      );
    });

    it('should skip when no active keywords', async () => {
      prisma.trendKeyword.findMany.mockResolvedValue([]);

      await service.matchKeywords(topics);

      expect(aiService.generateJson).not.toHaveBeenCalled();
      expect(notificationService.send).not.toHaveBeenCalled();
    });

    it('should update keyword hitCount on match', async () => {
      prisma.trendKeyword.findMany.mockResolvedValue([
        {
          id: 'kw-1',
          keyword: 'AI 工具',
          isActive: true,
          userId: mockUserId,
          user: { id: mockUserId, tenantId: mockTenantId, email: 'user@example.com' },
        },
      ]);

      aiService.generateJson.mockResolvedValue({
        matches: [{ keyword: 'ai 工具', topicIndices: [0] }],
      });

      prisma.trendUserSettings.findUnique.mockResolvedValue({
        userId: mockUserId,
        notifyKeywordHit: true,
      });

      notificationService.send.mockResolvedValue({ id: 'notif-1' });
      prisma.trendKeyword.update.mockResolvedValue({});

      await service.matchKeywords(topics);

      expect(prisma.trendKeyword.update).toHaveBeenCalledWith({
        where: { id: 'kw-1' },
        data: { hitCount: { increment: 1 }, lastHitAt: expect.any(Date) },
      });
    });
  });
});
