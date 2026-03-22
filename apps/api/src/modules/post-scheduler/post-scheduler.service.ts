import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PostStatus, PostType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { AiGeneratePostDto } from './dto/ai-generate.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class PostSchedulerService {
  private readonly logger = new Logger(PostSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    @InjectQueue('post-publish') private readonly publishQueue: Queue,
  ) {}

  async create(userId: string, tenantId: string, dto: CreatePostDto) {
    if (dto.clipId) {
      const clip = await this.prisma.videoClip.findUnique({
        where: { id: dto.clipId },
        select: { id: true, tenantId: true, clipUrl: true },
      });
      if (!clip || clip.tenantId !== tenantId) {
        throw new NotFoundException('Clip not found');
      }
      if (clip.clipUrl && (!dto.mediaUrls || dto.mediaUrls.length === 0)) {
        dto.mediaUrls = [clip.clipUrl];
      }
    }

    let status: PostStatus = PostStatus.DRAFT;
    if (dto.scheduledAt) {
      if (new Date(dto.scheduledAt) <= new Date()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
      status = PostStatus.SCHEDULED;
    }

    const post = await this.prisma.post.create({
      data: {
        userId,
        tenantId,
        contentText: dto.contentText,
        mediaUrls: dto.mediaUrls ?? [],
        clipId: dto.clipId,
        platforms: dto.platforms as unknown as Prisma.InputJsonValue,
        type: dto.type ?? PostType.ORIGINAL,
        affiliateLinks: dto.affiliateLinks as unknown as Prisma.InputJsonValue,
        hashtags: dto.hashtags ?? [],
        status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });

    // If SCHEDULED, create BullMQ delayed job
    if (status === PostStatus.SCHEDULED && dto.scheduledAt) {
      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      await this.publishQueue.add(
        'publish',
        { postId: post.id },
        { delay, jobId: `post-${post.id}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }

    this.logger.log(`Post ${post.id} created with status ${status}`);
    return {
      id: post.id,
      status: post.status,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async findAll(userId: string, query: ListPostsQueryDto) {
    const { cursor, limit = 20, status, type, dateFrom, dateTo } = query;

    const where: Prisma.PostWhereInput = {
      userId,
      ...(status && { status }),
      ...(type && { type }),
      ...(dateFrom || dateTo
        ? {
            scheduledAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
    };

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        contentText: true,
        platforms: true,
        type: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async findById(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        clip: {
          select: { id: true, title: true, clipUrl: true, thumbnailUrl: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('Not the post owner');
    }
    return post;
  }

  async update(postId: string, userId: string, dto: UpdatePostDto) {
    const post = await this.findById(postId, userId);

    if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot update post in ${post.status} status`,
      );
    }

    let newStatus = post.status;
    if (dto.scheduledAt) {
      if (new Date(dto.scheduledAt) <= new Date()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
      newStatus = PostStatus.SCHEDULED;
      // Remove old BullMQ job, create new delayed job
      try { await this.publishQueue.remove(`post-${postId}`); } catch { /* may not exist */ }
      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      await this.publishQueue.add(
        'publish',
        { postId },
        { delay, jobId: `post-${postId}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }

    const data: Record<string, unknown> = { status: newStatus };
    if (dto.contentText !== undefined) data.contentText = dto.contentText;
    if (dto.mediaUrls !== undefined) data.mediaUrls = dto.mediaUrls;
    if (dto.platforms !== undefined) data.platforms = dto.platforms as unknown as Prisma.InputJsonValue;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.hashtags !== undefined) data.hashtags = dto.hashtags;
    if (dto.affiliateLinks !== undefined) data.affiliateLinks = dto.affiliateLinks as unknown as Prisma.InputJsonValue;
    if (dto.scheduledAt !== undefined) data.scheduledAt = new Date(dto.scheduledAt);

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data,
    });

    this.logger.log(`Post ${postId} updated`);
    return updated;
  }

  async remove(postId: string, userId: string) {
    const post = await this.findById(postId, userId);

    if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot delete post in ${post.status} status`,
      );
    }

    // Remove BullMQ delayed job if SCHEDULED
    if (post.status === PostStatus.SCHEDULED) {
      try { await this.publishQueue.remove(`post-${postId}`); } catch { /* may not exist */ }
    }
    await this.prisma.post.delete({ where: { id: postId } });
    this.logger.log(`Post ${postId} deleted`);
  }

  async publishNow(postId: string, userId: string) {
    const post = await this.findById(postId, userId);

    if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot publish post in ${post.status} status`,
      );
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.PUBLISHING },
    });

    // Remove existing delayed job if SCHEDULED, then create immediate job
    try { await this.publishQueue.remove(`post-${postId}`); } catch { /* may not exist */ }
    await this.publishQueue.add(
      'publish',
      { postId },
      { jobId: `post-${postId}-now`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Post ${postId} queued for immediate publishing`);
    return {
      id: postId,
      status: 'PUBLISHING',
      message: 'Post queued for immediate publishing',
    };
  }

  async aiGenerate(userId: string, dto: AiGeneratePostDto) {
    let clipContext = '';
    if (dto.clipId) {
      const clip = await this.prisma.videoClip.findUnique({
        where: { id: dto.clipId },
        include: {
          video: { select: { transcript: true, aiSummary: true, title: true } },
        },
      });
      if (!clip) {
        throw new NotFoundException('Clip not found');
      }
      // Build rich context: title + summary + transcript (truncated)
      const parts = [`影片標題: ${clip.video.title}`, `片段標題: ${clip.title}`];
      if (clip.video.aiSummary) parts.push(`AI 摘要: ${clip.video.aiSummary}`);
      if (clip.video.transcript) {
        const transcriptStr = String(clip.video.transcript);
        const truncatedTranscript = transcriptStr.length > 2000
          ? transcriptStr.slice(0, 2000) + '...(truncated)'
          : transcriptStr;
        parts.push(`影片逐字稿:\n${truncatedTranscript}`);
      }
      clipContext = parts.join('\n');
    }

    // Use real GPT to generate platform-specific content
    const tone = dto.tone ?? 'professional';
    const systemPrompt = `你是一位在台灣市場有豐富經驗的社群媒體內容策略師，深諳各平台的演算法偏好和用戶行為。

請根據指定的平台和語調生成高互動率的貼文。每個平台的內容必須完全不同，不能只是改長短。

各平台策略（嚴格遵守）：
- **YouTube**（影片描述）：
  - 前 2 行最重要（摺疊前可見），必須含核心賣點
  - 200-500 字，包含時間軸目錄（00:00 格式）
  - 結尾加 CTA：訂閱、開啟小鈴鐺、留言互動
  - hashtags 放描述最底部
- **Instagram**（貼文文案）：
  - 第一句話就要抓住注意力（Hook）
  - 100-150 字，分段落，大量使用 emoji
  - 結尾用問句引導留言互動（提高互動率）
  - hashtags 5-10 個，混合熱門和精準標籤
- **TikTok**（影片標題/描述）：
  - 50 字以內，第一句就是 Hook
  - 年輕化、口語化語氣，帶點爭議性或懸念
  - hashtags 3-5 個，優先使用熱門挑戰標籤
- **Facebook**（社群貼文）：
  - 150-300 字，故事敘事或提問開頭
  - 設計讓人想分享的內容（共鳴感/實用性）
  - 結尾用二選一問題引發討論
- **Twitter/X**（推文）：
  - 100 字以內（含 hashtags），精簡有力
  - 觀點鮮明，引發 RT 和引用
- **Threads**（串文）：
  - 對話式語氣，像跟朋友聊天
  - 分享個人觀點或幕後故事
  - 100 字以內，不需要太多 hashtags

語調：${tone === 'professional' ? '專業知性，有深度的見解' : tone === 'casual' ? '輕鬆日常，像跟朋友聊天' : tone === 'humorous' ? '幽默有趣，帶點自嘲和梗' : tone}

回覆格式為 JSON：
{
  "suggestions": [
    { "platform": "YOUTUBE", "contentText": "...", "hashtags": ["#tag1", "#tag2"] }
  ]
}`;

    const userMsg = `請為以下平台生成貼文：${dto.platforms.join(', ')}
${clipContext ? `\n相關影片素材：${clipContext}` : ''}
${dto.additionalContext ? `\n額外資訊：${dto.additionalContext}` : ''}`;

    const result = await this.aiService.generateJson<{
      suggestions: Array<{ platform: string; contentText: string; hashtags: string[] }>;
    }>(systemPrompt, userMsg, { model: 'gpt-4o' });

    if (result?.suggestions) {
      this.logger.log(`AI content generated for user ${userId} via GPT`);
      return {
        suggestions: result.suggestions,
        content: result.suggestions[0]?.contentText ?? '',
        hashtags: result.suggestions[0]?.hashtags ?? [],
      };
    }

    // Fallback if GPT fails
    this.logger.warn('GPT generation failed, using fallback');
    const fallbackText = `✨ 新內容來啦！${clipContext ? `\n\n${clipContext}` : ''}\n\n記得追蹤關注更多精彩內容！`;
    return {
      suggestions: dto.platforms.map((p) => ({
        platform: p,
        contentText: fallbackText,
        hashtags: ['#創作者', '#新內容'],
      })),
      content: fallbackText,
      hashtags: ['#創作者', '#新內容'],
    };
  }

  async getOptimalPostingTimes(userId: string) {
    // Analyze past post performance to recommend optimal posting times
    const publishedPosts = await this.prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        publishedAt: true,
        platforms: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });

    // TODO: Correlate with PlatformAnalytics engagement data
    // TODO: Use GPT-4o to analyze patterns and generate recommendations

    // Placeholder: analyze posting hour distribution
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};

    for (const post of publishedPosts) {
      if (post.publishedAt) {
        const hour = post.publishedAt.getHours();
        const day = post.publishedAt.getDay();
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
        dayCounts[day] = (dayCounts[day] ?? 0) + 1;
      }
    }

    // Default recommendations if not enough data
    const defaultSlots = [
      { day: 'Monday', time: '09:00', reason: 'Morning engagement peak' },
      { day: 'Wednesday', time: '12:00', reason: 'Midweek lunch break' },
      { day: 'Friday', time: '17:00', reason: 'Weekend preview engagement' },
      { day: 'Saturday', time: '10:00', reason: 'Weekend leisure browsing' },
    ];

    return {
      totalPostsAnalyzed: publishedPosts.length,
      recommendations:
        publishedPosts.length < 10
          ? defaultSlots
          : defaultSlots, // TODO: replace with data-driven recommendations
      hourDistribution: hourCounts,
      dayDistribution: dayCounts,
    };
  }
}
