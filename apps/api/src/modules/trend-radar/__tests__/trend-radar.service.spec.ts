import { Test, TestingModule } from '@nestjs/testing';
import { TrendRadarService } from '../trend-radar.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { TrendPhase, TrendSourcePlatform } from '@prisma/client';

// ─── Mock all external source modules to prevent real HTTP calls ───

const mockFetch = jest.fn().mockResolvedValue([]);

jest.mock('../sources/rss.source', () => ({
  createRssSources: () => [
    { name: 'MockRSS', sourcePlatform: 'RSS_ITHOME', fetch: mockFetch },
  ],
}));

jest.mock('../sources/youtube-trending.source', () => ({
  YouTubeTrendingSource: jest.fn().mockImplementation(() => ({
    name: 'MockYouTube',
    sourcePlatform: 'YOUTUBE',
    fetch: mockFetch,
  })),
}));

jest.mock('../sources/claude-code-docs.source', () => ({
  ClaudeCodeDocsSource: jest.fn().mockImplementation(() => ({
    name: 'MockClaudeDocs',
    sourcePlatform: 'RSS_ITHOME',
    fetch: mockFetch,
  })),
}));

jest.mock('../sources/tiktok-scraper.source', () => ({
  TikTokScraperSource: jest.fn().mockImplementation(() => ({
    name: 'MockTikTok',
    sourcePlatform: 'TIKTOK',
    fetch: mockFetch,
  })),
}));

jest.mock('../sources/threads-scraper.source', () => ({
  ThreadsScraperSource: jest.fn().mockImplementation(() => ({
    name: 'MockThreads',
    sourcePlatform: 'THREADS',
    fetch: mockFetch,
  })),
}));

jest.mock('../sources/dcard-scraper.source', () => ({
  DcardScraperSource: jest.fn().mockImplementation(() => ({
    name: 'MockDcard',
    sourcePlatform: 'DCARD',
    fetch: mockFetch,
  })),
}));

