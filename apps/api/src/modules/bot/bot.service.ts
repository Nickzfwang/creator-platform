import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { AiService } from '../ai/ai.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ListBotsQueryDto } from './dto/list-bots-query.dto';

interface MessageJson {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KnowledgeBaseService,
    private readonly aiService: AiService,
  ) {}

  // ─── Bot Config CRUD ───

  async create(userId: string, tenantId: string, dto: CreateBotDto) {
    // Validate knowledge base ownership if provided
    if (dto.knowledgeBaseId) {
      await this.kbService.findById(userId, tenantId, dto.knowledgeBaseId);
    }

    const bot = await this.prisma.botConfig.create({
      data: {
        userId,
        tenantId,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        welcomeMessage: dto.welcomeMessage,
        systemPrompt: dto.systemPrompt,
        knowledgeBaseId: dto.knowledgeBaseId,
        personality: dto.personality as unknown as Prisma.InputJsonValue,
        isPublic: dto.isPublic ?? false,
        accessTier: dto.accessTier,
      },
    });

    return this.formatBot(bot);
  }

  async findAll(userId: string, tenantId: string, query: ListBotsQueryDto) {
    const limit = query.limit ?? 20;

    const bots = await this.prisma.botConfig.findMany({
      where: { tenantId, userId },
      take: limit + 1,
      ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { conversations: true } },
        knowledgeBase: { select: { id: true, name: true, status: true } },
      },
    });

    const hasMore = bots.length > limit;
    const data = hasMore ? bots.slice(0, limit) : bots;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((b) => ({
        ...this.formatBot(b),
        knowledgeBase: b.knowledgeBase
          ? { id: b.knowledgeBase.id, name: b.knowledgeBase.name, status: b.knowledgeBase.status }
          : null,
        conversationCount: b._count.conversations,
      })),
      nextCursor,
      hasMore,
    };
  }

  async findById(userId: string, tenantId: string, id: string) {
    const bot = await this.prisma.botConfig.findUnique({
      where: { id },
      include: {
        knowledgeBase: { select: { id: true, name: true, status: true, chunkCount: true } },
        _count: { select: { conversations: true } },
      },
    });

    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.userId !== userId || bot.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    return {
      ...this.formatBot(bot),
      knowledgeBase: bot.knowledgeBase,
      conversationCount: bot._count.conversations,
    };
  }

  async update(userId: string, tenantId: string, id: string, dto: UpdateBotDto) {
    const bot = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.userId !== userId || bot.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    if (dto.knowledgeBaseId) {
      await this.kbService.findById(userId, tenantId, dto.knowledgeBaseId);
    }

    const updated = await this.prisma.botConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.welcomeMessage !== undefined && { welcomeMessage: dto.welcomeMessage }),
        ...(dto.systemPrompt !== undefined && { systemPrompt: dto.systemPrompt }),
        ...(dto.knowledgeBaseId !== undefined && { knowledgeBaseId: dto.knowledgeBaseId }),
        ...(dto.personality !== undefined && { personality: dto.personality as unknown as Prisma.InputJsonValue }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.accessTier !== undefined && { accessTier: dto.accessTier }),
      },
    });

    return this.formatBot(updated);
  }

  async remove(userId: string, tenantId: string, id: string) {
    const bot = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.userId !== userId || bot.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Delete conversations first
    await this.prisma.conversation.deleteMany({ where: { botId: id } });
    await this.prisma.botConfig.delete({ where: { id } });
  }

  // ─── Chat ───

  async chat(botId: string, dto: ChatMessageDto, fanUserId?: string) {
    const bot = await this.prisma.botConfig.findUnique({
      where: { id: botId },
      include: { knowledgeBase: { select: { id: true } } },
    });

    if (!bot) throw new NotFoundException('Bot not found');
    if (!bot.isPublic && !fanUserId) {
      throw new ForbiddenException('This bot is not public');
    }

    // Get or create conversation
    let conversation: { id: string; messages: unknown[]; messageCount: number };

    if (dto.conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: dto.conversationId },
      });
      if (!existing || existing.botId !== botId) {
        throw new NotFoundException('Conversation not found');
      }
      conversation = existing;
    } else {
      conversation = await this.prisma.conversation.create({
        data: {
          botId,
          tenantId: bot.tenantId,
          fanUserId,
          anonymousId: dto.anonymousId,
          messages: [],
          messageCount: 0,
        },
      });

      // Increment bot conversation count
      await this.prisma.botConfig.update({
        where: { id: botId },
        data: { totalConversations: { increment: 1 } },
      });
    }

    // Build context from knowledge base
    let context = '';
    if (bot.knowledgeBase?.id) {
      const relevantChunks = await this.kbService.searchSimilar(
        bot.knowledgeBase.id,
        dto.message,
        5,
      );
      if (relevantChunks.length > 0) {
        context = relevantChunks.map((c) => c.content).join('\n\n');
      }
    }

    // Build personality traits
    const personality = bot.personality as { tone?: string; style?: string; expertise?: string[] } | null;
    const personalitySection = personality
      ? `\n你的人格特質：
- 語氣：${personality.tone ?? '友善專業'}
- 風格：${personality.style ?? '有條理、善於舉例'}
${personality.expertise?.length ? `- 專長領域：${personality.expertise.join('、')}` : ''}`
      : '';

    // Build system prompt with bot config + knowledge base context
    const systemPrompt = [
      bot.systemPrompt ?? `你是創作者的 AI 助理，代表創作者與粉絲互動。
你的核心任務是：
1. 用繁體中文回答粉絲的問題
2. 根據知識庫內容提供準確資訊，不要編造不存在的內容
3. 如果知識庫中沒有相關資訊，誠實告知並建議粉絲透過其他方式聯繫創作者
4. 保持友善、親切、有溫度的對話風格
5. 回答要具體、有幫助，避免空泛的客套話`,
      personalitySection,
      bot.welcomeMessage ? `歡迎訊息風格參考：${bot.welcomeMessage}` : '',
      context
        ? `\n===== 知識庫相關內容（務必以此為依據回答） =====\n${context}\n===== 知識庫內容結束 =====\n\n請優先根據知識庫的內容來回答。如果知識庫中沒有相關資訊，可以根據一般常識回答，但要標注「此資訊非來自創作者的知識庫」。`
        : '\n目前沒有匹配的知識庫內容。請根據一般常識友善回答，並建議粉絲訪問創作者的頻道或網站獲取更多資訊。',
    ].filter(Boolean).join('\n\n');

    // Build conversation history
    const existingMsgs = (conversation.messages as unknown as MessageJson[]) ?? [];
    const history = existingMsgs.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Call real GPT
    const reply = await this.aiService.chatWithHistory(
      systemPrompt,
      [...history, { role: 'user' as const, content: dto.message }],
      { model: 'gpt-4o', maxTokens: 512 },
    );

    // Append messages to conversation
    const existingMessages = (conversation.messages as unknown as MessageJson[]) ?? [];
    const now = new Date().toISOString();
    const newMessages: MessageJson[] = [
      ...existingMessages,
      { role: 'user', content: dto.message, timestamp: now },
      { role: 'assistant', content: reply, timestamp: now },
    ];

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messages: newMessages as unknown as Prisma.InputJsonValue[],
        messageCount: { increment: 2 },
      },
    });

    // Increment bot total messages
    await this.prisma.botConfig.update({
      where: { id: botId },
      data: { totalMessages: { increment: 2 } },
    });

    return {
      conversationId: conversation.id,
      reply,
      hasContext: !!context,
    };
  }

  // ─── Conversations ───

  async getConversations(userId: string, tenantId: string, botId: string, limit: number = 20, cursor?: string) {
    const bot = await this.prisma.botConfig.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.userId !== userId || bot.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { botId },
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        fanUserId: true,
        anonymousId: true,
        messageCount: true,
        satisfactionScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = conversations.length > limit;
    const data = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  // ─── Helpers ───

  private formatBot(bot: {
    id: string;
    name: string;
    avatarUrl: string | null;
    welcomeMessage: string | null;
    systemPrompt: string | null;
    knowledgeBaseId: string | null;
    personality: unknown;
    isPublic: boolean;
    accessTier: string;
    totalConversations: number;
    totalMessages: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: bot.id,
      name: bot.name,
      avatarUrl: bot.avatarUrl,
      welcomeMessage: bot.welcomeMessage,
      systemPrompt: bot.systemPrompt,
      knowledgeBaseId: bot.knowledgeBaseId,
      personality: bot.personality,
      isPublic: bot.isPublic,
      accessTier: bot.accessTier,
      totalConversations: bot.totalConversations,
      totalMessages: bot.totalMessages,
      createdAt: bot.createdAt.toISOString(),
      updatedAt: bot.updatedAt.toISOString(),
    };
  }
}
