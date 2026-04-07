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
        throw new NotFoundException('errors.postScheduler.clipNotFound');
      }
      if (clip.clipUrl && (!dto.mediaUrls || dto.mediaUrls.length === 0)) {
        dto.mediaUrls = [clip.clipUrl];
      }
    }

    let status: PostStatus = PostStatus.DRAFT;
    if (dto.scheduledAt) {
      if (new Date(dto.scheduledAt) <= new Date()) {
        throw new BadRequestException('errors.postScheduler.scheduleMustBeFuture');
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
      throw new NotFoundException('errors.postScheduler.postNotFound');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('errors.postScheduler.notPostOwner');
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
        throw new BadRequestException('errors.postScheduler.scheduleMustBeFuture');
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

  /**
   * Parse Prisma JsonValue transcript to plain string
   */
  private parseTranscript(transcript: unknown): string {
    if (!transcript) return '';
    if (typeof transcript === 'string') return transcript;
    // Prisma JsonValue: could be a JSON-encoded string (with quotes)
    try {
      const parsed = typeof transcript === 'string' ? JSON.parse(transcript) : transcript;
      if (typeof parsed === 'string') return parsed;
      return String(parsed);
    } catch {
      return String(transcript);
    }
  }

  async aiGenerate(userId: string, dto: AiGeneratePostDto) {
    let clipContext = '';
    let hasVideoContext = false;

    if (dto.clipId) {
      const clip = await this.prisma.videoClip.findUnique({
        where: { id: dto.clipId },
        include: {
          video: { select: { transcript: true, aiSummary: true, title: true } },
        },
      });
      if (!clip) {
        throw new NotFoundException('errors.postScheduler.clipNotFound');
      }
      // Build rich context: title + summary + transcript (truncated)
      const parts = [`影片標題: ${clip.video.title}`, `片段標題: ${clip.title}`];
      if (clip.video.aiSummary) parts.push(`AI 摘要: ${clip.video.aiSummary}`);

      const transcriptStr = this.parseTranscript(clip.video.transcript);
      if (transcriptStr) {
        const truncated = transcriptStr.length > 2000
          ? transcriptStr.slice(0, 2000) + '...(truncated)'
          : transcriptStr;
        parts.push(`影片逐字稿:\n${truncated}`);
      }
      clipContext = parts.join('\n');
      hasVideoContext = true;
      this.logger.log(`AI generate with clip context: video="${clip.video.title}", clip="${clip.title}", transcript=${transcriptStr.length} chars`);
    }

    // Use real GPT to generate platform-specific content
    const tone = dto.tone ?? 'professional';

    // Build constraint based on whether we have video context
    const contentConstraint = hasVideoContext
      ? `⚠️ 最重要的規則：你必須 100% 根據下方提供的「影片素材」來撰寫貼文。
貼文的每一句話都必須與影片的實際內容直接相關。
嚴禁編造影片中不存在的內容、場景或主題。
如果逐字稿提到演唱會，就寫演唱會相關；如果是教學，就寫教學相關。
絕對不能生成與影片無關的通用內容。`
      : '請根據使用者提供的額外資訊或主題來生成貼文。如果沒有提供任何素材，請生成通用的創作者互動內容。';

    const systemPrompt = `你是一位在台灣市場有豐富經驗的社群媒體內容策略師，深諳各平台的演算法偏好和用戶行為。

${contentConstraint}

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
}

===== 範例（假設影片是關於「在家沖咖啡教學」）=====

YouTube 範例：
"手沖咖啡新手必看！5 個步驟讓你在家也能沖出咖啡廳等級的風味 ☕\n\n你是不是也覺得手沖咖啡很難？其實只要掌握水溫、研磨度和注水手法，在家就能沖出超好喝的咖啡！\n\n⏱ 時間軸\n00:00 開場\n00:30 器材準備\n01:45 研磨度設定\n03:20 注水手法示範\n05:00 品嚐成果\n\n如果你也是咖啡新手，記得按讚訂閱開啟小鈴鐺 🔔\n留言告訴我你最想學哪種沖煮方式！"

Instagram 範例：
"在家也能沖出咖啡廳等級的手沖 ☕✨\n\n每天早上的小確幸，就是這杯自己沖的咖啡 🥹\n\n分享 5 個手沖關鍵步驟 👇\n1️⃣ 水溫 90-93°C\n2️⃣ 中細研磨\n3️⃣ 悶蒸 30 秒\n4️⃣ 緩慢注水\n5️⃣ 享受 ☕\n\n你是黑咖啡派還是拿鐵派？留言告訴我！💬"

TikTok 範例：
"別再買超商咖啡了！在家沖更好喝 ☕ 新手照著做就行 #手沖咖啡 #咖啡教學 #居家咖啡"

===== 範例結束 =====`;

    const userMsg = `請為以下平台生成貼文：${dto.platforms.join(', ')}
${clipContext ? `\n===== 影片素材（貼文必須基於此內容） =====\n${clipContext}\n===== 影片素材結束 =====` : ''}
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

    // Analyze posting hour distribution + correlate with AI below
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

    // Default recommendations for new creators (< 10 posts)
    const defaultSlots = [
      { day: '週一', time: '09:00', reason: '上班族通勤時段，社群使用高峰' },
      { day: '週三', time: '12:00', reason: '週中午休時段，適合知識型內容' },
      { day: '週五', time: '17:00', reason: '週末前夕，放鬆瀏覽時段' },
      { day: '週六', time: '10:00', reason: '週末休閒時段，長影片觀看高峰' },
    ];

    if (publishedPosts.length < 5) {
      return {
        totalPostsAnalyzed: publishedPosts.length,
        recommendations: defaultSlots,
        hourDistribution: hourCounts,
        dayDistribution: dayCounts,
        aiInsight: '目前發佈數據不足（少於 5 篇），建議先參考以上通用最佳時段。累積更多發佈數據後，AI 將根據你的粉絲互動模式提供個人化建議。',
      };
    }

    // Enough data — use AI to analyze patterns
    // Gather social account analytics for context
    const socialAccounts = await this.prisma.socialAccount.findMany({
      where: { userId, isActive: true },
      select: { platform: true, platformUsername: true, followerCount: true },
    });

    const analyticsData = await this.prisma.platformAnalytics.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, followers: true, engagementRate: true, views: true, socialAccount: { select: { platform: true } } },
    });

    const aiAnalysis = await this.aiService.generateJson<{
      recommendations: Array<{ day: string; time: string; reason: string }>;
      insight: string;
    }>(
      `你是社群媒體數據分析專家，擅長分析發佈時間與互動率的關聯。

根據以下創作者的發佈歷史和平台數據，分析最佳發佈時間並提供建議。

注意事項：
- 時間以台灣時區 (UTC+8) 為準
- day 用繁體中文（週一、週二...）
- 提供 4 個建議時段
- 每個建議要說明具體原因（根據數據，不是猜測）
- insight 提供一段 50-100 字的整體分析摘要

回覆 JSON: { "recommendations": [{ "day": "週一", "time": "09:00", "reason": "..." }], "insight": "..." }`,
      `=== 發佈歷史（${publishedPosts.length} 篇） ===
小時分佈：${JSON.stringify(hourCounts)}
星期分佈：${JSON.stringify(dayCounts)}（0=日 1=一 2=二 ... 6=六）

=== 社群帳號 ===
${socialAccounts.map(a => `${a.platform}: @${a.platformUsername} (${a.followerCount} 粉絲)`).join('\n') || '尚無連結帳號'}

=== 近 30 天 Analytics ===
${analyticsData.slice(0, 10).map(a => `${a.socialAccount.platform} ${a.date.toISOString().split('T')[0]}: ${a.followers ?? 0} followers, ${a.engagementRate ?? 0}% engagement, ${a.views ?? 0} views`).join('\n') || '尚無分析數據'}`,
      { maxTokens: 500 },
    );

    return {
      totalPostsAnalyzed: publishedPosts.length,
      recommendations: aiAnalysis?.recommendations ?? defaultSlots,
      hourDistribution: hourCounts,
      dayDistribution: dayCounts,
      aiInsight: aiAnalysis?.insight ?? '數據分析完成，建議參考上方推薦時段。',
    };
  }
}
