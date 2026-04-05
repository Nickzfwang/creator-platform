import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentClipService } from '../content-clip.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

const mockPrisma = () => ({
  contentClip: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const mockAiService = () => ({
  generateJson: jest.fn(),
});

const makeClip = (overrides: Record<string, unknown> = {}) => ({
  id: 'clip-1', userId: 'user-1', tenantId: 'tenant-1',
  platform: 'youtube', url: 'https://youtube.com/watch?v=123',
  title: 'Test Video', rawContent: 'Video content here',
  aiSummary: 'AI summary', aiCategory: '科技',
  aiTags: ['AI', 'tech'], author: 'Creator',
  imageUrl: null, isStarred: false,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('ContentClipService', () => {
  let service: ContentClipService;
  let prisma: ReturnType<typeof mockPrisma>;
  let ai: ReturnType<typeof mockAiService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    ai = mockAiService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentClipService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(ContentClipService);
  });

  describe('createClip', () => {
    it('should create clip with AI-generated metadata', async () => {
      ai.generateJson.mockResolvedValue({
        summary: 'AI 生成摘要',
        category: '科技',
        tags: ['AI', 'GPT', 'OpenAI'],
        contentIdea: '可以做一支影片介紹',
      });
      prisma.contentClip.create.mockResolvedValue(makeClip({ aiSummary: 'AI 生成摘要' }));

      const result = await service.createClip('user-1', 'tenant-1', {
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=123',
        title: 'Test',
        rawContent: 'Content text',
      });

      expect(result.aiSummary).toBe('AI 生成摘要');
      expect(prisma.contentClip.create).toHaveBeenCalled();
    });

    it('should handle AI returning null', async () => {
      ai.generateJson.mockResolvedValue(null);
      prisma.contentClip.create.mockResolvedValue(makeClip({ aiSummary: null, aiCategory: null, aiTags: [] }));

      const result = await service.createClip('user-1', 'tenant-1', {
        platform: 'twitter',
        url: 'https://twitter.com/status/123',
        title: 'Tweet',
        rawContent: 'Tweet content',
      });

      expect(result).toBeDefined();
    });
  });

  describe('getClips', () => {
    it('should return paginated clips', async () => {
      prisma.contentClip.findMany.mockResolvedValue([makeClip()]);

      const result = await service.getClips('user-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should detect hasMore when results exceed limit', async () => {
      const clips = Array.from({ length: 3 }, (_, i) => makeClip({ id: `clip-${i}` }));
      prisma.contentClip.findMany.mockResolvedValue(clips);

      const result = await service.getClips('user-1', { limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('clip-1');
    });

    it('should apply category filter', async () => {
      prisma.contentClip.findMany.mockResolvedValue([]);

      await service.getClips('user-1', { category: '科技' });

      expect(prisma.contentClip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ aiCategory: '科技' }),
        }),
      );
    });

    it('should apply starred filter', async () => {
      prisma.contentClip.findMany.mockResolvedValue([]);

      await service.getClips('user-1', { starred: true });

      expect(prisma.contentClip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isStarred: true }),
        }),
      );
    });

    it('should apply platform filter', async () => {
      prisma.contentClip.findMany.mockResolvedValue([]);

      await service.getClips('user-1', { platform: 'youtube' });

      expect(prisma.contentClip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: 'youtube' }),
        }),
      );
    });
  });

  describe('toggleStar', () => {
    it('should toggle star from false to true', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(makeClip({ isStarred: false }));
      prisma.contentClip.update.mockResolvedValue(makeClip({ isStarred: true }));

      const result = await service.toggleStar('clip-1', 'user-1');
      expect(result.isStarred).toBe(true);
    });

    it('should toggle star from true to false', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(makeClip({ isStarred: true }));
      prisma.contentClip.update.mockResolvedValue(makeClip({ isStarred: false }));

      const result = await service.toggleStar('clip-1', 'user-1');
      expect(result.isStarred).toBe(false);
    });

    it('should throw NotFoundException if clip not found', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(null);
      await expect(service.toggleStar('clip-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if not owner', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(makeClip({ userId: 'other' }));
      await expect(service.toggleStar('clip-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteClip', () => {
    it('should delete clip', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(makeClip());

      const result = await service.deleteClip('clip-1', 'user-1');

      expect(result.deleted).toBe(true);
      expect(prisma.contentClip.delete).toHaveBeenCalledWith({ where: { id: 'clip-1' } });
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(null);
      await expect(service.deleteClip('clip-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if not owner', async () => {
      prisma.contentClip.findUnique.mockResolvedValue(makeClip({ userId: 'other' }));
      await expect(service.deleteClip('clip-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
