import { Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import type { FetchedPost } from '../auto-browse.service';

/**
 * Dcard Public Scraper
 * - Uses Playwright in HEADED mode to bypass Cloudflare
 * - Only accesses PUBLIC content (no login required)
 * - Extracts post titles + links from the trending page
 */
export class DcardScraper {
  private readonly logger = new Logger('DcardScraper');

  async scrape(options?: {
    maxPosts?: number;
    forum?: string; // 'trending' (default), 'tech', 'talk', 'relationship', etc.
  }): Promise<FetchedPost[]> {
    const maxPosts = options?.maxPosts ?? 15;
    const forum = options?.forum ?? '';

    const url = forum
      ? `https://www.dcard.tw/f/${forum}`
      : 'https://www.dcard.tw/f';

    this.logger.log(`Scraping Dcard: ${url} (max ${maxPosts} posts)`);

    let browser;
    try {
      browser = await chromium.launch({
        headless: false, // Must be headed to bypass Cloudflare
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--window-position=-2000,-2000', // Position off-screen so user doesn't see it
        ],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-TW',
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();

      // Remove automation indicators
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // Navigate to Dcard
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(4000);

      // Check if we got past Cloudflare
      const pageTitle = await page.title();
      if (pageTitle.includes('Cloudflare') || pageTitle.includes('Attention')) {
        this.logger.warn('Cloudflare blocked Dcard access');
        await browser.close();
        return [];
      }

      // Scroll down to load more posts
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(1500);
      }

      // Extract post data from the page
      const posts = await page.evaluate((max: number) => {
        const results: Array<{
          title: string;
          url: string;
          excerpt: string;
          forum: string;
        }> = [];

        const seen = new Set<string>();

        // Find all h2/h3 that are post titles
        const headings = document.querySelectorAll('h2, h3');
        headings.forEach((heading) => {
          if (results.length >= max) return;

          const title = heading.textContent?.trim() || '';
          if (!title || title.length < 5 || seen.has(title)) return;
          seen.add(title);

          // Find the closest link
          const link = heading.closest('a') || heading.querySelector('a') || heading.parentElement?.querySelector('a[href*="/p/"]');
          let href = link?.getAttribute('href') || '';

          // Also check parent elements for links
          if (!href.includes('/p/')) {
            let parent = heading.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const parentLink = parent.querySelector('a[href*="/p/"]');
              if (parentLink) {
                href = parentLink.getAttribute('href') || '';
                break;
              }
              parent = parent.parentElement;
            }
          }

          if (!href.includes('/p/')) return;

          const fullUrl = href.startsWith('http') ? href : `https://www.dcard.tw${href}`;

          // Try to get excerpt from nearby text
          const container = heading.closest('article') || heading.parentElement?.parentElement;
          const excerpt = container?.textContent?.replace(title, '')?.trim()?.slice(0, 200) || '';

          // Try to get forum name
          const forumMatch = excerpt.match(/([\u4e00-\u9fff\w]+)\s*·/);

          results.push({
            title,
            url: fullUrl,
            excerpt,
            forum: forumMatch ? forumMatch[1] : '',
          });
        });

        return results;
      }, maxPosts);

      await context.close();
      await browser.close();

      const fetchedPosts: FetchedPost[] = posts.map((p) => ({
        platform: 'Dcard',
        title: p.title,
        content: p.excerpt,
        url: p.url,
        author: p.forum || undefined,
      }));

      this.logger.log(`Scraped ${fetchedPosts.length} posts from Dcard`);
      return fetchedPosts;

    } catch (e) {
      this.logger.error(`Dcard scraping failed: ${e.message}`);
      if (browser) await browser.close().catch(() => {});
      return [];
    }
  }
}
