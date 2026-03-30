import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationService } from '../notification/notification.service';
import { TrendTopic } from '@prisma/client';

@Injectable()
export class TrendRadarViralService {
  private readonly logger = new Logger(TrendRadarViralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Detect viral trends by comparing current vs previous snapshot.
   * Triggers: score jump >= 0.3, first appearance with score >= 0.8, or new cross-platform detection.
   */
  async detectViralTrends(
    currentTopics: TrendTopic[],
    previousTopics: TrendTopic[],
  ): Promise<void> {
    const previousMap = new Map(previousTopics.map(t => [t.fingerprint, t]));

    for (const topic of currentTopics) {
      const prev = previousMap.get(topic.fingerprint);
      const isViral =
        (prev && topic.relevanceScore - prev.relevanceScore >= 0.3) ||
        (!prev && topic.relevanceScore >= 0.8) ||
        (topic.isCrossPlatform && prev && !prev.isCrossPlatform);

      if (!isViral) continue;

      // AI generate recommended angle
      let angle = '';
      try {
        angle = await this.aiService.chat(
          '你是創作者顧問。根據以下爆紅趨勢，用 2-3 句話建議創作者如何切入製作內容。',
          `趨勢：${topic.title}\n摘要：${topic.summary}`,
          { maxTokens: 150 },
        );
      } catch {
        angle = '建議密切關注此趨勢動態。';
      }

      // Find all users with viral alerts enabled
      const users = await this.prisma.trendUserSettings.findMany({
        where: { notifyViralAlert: true },
        select: {
          userId: true,
          tenantId: true,
          emailViralAlert: true,
          user: { select: { email: true } },
        },
      });

      // Send notifications
      for (const u of users) {
        try {
          await this.notificationService.send({
            userId: u.userId,
            tenantId: u.tenantId,
            type: 'TREND_VIRAL_ALERT',
            title: `🔥 爆紅警報：${topic.title}`,
            body: `${topic.summary}\n\n💡 建議切入：${angle}`,
            metadata: {
              fingerprint: topic.fingerprint,
              relevanceScore: topic.relevanceScore,
            },
            linkUrl: `/trends?fingerprint=${topic.fingerprint}`,
          });
        } catch (error) {
          this.logger.warn(`Failed to send viral alert to ${u.userId}: ${error}`);
        }
      }

      this.logger.log(`Viral trend detected: ${topic.title} (score: ${topic.relevanceScore})`);
    }
  }

  /**
   * Match new trend topics against user keywords using AI semantic matching.
   */
  async matchKeywords(topics: TrendTopic[]): Promise<void> {
    if (topics.length === 0) return;

    // Get all active keywords
    const allKeywords = await this.prisma.trendKeyword.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true, tenantId: true, email: true } } },
    });

    if (allKeywords.length === 0) return;

    // Group by keyword (normalized)
    const keywordGroups = new Map<string, typeof allKeywords>();
    for (const kw of allKeywords) {
      const normalized = kw.keyword.toLowerCase().trim();
      const group = keywordGroups.get(normalized) || [];
      group.push(kw);
      keywordGroups.set(normalized, group);
    }

    const uniqueKeywords = [...keywordGroups.keys()];

    // AI semantic matching
    let matches: { keyword: string; topicIndices: number[] }[] = [];
    try {
      const result = await this.aiService.generateJson<{
        matches: { keyword: string; topicIndices: number[] }[];
      }>(
        `你是語意比對引擎。判斷以下關鍵字是否與任一趨勢主題語意相關。
不是純粹字串比對，而是語意相關性（例如「AI 工具」應匹配「ChatGPT 新功能」）。
只回傳有命中的關鍵字。

回覆 JSON: { "matches": [{ "keyword": "xxx", "topicIndices": [0, 2] }] }`,
        `關鍵字：${uniqueKeywords.join(', ')}\n\n趨勢主題：\n${topics.map((t, i) => `[${i}] ${t.title}: ${t.summary}`).join('\n')}`,
        { maxTokens: 512 },
      );
      matches = result?.matches ?? [];
    } catch (error) {
      this.logger.warn(`AI keyword matching failed: ${error}`);
      return;
    }

    // Send notifications for matches
    for (const match of matches) {
      const subscribers = keywordGroups.get(match.keyword) || [];
      const matchedTopics = match.topicIndices
        .map(i => topics[i])
        .filter(Boolean);

      if (matchedTopics.length === 0) continue;

      for (const kw of subscribers) {
        // Check user settings
        const settings = await this.prisma.trendUserSettings.findUnique({
          where: { userId: kw.userId },
        });
        if (settings && !settings.notifyKeywordHit) continue;

        try {
          await this.notificationService.send({
            userId: kw.userId,
            tenantId: kw.user.tenantId,
            type: 'TREND_KEYWORD_HIT',
            title: `🎯 關鍵字命中：${kw.keyword}`,
            body: matchedTopics.map(t => `• ${t.title}`).join('\n'),
            metadata: {
              keywordId: kw.id,
              keyword: kw.keyword,
              fingerprints: matchedTopics.map(t => t.fingerprint),
            },
            linkUrl: '/trends',
          });
        } catch (error) {
          this.logger.warn(`Failed to send keyword hit to ${kw.userId}: ${error}`);
        }

        // Update keyword stats
        await this.prisma.trendKeyword.update({
          where: { id: kw.id },
          data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
        });
      }
    }

    this.logger.log(`Keyword matching done: ${matches.length} keywords matched`);
  }
}
