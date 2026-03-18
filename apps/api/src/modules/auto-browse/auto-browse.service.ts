import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as puppeteer from 'puppeteer-core';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { FacebookScraper } from './scrapers/facebook.scraper';
import { YouTubeScraper } from './scrapers/youtube.scraper';
import { ThreadsScraper } from './scrapers/threads.scraper';

export interface ScrapedPost {
  platform: string;
  author: string;
  content: string;
  url: string;
  likes?: number;
  comments?: number;
  shares?: number;
  imageUrl?: string;
  timestamp?: string;
}

export interface BrowseResult {
  id: string;
  platform: string;
  totalPosts: number;
  posts: SavedPost[];
  startedAt: string;
  completedAt: string;
}

export interface SavedPost extends ScrapedPost {
  aiSummary: string;
  aiCategory: string;
  aiTags: string[];
  relevanceScore: number;
}

@Injectable()
export class AutoBrowseService {
  private readonly logger = new Logger(AutoBrowseService.name);
  private browser: puppeteer.Browser | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Connect to user's Chrome browser via CDP
   * User must launch Chrome with: --remote-debugging-port=9222
   */
  async connectToChrome(debuggingPort = 9222): Promise<puppeteer.Browser> {
    try {
      // Try to connect to existing Chrome session
      const browserURL = `http://127.0.0.1:${debuggingPort}`;
      this.browser = await puppeteer.connect({
        browserURL,
        defaultViewport: null, // Use existing viewport
      });
      this.logger.log(`Connected to Chrome on port ${debuggingPort}`);
      return this.browser;
    } catch (error) {
      throw new BadRequestException(
        `無法連接到 Chrome 瀏覽器。請先用以下指令啟動 Chrome：\n\n` +
        `Mac: open -a "Google Chrome" --args --remote-debugging-port=${debuggingPort}\n` +
        `Windows: chrome.exe --remote-debugging-port=${debuggingPort}\n\n` +
        `確保已在 Chrome 中登入你的社群帳號（Facebook、YouTube 等）`,
      );
    }
  }

  async disconnect() {
    if (this.browser) {
      this.browser.disconnect(); // disconnect, NOT close (don't close user's browser)
      this.browser = null;
      this.logger.log('Disconnected from Chrome');
    }
  }

  /**
   * Browse a platform and collect trending posts
   */
  async browsePlatform(
    userId: string,
    tenantId: string,
    platform: string,
    options?: { maxPosts?: number; scrollCount?: number },
  ): Promise<BrowseResult> {
    const startedAt = new Date().toISOString();
    const maxPosts = options?.maxPosts ?? 15;
    const scrollCount = options?.scrollCount ?? 8;

    // Connect to Chrome
    const browser = await this.connectToChrome();

    try {
      // Open a new tab (don't mess with user's existing tabs)
      const page = await browser.newPage();

      let rawPosts: ScrapedPost[] = [];

      // Select scraper based on platform
      switch (platform.toLowerCase()) {
        case 'facebook':
          rawPosts = await new FacebookScraper().scrape(page, { maxPosts, scrollCount });
          break;
        case 'youtube':
          rawPosts = await new YouTubeScraper().scrape(page, { maxPosts, scrollCount });
          break;
        case 'threads':
          rawPosts = await new ThreadsScraper().scrape(page, { maxPosts, scrollCount });
          break;
        default:
          throw new BadRequestException(`不支援的平台: ${platform}`);
      }

      // Close the tab we opened
      await page.close();

      this.logger.log(`Scraped ${rawPosts.length} posts from ${platform}`);

      // Use AI to analyze and summarize all posts in batch
      const savedPosts = await this.analyzePostsBatch(rawPosts);

      // Save to database
      for (const post of savedPosts) {
        await this.prisma.contentClip.create({
          data: {
            userId,
            tenantId,
            platform: post.platform,
            url: post.url,
            title: post.aiSummary?.slice(0, 100) || post.content.slice(0, 100),
            rawContent: post.content.slice(0, 5000),
            aiSummary: post.aiSummary,
            aiCategory: post.aiCategory,
            aiTags: post.aiTags,
            author: post.author || null,
            imageUrl: post.imageUrl || null,
          },
        });
      }

      const completedAt = new Date().toISOString();

      return {
        id: `browse-${Date.now()}`,
        platform,
        totalPosts: savedPosts.length,
        posts: savedPosts,
        startedAt,
        completedAt,
      };
    } catch (error) {
      this.logger.error(`Browse failed for ${platform}: ${error.message}`);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Use GPT to analyze a batch of posts
   */
  private async analyzePostsBatch(posts: ScrapedPost[]): Promise<SavedPost[]> {
    if (posts.length === 0) return [];

    // Analyze in chunks of 5 to avoid token limits
    const chunkSize = 5;
    const results: SavedPost[] = [];

    for (let i = 0; i < posts.length; i += chunkSize) {
      const chunk = posts.slice(i, i + chunkSize);
      const postsText = chunk.map((p, idx) =>
        `[${idx}] 作者: ${p.author}\n內容: ${p.content.slice(0, 300)}\n互動: ${p.likes ?? '?'} 讚, ${p.comments ?? '?'} 留言`
      ).join('\n---\n');

      const aiResult = await this.aiService.generateJson<{
        analyses: Array<{
          index: number;
          summary: string;
          category: string;
          tags: string[];
          relevanceScore: number;
        }>;
      }>(
        `你是社群趨勢分析師。分析以下${chunk.length}則社群貼文，為每一則提供：
- summary: 30-60字繁體中文摘要
- category: 分類（科技/生活/商業/娛樂/教育/設計/行銷/健康/美食/旅遊/時事/其他）
- tags: 3個相關標籤
- relevanceScore: 0-100 的內容創作參考價值分數（對創作者有多大啟發？）

回覆 JSON: { "analyses": [{ "index": 0, "summary": "...", "category": "...", "tags": [...], "relevanceScore": 85 }, ...] }`,
        postsText,
        { maxTokens: 800 },
      );

      for (const analysis of aiResult?.analyses ?? []) {
        const originalPost = chunk[analysis.index];
        if (originalPost) {
          results.push({
            ...originalPost,
            aiSummary: analysis.summary,
            aiCategory: analysis.category,
            aiTags: analysis.tags,
            relevanceScore: analysis.relevanceScore,
          });
        }
      }

      // Add any posts that AI didn't analyze
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

    // Sort by relevance score
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Check if Chrome is accessible
   */
  async checkConnection(port = 9222): Promise<{ connected: boolean; message: string }> {
    try {
      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null,
      });
      const pages = await browser.pages();
      browser.disconnect();
      return {
        connected: true,
        message: `已連接到 Chrome（${pages.length} 個分頁）`,
      };
    } catch {
      return {
        connected: false,
        message: '無法連接。請用以下指令啟動 Chrome：\nopen -a "Google Chrome" --args --remote-debugging-port=9222',
      };
    }
  }
}
