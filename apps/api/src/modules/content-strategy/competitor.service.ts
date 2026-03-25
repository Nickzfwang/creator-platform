import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { COMPETITOR_LIMITS } from './constants/plan-limits';

interface YouTubeChannelInfo {
  channelId: string;
  channelName: string;
  channelAvatar: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
}

interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: Date;
  durationSeconds: number | null;
  tags: string[];
}

@Injectable()
export class CompetitorService {
  private readonly logger = new Logger(CompetitorService.name);

  private readonly youtubeApiKey: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
  ) {
    this.youtubeApiKey = this.config.get<string>('YOUTUBE_API_KEY');
    if (!this.youtubeApiKey) {
      this.logger.warn('YOUTUBE_API_KEY not set — competitor tracking will use placeholder data');
    }
  }

  async addCompetitor(userId: string, tenantId: string, channelUrl: string) {
    // Check plan limit
    const plan = await this.getUserPlan(tenantId);
    const currentCount = await this.prisma.competitor.count({
      where: { userId, tenantId, isActive: true },
    });
    const limit = COMPETITOR_LIMITS[plan] || COMPETITOR_LIMITS.FREE;
    if (currentCount >= limit) {
      throw new ForbiddenException(
        `已達競品追蹤上限 (${limit} 個)，請升級方案或移除現有追蹤`,
      );
    }

    // Parse YouTube channel URL
    const channelId = this.parseYouTubeChannelUrl(channelUrl);
    if (!channelId) {
      throw new BadRequestException('無法解析 YouTube 頻道 URL，請提供有效的頻道連結');
    }

    // Check duplicate
    const existing = await this.prisma.competitor.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (existing && existing.tenantId === tenantId) {
      throw new ConflictException('已追蹤此頻道');
    }

    // Fetch channel info from YouTube Data API v3
    const channelInfo = await this.fetchChannelInfo(channelId);

    // Fetch recent videos
    const videos = await this.fetchRecentVideos(channelId);

    // Create competitor + videos in transaction
    const competitor = await this.prisma.competitor.create({
      data: {
        userId,
        tenantId,
        channelId,
        channelUrl,
        channelName: channelInfo.channelName,
        channelAvatar: channelInfo.channelAvatar,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        lastSyncedAt: new Date(),
      },
    });

    if (videos.length > 0) {
      await this.prisma.competitorVideo.createMany({
        data: videos.map((v) => ({
          competitorId: competitor.id,
          platformVideoId: v.videoId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          publishedAt: v.publishedAt,
          durationSeconds: v.durationSeconds,
          tags: v.tags,
        })),
        skipDuplicates: true,
      });
    }

    const recentVideos = await this.prisma.competitorVideo.findMany({
      where: { competitorId: competitor.id },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    });

    return { ...competitor, recentVideos };
  }

  async listCompetitors(userId: string, tenantId: string) {
    const plan = await this.getUserPlan(tenantId);
    const limit = COMPETITOR_LIMITS[plan] || COMPETITOR_LIMITS.FREE;

    const competitors = await this.prisma.competitor.findMany({
      where: { userId, tenantId, isActive: true },
      include: {
        videos: {
          where: {
            publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: { viewCount: true },
        },
        _count: {
          select: {
            videos: {
              where: {
                publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      competitors: competitors.map((c) => {
        const views = c.videos.map((v) => v.viewCount || 0);
        return {
          id: c.id,
          channelId: c.channelId,
          channelUrl: c.channelUrl,
          channelName: c.channelName,
          channelAvatar: c.channelAvatar,
          subscriberCount: c.subscriberCount,
          videoCount: c.videoCount,
          lastSyncedAt: c.lastSyncedAt,
          recentVideoCount: c._count.videos,
          avgViews: views.length > 0
            ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
            : null,
        };
      }),
      quota: { used: competitors.length, max: limit },
    };
  }

  async getCompetitorVideos(
    competitorId: string,
    userId: string,
    tenantId: string,
    cursor?: string,
    limit: number = 20,
  ) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id: competitorId, userId, tenantId },
    });
    if (!competitor) throw new NotFoundException('競品頻道不存在');

    const clampedLimit = Math.min(limit, 50);
    const videos = await this.prisma.competitorVideo.findMany({
      where: {
        competitorId,
        ...(cursor && { id: { lt: cursor } }),
      },
      orderBy: { publishedAt: 'desc' },
      take: clampedLimit + 1,
    });

    const hasMore = videos.length > clampedLimit;
    const data = hasMore ? videos.slice(0, clampedLimit) : videos;

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      hasMore,
    };
  }

  async removeCompetitor(competitorId: string, userId: string, tenantId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id: competitorId, userId, tenantId },
    });
    if (!competitor) throw new NotFoundException('競品頻道不存在');

    await this.prisma.competitor.delete({ where: { id: competitorId } });
  }

  async getCompetitorAnalysis(userId: string, tenantId: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: { userId, tenantId, isActive: true },
      include: {
        videos: {
          where: {
            publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { viewCount: 'desc' },
          take: 20,
        },
      },
    });

    if (competitors.length === 0) {
      return {
        analysis: '尚未追蹤任何競品頻道。請先新增競品頻道以獲取分析。',
        topTopics: [],
        opportunities: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const videoData = competitors.flatMap((c) =>
      c.videos.map((v) => ({
        channel: c.channelName,
        title: v.title,
        views: v.viewCount,
        published: v.publishedAt.toISOString().split('T')[0],
      })),
    );

    const result = await this.aiService.generateJson<{
      analysis: string;
      topTopics: string[];
      opportunities: string[];
    }>(
      `你是一位內容競品分析師。分析以下同領域創作者的近期影片數據，找出：
1. 熱門主題趨勢（哪些主題觀看數最高）
2. 發佈策略（頻率、時間規律）
3. 差異化機會（競品尚未覆蓋但有潛力的主題）

回傳 JSON：{ "analysis": "Markdown 分析報告", "topTopics": ["主題1", ...], "opportunities": ["機會1", ...] }`,
      JSON.stringify(videoData, null, 2),
    );

    return {
      analysis: result?.analysis || '分析生成失敗，請稍後重試。',
      topTopics: result?.topTopics || [],
      opportunities: result?.opportunities || [],
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Sync (for cron job) ───

  async syncCompetitor(competitorId: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
    });
    if (!competitor || !competitor.isActive) return;

    try {
      const videos = await this.fetchRecentVideos(competitor.channelId);

      if (videos.length > 0) {
        await this.prisma.$transaction(
          videos.map((v) =>
            this.prisma.competitorVideo.upsert({
              where: {
                competitorId_platformVideoId: {
                  competitorId: competitor.id,
                  platformVideoId: v.videoId,
                },
              },
              create: {
                competitorId: competitor.id,
                platformVideoId: v.videoId,
                title: v.title,
                description: v.description,
                thumbnailUrl: v.thumbnailUrl,
                viewCount: v.viewCount,
                likeCount: v.likeCount,
                commentCount: v.commentCount,
                publishedAt: v.publishedAt,
                durationSeconds: v.durationSeconds,
                tags: v.tags,
              },
              update: {
                viewCount: v.viewCount,
                likeCount: v.likeCount,
                commentCount: v.commentCount,
              },
            }),
          ),
        );
      }

      await this.prisma.competitor.update({
        where: { id: competitorId },
        data: { lastSyncedAt: new Date() },
      });

      this.logger.log(`Synced competitor ${competitor.channelName} (${videos.length} videos)`);
    } catch (error) {
      this.logger.error(`Failed to sync competitor ${competitorId}:`, error);
    }
  }

  // ─── Private Helpers ───

  private parseYouTubeChannelUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;

      // /channel/UC... format
      const channelMatch = path.match(/\/channel\/(UC[\w-]+)/);
      if (channelMatch) return channelMatch[1];

      // /@username format
      const handleMatch = path.match(/\/@([\w.-]+)/);
      if (handleMatch) return `@${handleMatch[1]}`;

      // /c/customname format
      const customMatch = path.match(/\/c\/([\w.-]+)/);
      if (customMatch) return `c/${customMatch[1]}`;

      // /user/username format
      const userMatch = path.match(/\/user\/([\w.-]+)/);
      if (userMatch) return `user/${userMatch[1]}`;

      return null;
    } catch {
      return null;
    }
  }

  private async getUserPlan(tenantId: string): Promise<string> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      select: { plan: true },
    });
    return subscription?.plan || 'FREE';
  }

  private getYouTubePublicClient() {
    return google.youtube({ version: 'v3', auth: this.youtubeApiKey });
  }

  private async fetchChannelInfo(channelId: string): Promise<YouTubeChannelInfo> {
    if (!this.youtubeApiKey) {
      return {
        channelId,
        channelName: `Channel ${channelId}`,
        channelAvatar: null,
        subscriberCount: null,
        videoCount: null,
      };
    }

    const youtube = this.getYouTubePublicClient();

    try {
      // Handle @username vs channel ID
      let resolvedChannelId = channelId;
      if (channelId.startsWith('@')) {
        const searchRes = await youtube.search.list({
          part: ['snippet'],
          q: channelId,
          type: ['channel'],
          maxResults: 1,
        });
        resolvedChannelId = searchRes.data.items?.[0]?.snippet?.channelId || channelId;
      } else if (channelId.startsWith('c/') || channelId.startsWith('user/')) {
        const searchRes = await youtube.search.list({
          part: ['snippet'],
          q: channelId.replace(/^(c|user)\//, ''),
          type: ['channel'],
          maxResults: 1,
        });
        resolvedChannelId = searchRes.data.items?.[0]?.snippet?.channelId || channelId;
      }

      const res = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [resolvedChannelId],
      });

      const channel = res.data.items?.[0];
      if (!channel) {
        return {
          channelId: resolvedChannelId,
          channelName: `Channel ${resolvedChannelId}`,
          channelAvatar: null,
          subscriberCount: null,
          videoCount: null,
        };
      }

      return {
        channelId: channel.id || resolvedChannelId,
        channelName: channel.snippet?.title || `Channel ${resolvedChannelId}`,
        channelAvatar: channel.snippet?.thumbnails?.default?.url || null,
        subscriberCount: Number(channel.statistics?.subscriberCount) || null,
        videoCount: Number(channel.statistics?.videoCount) || null,
      };
    } catch (err) {
      this.logger.error(`YouTube channels.list failed for ${channelId}: ${err}`);
      return {
        channelId,
        channelName: `Channel ${channelId}`,
        channelAvatar: null,
        subscriberCount: null,
        videoCount: null,
      };
    }
  }

  private async fetchRecentVideos(channelId: string): Promise<YouTubeVideoInfo[]> {
    if (!this.youtubeApiKey) return [];

    const youtube = this.getYouTubePublicClient();

    try {
      // Step 1: Search for recent videos
      const searchRes = await youtube.search.list({
        part: ['snippet'],
        channelId: channelId.startsWith('UC') ? channelId : undefined,
        q: !channelId.startsWith('UC') ? channelId : undefined,
        type: ['video'],
        order: 'date',
        maxResults: 50,
      });

      const videoIds = (searchRes.data.items || [])
        .map((item) => item.id?.videoId)
        .filter(Boolean) as string[];

      if (videoIds.length === 0) return [];

      // Step 2: Get video statistics (batch, max 50)
      const videosRes = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: videoIds,
      });

      return (videosRes.data.items || []).map((v) => ({
        videoId: v.id!,
        title: v.snippet?.title || '',
        description: v.snippet?.description?.slice(0, 500) || null,
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url || null,
        viewCount: Number(v.statistics?.viewCount) || null,
        likeCount: Number(v.statistics?.likeCount) || null,
        commentCount: Number(v.statistics?.commentCount) || null,
        publishedAt: new Date(v.snippet?.publishedAt || Date.now()),
        durationSeconds: this.parseDuration(v.contentDetails?.duration),
        tags: v.snippet?.tags?.slice(0, 10) || [],
      }));
    } catch (err) {
      this.logger.error(`YouTube video fetch failed for ${channelId}: ${err}`);
      return [];
    }
  }

  private parseDuration(duration: string | undefined | null): number | null {
    if (!duration) return null;
    // ISO 8601 duration: PT1H2M3S
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }
}
