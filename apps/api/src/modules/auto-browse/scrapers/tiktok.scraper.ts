import { Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import type { FetchedPost } from '../auto-browse.service';

/**
 * TikTok Public Scraper
 * - Uses Playwright in HEADED mode
 * - Accesses TikTok explore/trending page (public, no login)
 */
export class TikTokScraper {
  private readonly logger = new Logger('TikTokScraper');

  async scrape(options?: { maxPosts?: number }): Promise<FetchedPost[]> {
    const maxPosts = options?.maxPosts ?? 10;
    this.logger.log(`Scraping TikTok (max ${maxPosts} posts)`);

    let browser;
    try {
      browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--window-position=-2000,-2000',
        ],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-TW',
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // Go to TikTok explore page
      await page.goto('https://www.tiktok.com/explore', {
        waitUntil: 'networkidle',
        timeout: 20000,
      }).catch(() => {});

      await page.waitForTimeout(4000);

      // Check if blocked
      const title = await page.title();
      if (title.includes('Cloudflare') || title.includes('blocked') || title.includes('Verify')) {
        this.logger.warn('TikTok blocked access');
        await browser.close();
        return [];
      }

      // Scroll to load more
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(1500);
      }

      // Extract video info
      const posts = await page.evaluate((max: number) => {
        const results: Array<{
          title: string;
          url: string;
          author: string;
          views: string;
        }> = [];
        const seen = new Set<string>();

        // TikTok explore shows video cards with descriptions
        const videoCards = document.querySelectorAll('[class*="DivItemContainer"], [class*="video-card"], a[href*="/@"]');

        videoCards.forEach((card) => {
          if (results.length >= max) return;

          // Get video link
          const linkEl = card.tagName === 'A' ? card : card.querySelector('a[href*="/video/"]');
          const href = linkEl?.getAttribute('href') || '';
          if (!href || seen.has(href)) return;
          seen.add(href);

          // Get description
          const descEl = card.querySelector('[class*="title"], [class*="desc"], [class*="caption"]');
          const desc = descEl?.textContent?.trim() || '';

          // Get author
          const authorEl = card.querySelector('[class*="author"], [class*="username"]');
          const author = authorEl?.textContent?.trim() || '';

          // Get view count
          const viewEl = card.querySelector('[class*="view"], [class*="play"]');
          const views = viewEl?.textContent?.trim() || '';

          const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;

          results.push({
            title: desc || `TikTok 影片`,
            url: fullUrl,
            author,
            views,
          });
        });

        // Fallback: try to get from any visible text blocks
        if (results.length === 0) {
          const allLinks = document.querySelectorAll('a[href*="/video/"]');
          allLinks.forEach((link) => {
            if (results.length >= max) return;
            const href = link.getAttribute('href') || '';
            if (seen.has(href)) return;
            seen.add(href);

            const container = link.closest('div') || link.parentElement;
            const text = container?.textContent?.trim()?.slice(0, 200) || '';

            results.push({
              title: text || 'TikTok 熱門影片',
              url: href.startsWith('http') ? href : `https://www.tiktok.com${href}`,
              author: '',
              views: '',
            });
          });
        }

        return results;
      }, maxPosts);

      await context.close();
      await browser.close();

      const fetchedPosts: FetchedPost[] = posts.map(p => ({
        platform: 'TikTok',
        title: p.title.slice(0, 100),
        content: `${p.title} ${p.views ? `(${p.views} 觀看)` : ''}`.trim(),
        url: p.url,
        author: p.author || undefined,
      }));

      this.logger.log(`Scraped ${fetchedPosts.length} posts from TikTok`);
      return fetchedPosts;

    } catch (e) {
      this.logger.error(`TikTok scraping failed: ${e.message}`);
      if (browser) await browser.close().catch(() => {});
      return [];
    }
  }
}
