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

    // Build system prompt with bot config + knowledge base context
    const systemPrompt = [
      bot.systemPrompt ?? '你是一個友善的 AI 助理，幫助創作者與粉絲互動。請用繁體中文回答。',
      bot.welcomeMessage ? `歡迎訊息風格參考：${bot.welcomeMessage}` : '',
      context ? `\n以下是相關知識庫內容，請根據這些資訊回答：\n${context}` : '',
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

  // ─── Mock AI Reply ───

  private generateMockReply(message: string, context: string): string {
    const msg = message.toLowerCase();

    // Keyword-matched responses for demo
    if (msg.includes('價格') || msg.includes('多少錢') || msg.includes('費用') || msg.includes('會員')) {
      return '我們有三個會員等級可以選擇：\n\n🆓 **免費會員**：觀看公開影片、參與社群討論\n⭐ **Pro 會員（NT$199/月）**：獨家幕後花絮、搶先觀看、專屬 Discord\n👑 **VIP 會員（NT$499/月）**：每月線上 Q&A、個人化建議、完整資源庫\n\n年繳方案可享 85 折優惠！你有興趣了解哪個方案呢？';
    }

    if (msg.includes('合作') || msg.includes('業配') || msg.includes('邀約') || msg.includes('sponsor')) {
      return '感謝你對合作的興趣！Nick 目前接受以下合作方式：\n\n📹 **產品評測** — 深度開箱 + YouTube 長片\n📱 **贊助內容** — 品牌植入式影片\n🤝 **品牌大使** — 長期合作方案\n🎪 **活動合作** — 線下活動或限定企劃\n\n合作預算起步為 NT$30,000，視合作範圍而定。請透過 nick@nickcreates.com 聯繫詳細洽談！';
    }

    if (msg.includes('頻道') || msg.includes('channel') || msg.includes('介紹') || msg.includes('關於')) {
      return 'Nick Creates 是一個專注於科技、生活和創作的頻道 🎬\n\n📊 **頻道數據**\n- YouTube：12.5 萬訂閱\n- Instagram：8.5 萬粉絲\n- TikTok：21 萬粉絲\n\n🎯 **內容方向**\n科技開箱評測、生活 Vlog、料理教學、程式教學\n\n📅 每週二、週五固定更新！';
    }

    if (msg.includes('設備') || msg.includes('相機') || msg.includes('器材') || msg.includes('拍攝')) {
      return 'Nick 的拍攝設備清單：\n\n📷 **相機**：Sony A7IV\n🎥 **鏡頭**：24-70mm f/2.8 GM\n🎤 **麥克風**：Rode VideoMic Pro+\n💡 **燈光**：Aputure 300d II\n🖥️ **剪輯**：MacBook Pro M3 Max + DaVinci Resolve\n\n這些設備的推廣連結都在影片描述欄！';
    }

    if (msg.includes('你好') || msg.includes('嗨') || msg.includes('hi') || msg.includes('hello')) {
      return '嗨！很高興認識你 👋 我是 Nick 的 AI 助理，可以幫你解答關於頻道、會員方案或合作的任何問題。有什麼想了解的嗎？';
    }

    // If we have KB context, use it
    if (context) {
      return `根據我的知識庫，以下是相關資訊：\n\n${context.substring(0, 300)}\n\n如果需要更多細節，歡迎繼續提問！😊`;
    }

    // Default response
    return `感謝你的提問！這是一個很好的問題 😊\n\n目前我可以幫你解答以下主題：\n- 💰 會員方案與價格\n- 🤝 品牌合作方式\n- 📹 頻道介紹與數據\n- 📷 拍攝設備推薦\n\n請告訴我你想了解哪個方面？`;
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
