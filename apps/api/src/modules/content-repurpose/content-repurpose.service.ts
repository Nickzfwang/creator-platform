import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RepurposeJobStatus, RepurposeItemStatus, VideoStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { UpdateRepurposeItemDto } from './dto/update-repurpose-item.dto';
import { ScheduleItemsDto } from './dto/schedule-items.dto';
import { CreateCampaignFromItemDto } from './dto/create-campaign.dto';

interface SocialPostContent {
  contentText: string;
  hashtags: string[];
  characterCount: number;
}

interface ShortVideoSuggestionContent {
  title: string;
  startTime: number;
  endTime: number;
  transcriptExcerpt: string;
  reason: string;
  suggestedPlatforms: string[];
  score: number;
}

interface EmailContent {
  subject: string;
  body: string;
  plainText: string;
  ctaText: string;
  ctaUrl: string;
}

const PLATFORM_CONFIGS: Record<string, { name: string; maxChars: number; rules: string }> = {
  YOUTUBE: {
    name: 'YouTube 社群',
    maxChars: 500,
    rules: '較長文案、引導觀看完整影片、可使用時間戳格式 00:00、結尾放影片連結 CTA',
  },
  INSTAGRAM: {
    name: 'Instagram',
    maxChars: 150,
    rules: 'Emoji 豐富、Hashtag 15-30 個混合大眾和小眾標籤、第一行必須是 Hook、結尾互動 CTA（提問或邀請留言）',
  },
  FACEBOOK: {
    name: 'Facebook',
    maxChars: 300,
    rules: '故事性強、可較長、分享導向、開頭用故事或提問引入、適合較深入的觀點分享',
  },
  TWITTER: {
    name: 'Twitter/X',
    maxChars: 280,
    rules: '280 字內、精煉有力、1-3 個話題標籤、可加上爭議性觀點引發轉推',
  },
  THREADS: {
    name: 'Threads',
    maxChars: 500,
    rules: '對話感、觀點鮮明、引發討論、像是跟朋友聊天、少用 Hashtag（最多 3 個）',
  },
};

const STYLE_CONFIGS: Record<string, { name: string; description: string }> = {
  knowledge: {
    name: '知識型',
    description: '條列重點、乾貨整理、實用導向。用數字或列點呈現核心資訊，讓讀者快速獲取價值。',
  },
  story: {
    name: '故事型',
    description: '敘事手法、引發好奇、情感連結。用個人經驗或場景描述切入，讓讀者產生共鳴。',
  },
  interactive: {
    name: '互動型',
    description: '提問形式、投票、引發討論。用開放式問題開場，鼓勵留言互動，增加演算法權重。',
  },
};

@Injectable()
export class ContentRepurposeService {
  private readonly logger = new Logger(ContentRepurposeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    @InjectQueue('content-repurpose') private readonly repurposeQueue: Queue,
  ) {}

  // ─── Trigger Generation ───

