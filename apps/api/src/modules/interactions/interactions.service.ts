import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CommentCategory, CommentPriority, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { ImportCommentsDto } from './dto/import-comments.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

interface ClassificationResult {
  category: string;
  sentiment: number;
  priority: string;
}

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  // ─── Import Comments ───

  async importComments(userId: string, tenantId: string, dto: ImportCommentsDto) {
    // Create all comments
    const comments = await this.prisma.$transaction(
      dto.comments.map((c) =>
        this.prisma.fanComment.create({
          data: {
            userId,
            tenantId,
            authorName: c.authorName,
            content: c.content,
            platform: c.platform,
            publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
            sourceUrl: c.sourceUrl,
          },
        }),
      ),
    );

    // Classify in background (don't block response)
    this.classifyComments(comments.map((c) => c.id), comments.map((c) => c.content)).catch(
      (err) => this.logger.error('Classification failed:', err),
    );

    return { imported: comments.length, classified: 0, commentIds: comments.map((c) => c.id) };
  }

  // ─── List Comments ───

  async listComments(
    userId: string,
    tenantId: string,
    params: {
      cursor?: string;
      limit?: number;
      category?: CommentCategory;
      priority?: CommentPriority;
      isReplied?: boolean;
      search?: string;
    },
  ) {
    const limit = Math.min(params.limit || 20, 50);

    const where: Prisma.FanCommentWhereInput = {
      userId,
      tenantId,
      ...(params.category && { category: params.category }),
      ...(params.priority && { priority: params.priority }),
      ...(params.isReplied !== undefined && { isReplied: params.isReplied }),
      ...(params.search && {
        OR: [
          { content: { contains: params.search, mode: 'insensitive' as const } },
          { authorName: { contains: params.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const items = await this.prisma.fanComment.findMany({
      where: {
        ...where,
        ...(params.cursor && { createdAt: { lt: new Date(params.cursor) } }),
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  // ─── Generate Reply ───

  async generateReply(commentId: string, userId: string, tenantId: string, dto: GenerateReplyDto) {
    const comment = await this.prisma.fanComment.findFirst({
      where: { id: commentId, userId, tenantId },
    });
    if (!comment) throw new NotFoundException('留言不存在');

    // Get RAG context if knowledge base specified
    let ragContext = '';
    if (dto.knowledgeBaseId) {
      try {
        const results = await this.knowledgeBaseService.searchSimilar(
          dto.knowledgeBaseId,
          comment.content,
          3,
        );
        ragContext = results.map((r: any) => r.content).join('\n\n');
      } catch {
        this.logger.warn('RAG search failed, proceeding without context');
      }
    }

    const tones = dto.tone
      ? [dto.tone]
      : ['friendly', 'professional', 'casual'];

    const toneDescriptions: Record<string, string> = {
      friendly: '親切友善、帶有溫暖感',
      professional: '專業正式、有禮貌但不過度親暱',
      casual: '輕鬆隨意、像朋友聊天',
    };

    const result = await this.aiService.generateJson<{
      replies: { tone: string; content: string }[];
    }>(
      `你是一位創作者的社群管理助手。根據粉絲的留言，代擬回覆草稿。

要求：
- 每個語氣生成一則回覆
- 回覆長度 30-100 字
- 回覆要自然，不要太公式化
- 如果有知識庫參考資料，用它來回答問題
- 不要以「感謝您的留言」這種千篇一律的開頭

${ragContext ? `\n## 知識庫參考資料\n${ragContext}` : ''}

回傳 JSON：{ "replies": [{ "tone": "friendly|professional|casual", "content": "回覆內容" }] }`,
      `留言分類：${comment.category}\n留言作者：${comment.authorName}\n留言內容：${comment.content}\n\n請以以下語氣回覆：${tones.map((t) => `${t}（${toneDescriptions[t]}）`).join('、')}`,
    );

    const replies = result?.replies || tones.map((t) => ({
      tone: t,
      content: `感謝你的留言！（AI 生成暫時不可用，請手動撰寫回覆）`,
    }));

    // Save first reply as aiReply
    if (replies.length > 0) {
      await this.prisma.fanComment.update({
        where: { id: commentId },
        data: { aiReply: replies[0].content },
      });
    }

    return { replies };
  }

  // ─── Update Comment ───

  async updateComment(commentId: string, userId: string, tenantId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.fanComment.findFirst({
      where: { id: commentId, userId, tenantId },
    });
    if (!comment) throw new NotFoundException('留言不存在');

    const data: Prisma.FanCommentUpdateInput = {};
    if (dto.finalReply !== undefined) data.finalReply = dto.finalReply;
    if (dto.isReplied !== undefined) {
      data.isReplied = dto.isReplied;
      if (dto.isReplied) data.repliedAt = new Date();
    }
    if (dto.category !== undefined) data.category = dto.category;

    return this.prisma.fanComment.update({
      where: { id: commentId },
      data,
    });
  }

  // ─── Delete Comment ───

  async deleteComment(commentId: string, userId: string, tenantId: string) {
    const comment = await this.prisma.fanComment.findFirst({
      where: { id: commentId, userId, tenantId },
    });
    if (!comment) throw new NotFoundException('留言不存在');

    await this.prisma.fanComment.delete({ where: { id: commentId } });
  }

  // ─── Stats ───

  async getStats(userId: string, tenantId: string, period: string = '30d') {
    const days = period === '7d' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000);

    const comments = await this.prisma.fanComment.findMany({
      where: { userId, tenantId, createdAt: { gte: since } },
      select: { category: true, sentiment: true, isReplied: true, createdAt: true },
    });

    // Category breakdown
    const categoryCount: Record<string, number> = {};
    for (const c of comments) {
      categoryCount[c.category] = (categoryCount[c.category] || 0) + 1;
    }

    // Sentiment trend (daily avg)
    const sentimentByDay = new Map<string, { sum: number; count: number }>();
    for (const c of comments) {
      const day = c.createdAt.toISOString().split('T')[0];
      const existing = sentimentByDay.get(day) || { sum: 0, count: 0 };
      existing.sum += c.sentiment;
      existing.count++;
      sentimentByDay.set(day, existing);
    }

    const sentimentTrend = Array.from(sentimentByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({
        date,
        avgSentiment: Math.round((sum / count) * 100) / 100,
        count,
      }));

    const totalComments = comments.length;
    const repliedCount = comments.filter((c) => c.isReplied).length;
    const avgSentiment = totalComments > 0
      ? Math.round((comments.reduce((s, c) => s + c.sentiment, 0) / totalComments) * 100) / 100
      : 0;

    return {
      period: { days, since: since.toISOString() },
      totalComments,
      repliedCount,
      replyRate: totalComments > 0 ? Math.round((repliedCount / totalComments) * 1000) / 10 : 0,
      avgSentiment,
      categoryBreakdown: Object.entries(categoryCount).map(([category, count]) => ({
        category,
        count,
        percentage: totalComments > 0 ? Math.round((count / totalComments) * 1000) / 10 : 0,
      })),
      sentimentTrend,
    };
  }

  // ─── Private: AI Classification ───

  private async classifyComments(ids: string[], contents: string[]) {
    // Batch classify using AI
    const result = await this.aiService.generateJson<{
      classifications: ClassificationResult[];
    }>(
      `你是一位社群留言分析師。分析以下留言，為每則留言分類。

分類規則：
- category: POSITIVE（正面讚美/支持）| NEGATIVE（批評/不滿）| QUESTION（問題/疑問）| COLLABORATION（合作邀約/商務）| SPAM（垃圾/廣告）| NEUTRAL（中性/一般）
- sentiment: -1.0（非常負面）到 1.0（非常正面），0 為中性
- priority: HIGH（COLLABORATION 或需要緊急回覆的 QUESTION）| MEDIUM（QUESTION 或 NEGATIVE）| LOW（其他）

回傳 JSON：{ "classifications": [{ "category": "...", "sentiment": 0.5, "priority": "..." }] }
陣列順序對應留言順序。`,
      contents.map((c, i) => `留言 ${i + 1}: ${c}`).join('\n'),
    );

    if (!result?.classifications) return;

    // Update each comment
    const updates = result.classifications.slice(0, ids.length);
    await this.prisma.$transaction(
      updates.map((cls, i) =>
        this.prisma.fanComment.update({
          where: { id: ids[i] },
          data: {
            category: this.parseCategory(cls.category),
            sentiment: Math.max(-1, Math.min(1, cls.sentiment || 0)),
            priority: this.parsePriority(cls.priority),
          },
        }),
      ),
    );

    this.logger.log(`Classified ${updates.length} comments`);
  }

  private parseCategory(cat: string): CommentCategory {
    const upper = cat?.toUpperCase();
    const valid: CommentCategory[] = ['POSITIVE', 'NEGATIVE', 'QUESTION', 'COLLABORATION', 'SPAM', 'NEUTRAL'];
    return valid.includes(upper as CommentCategory) ? (upper as CommentCategory) : CommentCategory.NEUTRAL;
  }

  private parsePriority(pri: string): CommentPriority {
    const upper = pri?.toUpperCase();
    if (upper === 'HIGH') return CommentPriority.HIGH;
    if (upper === 'MEDIUM') return CommentPriority.MEDIUM;
    return CommentPriority.LOW;
  }
}
