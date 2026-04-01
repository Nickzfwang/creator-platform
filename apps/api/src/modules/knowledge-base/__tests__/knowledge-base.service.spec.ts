import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { KnowledgeStatus } from '@prisma/client';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let prisma: jest.Mocked<PrismaService>;
  let aiService: jest.Mocked<AiService>;

  const userId = 'user-1';
  const tenantId = 'tenant-1';

  const mockKb = (overrides: Partial<any> = {}) => ({
    id: 'kb-1',
    userId,
    tenantId,
    name: 'Test KB',
    description: 'A test knowledge base',
    sourceType: 'TEXT',
    status: KnowledgeStatus.READY,
    documentCount: 1,
    chunkCount: 5,
    settings: {},
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: {
            knowledgeBase: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            knowledgeChunk: {
              createMany: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              deleteMany: jest.fn(),
              aggregate: jest.fn(),
            },
            $executeRawUnsafe: jest.fn(),
            $queryRawUnsafe: jest.fn(),
          },
        },
        {
          provide: AiService,
          useValue: {
            isAvailable: true,
            generateEmbedding: jest.fn(),
            generateEmbeddings: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(KnowledgeBaseService);
    prisma = module.get(PrismaService);
    aiService = module.get(AiService);
  });

  // ─── ingest ───

  describe('ingest', () => {
    it('should chunk text, create records, generate embeddings, and update KB stats', async () => {
      const kb = mockKb({ status: KnowledgeStatus.PROCESSING });
      (prisma.knowledgeBase.findUnique as jest.Mock).mockResolvedValue(kb);
      (prisma.knowledgeChunk.aggregate as jest.Mock).mockResolvedValue({ _max: { chunkIndex: null } });
      (prisma.knowledgeChunk.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.knowledgeChunk.count as jest.Mock).mockResolvedValue(1);
      (prisma.knowledgeBase.update as jest.Mock).mockResolvedValue({});
      (prisma.knowledgeChunk.findMany as jest.Mock).mockResolvedValue([{ id: 'chunk-1' }]);

      const fakeEmbedding = new Array(1536).fill(0.1);
      (aiService.generateEmbeddings as jest.Mock).mockResolvedValue([fakeEmbedding]);

      const result = await service.ingest(userId, tenantId, 'kb-1', {
        content: 'Short test content for embedding.',
        sourceRef: 'test.txt',
      });

      expect(result).toEqual({
        knowledgeBaseId: 'kb-1',
        chunksCreated: 1,
        totalChunks: 1,
      });

      expect(prisma.knowledgeChunk.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
          knowledgeBaseId: 'kb-1',
          sourceRef: 'test.txt',
          chunkIndex: 0,
        })],
      });

      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
        data: {
          chunkCount: 1,
          documentCount: { increment: 1 },
          status: KnowledgeStatus.READY,
        },
      });

      // Embedding was stored via raw SQL
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_chunks SET embedding'),
        expect.stringContaining('[0.1,'),
        'chunk-1',
      );
    });

    it('should throw ForbiddenException when KB belongs to another user', async () => {
      (prisma.knowledgeBase.findUnique as jest.Mock).mockResolvedValue(
        mockKb({ userId: 'other-user' }),
      );

      await expect(
        service.ingest(userId, tenantId, 'kb-1', { content: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should gracefully skip embeddings when AI is unavailable', async () => {
      Object.defineProperty(aiService, 'isAvailable', { value: false });
      const kb = mockKb();
      (prisma.knowledgeBase.findUnique as jest.Mock).mockResolvedValue(kb);
      (prisma.knowledgeChunk.aggregate as jest.Mock).mockResolvedValue({ _max: { chunkIndex: null } });
      (prisma.knowledgeChunk.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.knowledgeChunk.count as jest.Mock).mockResolvedValue(1);
      (prisma.knowledgeBase.update as jest.Mock).mockResolvedValue({});

      const result = await service.ingest(userId, tenantId, 'kb-1', { content: 'test' });

      expect(result.chunksCreated).toBe(1);
      expect(aiService.generateEmbeddings).not.toHaveBeenCalled();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // ─── searchSimilar ───

  describe('searchSimilar', () => {
    it('should use vector search when AI is available and results exist', async () => {
      const fakeEmbedding = new Array(1536).fill(0.5);
      (aiService.generateEmbedding as jest.Mock).mockResolvedValue(fakeEmbedding);
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { id: 'chunk-1', content: 'relevant content', source_ref: 'doc.txt', chunk_index: 0, similarity: 0.85 },
        { id: 'chunk-2', content: 'somewhat relevant', source_ref: null, chunk_index: 1, similarity: 0.6 },
      ]);

      const results = await service.searchSimilar('kb-1', 'test query', 5);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'chunk-1',
        content: 'relevant content',
        sourceRef: 'doc.txt',
        chunkIndex: 0,
      });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('embedding <=>'),
        expect.any(String),
        'kb-1',
        5,
      );
    });

    it('should filter out low-similarity results (< 0.3)', async () => {
      (aiService.generateEmbedding as jest.Mock).mockResolvedValue(new Array(1536).fill(0));
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { id: 'c1', content: 'good', source_ref: null, chunk_index: 0, similarity: 0.8 },
        { id: 'c2', content: 'bad', source_ref: null, chunk_index: 1, similarity: 0.2 },
      ]);

      const results = await service.searchSimilar('kb-1', 'query');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('c1');
    });

    it('should fall back to text search when vector search fails', async () => {
      (aiService.generateEmbedding as jest.Mock).mockRejectedValue(new Error('API error'));
      (prisma.knowledgeChunk.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', content: 'fallback result', sourceRef: null, chunkIndex: 0 },
      ]);

      const results = await service.searchSimilar('kb-1', 'query');

      expect(results).toHaveLength(1);
      expect(prisma.knowledgeChunk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            knowledgeBaseId: 'kb-1',
            content: { contains: 'query', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  // ─── CRUD ───

  describe('remove', () => {
    it('should delete chunks then knowledge base', async () => {
      (prisma.knowledgeBase.findUnique as jest.Mock).mockResolvedValue(mockKb());

      await service.remove(userId, tenantId, 'kb-1');

      expect(prisma.knowledgeChunk.deleteMany).toHaveBeenCalledWith({
        where: { knowledgeBaseId: 'kb-1' },
      });
      expect(prisma.knowledgeBase.delete).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
      });
    });

    it('should throw NotFoundException when KB does not exist', async () => {
      (prisma.knowledgeBase.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(userId, tenantId, 'kb-1')).rejects.toThrow(NotFoundException);
    });
  });
});
