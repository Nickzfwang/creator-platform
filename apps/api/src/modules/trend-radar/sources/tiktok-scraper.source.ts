import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';
import { PlaywrightPool } from '../shared/playwright-pool';

export class TikTokScraperSource implements TrendSource {
  private readonly logger = new Logger(TikTokScraperSource.name);

  readonly name = 'TikTok Explore';
  readonly sourcePlatform = 'SCRAPER_TIKTOK';

  async fetch(): Promise<RssFeedItem[]> {
    const browser = await PlaywrightPool.getBrowser();
    const context = await PlaywrightPool.createStealthContext(browser);

    try {
      const page = await context.newPage();

      await page.goto('https://www.tiktok.com/explore', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Scroll once to trigger lazy loading
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(4000);

      // Try multiple selectors for video cards
      const items = await page.evaluate(() => {
        const results: Array<{ title: string; link: string }> = [];

        const selectors = [
          '[class*="DivItemContainer"]',
          '[class*="video-card"]',
          'a[href*="/video/"]',
        ];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length === 0) continue;

          elements.forEach((el) => {
            const anchor =
              el.tagName === 'A'
                ? (el as HTMLAnchorElement)
                : el.querySelector('a[href*="/video/"]');

            if (!anchor) return;

            const href = (anchor as HTMLAnchorElement).href || '';
            if (!href.includes('/video/')) return;

            // Try to extract a title or description text
            const titleEl =
              el.querySelector('[class*="title"]') ||
              el.querySelector('[class*="desc"]') ||
              el.querySelector('[class*="caption"]');
            const title = titleEl?.textContent?.trim() || '';

            // Extract author from URL pattern /@username/video/id
            const authorMatch = href.match(/@([^/]+)\/video/);
            const author = authorMatch ? `@${authorMatch[1]}` : '';

            const displayTitle = title || (author ? `${author} 的影片` : href);

            if (displayTitle && href) {
              results.push({ title: displayTitle, link: href });
            }
          });

          if (results.length > 0) break; // Use first selector that works
        }

        return results;
      });

      await page.close();

      return items.slice(0, 10).map((item: { title: string; link: string }) => ({
        title: item.title,
        link: item.link,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));
    } catch (error) {
      this.logger.warn(`Failed to scrape TikTok: ${error}`);
      return [];
    } finally {
      await context.close();
    }
  }
}
