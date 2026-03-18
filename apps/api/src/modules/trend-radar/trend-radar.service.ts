import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

interface RssFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  source: string;
}

export interface TrendTopic {
  title: string;
  summary: string;
  source: string;
  category: string;
  relevanceScore: number;
  contentIdeas: string[];
  url?: string;
}

export interface TrendReport {
  topics: TrendTopic[];
  aiAnalysis: string;
  generatedAt: string;
  sources: string[];
}

// RSS feed sources - public and legal
const RSS_FEEDS: Array<{ name: string; url: string; category: string }> = [
  // Taiwan tech & digital
  { name: 'Dcard 熱門', url: 'https://www.dcard.tw/service/api/v2/posts?popular=true&limit=15', category: '社群討論' },
  { name: 'TechOrange 科技報橘', url: 'https://buzzorange.com/techorange/feed/', category: '科技' },
  { name: 'iThome', url: 'https://www.ithome.com.tw/rss', category: '科技' },
  { name: '數位時代', url: 'https://www.bnext.com.tw/rss', category: '商業科技' },
  // International
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: '國際科技' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: '國際科技' },
  { name: 'Product Hunt', url: 'https://www.producthunt.com/feed', category: '新產品' },
  // YouTube / Creator economy
  { name: 'Creator Economy (Substack)', url: 'https://creatoreconomy.so/feed', category: '創作者經濟' },
];

@Injectable()
export class TrendRadarService {
  private readonly logger = new Logger(TrendRadarService.name);
  private cachedReport: TrendReport | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(private readonly aiService: AiService) {}

  async getTrends(
    category?: string,
    forceRefresh = false,
  ): Promise<TrendReport> {
    // Return cache if fresh
    if (
      !forceRefresh &&
      this.cachedReport &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL
    ) {
      if (category) {
        return {
          ...this.cachedReport,
          topics: this.cachedReport.topics.filter(
            (t) => t.category === category,
          ),
        };
      }
      return this.cachedReport;
    }

    // Fetch RSS feeds in parallel
    const feedResults = await Promise.allSettled(
      RSS_FEEDS.map((feed) => this.fetchFeed(feed)),
    );

    const allItems: RssFeedItem[] = [];
    const activeSources: string[] = [];

    for (let i = 0; i < feedResults.length; i++) {
      const result = feedResults[i];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allItems.push(...result.value);
        activeSources.push(RSS_FEEDS[i].name);
      }
    }

    this.logger.log(
      `Fetched ${allItems.length} items from ${activeSources.length} sources`,
    );

    // Use GPT to analyze and rank trends
    const report = await this.analyzeWithAi(allItems, activeSources);
    this.cachedReport = report;
    this.cacheTimestamp = Date.now();

    if (category) {
      return {
        ...report,
        topics: report.topics.filter((t) => t.category === category),
      };
    }
    return report;
  }

  private async fetchFeed(feed: {
    name: string;
    url: string;
    category: string;
  }): Promise<RssFeedItem[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CreatorPlatform/1.0 (RSS Reader)' },
      });
      clearTimeout(timeout);

      if (!res.ok) return [];

      const text = await res.text();
      const items: RssFeedItem[] = [];

      if (feed.url.includes('dcard.tw')) {
        // Dcard returns JSON
        try {
          const posts = JSON.parse(text);
          if (Array.isArray(posts)) {
            for (const post of posts.slice(0, 10)) {
              items.push({
                title: post.title || '',
                link: `https://www.dcard.tw/f/${post.forumAlias}/p/${post.id}`,
                pubDate: post.createdAt,
                source: feed.name,
              });
            }
          }
        } catch {
          /* ignore parse errors */
        }
      } else {
        // Parse RSS/Atom XML - simple regex extraction
        const titleMatches = text.matchAll(
          /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/g,
        );
        const linkMatches = text.matchAll(
          /<link[^>]*href="([^"]*)"[^>]*\/>|<link[^>]*>(.*?)<\/link>/g,
        );

        const titles: string[] = [];
        const links: string[] = [];

        for (const match of titleMatches) {
          const t = (match[1] || match[2] || '').trim();
          if (t && t !== feed.name && !t.includes('<?xml')) titles.push(t);
        }
        for (const match of linkMatches) {
          const l = (match[1] || match[2] || '').trim();
          if (l && l.startsWith('http')) links.push(l);
        }

        for (let i = 0; i < Math.min(titles.length, 10); i++) {
          items.push({
            title: titles[i],
            link: links[i] || '',
            source: feed.name,
          });
        }
      }

      return items;
    } catch (error) {
      this.logger.warn(`Failed to fetch ${feed.name}: ${error}`);
      return [];
    }
  }

  private async analyzeWithAi(
    items: RssFeedItem[],
    sources: string[],
  ): Promise<TrendReport> {
    // Prepare titles for GPT analysis
    const titlesText = items
      .slice(0, 50) // Limit to avoid token overflow
      .map((item, i) => `${i + 1}. [${item.source}] ${item.title}`)
      .join('\n');

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

請分析以下從各大平台收集的熱門標題（每條前面有編號），識別出 8-12 個最值得關注的趨勢話題。

對每個趨勢，提供：
- title: 趨勢主題名稱（繁體中文，簡潔有力）
- summary: 30-50 字的趨勢摘要，說明為什麼創作者應該關注
- source: 來源平台名稱
- category: 分類（科技/生活/商業/娛樂/社會議題/創作者經濟）
- relevanceScore: 對創作者的相關度 0-1（越高越相關）
- contentIdeas: 2-3 個基於此趨勢的影片/內容創意（每個一句話）
- sourceArticleIndex: 這個趨勢最相關的原始文章編號（1-based，對應上面列表的編號）

按 relevanceScore 降序排列。

回覆 JSON 格式：{ "topics": [...] }`,
      `以下是今日從各平台收集的熱門標題：\n\n${titlesText}`,
      { maxTokens: 2048 },
    );

    // Generate overall analysis
    const analysis = await this.aiService.chat(
      `你是一位台灣創作者的趨勢顧問。根據以下今日熱門趨勢，用繁體中文寫一段 150-200 字的趨勢總結。

語氣要像一個親切的早報主播，告訴創作者今天有什麼值得關注的。
用 emoji 增加可讀性，分 2-3 個重點段落。
最後給一個「今日行動建議」。`,
      `今日趨勢主題：\n${(jsonResult?.topics ?? []).map((t) => `- ${t.title}: ${t.summary}`).join('\n')}`,
      { maxTokens: 400 },
    );

    const limitedItems = items.slice(0, 50);
    const topics: TrendTopic[] = (jsonResult?.topics ?? []).map((t) => {
      // Use GPT-provided index (1-based) to look up the original article URL
      const idx = (t as any).sourceArticleIndex;
      const matchedItem = typeof idx === 'number' && idx >= 1 && idx <= limitedItems.length
        ? limitedItems[idx - 1]
        : undefined;
      return {
        title: t.title,
        summary: t.summary,
        source: t.source,
        category: t.category,
        relevanceScore: t.relevanceScore,
        contentIdeas: t.contentIdeas,
        url: matchedItem?.link || undefined,
      };
    });

    return {
      topics,
      aiAnalysis: analysis,
      generatedAt: new Date().toISOString(),
      sources,
    };
  }
}
