import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { parseStringPromise } from 'xml2js';
import { DcardScraper } from './scrapers/dcard.scraper';
import { ThreadsScraper } from './scrapers/threads.scraper';
import { TikTokScraper } from './scrapers/tiktok.scraper';

export interface FetchedPost {
  platform: string;
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
}

export interface AnalyzedPost extends FetchedPost {
  aiSummary: string;
  aiCategory: string;
  aiTags: string[];
  relevanceScore: number;
  contentIdea?: string;
}

export interface ExploreResult {
  id: string;
  source: string;
  totalPosts: number;
  posts: AnalyzedPost[];
  startedAt: string;
  completedAt: string;
}

// RSS sources organized by category
const RSS_SOURCES: Record<string, { name: string; url: string; category: string }[]> = {
  tech: [
    { name: 'TechNews 科技新報', url: 'https://technews.tw/feed/', category: '科技' },
    { name: 'iThome', url: 'https://www.ithome.com.tw/rss', category: '科技' },
  ],
  global: [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: '科技' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: '科技' },
    { name: 'Hacker News Best', url: 'https://hnrss.org/best', category: '科技' },
  ],
  lifestyle: [
    { name: '食力 foodNEXT', url: 'https://www.foodnext.net/feed', category: '美食' },
    { name: '女人迷', url: 'https://womany.net/rss', category: '生活' },
  ],
};

// Browser-based sources (Playwright)
const BROWSER_SOURCES = ['dcard', 'threads', 'tiktok'];

@Injectable()
export class AutoBrowseService {
  private readonly logger = new Logger(AutoBrowseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Explore a category of sources and return AI-analyzed trending content
   */
  async explore(
    userId: string,
    tenantId: string,
    options?: {
      category?: string;    // tech, creator, global, lifestyle, or 'all'
      maxPosts?: number;
      customRssUrl?: string; // User can add their own RSS feed
    },
  ): Promise<ExploreResult> {
    const startedAt = new Date().toISOString();
    const maxPosts = options?.maxPosts ?? 15;
    const category = options?.category ?? 'all';

    // Collect RSS sources to fetch
    let sources: { name: string; url: string; category: string }[] = [];

    if (options?.customRssUrl) {
      sources = [{ name: '自訂來源', url: options.customRssUrl, category: '自訂' }];
    } else if (category === 'all') {
      sources = Object.values(RSS_SOURCES).flat();
    } else if (RSS_SOURCES[category]) {
      sources = RSS_SOURCES[category];
    } else if (!BROWSER_SOURCES.includes(category)) {
      throw new BadRequestException(`不支援的分類: ${category}。可用: ${[...Object.keys(RSS_SOURCES), ...BROWSER_SOURCES, 'all'].join(', ')}`);
    }

    // Fetch all sources in parallel
    const allPosts: FetchedPost[] = [];

    // RSS feeds
    const fetchPromises = sources.map(async (source) => {
      try {
        const posts = await this.fetchRss(source.url, source.name, source.category);
        allPosts.push(...posts);
      } catch (e) {
        this.logger.warn(`Failed to fetch ${source.name}: ${e.message}`);
      }
    });

    await Promise.all(fetchPromises);

    // Browser-based sources (run sequentially to avoid resource exhaustion)
    // Skip browser scraping when category is 'all' to prevent long timeouts and crashes
    // Users can scrape specific platforms individually
    const skipBrowserForAll = category === 'all';
    const browserSources: Array<{ name: string; scraper: () => Promise<FetchedPost[]> }> = [];

    if (category === 'dcard' || (!skipBrowserForAll && category === 'all')) {
      browserSources.push({
        name: 'Dcard',
        scraper: () => new DcardScraper().scrape({ maxPosts: category === 'dcard' ? maxPosts : 8 }),
      });
    }
    if (category === 'threads' || (!skipBrowserForAll && category === 'all')) {
      browserSources.push({
        name: 'Threads',
        scraper: () => new ThreadsScraper().scrape({ maxPosts: category === 'threads' ? maxPosts : 8 }),
      });
    }
    if (category === 'tiktok' || (!skipBrowserForAll && category === 'all')) {
      browserSources.push({
        name: 'TikTok',
        scraper: () => new TikTokScraper().scrape({ maxPosts: category === 'tiktok' ? maxPosts : 8 }),
      });
    }

    // Run scrapers one at a time to avoid launching multiple browsers simultaneously
    for (const source of browserSources) {
      try {
        const posts = await source.scraper();
        allPosts.push(...posts);
        this.logger.log(`Scraped ${posts.length} posts from ${source.name}`);
      } catch (e) {
        this.logger.warn(`${source.name} scraping failed: ${(e as Error).message}`);
      }
    }

    this.logger.log(`Fetched ${allPosts.length} posts from all sources`);

    // Sort by date (newest first) and limit
    const recentPosts = allPosts
      .sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
      })
      .slice(0, maxPosts);

    // AI analyze
    const analyzedPosts = await this.analyzePostsBatch(recentPosts);

    // Save to content_clips for persistence
    for (const post of analyzedPosts.slice(0, 10)) {
      try {
        await this.prisma.contentClip.create({
          data: {
            userId,
            tenantId,
            platform: post.platform,
            url: post.url,
            title: post.title.slice(0, 200),
            rawContent: post.content.slice(0, 5000),
            aiSummary: post.aiSummary,
            aiCategory: post.aiCategory,
            aiTags: post.aiTags,
            author: post.author ?? null,
            imageUrl: post.imageUrl ?? null,
          },
        });
      } catch {
        // Skip duplicate URLs
      }
    }

