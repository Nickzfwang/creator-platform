import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { generateFingerprint } from './utils/fingerprint';
import { RssFeedItem, TrendSource } from './sources/base-source';
import { createRssSources } from './sources/rss.source';
import { DcardApiSource } from './sources/dcard-api.source';
import { YouTubeTrendingSource } from './sources/youtube-trending.source';
import { TikTokScraperSource } from './sources/tiktok-scraper.source';
import { ThreadsScraperSource } from './sources/threads-scraper.source';
import { ClaudeCodeDocsSource } from './sources/claude-code-docs.source';
import { TrendPhase, TrendSourcePlatform } from '@prisma/client';

export interface TrendTopicResponse {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  source: string;
  sourcePlatform: TrendSourcePlatform;
  category: string;
  relevanceScore: number;
  contentIdeas: string[];
  url: string | null;
  phase: TrendPhase;
  isCrossPlatform: boolean;
  firstSeenAt: string;
}

export interface TrendReportResponse {
  topics: TrendTopicResponse[];
  aiAnalysis: string;
  generatedAt: string;
  sources: string[];
  nextRefreshAt: string;
}

@Injectable()
export class TrendRadarService {
  private readonly logger = new Logger(TrendRadarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Get latest trends from DB. If no snapshot or stale (>2hr), triggers sync refresh.
   */
  async getTrends(
    category?: string,
    platform?: string,
    phase?: string,
  ): Promise<TrendReportResponse> {
    let snapshot = await this.prisma.trendSnapshot.findFirst({
      orderBy: { generatedAt: 'desc' },
      include: { topics: { orderBy: { relevanceScore: 'desc' } } },
    });

    // If no snapshot at all, must do a sync refresh (first boot)
    if (!snapshot) {
      snapshot = await this.refreshTrends(false);
    } else if (Date.now() - snapshot.generatedAt.getTime() > 2 * 60 * 60 * 1000) {
      // Stale snapshot — return it immediately, cron will refresh in background
      this.logger.warn('Snapshot is stale, returning cached data. Cron will refresh.');
    }

    let topics = snapshot.topics;

    // Apply filters
    if (category) {
      topics = topics.filter(t => t.category === category);
    }
    if (platform) {
      topics = topics.filter(t => t.sourcePlatform === platform);
    }
    if (phase) {
      topics = topics.filter(t => t.phase === phase);
    }

    // Calculate next refresh time (next even hour during 8-22 UTC+8)
    const nextRefresh = new Date(snapshot.generatedAt.getTime() + 2 * 60 * 60 * 1000);

    return {
      topics: topics.map(t => ({
        id: t.id,
        fingerprint: t.fingerprint,
        title: t.title,
        summary: t.summary,
        source: t.source,
        sourcePlatform: t.sourcePlatform,
        category: t.category,
        relevanceScore: t.relevanceScore,
        contentIdeas: t.contentIdeas,
        url: t.url,
        phase: t.phase,
        isCrossPlatform: t.isCrossPlatform,
        firstSeenAt: t.firstSeenAt.toISOString(),
      })),
      aiAnalysis: snapshot.aiAnalysis,
      generatedAt: snapshot.generatedAt.toISOString(),
      sources: snapshot.sources.map(s => s.toString()),
      nextRefreshAt: nextRefresh.toISOString(),
    };
  }

  /**
   * Full refresh: fetch all sources, AI analyze, persist to DB.
   * Returns the new snapshot with topics included.
   */
  async refreshTrends(includeScraper: boolean = false) {
    // 1. Collect from all sources in parallel
    const rssSources = createRssSources();
    const apiSources: TrendSource[] = [
      new DcardApiSource(),
      new YouTubeTrendingSource(),
      new ClaudeCodeDocsSource(),
    ];

    const scraperSources: TrendSource[] = includeScraper
      ? [new TikTokScraperSource(), new ThreadsScraperSource()]
      : [];

    const allSources = [...rssSources, ...apiSources, ...scraperSources];
    const results = await Promise.allSettled(
      allSources.map(s => s.fetch()),
    );

    const allItems: RssFeedItem[] = [];
    const activePlatforms: TrendSourcePlatform[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allItems.push(...result.value);
        const platformStr = allSources[i].sourcePlatform;
        if (!activePlatforms.includes(platformStr as TrendSourcePlatform)) {
          activePlatforms.push(platformStr as TrendSourcePlatform);
        }
      }
    }

    this.logger.log(`Fetched ${allItems.length} items from ${activePlatforms.length} sources`);

    // 2. Deduplicate by URL
    const seen = new Set<string>();
    const uniqueItems = allItems.filter(item => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    });

