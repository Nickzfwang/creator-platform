import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CalendarItemStatus,
  SuggestionSource,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { TrendRadarService } from '../trend-radar/trend-radar.service';
import { GenerateSuggestionsDto } from './dto/generate-suggestions.dto';
import { AdoptSuggestionDto } from './dto/adopt-suggestion.dto';
import { CreateCalendarItemDto } from './dto/create-calendar-item.dto';
import { UpdateCalendarItemDto } from './dto/update-calendar-item.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CreatePostFromCalendarDto } from './dto/create-post-from-calendar.dto';
import { UpdateStrategySettingsDto } from './dto/update-strategy-settings.dto';

interface AiSuggestion {
  title: string;
  description: string;
  reasoning: string;
  dataSource: string;
  performanceScore: number;
  confidenceLevel: string;
  confidenceReason: string;
  suggestedDate: string | null;
  suggestedPlatforms: string[];
  tags: string[];
  relatedTrends: string[];
  competitorRef: string | null;
}

const DEFAULT_SETTINGS = {
  niche: null as string | null,
  preferredFrequency: 3,
  autoGenerateEnabled: true,
  preferredGenerateDay: 1,
  preferredGenerateHour: 9,
};

const VALID_STATUS_TRANSITIONS: Record<string, CalendarItemStatus[]> = {
  SUGGESTED: [CalendarItemStatus.PLANNED, CalendarItemStatus.DISMISSED],
  PLANNED: [CalendarItemStatus.IN_PRODUCTION, CalendarItemStatus.SKIPPED],
  IN_PRODUCTION: [CalendarItemStatus.PUBLISHED],
  PUBLISHED: [CalendarItemStatus.MEASURED],
};

@Injectable()
export class ContentStrategyService {
  private readonly logger = new Logger(ContentStrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly analyticsService: AnalyticsService,
    private readonly trendRadarService: TrendRadarService,
    @InjectQueue('content-strategy') private readonly strategyQueue: Queue,
  ) {}

  // ─── AI 主題推薦 ───

  async generateSuggestions(userId: string, tenantId: string, dto: GenerateSuggestionsDto) {
    const count = dto.count ?? 7;
    const preference = dto.preference ?? SuggestionSource.MIXED;

    // 收集數據
    const [topContent, overview, trends, competitorVideos] = await Promise.all([
      this.analyticsService.getTopContent(userId, tenantId, '90d', 20).catch(() => null),
      this.analyticsService.getOverview(userId, tenantId, '30d').catch(() => null),
      this.trendRadarService.getTrends(dto.niche || undefined).catch(() => null),
      this.getCompetitorRecentVideos(userId, tenantId),
    ]);

    const hasHistoryData = topContent && overview;
    if (!hasHistoryData && !dto.niche) {
      throw new BadRequestException('errors.contentStrategy.nicheRequired');
    }

    // 組裝 AI context
    const context = this.buildAiContext({
      topContent,
      overview,
      trends,
      competitorVideos,
      preference,
      niche: dto.niche,
      count,
    });

    // GPT-4o 生成
    const suggestions = await this.aiService.generateJson<{ suggestions: AiSuggestion[] }>(
      this.buildSuggestionSystemPrompt(),
      context,
    );

    if (!suggestions?.suggestions?.length) {
      throw new BadRequestException('errors.contentStrategy.generateFailed');
    }

    // 批次寫入 DB
    const batchId = randomUUID();
    const records = await this.prisma.$transaction(
      suggestions.suggestions.slice(0, count).map((s, index) =>
        this.prisma.topicSuggestion.create({
          data: {
            userId,
            tenantId,
            batchId,
            title: s.title,
            description: s.description,
            reasoning: s.reasoning,
            dataSource: this.parseSuggestionSource(s.dataSource),
            performanceScore: Math.min(10, Math.max(1, s.performanceScore)),
            confidenceLevel: this.parseConfidenceLevel(s.confidenceLevel),
            confidenceReason: s.confidenceReason,
            suggestedDate: s.suggestedDate ? new Date(s.suggestedDate) : null,
            suggestedPlatforms: s.suggestedPlatforms || ['YOUTUBE'],
            tags: s.tags || [],
            relatedTrends: s.relatedTrends || [],
            competitorRef: s.competitorRef,
          },
        }),
      ),
    );

    return {
      batchId,
      suggestions: records,
      generatedAt: new Date().toISOString(),
    };
  }

