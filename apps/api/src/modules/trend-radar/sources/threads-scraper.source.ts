import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';
import { PlaywrightPool } from '../shared/playwright-pool';

const UI_KEYWORDS = ['登入', '追蹤', '回覆', '探索', '搜尋', '通知'];

export class ThreadsScraperSource implements TrendSource {
  private readonly logger = new Logger(ThreadsScraperSource.name);

  readonly name = 'Threads';
  readonly sourcePlatform = 'SCRAPER_THREADS';

  async fetch(): Promise<RssFeedItem[]> {
    const browser = await PlaywrightPool.getBrowser();
    const context = await PlaywrightPool.createStealthContext(browser);

    try {
      const page = await context.newPage();

      await page.goto('https://www.threads.net/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Wait for content to load
      await page.waitForTimeout(4000);

      const rawItems = await page.evaluate(() => {
        const results: Array<{
          text: string;
          link: string;
          username: string;
        }> = [];

        const postLinks = document.querySelectorAll('a[href*="/post/"]');

        postLinks.forEach((anchor) => {
          const href = (anchor as HTMLAnchorElement).href || '';
          if (!href.includes('/post/')) return;

          // Parse username from URL pattern /@username/post/xxx
          const usernameMatch = href.match(/@([^/]+)\/post\//);
          const username = usernameMatch ? usernameMatch[1] : '';

          // Get visible text near the link
          const parentEl = anchor.closest('div[class]') || anchor.parentElement;
          const text = parentEl?.textContent?.trim() || '';

          if (username && href) {
            results.push({ text, link: href, username });
          }
        });

        return results;
      });

      await page.close();

      // Filter out UI elements and deduplicate by link
      const seen = new Set<string>();
      const filtered = rawItems.filter((item: { text: string; link: string; username: string }) => {
        if (seen.has(item.link)) return false;
        seen.add(item.link);

        // Filter out items that are purely UI keywords
        const trimmed = item.text.trim();
        if (UI_KEYWORDS.some((kw) => trimmed === kw)) return false;

        return true;
      });

      return filtered.slice(0, 10).map((item: { text: string; link: string; username: string }) => ({
        title: item.text
          ? item.text.substring(0, 120)
          : `@${item.username} 的貼文`,
        link: item.link,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));
    } catch (error) {
      this.logger.warn(`Failed to scrape Threads: ${error}`);
      return [];
    } finally {
      await context.close();
    }
  }
}
