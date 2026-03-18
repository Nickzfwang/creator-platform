import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ContentClipService {
  private readonly logger = new Logger(ContentClipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async createClip(
    userId: string,
    tenantId: string,
    dto: {
      platform: string;
      url: string;
      title: string;
      rawContent: string;
      author?: string;
      imageUrl?: string;
    },
  ) {
    // Use AI to generate summary, category, and tags
    const aiResult = await this.aiService.generateJson<{
      summary: string;
      category: string;
      tags: string[];
      contentIdea: string;
    }>(
      `你是一位內容策展 AI。請分析以下從社群平台收藏的內容，提供：
- summary: 50-80 字的繁體中文摘要，抓住重點
- category: 分類（科技/生活/商業/娛樂/教育/設計/行銷/健康/美食/旅遊/其他）
- tags: 3-5 個相關標籤（不含 # 符號）
- contentIdea: 基於此內容，創作者可以製作什麼影片/貼文（一句話）

回覆 JSON 格式：{ "summary": "...", "category": "...", "tags": [...], "contentIdea": "..." }`,
      `平台：${dto.platform}\n標題：${dto.title}\n內容：${dto.rawContent.slice(0, 1500)}`,
      { maxTokens: 300 },
    );

    const clip = await this.prisma.contentClip.create({
      data: {
        userId,
        tenantId,
        platform: dto.platform,
        url: dto.url,
        title: dto.title,
        rawContent: dto.rawContent.slice(0, 5000),
        aiSummary: aiResult?.summary ?? null,
        aiCategory: aiResult?.category ?? null,
        aiTags: aiResult?.tags ?? [],
        author: dto.author ?? null,
        imageUrl: dto.imageUrl ?? null,
      },
    });

    this.logger.log(`Content clip saved: ${clip.id} from ${dto.platform}`);
    return clip;
  }

  async getClips(
    userId: string,
    options?: {
      category?: string;
      platform?: string;
      starred?: boolean;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = options?.limit ?? 20;
    const where: any = { userId };
    if (options?.category) where.aiCategory = options.category;
    if (options?.platform) where.platform = options.platform;
    if (options?.starred) where.isStarred = true;

    const clips = await this.prisma.contentClip.findMany({
      where,
      take: limit + 1,
      ...(options?.cursor && { skip: 1, cursor: { id: options.cursor } }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = clips.length > limit;
    const data = hasMore ? clips.slice(0, limit) : clips;

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      hasMore,
    };
  }

  async toggleStar(clipId: string, userId: string) {
    const clip = await this.prisma.contentClip.findUnique({ where: { id: clipId } });
    if (!clip || clip.userId !== userId) throw new NotFoundException('Clip not found');

    return this.prisma.contentClip.update({
      where: { id: clipId },
      data: { isStarred: !clip.isStarred },
    });
  }

  async deleteClip(clipId: string, userId: string) {
    const clip = await this.prisma.contentClip.findUnique({ where: { id: clipId } });
    if (!clip || clip.userId !== userId) throw new NotFoundException('Clip not found');

    await this.prisma.contentClip.delete({ where: { id: clipId } });
    return { deleted: true };
  }
}