    return {
      id: `explore-${Date.now()}`,
      source: category,
      totalPosts: analyzedPosts.length,
      posts: analyzedPosts,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetch and parse an RSS feed
   */
  private async fetchRss(url: string, sourceName: string, category: string): Promise<FetchedPost[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CreatorPlatform/1.0 RSS Reader',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const xml = await res.text();
      const parsed = await parseStringPromise(xml, { trim: true, explicitArray: false });

      const posts: FetchedPost[] = [];

      // Handle RSS 2.0
      if (parsed.rss?.channel?.item) {
        const items = Array.isArray(parsed.rss.channel.item)
          ? parsed.rss.channel.item
          : [parsed.rss.channel.item];

        for (const item of items.slice(0, 10)) {
          posts.push({
            platform: sourceName,
            title: this.cleanText(item.title || ''),
            content: this.cleanText(this.stripHtml(item.description || item['content:encoded'] || '')).slice(0, 500),
            url: item.link || '',
            author: item['dc:creator'] || item.author || undefined,
            publishedAt: item.pubDate || undefined,
            imageUrl: this.extractImageUrl(item),
          });
        }
      }

      // Handle Atom feeds
      if (parsed.feed?.entry) {
        const entries = Array.isArray(parsed.feed.entry)
          ? parsed.feed.entry
          : [parsed.feed.entry];

        for (const entry of entries.slice(0, 10)) {
          const link = Array.isArray(entry.link)
            ? entry.link.find((l: any) => l.$?.rel === 'alternate')?.$.href || entry.link[0]?.$.href
            : entry.link?.$.href || entry.link;

          posts.push({
            platform: sourceName,
            title: this.cleanText(typeof entry.title === 'string' ? entry.title : entry.title?._ || ''),
            content: this.cleanText(this.stripHtml(
              typeof entry.content === 'string' ? entry.content : entry.content?._ ||
              typeof entry.summary === 'string' ? entry.summary : entry.summary?._ || ''
            )).slice(0, 500),
            url: link || '',
            author: entry.author?.name || undefined,
            publishedAt: entry.published || entry.updated || undefined,
          });
        }
      }

      return posts;
    } catch (e) {
      this.logger.warn(`RSS fetch error for ${sourceName}: ${e.message}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * AI batch analysis
   */
  private async analyzePostsBatch(posts: FetchedPost[]): Promise<AnalyzedPost[]> {
    if (posts.length === 0) return [];

    const chunkSize = 5;
    const results: AnalyzedPost[] = [];

    for (let i = 0; i < posts.length; i += chunkSize) {
      const chunk = posts.slice(i, i + chunkSize);
      const postsText = chunk.map((p, idx) =>
        `[${idx}] 來源: ${p.platform}\n標題: ${p.title}\n摘要: ${p.content.slice(0, 200)}`
      ).join('\n---\n');

      const aiResult = await this.aiService.generateJson<{
        analyses: Array<{
          index: number;
          summary: string;
          category: string;
          tags: string[];
          relevanceScore: number;
          contentIdea: string;
        }>;
      }>(
        `你是內容創作顧問。分析以下${chunk.length}則熱門文章，為每一則提供：
- summary: 40-70字繁體中文摘要
- category: 分類（科技/AI/商業/生活/娛樂/教育/設計/行銷/健康/其他）
- tags: 3個標籤
- relevanceScore: 0-100 對創作者的參考價值
- contentIdea: 基於此內容，創作者可以製作什麼影片/貼文（一句話建議）

回覆 JSON: { "analyses": [{ "index": 0, "summary": "...", "category": "...", "tags": [...], "relevanceScore": 85, "contentIdea": "..." }, ...] }`,
        postsText,
        { maxTokens: 800 },
      );

      for (const analysis of aiResult?.analyses ?? []) {
        const original = chunk[analysis.index];
        if (original) {
          results.push({
            ...original,
            aiSummary: analysis.summary,
            aiCategory: analysis.category,
            aiTags: analysis.tags,
            relevanceScore: analysis.relevanceScore,
            contentIdea: analysis.contentIdea,
          });
        }
      }

      // Fill in posts AI didn't analyze
      for (let j = 0; j < chunk.length; j++) {
        if (!aiResult?.analyses?.find(a => a.index === j)) {
          results.push({
            ...chunk[j],
            aiSummary: chunk[j].content.slice(0, 60),
            aiCategory: '其他',
            aiTags: [],
            relevanceScore: 50,
          });
        }
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * List available source categories
   */
  getAvailableSources() {
    const rssSources = Object.entries(RSS_SOURCES).map(([key, sources]) => ({
      id: key,
      label: key === 'tech' ? '科技' : key === 'creator' ? '創作者' : key === 'global' ? '國際' : '生活',
      sources: sources.map(s => ({ name: s.name, category: s.category })),
    }));

    // Add browser-based sources
    rssSources.push(
      { id: 'dcard', label: 'Dcard 熱門', sources: [{ name: 'Dcard 熱門文章', category: '社群' }] },
      { id: 'threads', label: 'Threads', sources: [{ name: 'Threads 熱門', category: '社群' }] },
      { id: 'tiktok', label: 'TikTok', sources: [{ name: 'TikTok 熱門', category: '短影片' }] },
    );

    return rssSources;
  }

  // --- Utility methods ---

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private extractImageUrl(item: any): string | undefined {
    // Try media:content
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    // Try enclosure
    if (item.enclosure?.$?.url && item.enclosure.$.type?.startsWith('image')) return item.enclosure.$.url;
    // Try to extract from description
    const imgMatch = (item.description || '').match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) return imgMatch[1];
    return undefined;
  }
}
