import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { VideoService } from '../video.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { ContentRepurposeService } from '../../content-repurpose/content-repurpose.service';

const mockPrisma = () => ({
  video: { findUnique: jest.fn(), update: jest.fn() },
  videoClip: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  post: { create: jest.fn() },
});

const mockAiService = () => ({
  transcribeVerbose: jest.fn(),
  generateJson: jest.fn(),
  chat: jest.fn(),
  transcribe: jest.fn(),
  polishSubtitles: jest.fn(),
});

const mockRepurposeService = () => ({
  triggerGeneration: jest.fn(),
});

describe('VideoService — Post-Production Tools', () => {
  let service: VideoService;
  let prisma: ReturnType<typeof mockPrisma>;
  let aiService: ReturnType<typeof mockAiService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    aiService = mockAiService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: ContentRepurposeService, useValue: mockRepurposeService() },
      ],
    }).compile();

    service = module.get(VideoService);
  });

  // ─── detectFillers ───

  describe('detectFillers', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should detect filler words from whisperWords metadata', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId,
        userId,
        metadata: {
          whisperWords: [
            { word: '今天', start: 0, end: 0.3 },
            { word: '嗯', start: 0.3, end: 0.5 },
            { word: '我們', start: 0.5, end: 0.8 },
            { word: '來', start: 0.8, end: 1.0 },
            { word: '那個', start: 1.0, end: 1.3 },
            { word: '聊聊', start: 1.3, end: 1.6 },
          ],
        },
      });
      prisma.video.update.mockResolvedValue({});

      const result = await service.detectFillers(videoId, userId);

      expect(result.totalCount).toBe(2);
      expect(result.fillers[0].word).toBe('嗯');
      expect(result.fillers[1].word).toBe('那個');
      expect(result.estimatedSavings).toBeGreaterThan(0);
      expect(prisma.video.update).toHaveBeenCalled();
    });

    it('should return empty when no filler words found', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId,
        userId,
        metadata: {
          whisperWords: [
            { word: '今天', start: 0, end: 0.3 },
            { word: '天氣', start: 0.3, end: 0.6 },
            { word: '很好', start: 0.6, end: 0.9 },
          ],
        },
      });
      prisma.video.update.mockResolvedValue({});

      const result = await service.detectFillers(videoId, userId);

      expect(result.totalCount).toBe(0);
      expect(result.fillers).toHaveLength(0);
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.detectFillers(videoId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId: 'other', metadata: {},
      });

      await expect(service.detectFillers(videoId, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should include context before and after filler', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId,
        userId,
        metadata: {
          whisperWords: [
            { word: '所以', start: 0, end: 0.2 },
            { word: '我', start: 0.2, end: 0.3 },
            { word: '覺得', start: 0.3, end: 0.5 },
            { word: '嗯', start: 0.5, end: 0.7 },
            { word: '這個', start: 0.7, end: 0.9 },
            { word: '方法', start: 0.9, end: 1.1 },
          ],
        },
      });
      prisma.video.update.mockResolvedValue({});

      const result = await service.detectFillers(videoId, userId);

      expect(result.fillers[0].contextBefore).toContain('所以');
      expect(result.fillers[0].contextAfter).toContain('這個');
    });
  });

  // ─── generateChapters ───

  describe('generateChapters', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should generate chapters from transcript', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId,
        userId,
        title: 'Test Video',
        transcript: 'A long transcript about various topics...',
        durationSeconds: 600,
        metadata: {},
      });

      aiService.generateJson.mockResolvedValue({
        chapters: [
          { title: '開場介紹', startTime: 0 },
          { title: '核心內容', startTime: 120 },
          { title: '總結', startTime: 480 },
        ],
      });

      prisma.video.update.mockResolvedValue({});

      const result = await service.generateChapters(videoId, userId);

      expect(result.chapters).toHaveLength(3);
      expect(result.chapters[0].startTime).toBe(0);
      expect(result.youtubeFormat).toContain('00:00 開場介紹');
      expect(result.youtubeFormat).toContain('02:00 核心內容');
    });

    it('should ensure first chapter starts at 0', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, title: 'Test', transcript: 'text',
        durationSeconds: 300, metadata: {},
      });

      aiService.generateJson.mockResolvedValue({
        chapters: [
          { title: '介紹', startTime: 5 },
          { title: '重點', startTime: 120 },
        ],
      });
      prisma.video.update.mockResolvedValue({});

      const result = await service.generateChapters(videoId, userId);

      expect(result.chapters[0].startTime).toBe(0);
    });

    it('should throw for videos shorter than 30 seconds', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, durationSeconds: 15, metadata: {},
      });

      await expect(service.generateChapters(videoId, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw if no transcript', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, title: 'Test', transcript: null,
        durationSeconds: 300, metadata: {},
      });

      await expect(service.generateChapters(videoId, userId)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateChapters ───

  describe('updateChapters', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should update and sort chapters', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, metadata: { chapters: [] },
      });
      prisma.video.update.mockResolvedValue({});

      const chapters = [
        { id: 'ch-1', title: '結尾', startTime: 300 },
        { id: 'ch-0', title: '開頭', startTime: 0 },
      ];

      const result = await service.updateChapters(videoId, userId, chapters);

      expect(result.chapters[0].title).toBe('開頭');
      expect(result.chapters[1].title).toBe('結尾');
      expect(result.youtubeFormat).toContain('00:00 開頭');
    });

    it('should throw if not owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId: 'other', metadata: {},
      });

      await expect(
        service.updateChapters(videoId, userId, []),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── generateScriptSummary ───

  describe('generateScriptSummary', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should generate script summary and markdown', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, title: 'Test Video',
        transcript: 'Long transcript content here...',
        durationSeconds: 600, metadata: {},
      });

      const mockSummary = {
        title: '測試影片',
        totalDuration: '10:00',
        sections: [
          {
            title: '開場',
            timeRange: '00:00 - 02:00',
            startTime: 0,
            endTime: 120,
            keyPoints: ['歡迎觀看', '主題介紹'],
            keywords: ['介紹', '歡迎'],
          },
          {
            title: '核心內容',
            timeRange: '02:00 - 08:00',
            startTime: 120,
            endTime: 480,
            keyPoints: ['重點一', '重點二'],
            keywords: ['重點', '核心'],
          },
        ],
        tags: ['教學', '科技'],
        oneLinerSummary: '一支關於測試的影片',
      };

      aiService.generateJson.mockResolvedValue(mockSummary);
      prisma.video.update.mockResolvedValue({});

      const result = await service.generateScriptSummary(videoId, userId);

      expect(result.summary.title).toBe('測試影片');
      expect(result.summary.sections).toHaveLength(2);
      expect(result.markdown).toContain('# 測試影片');
      expect(result.markdown).toContain('開場');
      expect(result.markdown).toContain('核心內容');
    });

    it('should throw for short videos', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, durationSeconds: 20, metadata: {},
      });

      await expect(
        service.generateScriptSummary(videoId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no transcript', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, title: 'Test', transcript: null,
        durationSeconds: 300, metadata: {},
      });

      await expect(
        service.generateScriptSummary(videoId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if AI returns null', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, title: 'Test', transcript: 'text',
        durationSeconds: 300, metadata: {},
      });
      aiService.generateJson.mockResolvedValue(null);

      await expect(
        service.generateScriptSummary(videoId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── transcribeWords ───

  describe('transcribeWords', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should return existing words if already transcribed', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSED',
        originalUrl: '/uploads/videos/test.mp4',
        durationSeconds: 120,
        metadata: { whisperWords: [{ word: 'hi', start: 0, end: 0.5 }] },
      });

      const result = await service.transcribeWords(videoId, userId);

      expect(result.wordCount).toBe(1);
      expect(result.message).toContain('already exist');
    });

    it('should throw if video not PROCESSED', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSING',
        metadata: {},
      });

      await expect(
        service.transcribeWords(videoId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if not owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId: 'other', status: 'PROCESSED', metadata: {},
      });

      await expect(
        service.transcribeWords(videoId, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
