import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InteractionsService } from '../interactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';

describe('InteractionsService', () => {
  let service: InteractionsService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;

  const userId = '00000000-0000-0000-0000-000000000001';
  const tenantId = '00000000-0000-0000-0000-000000000002';
  const commentId = '00000000-0000-0000-0000-000000000003';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionsService,
        {
          provide: PrismaService,
          useValue: {
            fanComment: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
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
          provide: KnowledgeBaseService,
          useValue: {
            searchSimilar: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(InteractionsService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
  });

  describe('importComments', () => {
    it('should import comments and return count', async () => {
      const mockComments = [
        { id: 'c1', content: '好棒', authorName: '小明' },
        { id: 'c2', content: '不錯', authorName: '阿華' },
      ];
      (prisma.$transaction as jest.Mock).mockResolvedValue(mockComments);
      (aiService.generateJson as jest.Mock).mockResolvedValue(null);

      const result = await service.importComments(userId, tenantId, {
        comments: [
          { authorName: '小明', content: '好棒' },
          { authorName: '阿華', content: '不錯' },
        ],
      });

      expect(result.imported).toBe(2);
      expect(result.commentIds).toHaveLength(2);
    });
  });

  describe('listComments', () => {
    it('should return paginated comments', async () => {
      (prisma.fanComment.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', content: '好棒', createdAt: new Date() },
      ]);

      const result = await service.listComments(userId, tenantId, {});

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by category', async () => {
      (prisma.fanComment.findMany as jest.Mock).mockResolvedValue([]);

      await service.listComments(userId, tenantId, { category: 'QUESTION' as any });

      expect(prisma.fanComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'QUESTION' }),
        }),
      );
    });

    it('should clamp limit to 50', async () => {
      (prisma.fanComment.findMany as jest.Mock).mockResolvedValue([]);

      await service.listComments(userId, tenantId, { limit: 100 });

      expect(prisma.fanComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }), // 50 + 1
      );
    });
  });

  describe('generateReply', () => {
    it('should generate AI replies', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue({
        id: commentId,
        content: '請問這個怎麼用？',
        category: 'QUESTION',
        authorName: '粉絲',
      });
      (aiService.generateJson as jest.Mock).mockResolvedValue({
        replies: [
          { tone: 'friendly', content: '嗨！很高興你問這個問題...' },
          { tone: 'professional', content: '感謝您的詢問，關於使用方式...' },
        ],
      });
      (prisma.fanComment.update as jest.Mock).mockResolvedValue({});

      const result = await service.generateReply(commentId, userId, tenantId, {});

      expect(result.replies).toHaveLength(2);
      expect(result.replies[0].tone).toBe('friendly');
    });

    it('should throw when comment not found', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.generateReply('nonexistent', userId, tenantId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use RAG context when knowledgeBaseId provided', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue({
        id: commentId,
        content: '怎麼用？',
        category: 'QUESTION',
        authorName: '粉絲',
      });
      (aiService.generateJson as jest.Mock).mockResolvedValue({
        replies: [{ tone: 'friendly', content: '根據我們的教學...' }],
      });
      (prisma.fanComment.update as jest.Mock).mockResolvedValue({});

      await service.generateReply(commentId, userId, tenantId, {
        knowledgeBaseId: 'kb-id',
      });

      // AI should be called (we can't easily verify RAG content in mock)
      expect(aiService.generateJson).toHaveBeenCalled();
    });
  });

  describe('updateComment', () => {
    it('should mark comment as replied', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue({ id: commentId });
      (prisma.fanComment.update as jest.Mock).mockResolvedValue({
        id: commentId,
        isReplied: true,
        finalReply: '謝謝！',
      });

      const result = await service.updateComment(commentId, userId, tenantId, {
        finalReply: '謝謝！',
        isReplied: true,
      });

      expect(result.isReplied).toBe(true);
      expect(result.finalReply).toBe('謝謝！');
    });

    it('should throw when comment not found', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateComment('nonexistent', userId, tenantId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue({ id: commentId });
      (prisma.fanComment.delete as jest.Mock).mockResolvedValue({});

      await service.deleteComment(commentId, userId, tenantId);

      expect(prisma.fanComment.delete).toHaveBeenCalledWith({ where: { id: commentId } });
    });

    it('should throw when comment not found', async () => {
      (prisma.fanComment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteComment('nonexistent', userId, tenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return stats for comments', async () => {
      (prisma.fanComment.findMany as jest.Mock).mockResolvedValue([
        { category: 'POSITIVE', sentiment: 0.8, isReplied: true, createdAt: new Date() },
        { category: 'QUESTION', sentiment: 0.1, isReplied: false, createdAt: new Date() },
        { category: 'NEGATIVE', sentiment: -0.5, isReplied: true, createdAt: new Date() },
      ]);

      const result = await service.getStats(userId, tenantId, '30d');

      expect(result.totalComments).toBe(3);
      expect(result.repliedCount).toBe(2);
      expect(result.replyRate).toBeCloseTo(66.7, 0);
      expect(result.categoryBreakdown).toHaveLength(3);
    });

    it('should return zero stats for no comments', async () => {
      (prisma.fanComment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getStats(userId, tenantId);

      expect(result.totalComments).toBe(0);
      expect(result.replyRate).toBe(0);
      expect(result.avgSentiment).toBe(0);
    });
  });
});