    // 3. AI analysis (limit to 60 items)
    const itemsForAi = uniqueItems.slice(0, 60);
    const { topics: aiTopics, aiAnalysis } = await this.analyzeWithAi(itemsForAi);

    // 4. Get previous snapshot for phase calculation
    const previousSnapshot = await this.prisma.trendSnapshot.findFirst({
      orderBy: { generatedAt: 'desc' },
      include: { topics: true },
    });
    const previousTopicsMap = new Map(
      (previousSnapshot?.topics ?? []).map(t => [t.fingerprint, t]),
    );

    // 5. Pre-compute fingerprints (avoid O(n²))
    const topicsWithFingerprint = aiTopics.map(topic => ({
      ...topic,
      fingerprint: generateFingerprint(topic.title),
    }));

    // Build cross-platform lookup: fingerprint → Set of sourcePlatforms
    const crossPlatformMap = new Map<string, Set<string>>();
    for (const t of topicsWithFingerprint) {
      const set = crossPlatformMap.get(t.fingerprint) || new Set();
      set.add(t.sourcePlatform);
      crossPlatformMap.set(t.fingerprint, set);
    }

    // Batch query: get earliest firstSeenAt for all fingerprints
    const allFingerprints = [...new Set(topicsWithFingerprint.map(t => t.fingerprint))];
    const historicalFirstSeen = await this.prisma.trendTopic.groupBy({
      by: ['fingerprint'],
      where: { fingerprint: { in: allFingerprints } },
      _min: { firstSeenAt: true },
    });
    const firstSeenMap = new Map(
      historicalFirstSeen.map(h => [h.fingerprint, h._min.firstSeenAt]),
    );

    // Calculate phases and build topics
    const topicsToCreate = topicsWithFingerprint.map(topic => {
      const prev = previousTopicsMap.get(topic.fingerprint);

      let phase: TrendPhase = 'NEW';
      if (prev) {
        const scoreDiff = topic.relevanceScore - prev.relevanceScore;
        if (scoreDiff >= 0.05) phase = 'RISING';
        else if (scoreDiff <= -0.05) phase = 'DECLINING';
        else phase = 'PEAK';
      }

      const isCrossPlatform = (crossPlatformMap.get(topic.fingerprint)?.size ?? 0) >= 2;

      return {
        fingerprint: topic.fingerprint,
        title: topic.title,
        summary: topic.summary,
        source: topic.source,
        sourcePlatform: topic.sourcePlatform as TrendSourcePlatform,
        category: topic.category,
        relevanceScore: topic.relevanceScore,
        contentIdeas: topic.contentIdeas,
        url: topic.url || null,
        phase,
        isCrossPlatform,
        firstSeenAt: firstSeenMap.get(topic.fingerprint) ?? new Date(),
      };
    });

    // 6. Write to DB in a transaction
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const snap = await tx.trendSnapshot.create({
        data: {
          sources: activePlatforms,
          topicCount: topicsToCreate.length,
          aiAnalysis,
        },
      });

      if (topicsToCreate.length > 0) {
        await tx.trendTopic.createMany({
          data: topicsToCreate.map(t => ({
            snapshotId: snap.id,
            ...t,
          })),
        });
      }