  async listSuggestions(
    userId: string,
    tenantId: string,
    cursor?: string,
    limit: number = 20,
    batchId?: string,
    dismissed: boolean = false,
  ) {
    const clampedLimit = Math.min(Math.max(limit, 1), 50);
    const where: Prisma.TopicSuggestionWhereInput = {
      userId,
      tenantId,
      isDismissed: dismissed,
      ...(batchId && { batchId }),
    };

    // Validate cursor if provided
    const cursorDate = cursor ? new Date(cursor) : null;
    if (cursor && (!cursorDate || isNaN(cursorDate.getTime()))) {
      throw new BadRequestException('errors.contentStrategy.invalidCursor');
    }

    const items = await this.prisma.topicSuggestion.findMany({
      where: {
        ...where,
        ...(cursorDate && { createdAt: { lt: cursorDate } }),
      },
      orderBy: { createdAt: 'desc' },
      take: clampedLimit + 1,
    });

    const hasMore = items.length > clampedLimit;
    const data = hasMore ? items.slice(0, clampedLimit) : items;

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  async adoptSuggestion(suggestionId: string, userId: string, tenantId: string, dto: AdoptSuggestionDto) {
    const suggestion = await this.prisma.topicSuggestion.findFirst({
      where: { id: suggestionId, userId, tenantId },
    });
    if (!suggestion) throw new NotFoundException('errors.contentStrategy.suggestionNotFound');
    if (suggestion.isAdopted) throw new BadRequestException('errors.contentStrategy.alreadyAdopted');
    if (suggestion.isDismissed) throw new BadRequestException('errors.contentStrategy.alreadyDismissed');

    const [updatedSuggestion, calendarItem] = await this.prisma.$transaction([
      this.prisma.topicSuggestion.update({
        where: { id: suggestionId },
        data: { isAdopted: true },
      }),
      this.prisma.contentCalendar.create({
        data: {
          userId,
          tenantId,
          suggestionId,
          title: suggestion.title,
          description: suggestion.description,
          status: CalendarItemStatus.PLANNED,
          scheduledDate: new Date(dto.scheduledDate),
          scheduledTime: dto.scheduledTime,
          targetPlatforms: dto.targetPlatforms || suggestion.suggestedPlatforms,
        },
      }),
    ]);

    return { suggestion: updatedSuggestion, calendarItem };
  }

  async dismissSuggestion(suggestionId: string, userId: string, tenantId: string) {
    const suggestion = await this.prisma.topicSuggestion.findFirst({
      where: { id: suggestionId, userId, tenantId },
    });
    if (!suggestion) throw new NotFoundException('errors.contentStrategy.suggestionNotFound');

    return this.prisma.topicSuggestion.update({
      where: { id: suggestionId },
      data: { isDismissed: true },
    });
  }

  async replaceSuggestion(suggestionId: string, userId: string, tenantId: string) {
    const suggestion = await this.prisma.topicSuggestion.findFirst({
      where: { id: suggestionId, userId, tenantId },
    });
    if (!suggestion) throw new NotFoundException('errors.contentStrategy.suggestionNotFound');

    // Dismiss old
    await this.prisma.topicSuggestion.update({
      where: { id: suggestionId },
      data: { isDismissed: true },
    });

    // Generate one new
    const result = await this.generateSuggestions(userId, tenantId, { count: 5 });
    if (!result.suggestions[0]) {
      throw new BadRequestException('errors.contentStrategy.replaceFailed');
    }
    return result.suggestions[0];
  }

  // ─── 內容日曆 ───

  async getCalendar(userId: string, tenantId: string, query: CalendarQueryDto) {
    const where: Prisma.ContentCalendarWhereInput = {
      userId,
      tenantId,
      scheduledDate: {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      },
      ...(query.status && { status: query.status }),
    };

    const items = await this.prisma.contentCalendar.findMany({
      where,
      include: { suggestion: true },
      orderBy: { scheduledDate: 'asc' },
    });

    return { items };
  }

  async createCalendarItem(userId: string, tenantId: string, dto: CreateCalendarItemDto) {
    return this.prisma.contentCalendar.create({
      data: {
        userId,
        tenantId,
        title: dto.title,
        description: dto.description,
        status: CalendarItemStatus.PLANNED,
        scheduledDate: new Date(dto.scheduledDate),
        scheduledTime: dto.scheduledTime,
        targetPlatforms: dto.targetPlatforms || [],
        notes: dto.notes,
      },
    });
  }

  async updateCalendarItem(itemId: string, userId: string, tenantId: string, dto: UpdateCalendarItemDto) {
    const item = await this.prisma.contentCalendar.findFirst({
      where: { id: itemId, userId, tenantId },
    });
    if (!item) throw new NotFoundException('errors.contentStrategy.calendarItemNotFound');

    // Validate status transition
    if (dto.status) {
      const allowedNext = VALID_STATUS_TRANSITIONS[item.status];
      if (!allowedNext?.includes(dto.status)) {
        throw new BadRequestException(
          `無法從 ${item.status} 轉換到 ${dto.status}`,
        );
      }
      if (dto.status === CalendarItemStatus.PUBLISHED && !dto.videoId && !item.videoId) {
        throw new BadRequestException('errors.contentStrategy.publishNeedsVideo');
      }
    }

    const data: Prisma.ContentCalendarUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.scheduledDate !== undefined) data.scheduledDate = new Date(dto.scheduledDate);
    if (dto.scheduledTime !== undefined) data.scheduledTime = dto.scheduledTime;
    if (dto.targetPlatforms !== undefined) data.targetPlatforms = dto.targetPlatforms;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.videoId !== undefined) data.videoId = dto.videoId;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.actualViews !== undefined) data.actualViews = dto.actualViews;
    if (dto.actualLikes !== undefined) data.actualLikes = dto.actualLikes;
    if (dto.actualComments !== undefined) data.actualComments = dto.actualComments;
    if (dto.actualEngagement !== undefined) data.actualEngagement = dto.actualEngagement;

    return this.prisma.contentCalendar.update({
      where: { id: itemId },
      data,
      include: { suggestion: true },
    });
  }

  async deleteCalendarItem(itemId: string, userId: string, tenantId: string) {
    const item = await this.prisma.contentCalendar.findFirst({
      where: { id: itemId, userId, tenantId },
    });
    if (!item) throw new NotFoundException('errors.contentStrategy.calendarItemNotFound');

    if (item.status === CalendarItemStatus.PUBLISHED || item.status === CalendarItemStatus.MEASURED) {
      throw new BadRequestException('errors.contentStrategy.cannotDeletePublished');
    }

    await this.prisma.contentCalendar.delete({ where: { id: itemId } });
  }

  async createPostFromCalendar(
    itemId: string,
    userId: string,
    tenantId: string,
    dto: CreatePostFromCalendarDto,
  ) {
    const item = await this.prisma.contentCalendar.findFirst({
      where: { id: itemId, userId, tenantId },
    });
    if (!item) throw new NotFoundException('errors.contentStrategy.calendarItemNotFound');

    // Build scheduledAt from calendar date/time if not provided
    let scheduledAt: Date | null = null;
    if (dto.scheduledAt) {
      scheduledAt = new Date(dto.scheduledAt);
    } else if (item.scheduledTime) {
      const [hours, minutes] = item.scheduledTime.split(':').map(Number);
      scheduledAt = new Date(item.scheduledDate);
      scheduledAt.setHours(hours, minutes, 0, 0);
    }

    // Create post via PostScheduler
    const post = await this.prisma.post.create({
      data: {
        userId,
        tenantId,
        contentText: dto.contentText,
        platforms: dto.platforms.map((p) => ({ platform: p })),
        type: 'ORIGINAL',
        aiGenerated: false,
        hashtags: [],
        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt,
      },
    });

    // Update calendar item
    await this.prisma.contentCalendar.update({
      where: { id: itemId },
      data: { postId: post.id },
    });

    return {
      calendarItemId: itemId,
      postId: post.id,
      status: post.status,
    };
  }

  // ─── 策略回顧 ───

  async getReview(userId: string, tenantId: string, period: string = 'month', startDate?: string) {
    const { start, end } = this.parsePeriod(period, startDate);

    const [suggestions, calendarItems] = await Promise.all([
      this.prisma.topicSuggestion.findMany({
        where: {
          userId,
          tenantId,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.contentCalendar.findMany({
        where: {
          userId,
          tenantId,
          scheduledDate: { gte: start, lte: end },
        },
        include: { suggestion: true },
      }),
    ]);

    const totalSuggested = suggestions.length;
    const totalAdopted = suggestions.filter((s) => s.isAdopted).length;
    const totalPublished = calendarItems.filter(
      (i) => i.status === CalendarItemStatus.PUBLISHED || i.status === CalendarItemStatus.MEASURED,
    ).length;
    const totalMeasured = calendarItems.filter((i) => i.status === CalendarItemStatus.MEASURED).length;

    // Calculate prediction accuracy for measured items
    const measuredItems = calendarItems.filter(
      (i) => i.status === CalendarItemStatus.MEASURED && i.suggestion && i.actualViews !== null,
    );

    let avgPredictionAccuracy = 0;
    if (measuredItems.length > 0) {
      // Simple accuracy: how close predicted score maps to actual relative performance
      avgPredictionAccuracy = measuredItems.length / Math.max(totalSuggested, 1);
    }

    // Top performers
    const topPerformers = measuredItems
      .sort((a, b) => (b.actualViews || 0) - (a.actualViews || 0))
      .slice(0, 3)
      .map((i) => ({
        calendarItemId: i.id,
        title: i.title,
        predictedScore: i.suggestion?.performanceScore || 0,
        actualViews: i.actualViews || 0,
        actualEngagement: i.actualEngagement || 0,
      }));

    // Source breakdown
    const sourceMap = new Map<string, { count: number; adopted: number; views: number[] }>();
    for (const s of suggestions) {
      const existing = sourceMap.get(s.dataSource) || { count: 0, adopted: 0, views: [] };
      existing.count++;
      if (s.isAdopted) existing.adopted++;
      sourceMap.set(s.dataSource, existing);
    }
    for (const item of measuredItems) {
      if (item.suggestion) {
        const existing = sourceMap.get(item.suggestion.dataSource);
        if (existing && item.actualViews !== null) {
          existing.views.push(item.actualViews);
        }
      }
    }

    const sourceBreakdown = Array.from(sourceMap.entries()).map(([source, data]) => ({
      source,
      count: data.count,
      adoptionRate: data.count > 0 ? data.adopted / data.count : 0,
      avgActualViews: data.views.length > 0
        ? Math.round(data.views.reduce((a, b) => a + b, 0) / data.views.length)
        : null,
    }));

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: {
        totalSuggested,
        totalAdopted,
        adoptionRate: totalSuggested > 0 ? totalAdopted / totalSuggested : 0,
        totalPublished,
        totalMeasured,
        avgPredictionAccuracy,
      },
      topPerformers,
      sourceBreakdown,
    };
  }

  async getReviewInsights(userId: string, tenantId: string, period: string = 'month') {
    const reviewData = await this.getReview(userId, tenantId, period);

    const insights = await this.aiService.generateJson<{
      insights: string;
      recommendations: string[];
    }>(
      `你是一位內容策略分析師。根據以下數據，產出月度策略洞察報告：
1. 哪類建議（歷史/趨勢/競品）的表現最好？為什麼？
2. AI 預估分數與實際表現的偏差分析
3. 下個月的策略調整建議（3-5 條具體建議）

回傳 JSON：{ "insights": "Markdown 格式報告", "recommendations": ["建議1", "建議2", ...] }`,
      JSON.stringify(reviewData, null, 2),
    );

    return {
      insights: insights?.insights || '目前數據不足，無法產出洞察報告。請先生成並採用一些建議，累積數據後再查看。',
      recommendations: insights?.recommendations || [],
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 設定 ───

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    // Settings stored in a simple approach - query or use defaults
    // In production, would use User.metadata JSON field
    return { ...DEFAULT_SETTINGS, timezone: user?.timezone || 'Asia/Taipei' };
  }

  async updateSettings(userId: string, dto: UpdateStrategySettingsDto) {
    // For now, return merged settings
    // In production, persist to User.metadata JSON
    const current = await this.getSettings(userId);
    return {
      ...current,
      ...(dto.niche !== undefined && { niche: dto.niche }),
      ...(dto.preferredFrequency !== undefined && { preferredFrequency: dto.preferredFrequency }),
      ...(dto.autoGenerateEnabled !== undefined && { autoGenerateEnabled: dto.autoGenerateEnabled }),
      ...(dto.preferredGenerateDay !== undefined && { preferredGenerateDay: dto.preferredGenerateDay }),
      ...(dto.preferredGenerateHour !== undefined && { preferredGenerateHour: dto.preferredGenerateHour }),
    };
  }

  // ─── Weekly Auto Generate ───

  async weeklyAutoGenerate(userId: string, tenantId: string) {
    const settings = await this.getSettings(userId);
    const count = (settings.preferredFrequency || 3) + 2; // extra for choice

    const result = await this.generateSuggestions(userId, tenantId, {
      preference: SuggestionSource.MIXED,
      count: Math.min(count, 10),
      niche: settings.niche || undefined,
    });

    // Auto-create calendar items as SUGGESTED
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;

    for (let i = 0; i < Math.min(result.suggestions.length, settings.preferredFrequency || 3); i++) {
      const suggestion = result.suggestions[i];
      const scheduledDate = new Date(today);
      scheduledDate.setDate(today.getDate() + mondayOffset + Math.floor((i * 7) / (settings.preferredFrequency || 3)));

      await this.prisma.contentCalendar.create({
        data: {
          userId,
          tenantId,
          suggestionId: suggestion.id,
          title: suggestion.title,
          description: suggestion.description,
          status: CalendarItemStatus.SUGGESTED,
          scheduledDate,
          targetPlatforms: suggestion.suggestedPlatforms,
        },
      });
    }

    return result;
  }

  // ─── Private Helpers ───

  private async getCompetitorRecentVideos(userId: string, tenantId?: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: { userId, ...(tenantId && { tenantId }), isActive: true },
      include: {
        videos: {
          orderBy: { publishedAt: 'desc' },
          take: 10,
        },
      },
    });

    return competitors.flatMap((c) =>
      c.videos.map((v) => ({
        channelName: c.channelName,
        title: v.title,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
      })),
    );
  }

  private buildAiContext(params: {
    topContent: unknown;
    overview: unknown;
    trends: unknown;
    competitorVideos: unknown[];
    preference: SuggestionSource;
    niche?: string;
    count: number;
  }): string {
    const parts: string[] = [];

    if (params.niche) {
      parts.push(`## 創作者領域\n${params.niche}`);
    }

    if (params.overview) {
      parts.push(`## 頻道總覽（近 30 天）\n${JSON.stringify(params.overview, null, 2)}`);
    }

    if (params.topContent) {
      parts.push(`## 歷史最佳內容（近 90 天 Top 20）\n${JSON.stringify(params.topContent, null, 2)}`);
    }

    if (params.trends) {
      parts.push(`## 外部熱門趨勢\n${JSON.stringify(params.trends, null, 2)}`);
    }

    if (params.competitorVideos.length > 0) {
      parts.push(`## 競品近期內容\n${JSON.stringify(params.competitorVideos.slice(0, 30), null, 2)}`);
    }

    parts.push(`\n## 生成要求\n- 偏好：${params.preference}\n- 數量：${params.count} 個主題建議\n- 今天日期：${new Date().toISOString().split('T')[0]}`);

    return parts.join('\n\n');
  }

  private buildSuggestionSystemPrompt(): string {
    return `你是一位資深的 YouTube 內容策略顧問，專門幫助創作者規劃影片主題。

你的分析框架：
1. 數據驅動：根據頻道歷史表現，找出觀眾偏好的內容類型
2. 趨勢嗅覺：從當前熱門話題中找出與創作者 niche 相關的切入點
3. 競品洞察：分析同領域創作者的成功內容，找出差異化機會
4. 時效性：考慮話題的時間窗口，優先推薦有時效性的主題

輸出要求：
- 每個建議必須附上具體的推薦理由（引用數據來源）
- performanceScore (1-10)：基於歷史同類內容表現 + 趨勢熱度 + 競品驗證
- confidenceLevel (HIGH/MEDIUM/LOW)：基於數據支撐程度
- suggestedDate：考慮話題時效性和發佈節奏，格式 YYYY-MM-DD
- dataSource：標註主要依據的數據來源

回傳 JSON 格式：
{
  "suggestions": [
    {
      "title": "影片標題建議",
      "description": "2-3 句主題簡述",
      "reasoning": "推薦理由（引用具體數據）",
      "dataSource": "HISTORY|TREND|COMPETITOR|MIXED",
      "performanceScore": 8.5,
      "confidenceLevel": "HIGH",
      "confidenceReason": "信心依據說明",
      "suggestedDate": "2026-04-01",
      "suggestedPlatforms": ["YOUTUBE"],
      "tags": ["tag1", "tag2"],
      "relatedTrends": ["趨勢話題"],
      "competitorRef": null
    }
  ]
}`;
  }

  private parseSuggestionSource(source: string): SuggestionSource {
    const upper = source?.toUpperCase();
    if (upper === 'HISTORY') return SuggestionSource.HISTORY;
    if (upper === 'TREND') return SuggestionSource.TREND;
    if (upper === 'COMPETITOR') return SuggestionSource.COMPETITOR;
    return SuggestionSource.MIXED;
  }

  private parseConfidenceLevel(level: string) {
    const upper = level?.toUpperCase();
    if (upper === 'HIGH') return 'HIGH' as const;
    if (upper === 'LOW') return 'LOW' as const;
    return 'MEDIUM' as const;
  }

  private parsePeriod(period: string, startDate?: string): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    if (startDate) {
      start = new Date(startDate);
    } else if (period === 'quarter') {
      start = new Date(end);
      start.setMonth(start.getMonth() - 3);
    } else {
      // month
      start = new Date(end);
      start.setMonth(start.getMonth() - 1);
    }

    return { start, end };
  }
}
