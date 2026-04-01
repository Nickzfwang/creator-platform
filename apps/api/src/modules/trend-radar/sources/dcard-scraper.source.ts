import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';
import { PlaywrightPool } from '../shared/playwright-pool';

/**
 * Scrapes Dcard popular posts via Playwright.
 * Used because Dcard's API is behind Cloudflare and blocks server-side requests.
 */
export class DcardScraperSource implements TrendSource {
  private readonly logger = new Logger(DcardScraperSource.name);

  readonly name = 'Dcard 熱門';
  readonly sourcePlatform = 'API_DCARD'; // Keep same enum for backward compatibility

  async fetch(): Promise<RssFeedItem[]> {
    const browser = await PlaywrightPool.getBrowser();
    const context = await PlaywrightPool.createStealthContext(browser);

    try {
      const page = await context.newPage();

      await page.goto('https://www.dcard.tw/f', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Wait for post cards to appear
      await page.waitForTimeout(3000);

      // Scroll to load more posts
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);

      const items = await page.evaluate(() => {
        const results: Array<{ title: string; link: string }> = [];

        // Dcard post cards contain links to /f/{forum}/p/{id}
        const postLinks = document.querySelectorAll('a[href*="/f/"][href*="/p/"]');

        postLinks.forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          const href = anchor.href || '';
          if (!href.includes('/p/')) return;

          // Get post title from heading or text content
          const heading = el.querySelector('h2, h3, [class*="Title"]');
          const title = heading?.textContent?.trim() || anchor.textContent?.trim() || '';

          if (title && title.length > 2 && title.length < 200 && href) {
            // Avoid duplicates
            if (!results.some((r) => r.link === href)) {
              results.push({ title, link: href });
            }
          }
        });

        return results;
      });

      await page.close();

      return items.slice(0, 10).map((item) => ({
        title: item.title,
        link: item.link,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));
    } catch (error) {
      this.logger.warn(`Failed to scrape Dcard: ${error}`);
      return [];
    } finally {
      await context.close();
    }
  }
}