      return tx.trendSnapshot.findUniqueOrThrow({
        where: { id: snap.id },
        include: { topics: { orderBy: { relevanceScore: 'desc' } } },
      });
    });

    this.logger.log(`Created snapshot ${snapshot.id} with ${snapshot.topicCount} topics`);
    return snapshot;
  }

  /**
   * Get 14-day history for a specific trend by fingerprint.
   */
  async getTrendHistory(fingerprint: string) {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const topics = await this.prisma.trendTopic.findMany({
      where: {
        fingerprint,
        snapshot: { generatedAt: { gte: fourteenDaysAgo } },
      },
      include: { snapshot: { select: { generatedAt: true } } },
      orderBy: { snapshot: { generatedAt: 'asc' } },
    });

    if (topics.length === 0) return null;

    // Group by date, take highest score per day
    const dailyMap = new Map<string, { date: string; relevanceScore: number; snapshotId: string }>();
    for (const t of topics) {
      const date = t.snapshot.generatedAt.toISOString().split('T')[0];
      const existing = dailyMap.get(date);
      if (!existing || t.relevanceScore > existing.relevanceScore) {
        dailyMap.set(date, {
          date,
          relevanceScore: t.relevanceScore,
          snapshotId: t.snapshotId,
        });
      }
    }

    const history = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = topics[topics.length - 1];
    const peak = topics.reduce((max, t) => t.relevanceScore > max.relevanceScore ? t : max, topics[0]);

    return {
      fingerprint,
      title: latest.title,
      currentPhase: latest.phase,
      history,
      firstSeenAt: topics[0].firstSeenAt.toISOString(),
      peakScore: peak.relevanceScore,
      peakDate: peak.snapshot.generatedAt.toISOString().split('T')[0],
    };
  }

  /**
   * AI analysis: generate structured trend topics + daily summary.
   */
  private async analyzeWithAi(items: RssFeedItem[]): Promise<{
    topics: Array<{
      title: string;
      summary: string;
      source: string;
      sourcePlatform: string;
      category: string;
      relevanceScore: number;
      contentIdeas: string[];
      url?: string;
    }>;
    aiAnalysis: string;
  }> {
    const sanitize = (s: string) =>
      s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

    const titlesText = items
      .map((item, i) => `${i + 1}. [${sanitize(item.source)}] ${sanitize(item.title)}`)
      .join('\n');

    // Step 1: Structured analysis
    const jsonResult = await this.aiService.generateJson<{
      topics: Array<{
        title: string;
        summary: string;
        source: string;
        category: string;
        relevanceScore: number;
        contentIdeas: string[];
        sourceArticleIndex: number;
      }>;
    }>(
      `你是一位專業的社群趨勢分析師，專門為台灣的內容創作者提供趨勢洞察。

請分析以下從各大平台收集的熱門標題（每條前面有編號），識別出 8-15 個最值得關注的趨勢話題。

對每個趨勢，提供：
- title: 趨勢主題名稱（繁體中文，簡潔有力）
- summary: 30-50 字的趨勢摘要，說明為什麼創作者應該關注
- source: 來源平台名稱
- category: 分類（科技/生活/商業/娛樂/社會議題/創作者經濟）
- relevanceScore: 對創作者的相關度 0-1（越高越相關）
- contentIdeas: 2-3 個基於此趨勢的影片/內容創意（每個一句話）
- sourceArticleIndex: 這個趨勢最相關的原始文章編號（1-based）

按 relevanceScore 降序排列。

回覆 JSON 格式：{ "topics": [...] }`,
      `以下是今日從各平台收集的熱門標題：\n\n${titlesText}`,
      { maxTokens: 2048 },
    );

    // Step 2: Daily summary
    const topicsSummary = (jsonResult?.topics ?? [])
      .map(t => `- ${t.title}: ${t.summary}`)
      .join('\n');

    const aiAnalysis = await this.aiService.chat(
      `你是一位台灣創作者的趨勢顧問。根據以下今日熱門趨勢，用繁體中文寫一段 150-200 字的趨勢總結。
語氣要像一個親切的早報主播，告訴創作者今天有什麼值得關注的。
用 emoji 增加可讀性，分 2-3 個重點段落。
最後給一個「今日行動建議」。`,
      `今日趨勢主題：\n${topicsSummary}`,
      { maxTokens: 400 },
    );

    // Build source-name → platform lookup for robust mapping
    const sourceNameToPlatform = new Map<string, string>();
    for (const item of items) {
      if (!sourceNameToPlatform.has(item.source)) {
        sourceNameToPlatform.set(item.source, item.sourcePlatform);
      }
    }

    // Map back to source platforms and URLs
    const topics = (jsonResult?.topics ?? []).map(t => {
      const idx = t.sourceArticleIndex;
      const matchedItem = typeof idx === 'number' && idx >= 1 && idx <= items.length
        ? items[idx - 1]
        : undefined;
      return {
        title: t.title,
        summary: t.summary,
        source: t.source,
        sourcePlatform: matchedItem?.sourcePlatform
          || sourceNameToPlatform.get(t.source)
          || 'RSS_ITHOME',
        category: t.category,
        relevanceScore: t.relevanceScore,
        contentIdeas: t.contentIdeas,
        url: matchedItem?.link,
      };
    });

    return { topics, aiAnalysis };
  }
}
