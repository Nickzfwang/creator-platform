import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { generateFingerprint } from './utils/fingerprint';
import { RssFeedItem, TrendSource } from './sources/base-source';
import { createRssSources } from './sources/rss.source';
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
      try {
        snapshot = await this.refreshTrends(false);
      } catch (error) {
        this.logger.error(`First boot refresh failed: ${error}`);
        throw error;
      }
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
      const sourceName = allSources[i].name;
      if (result.status === 'rejected') {
        this.logger.warn(`Source "${sourceName}" failed: ${result.reason}`);
        continue;
      }
      if (result.value.length === 0) {
        this.logger.warn(`Source "${sourceName}" returned 0 items`);
        continue;
      }
      allItems.push(...result.value);
      const platformStr = allSources[i].sourcePlatform;
      if (!activePlatforms.includes(platformStr as TrendSourcePlatform)) {
        activePlatforms.push(platformStr as TrendSourcePlatform);
      }
    }

    this.logger.log(
      `Fetched ${allItems.length} items from ${activePlatforms.length} sources: ${activePlatforms.join(', ')}`,
    );

    if (allItems.length === 0) {
      this.logger.error('All sources returned 0 items — cannot create snapshot');
      throw new Error('All trend sources failed to return data');
    }

    // 2. Deduplicate by URL
    const seen = new Set<string>();
    const uniqueItems = allItems.filter(item => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    });

    // 3. Stratified sampling: ensure every platform is represented in AI input
    const AI_ITEM_LIMIT = 60;
    const itemsForAi = this.stratifiedSample(uniqueItems, AI_ITEM_LIMIT);
    let aiTopics: Awaited<ReturnType<typeof this.analyzeWithAi>>['topics'];
    let aiAnalysis: string;

    try {
      const result = await this.analyzeWithAi(itemsForAi);
      aiTopics = result.topics;
      aiAnalysis = result.aiAnalysis;
    } catch (error) {
      this.logger.error(`AI analysis failed, using fallback: ${error}`);
      aiTopics = [];
      aiAnalysis = '';
    }

    // Fallback: if AI returned no topics, create basic topics from raw items
    if (aiTopics.length === 0 && itemsForAi.length > 0) {
      this.logger.warn(`AI returned 0 topics, creating ${itemsForAi.length} fallback topics from raw items`);
      aiTopics = itemsForAi.map(item => ({
        title: item.title,
        summary: '',
        source: item.source,
        sourcePlatform: item.sourcePlatform,
        category: '未分類',
        relevanceScore: 0.5,
        contentIdeas: [],
        url: item.link,
      }));
      aiAnalysis = aiAnalysis || '⚠️ AI 分析暫時無法使用，以下為各平台原始熱門內容。';
    }

    // 3b. Ensure every active platform has at least 1 topic (AI may skip some)
    const coveredPlatforms = new Set(aiTopics.map(t => t.sourcePlatform));
    const itemsByPlatform = new Map<string, RssFeedItem[]>();
    for (const item of uniqueItems) {
      const list = itemsByPlatform.get(item.sourcePlatform) || [];
      list.push(item);
      itemsByPlatform.set(item.sourcePlatform, list);
    }

    for (const [platform, platformItems] of itemsByPlatform) {
      if (coveredPlatforms.has(platform)) continue;
      // This platform had items but AI didn't select any — add top items as fallback
      const fillCount = Math.min(2, platformItems.length);
      this.logger.warn(`Platform ${platform} missing from AI topics, adding ${fillCount} fallback items`);
      for (const item of platformItems.slice(0, fillCount)) {
        aiTopics.push({
          title: item.title,
          summary: `來自 ${item.source} 的熱門內容`,
          source: item.source,
          sourcePlatform: item.sourcePlatform,
          category: '未分類',
          relevanceScore: 0.4,
          contentIdeas: [],
          url: item.link,
        });
      }
    }

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
  async getTrendHistory(fingerprint: string, days: number = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const fourteenDaysAgo = startDate;

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
   * Stratified sampling: pick items evenly across platforms so AI sees all sources.
   * Each platform gets at least `floor(limit / platformCount)` items,
   * remaining slots filled round-robin.
   */
  private stratifiedSample(items: RssFeedItem[], limit: number): RssFeedItem[] {
    if (items.length <= limit) return items;

    // Group by sourcePlatform
    const byPlatform = new Map<string, RssFeedItem[]>();
    for (const item of items) {
      const list = byPlatform.get(item.sourcePlatform) || [];
      list.push(item);
      byPlatform.set(item.sourcePlatform, list);
    }

    const platforms = [...byPlatform.keys()];
    const perPlatform = Math.max(1, Math.floor(limit / platforms.length));
    const result: RssFeedItem[] = [];

    // First pass: take perPlatform items from each
    for (const platform of platforms) {
      const platItems = byPlatform.get(platform)!;
      result.push(...platItems.slice(0, perPlatform));
    }

    // Second pass: fill remaining slots from platforms that have more items
    if (result.length < limit) {
      const remaining = limit - result.length;
      const extras: RssFeedItem[] = [];
      for (const platform of platforms) {
        const platItems = byPlatform.get(platform)!;
        extras.push(...platItems.slice(perPlatform));
      }
      result.push(...extras.slice(0, remaining));
    }

    return result;
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

    // Build platform summary for AI prompt
    const platformCounts = new Map<string, number>();
    for (const item of items) {
      platformCounts.set(item.source, (platformCounts.get(item.source) || 0) + 1);
    }
    const platformSummary = [...platformCounts.entries()]
      .map(([name, count]) => `${name}(${count}條)`)
      .join('、');

    this.logger.log(`Sending ${items.length} items to AI for analysis (platforms: ${platformSummary})`);

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

請分析以下從各大平台收集的熱門標題（每條前面有編號），識別出 12-20 個最值得關注的趨勢話題。

**重要：你必須確保每個來源平台至少被選入 1 個趨勢。** 來源平台包括：${platformSummary}。
不要只選媒體/RSS 來源，YouTube、Dcard、Reddit、TikTok、Threads 等社群平台的趨勢同樣重要。

對每個趨勢，提供：
- title: 趨勢主題名稱（繁體中文，簡潔有力）
- summary: 30-50 字的趨勢摘要，說明為什麼創作者應該關注
- source: 來源平台名稱（必須與原始文章的來源名稱完全一致）
- category: 分類（科技/生活/商業/娛樂/社會議題/創作者經濟）
- relevanceScore: 對創作者的相關度 0-1（越高越相關）
- contentIdeas: 2-3 個基於此趨勢的影片/內容創意（每個一句話）
- sourceArticleIndex: 這個趨勢最相關的原始文章編號（1-based，必須準確對應）

按 relevanceScore 降序排列。

回覆 JSON 格式：{ "topics": [...] }`,
      `以下是今日從各平台收集的熱門標題：\n\n${titlesText}`,
      { maxTokens: 3000 },
    );

    if (!jsonResult || !jsonResult.topics || jsonResult.topics.length === 0) {
      this.logger.warn('AI generateJson returned null or empty topics');
    } else {
      this.logger.log(`AI returned ${jsonResult.topics.length} topics`);
    }

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

      // Resolve sourcePlatform: prefer matched item, then name lookup, then fuzzy match
      let resolvedPlatform = matchedItem?.sourcePlatform
        || sourceNameToPlatform.get(t.source);

      if (!resolvedPlatform) {
        // Fuzzy match: AI might return slightly different source names
        const lowerSource = t.source.toLowerCase();
        for (const [name, platform] of sourceNameToPlatform) {
          if (lowerSource.includes(name.toLowerCase()) || name.toLowerCase().includes(lowerSource)) {
            resolvedPlatform = platform;
            break;
          }
        }
      }

      // Final fallback: use the most common non-RSS platform, or first available
      if (!resolvedPlatform) {
        this.logger.warn(`Could not resolve sourcePlatform for AI topic: "${t.title}" (source: "${t.source}")`);
        resolvedPlatform = 'RSS_ITHOME';
      }

      return {
        title: t.title,
        summary: t.summary,
        source: t.source,
        sourcePlatform: resolvedPlatform,
        category: t.category,
        relevanceScore: t.relevanceScore,
        contentIdeas: t.contentIdeas,
        url: matchedItem?.link,
      };
    });

    return { topics, aiAnalysis };
  }
}
