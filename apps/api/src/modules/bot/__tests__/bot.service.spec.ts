import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { BotService } from '../bot.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { AiService } from '../../ai/ai.service';

describe('BotService', () => {
  let service: BotService;
  let prisma: jest.Mocked<PrismaService>;
  let kbService: jest.Mocked<KnowledgeBaseService>;
  let aiService: jest.Mocked<AiService>;

  const userId = 'user-1';
  const tenantId = 'tenant-1';

  const mockBot = (overrides: Partial<any> = {}) => ({
    id: 'bot-1',
    userId,
    tenantId,
    name: 'Test Bot',
    avatarUrl: null,
    welcomeMessage: '你好！',
    systemPrompt: null,
    knowledgeBaseId: 'kb-1',
    personality: { tone: '親切', style: '有條理' },
    isPublic: true,
    accessTier: 'FREE',
    totalConversations: 0,
    totalMessages: 0,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });

  const mockConversation = (overrides: Partial<any> = {}) => ({
    id: 'conv-1',
    botId: 'bot-1',
    tenantId,
    fanUserId: null,
    anonymousId: 'anon-1',
    messages: [],
    messageCount: 0,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        {
          provide: PrismaService,
          useValue: {
            botConfig: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            conversation: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: KnowledgeBaseService,
          useValue: {
            findById: jest.fn(),
            searchSimilar: jest.fn(),
          },
        },
        {
          provide: AiService,
          useValue: {
            chatWithHistory: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BotService);
    prisma = module.get(PrismaService);
    kbService = module.get(KnowledgeBaseService);
    aiService = module.get(AiService);
  });

  // ─── chat (RAG pipeline) ───

  describe('chat', () => {
    it('should search KB, inject context, call AI, and save messages', async () => {
      const bot = mockBot({ knowledgeBase: { id: 'kb-1' } });
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(bot);
      (prisma.conversation.create as jest.Mock).mockResolvedValue(mockConversation());
      (prisma.botConfig.update as jest.Mock).mockResolvedValue({});
      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      (kbService.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'c1', content: '知識庫內容：產品說明', sourceRef: null, chunkIndex: 0 },
      ]);
      (aiService.chatWithHistory as jest.Mock).mockResolvedValue('根據知識庫，產品說明如下...');

      const result = await service.chat('bot-1', {
        message: '產品有什麼功能？',
        anonymousId: 'anon-1',
      });

      expect(result).toEqual({
        conversationId: 'conv-1',
        reply: '根據知識庫，產品說明如下...',
        hasContext: true,
      });

      // Verify KB search was called
      expect(kbService.searchSimilar).toHaveBeenCalledWith('kb-1', '產品有什麼功能？', 5);

      // Verify AI was called with context in system prompt
      expect(aiService.chatWithHistory).toHaveBeenCalledWith(
        expect.stringContaining('知識庫相關內容'),
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '產品有什麼功能？' }),
        ]),
        expect.objectContaining({ model: 'gpt-4o' }),
      );

      // Verify messages were saved
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({
            messageCount: { increment: 2 },
          }),
        }),
      );
    });

    it('should work without knowledge base (no context)', async () => {
      const bot = mockBot({ knowledgeBaseId: null, knowledgeBase: null });
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(bot);
      (prisma.conversation.create as jest.Mock).mockResolvedValue(mockConversation());
      (prisma.botConfig.update as jest.Mock).mockResolvedValue({});
      (prisma.conversation.update as jest.Mock).mockResolvedValue({});
      (aiService.chatWithHistory as jest.Mock).mockResolvedValue('一般回答');

      const result = await service.chat('bot-1', {
        message: '你好',
        anonymousId: 'anon-1',
      });

      expect(result.hasContext).toBe(false);
      expect(kbService.searchSimilar).not.toHaveBeenCalled();
    });

    it('should continue existing conversation', async () => {
      const bot = mockBot({ knowledgeBase: null });
      const existingConv = mockConversation({
        messages: [
          { role: 'user', content: '你好', timestamp: '2026-03-01T00:00:00Z' },
          { role: 'assistant', content: '你好！', timestamp: '2026-03-01T00:00:00Z' },
        ],
        messageCount: 2,
      });

      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(bot);
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(existingConv);
      (prisma.conversation.update as jest.Mock).mockResolvedValue({});
      (prisma.botConfig.update as jest.Mock).mockResolvedValue({});
      (aiService.chatWithHistory as jest.Mock).mockResolvedValue('繼續對話');

      const result = await service.chat('bot-1', {
        message: '再問一個問題',
        conversationId: 'conv-1',
      });

      expect(result.conversationId).toBe('conv-1');

      // Verify history includes previous messages
      expect(aiService.chatWithHistory).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '你好' }),
          expect.objectContaining({ role: 'assistant', content: '你好！' }),
          expect.objectContaining({ role: 'user', content: '再問一個問題' }),
        ]),
        expect.any(Object),
      );

      // Should NOT create a new conversation
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent bot', async () => {
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.chat('nonexistent', { message: 'test', anonymousId: 'a' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private bot without fanUserId', async () => {
      const privateBot = mockBot({ isPublic: false, knowledgeBase: null });
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(privateBot);

      await expect(
        service.chat('bot-1', { message: 'test', anonymousId: 'a' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ───

  describe('remove', () => {
    it('should delete conversations then bot', async () => {
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(mockBot());

      await service.remove(userId, tenantId, 'bot-1');

      expect(prisma.conversation.deleteMany).toHaveBeenCalledWith({
        where: { botId: 'bot-1' },
      });
      expect(prisma.botConfig.delete).toHaveBeenCalledWith({
        where: { id: 'bot-1' },
      });
    });

    it('should throw ForbiddenException for another user\'s bot', async () => {
      (prisma.botConfig.findUnique as jest.Mock).mockResolvedValue(
        mockBot({ userId: 'other-user' }),
      );

      await expect(service.remove(userId, tenantId, 'bot-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