  async triggerGeneration(videoId: string, userId: string, tenantId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, status: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');
    if (video.status !== VideoStatus.PROCESSED) {
      throw new BadRequestException('Video must be in PROCESSED state');
    }

    // Check for existing job
    const existing = await this.prisma.repurposeJob.findUnique({
      where: { videoId },
    });

    if (existing) {
      if (existing.status === RepurposeJobStatus.PROCESSING) {
        throw new ConflictException('Content generation is already in progress');
      }
      // Delete old items and reset job
      await this.prisma.repurposeItem.deleteMany({ where: { jobId: existing.id } });
      await this.prisma.repurposeJob.update({
        where: { id: existing.id },
        data: {
          status: RepurposeJobStatus.PENDING,
          errorMessage: null,
          completedAt: null,
        },
      });

      await this.repurposeQueue.add('generate', { jobId: existing.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });

      return { jobId: existing.id, status: 'PENDING', message: '內容重新生成已排入佇列' };
    }

    const job = await this.prisma.repurposeJob.create({
      data: { videoId, userId, tenantId, status: RepurposeJobStatus.PENDING },
    });

    await this.repurposeQueue.add('generate', { jobId: job.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Repurpose job ${job.id} created for video ${videoId}`);
    return { jobId: job.id, status: 'PENDING', message: '內容生成已排入佇列' };
  }

  // ─── AI Generation (called by processor) ───

  async processGeneration(jobId: string) {
    const job = await this.prisma.repurposeJob.findUnique({
      where: { id: jobId },
      include: {
        video: {
          select: {
            id: true, title: true, aiSummary: true, transcript: true, durationSeconds: true,
          },
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    await this.prisma.repurposeJob.update({
      where: { id: jobId },
      data: { status: RepurposeJobStatus.PROCESSING },
    });

    const { video } = job;
    const transcript = typeof video.transcript === 'string'
      ? video.transcript
      : video.transcript
        ? JSON.stringify(video.transcript)
        : null;
    const truncatedTranscript = transcript
      ? transcript.length > 3000
        ? transcript.slice(0, 3000) + '...(截斷)'
        : transcript
      : null;

    try {
      // Run all generation tasks in parallel
      const [socialPosts, shortVideoSuggestions, email] = await Promise.allSettled([
        this.generateSocialPosts(video.title, video.aiSummary, truncatedTranscript),
        video.durationSeconds && video.durationSeconds >= 30
          ? this.generateShortVideoSuggestions(video.title, video.aiSummary, truncatedTranscript, video.durationSeconds)
          : Promise.resolve([]),
        this.generateEmail(video.title, video.aiSummary, truncatedTranscript),
      ]);

      const items: Array<{
        jobId: string;
        type: 'SOCIAL_POST' | 'SHORT_VIDEO_SUGGESTION' | 'EMAIL';
        platform?: string;
        style?: string;
        originalContent: object;
        metadata?: object;
      }> = [];

      // Process social posts
      if (socialPosts.status === 'fulfilled') {
        for (const post of socialPosts.value) {
          items.push({
            jobId,
            type: 'SOCIAL_POST',
            platform: post.platform,
            style: post.style,
            originalContent: post.content,
          });
        }
      } else {
        this.logger.error(`Social posts generation failed: ${socialPosts.reason}`);
      }

      // Process short video suggestions
      if (shortVideoSuggestions.status === 'fulfilled') {
        for (const suggestion of shortVideoSuggestions.value) {
          items.push({
            jobId,
            type: 'SHORT_VIDEO_SUGGESTION',
            originalContent: suggestion,
            metadata: { videoId: video.id },
          });
        }
      } else {
        this.logger.error(`Short video suggestions failed: ${shortVideoSuggestions.reason}`);
      }

      // Process email
      if (email.status === 'fulfilled' && email.value) {
        items.push({
          jobId,
          type: 'EMAIL',
          originalContent: email.value,
        });
      } else if (email.status === 'rejected') {
        this.logger.error(`Email generation failed: ${email.reason}`);
      }

      // Batch create all items
      if (items.length > 0) {
        await this.prisma.repurposeItem.createMany({ data: items as any });
      }

      await this.prisma.repurposeJob.update({
        where: { id: jobId },
        data: {
          status: RepurposeJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Repurpose job ${jobId} completed: ${items.length} items generated`);
    } catch (error) {
      this.logger.error(`Repurpose job ${jobId} failed: ${error}`);
      await this.prisma.repurposeJob.update({
        where: { id: jobId },
        data: {
          status: RepurposeJobStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async generateSocialPosts(
    title: string,
    summary: string | null,
    transcript: string | null,
  ): Promise<Array<{ platform: string; style: string; content: SocialPostContent }>> {
    const results: Array<{ platform: string; style: string; content: SocialPostContent }> = [];

    const contentContext = [
      `影片標題：「${title}」`,
      summary ? `影片摘要：${summary}` : '',
      transcript ? `影片轉錄稿（節錄）：\n${transcript}` : '',
    ].filter(Boolean).join('\n\n');

    const styleInstructions = Object.entries(STYLE_CONFIGS)
      .map(([key, config]) => `${key}（${config.name}）：${config.description}`)
      .join('\n');

    // Generate posts per platform (5 parallel API calls)
    const platformPromises = Object.entries(PLATFORM_CONFIGS).map(
      async ([platformKey, platformConfig]) => {
        const systemPrompt = `你是一位專業的社群媒體文案專家，精通繁體中文內容創作。
根據影片內容，為 ${platformConfig.name} 生成 3 種不同風格的貼文。

平台規則：
- 總字數上限 ${platformConfig.maxChars} 字
- ${platformConfig.rules}
- 使用繁體中文
- 內容必須基於影片實際內容，不可捏造

3 種風格：
${styleInstructions}

回傳 JSON 格式：
{
  "posts": [
    {
      "style": "knowledge",
      "contentText": "貼文內容...",
      "hashtags": ["#標籤1", "#標籤2"]
    },
    {
      "style": "story",
      "contentText": "貼文內容...",
      "hashtags": ["#標籤1", "#標籤2"]
    },
    {
      "style": "interactive",
      "contentText": "貼文內容...",
      "hashtags": ["#標籤1", "#標籤2"]
    }
  ]
}`;

        const result = await this.aiService.generateJson<{
          posts: Array<{
            style: string;
            contentText: string;
            hashtags: string[];
          }>;
        }>(systemPrompt, contentContext, { model: 'gpt-4o-mini', maxTokens: 1500 });

        if (result?.posts) {
          for (const post of result.posts) {
            results.push({
              platform: platformKey,
              style: post.style,
              content: {
                contentText: post.contentText,
                hashtags: post.hashtags,
                characterCount: post.contentText.length,
              },
            });
          }
        }
      },
    );

    await Promise.allSettled(platformPromises);
    return results;
  }

  private async generateShortVideoSuggestions(
    title: string,
    summary: string | null,
    transcript: string | null,
    durationSeconds: number,
  ): Promise<ShortVideoSuggestionContent[]> {
    if (!transcript) {
      // Without transcript, generate basic suggestions based on time splits
      return this.generateBasicSuggestions(title, durationSeconds);
    }

    const systemPrompt = `你是一位專業的影片剪輯師，擅長找出影片中最適合做短影片的精華片段。
分析以下影片轉錄稿，找出 3-5 個最適合做短影片的精華片段。

選擇標準（按優先級）：
1. 金句/核心觀點 — 獨立成段就有價值的精煉表述
2. 情緒高點 — 激動、驚訝、搞笑的時刻
3. 實用技巧 — 具體可操作的教學步驟
4. 爭議觀點 — 容易引發討論和互動的立場
5. 故事轉折 — 有戲劇性的敘事片段

每個片段：
- 時長 15-60 秒
- 必須是完整的語意段落（不能在句子中間切斷）
- 根據轉錄稿中文字的位置比例推估時間戳

影片總時長：${durationSeconds} 秒

回傳 JSON 格式：
{
  "suggestions": [
    {
      "title": "建議短影片標題（繁體中文）",
      "startTime": 120,
      "endTime": 155,
      "transcriptExcerpt": "對應的轉錄文字片段（50-100字）",
      "reason": "推薦原因（金句/高潮/實用技巧/爭議觀點/情緒高點）",
      "suggestedPlatforms": ["YOUTUBE", "TIKTOK"],
      "score": 0.92
    }
  ]
}`;

    const userMessage = [
      `影片標題：「${title}」`,
      `時長：${durationSeconds} 秒（${Math.round(durationSeconds / 60)} 分鐘）`,
      summary ? `摘要：${summary}` : '',
      `轉錄稿：\n${transcript}`,
    ].filter(Boolean).join('\n\n');

    const result = await this.aiService.generateJson<{
      suggestions: ShortVideoSuggestionContent[];
    }>(systemPrompt, userMessage, { model: 'gpt-4o', maxTokens: 2048 });

    return result?.suggestions ?? this.generateBasicSuggestions(title, durationSeconds);
  }

  private generateBasicSuggestions(title: string, durationSeconds: number): ShortVideoSuggestionContent[] {
    const segmentLength = Math.min(45, Math.floor(durationSeconds / 4));
    return [
      {
        title: `${title} — 精華片段`,
        startTime: Math.floor(durationSeconds * 0.15),
        endTime: Math.floor(durationSeconds * 0.15) + segmentLength,
        transcriptExcerpt: '（無轉錄稿，建議手動確認片段內容）',
        reason: '影片前段通常包含核心觀點',
        suggestedPlatforms: ['YOUTUBE', 'INSTAGRAM'],
        score: 0.7,
      },
      {
        title: `${title} — 核心重點`,
        startTime: Math.floor(durationSeconds * 0.45),
        endTime: Math.floor(durationSeconds * 0.45) + segmentLength,
        transcriptExcerpt: '（無轉錄稿，建議手動確認片段內容）',
        reason: '影片中段通常是重點內容展開',
        suggestedPlatforms: ['TIKTOK', 'INSTAGRAM'],
        score: 0.65,
      },
    ];
  }

  private async generateEmail(
    title: string,
    summary: string | null,
    transcript: string | null,
  ): Promise<EmailContent> {
    const systemPrompt = `你是一位 Email 行銷專家，精通繁體中文內容。
為創作者的新影片生成一封會員通知 Email。

要求：
- 主旨：15-30 字，製造好奇心，可包含 emoji
- 正文：HTML 格式，200-300 字
  - 開頭個人化問候（使用 {{name}} 作為收件人名稱佔位符）
  - 影片核心價值 3 點摘要（用 <ul><li> 列點）
  - CTA 按鈕引導觀看（使用 <a> 標籤，href 用 {{VIDEO_URL}} 佔位符）
- 提供純文字備份版本
- 使用繁體中文

回傳 JSON 格式：
{
  "subject": "信件主旨",
  "body": "<html>HTML 正文</html>",
  "plainText": "純文字版本",
  "ctaText": "立即觀看",
  "ctaUrl": "{{VIDEO_URL}}"
}`;

    const userMessage = [
      `影片標題：「${title}」`,
      summary ? `摘要：${summary}` : '',
      transcript ? `轉錄稿（節錄）：${transcript.slice(0, 1500)}` : '',
    ].filter(Boolean).join('\n\n');

    const result = await this.aiService.generateJson<EmailContent>(
      systemPrompt,
      userMessage,
      { model: 'gpt-4o-mini', maxTokens: 1500 },
    );

    return result ?? {
      subject: `🎬 新影片上線：${title}`,
      body: `<p>Hi {{name}}，</p><p>我的新影片「${title}」已經上線了！</p><p>${summary ?? ''}</p><p><a href="{{VIDEO_URL}}">立即觀看</a></p>`,
      plainText: `Hi {{name}}，我的新影片「${title}」已經上線了！${summary ?? ''}\n\n立即觀看：{{VIDEO_URL}}`,
      ctaText: '立即觀看',
      ctaUrl: '{{VIDEO_URL}}',
    };
  }

  // ─── Query ───

  async getJobByVideoId(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');

    const job = await this.prisma.repurposeJob.findUnique({
      where: { videoId },
      include: {
        items: {
          orderBy: [{ type: 'asc' }, { platform: 'asc' }, { style: 'asc' }],
        },
      },
    });

    if (!job) return { job: null };

    return {
      job: {
        ...job,
        items: job.items.map((item) => ({
          ...item,
          content: item.editedContent ?? item.originalContent,
        })),
      },
    };
  }

  // ─── Update Item ───

  async updateItem(itemId: string, userId: string, dto: UpdateRepurposeItemDto) {
    const item = await this.findItemWithOwnerCheck(itemId, userId);

    const data: Record<string, unknown> = {};
    if (dto.editedContent !== undefined) {
      data.editedContent = dto.editedContent;
      data.status = RepurposeItemStatus.EDITED;
    }
    if (dto.status === 'DISCARDED') {
      data.status = RepurposeItemStatus.DISCARDED;
    }

    const updated = await this.prisma.repurposeItem.update({
      where: { id: itemId },
      data,
    });

    return {
      id: updated.id,
      status: updated.status,
      content: updated.editedContent ?? updated.originalContent,
      updatedAt: updated.updatedAt,
    };
  }

  async resetItem(itemId: string, userId: string) {
    await this.findItemWithOwnerCheck(itemId, userId);

    const updated = await this.prisma.repurposeItem.update({
      where: { id: itemId },
      data: {
        editedContent: Prisma.DbNull,
        status: RepurposeItemStatus.GENERATED,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      content: updated.originalContent,
      updatedAt: updated.updatedAt,
    };
  }

  async regenerateItem(itemId: string, userId: string) {
    const item = await this.findItemWithOwnerCheck(itemId, userId);

    const job = await this.prisma.repurposeJob.findUnique({
      where: { id: item.jobId },
      include: {
        video: {
          select: { title: true, aiSummary: true, transcript: true, durationSeconds: true },
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    const { video } = job;
    const transcript = typeof video.transcript === 'string'
      ? video.transcript
      : video.transcript ? JSON.stringify(video.transcript) : null;
    const truncated = transcript && transcript.length > 3000
      ? transcript.slice(0, 3000) + '...(截斷)'
      : transcript;

    let newContent: Prisma.InputJsonValue;

    if (item.type === 'SOCIAL_POST' && item.platform && item.style) {
      const posts = await this.generateSocialPosts(video.title, video.aiSummary, truncated);
      const match = posts.find((p) => p.platform === item.platform && p.style === item.style);
      newContent = (match?.content ?? item.originalContent) as Prisma.InputJsonValue;
    } else if (item.type === 'SHORT_VIDEO_SUGGESTION') {
      const suggestions = await this.generateShortVideoSuggestions(
        video.title, video.aiSummary, truncated, video.durationSeconds ?? 300,
      );
      newContent = (suggestions[0] ?? item.originalContent) as unknown as Prisma.InputJsonValue;
    } else {
      const email = await this.generateEmail(video.title, video.aiSummary, truncated);
      newContent = email as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.repurposeItem.update({
      where: { id: itemId },
      data: {
        originalContent: newContent as any,
        editedContent: Prisma.DbNull,
        status: RepurposeItemStatus.GENERATED,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      content: updated.originalContent,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Schedule Posts ───

  async scheduleItems(userId: string, tenantId: string, dto: ScheduleItemsDto) {
    const items = await this.prisma.repurposeItem.findMany({
      where: {
        id: { in: dto.itemIds },
        type: 'SOCIAL_POST',
        job: { userId, tenantId },
      },
      include: { job: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('No valid social post items found');
    }

    const scheduled: Array<{ itemId: string; postId: string; platform: string; status: string }> = [];
    const failed: Array<{ itemId: string; reason: string }> = [];

    for (const item of items) {
      if (item.status === RepurposeItemStatus.DISCARDED) {
        failed.push({ itemId: item.id, reason: 'Item has been discarded' });
        continue;
      }

      const content = (item.editedContent ?? item.originalContent) as any;

      try {
        const post = await this.prisma.post.create({
          data: {
            userId,
            tenantId,
            contentText: content.contentText,
            hashtags: content.hashtags ?? [],
            platforms: [{ platform: item.platform }],
            type: 'ORIGINAL',
            aiGenerated: true,
            status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          },
        });

        await this.prisma.repurposeItem.update({
          where: { id: item.id },
          data: { postId: post.id, status: RepurposeItemStatus.SCHEDULED },
        });

        scheduled.push({
          itemId: item.id,
          postId: post.id,
          platform: item.platform ?? 'unknown',
          status: post.status,
        });
      } catch (error) {
        failed.push({
          itemId: item.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { scheduled, failed };
  }

  // ─── Create Email Campaign ───

  async createCampaignFromItem(
    itemId: string,
    userId: string,
    tenantId: string,
    dto: CreateCampaignFromItemDto,
  ) {
    const item = await this.findItemWithOwnerCheck(itemId, userId);

    if (item.type !== 'EMAIL') {
      throw new BadRequestException('Item is not an EMAIL type');
    }

    const content = (item.editedContent ?? item.originalContent) as unknown as EmailContent;

    const campaign = await this.prisma.emailCampaign.create({
      data: {
        userId,
        tenantId,
        name: `影片推廣 — ${content.subject}`,
        type: 'SINGLE',
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        targetTags: dto.targetTags ?? [],
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        emails: {
          create: {
            subject: content.subject,
            body: content.body,
            sortOrder: 0,
          },
        },
      },
    });

    await this.prisma.repurposeItem.update({
      where: { id: itemId },
      data: { campaignId: campaign.id, status: RepurposeItemStatus.SCHEDULED },
    });

    return {
      itemId,
      campaignId: campaign.id,
      status: campaign.status,
    };
  }

  // ─── Helpers ───

  private async findItemWithOwnerCheck(itemId: string, userId: string) {
    const item = await this.prisma.repurposeItem.findUnique({
      where: { id: itemId },
      include: { job: { select: { userId: true } } },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.job.userId !== userId) throw new ForbiddenException('Not the item owner');

    return item;
  }
}