describe('TrendRadarService', () => {
  let service: TrendRadarService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;

  const mockUserId = '00000000-0000-0000-0000-000000000001';

  // Fixed timestamps for predictable testing
  const NOW = new Date('2026-03-30T10:00:00.000Z');
  const ONE_HOUR_AGO = new Date('2026-03-30T09:00:00.000Z');
  const THREE_HOURS_AGO = new Date('2026-03-30T07:00:00.000Z');

  const mockTopic = (overrides: Partial<any> = {}) => ({
    id: 'topic-1',
    fingerprint: 'fp-ai-trend',
    title: 'AI 趨勢',
    summary: '最新 AI 發展趨勢',
    source: 'iThome',
    sourcePlatform: 'RSS_ITHOME' as TrendSourcePlatform,
    category: '科技',
    relevanceScore: 0.9,
    contentIdeas: ['idea1', 'idea2'],
    url: 'https://example.com/1',
    phase: 'NEW' as TrendPhase,
    isCrossPlatform: false,
    firstSeenAt: new Date('2026-03-29T00:00:00.000Z'),
    snapshotId: 'snap-1',
    ...overrides,
  });

  const mockSnapshot = (overrides: Partial<any> = {}) => ({
    id: 'snap-1',
    generatedAt: ONE_HOUR_AGO,
    sources: ['RSS_ITHOME', 'DCARD'],
    topicCount: 2,
    aiAnalysis: '今日 AI 趨勢分析摘要',
    topics: [
      mockTopic(),
      mockTopic({
        id: 'topic-2',
        fingerprint: 'fp-life-trend',
        title: '生活趨勢',
        category: '生活',
        relevanceScore: 0.7,
        phase: 'RISING' as TrendPhase,
      }),
    ],
    ...overrides,
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockFetch.mockReset().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendRadarService,
        {
          provide: PrismaService,
          useValue: {
            trendSnapshot: {
              findFirst: jest.fn(),
              create: jest.fn(),
              deleteMany: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
            trendTopic: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              groupBy: jest.fn(),
            },
            $transaction: jest.fn((fn) => fn(prisma)),
          },
        },
        {
          provide: AiService,
          useValue: {
            generateJson: jest.fn(),
            chat: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TrendRadarService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getTrends', () => {
    it('should return latest snapshot with topics', async () => {
      const snapshot = mockSnapshot();
      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.getTrends();

      expect(result.topics).toHaveLength(2);
      expect(result.aiAnalysis).toBe('今日 AI 趨勢分析摘要');
      expect(result.generatedAt).toBe(ONE_HOUR_AGO.toISOString());
      expect(result.sources).toEqual(['RSS_ITHOME', 'DCARD']);
      expect(result.nextRefreshAt).toBeDefined();
      expect(result.topics[0].id).toBe('topic-1');
      expect(result.topics[0].firstSeenAt).toBe('2026-03-29T00:00:00.000Z');
    });

    it('should trigger refresh when no snapshot exists', async () => {
      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(null);

      const refreshSpy = jest
        .spyOn(service, 'refreshTrends')
        .mockResolvedValue(mockSnapshot() as any);

      const result = await service.getTrends();

      expect(refreshSpy).toHaveBeenCalledWith(false);
      expect(result.topics).toHaveLength(2);
    });

    it('should return stale data without blocking when snapshot is old', async () => {
      const staleSnapshot = mockSnapshot({ generatedAt: THREE_HOURS_AGO });
      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(staleSnapshot);

      const refreshSpy = jest.spyOn(service, 'refreshTrends');

      const result = await service.getTrends();

      expect(refreshSpy).not.toHaveBeenCalled();
      expect(result.topics).toHaveLength(2);
      expect(result.generatedAt).toBe(THREE_HOURS_AGO.toISOString());
    });

    it('should filter topics by category', async () => {
      const snapshot = mockSnapshot();
      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.getTrends('科技');

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].category).toBe('科技');
      expect(result.topics[0].title).toBe('AI 趨勢');
    });

    it('should filter topics by phase', async () => {
      const snapshot = mockSnapshot();
      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.getTrends(undefined, undefined, 'RISING');

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].phase).toBe('RISING');
      expect(result.topics[0].title).toBe('生活趨勢');
    });
  });

  describe('getTrendHistory', () => {
    const makeHistoryTopic = (date: string, score: number, overrides: Partial<any> = {}) => ({
      id: `topic-${date}-${score}`,
      fingerprint: 'fp-ai-trend',
      title: 'AI 趨勢',
      summary: '摘要',
      source: 'iThome',
      sourcePlatform: 'RSS_ITHOME',
      category: '科技',
      relevanceScore: score,
      contentIdeas: ['idea1'],
      url: 'https://example.com/1',
      phase: 'RISING' as TrendPhase,
      isCrossPlatform: false,
      firstSeenAt: new Date('2026-03-16T00:00:00.000Z'),
      snapshotId: `snap-${date}`,
      snapshot: { generatedAt: new Date(`${date}T12:00:00.000Z`) },
      ...overrides,
    });

    it('should return 14-day history grouped by date', async () => {
      const topics = [
        makeHistoryTopic('2026-03-20', 0.7),
        makeHistoryTopic('2026-03-20', 0.8),
        makeHistoryTopic('2026-03-21', 0.85),
        makeHistoryTopic('2026-03-22', 0.6),
      ];
      (prisma.trendTopic.findMany as jest.Mock).mockResolvedValue(topics);

      const result = await service.getTrendHistory('fp-ai-trend');

      expect(result).not.toBeNull();
      expect(result!.history).toHaveLength(3);
      expect(result!.history[0].date).toBe('2026-03-20');
      expect(result!.history[0].relevanceScore).toBe(0.8);
      expect(result!.history[1].date).toBe('2026-03-21');
      expect(result!.history[2].date).toBe('2026-03-22');
    });

    it('should return null when no history found', async () => {
      (prisma.trendTopic.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getTrendHistory('fp-nonexistent');

      expect(result).toBeNull();
    });

    it('should calculate peak score and peak date correctly', async () => {
      const topics = [
        makeHistoryTopic('2026-03-18', 0.5),
        makeHistoryTopic('2026-03-19', 0.95),
        makeHistoryTopic('2026-03-20', 0.7),
        makeHistoryTopic('2026-03-21', 0.6),
      ];
      (prisma.trendTopic.findMany as jest.Mock).mockResolvedValue(topics);

      const result = await service.getTrendHistory('fp-ai-trend');

      expect(result).not.toBeNull();
      expect(result!.peakScore).toBe(0.95);
      expect(result!.peakDate).toBe('2026-03-19');
      expect(result!.currentPhase).toBe('RISING');
      expect(result!.firstSeenAt).toBe('2026-03-16T00:00:00.000Z');
    });
  });

  describe('refreshTrends', () => {
    it('should create snapshot and topics in transaction', async () => {
      // Mock sources to return actual items
      mockFetch.mockResolvedValue([
        { title: 'AI 新突破', link: 'https://example.com/ai', source: 'MockRSS', sourcePlatform: 'RSS_ITHOME', pubDate: NOW.toISOString() },
      ]);

      const mockAiTopics = {
        topics: [
          {
            title: 'AI 新突破',
            summary: 'GPT-5 發布',
            source: 'iThome',
            category: '科技',
            relevanceScore: 0.9,
            contentIdeas: ['解析影片', '教學系列'],
            sourceArticleIndex: 1,
          },
        ],
      };

      (aiService.generateJson as jest.Mock).mockResolvedValue(mockAiTopics);
      (aiService.chat as jest.Mock).mockResolvedValue('今日 AI 趨勢總結...');

      (prisma.trendSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.trendTopic.groupBy as jest.Mock).mockResolvedValue([]);

      const createdSnap = {
        id: 'new-snap-1',
        sources: ['RSS_ITHOME'],
        topicCount: 1,
        aiAnalysis: '今日 AI 趨勢總結...',
      };
      (prisma.trendSnapshot.create as jest.Mock).mockResolvedValue(createdSnap);
      (prisma.trendTopic.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const fullSnap = {
        ...createdSnap,
        generatedAt: NOW,
        topics: [mockTopic({ snapshotId: 'new-snap-1' })],
      };
      (prisma.trendSnapshot as any).findUniqueOrThrow = jest.fn().mockResolvedValue(fullSnap);

      const result = await service.refreshTrends(false);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('new-snap-1');
      expect(result.topics).toHaveLength(1);
    });

    it('should throw error when all sources return empty results', async () => {
      // All mocked sources return [] by default (from beforeEach)
      await expect(service.refreshTrends(false)).rejects.toThrow(
        'All trend sources failed to return data',
      );

      // No transaction should have been started
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
