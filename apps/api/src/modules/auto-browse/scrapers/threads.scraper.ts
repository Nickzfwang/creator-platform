import { Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import type { FetchedPost } from '../auto-browse.service';

/**
 * Threads Public Scraper
 * - Uses Playwright in HEADED mode to bypass detection
 * - Accesses Threads search page (public, no login)
 * - Extracts post content + username from page text
 */
export class ThreadsScraper {
  private readonly logger = new Logger('ThreadsScraper');

  async scrape(options?: {
    maxPosts?: number;
    query?: string;
  }): Promise<FetchedPost[]> {
    const maxPosts = options?.maxPosts ?? 10;
    const query = options?.query ?? '熱門';
    this.logger.log(`Scraping Threads for "${query}" (max ${maxPosts} posts)`);

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

      const url = `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=default`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(5000);

      // Check if blocked
      const pageTitle = await page.title();
      if (pageTitle.includes('Cloudflare') || pageTitle.includes('blocked')) {
        this.logger.warn('Threads blocked access');
        await browser.close();
        return [];
      }

      // Scroll to load more
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(2000);

      // Extract using innerText parsing + post links
      const posts = await page.evaluate((max: number) => {
        const results: Array<{ content: string; author: string; url: string }> = [];

        // Get all post links to identify post boundaries
        const postLinks = document.querySelectorAll('a[href*="/post/"]');
        const seen = new Set<string>();

        postLinks.forEach((link) => {
          if (results.length >= max) return;

          const href = link.getAttribute('href') || '';
          if (seen.has(href)) return;
          seen.add(href);

          const fullUrl = href.startsWith('http') ? href : `https://www.threads.net${href}`;

          // Extract username from URL pattern /@username/post/xxx
          const usernameMatch = href.match(/@([^/]+)/);
          const author = usernameMatch ? usernameMatch[1] : '';

          // Walk up to find the post container and get its text
          let container = link.parentElement;
          for (let i = 0; i < 15 && container; i++) {
            // A good container should have substantial text
            const text = container.innerText || '';
            if (text.length > 50) break;
            container = container.parentElement;
          }

          const containerText = container?.innerText || '';

          // Filter out UI elements from the text
          const uiWords = ['搜尋', '追蹤', '回覆', '轉發', '登入', '註冊', '首頁', '探索', 'Threads'];
          const lines = containerText.split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 15 && !uiWords.some(w => l === w));

          // The longest line is likely the post content
          const content = lines.sort((a: string, b: string) => b.length - a.length)[0] || '';

          if (content.length < 15) return;

          results.push({
            content: content.slice(0, 500),
            author,
            url: fullUrl,
          });
        });

        // Fallback: parse body text directly if no post links found
        if (results.length === 0) {
          const bodyText = document.body.innerText;
          const allLines = bodyText.split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 30);

          // Take lines that look like post content (not UI)
          const uiPatterns = ['登入', '註冊', '搜尋', 'Threads', 'Cookie', 'Instagram', '使用條款'];
          const contentLines = allLines.filter(
            (l: string) => !uiPatterns.some(p => l.includes(p))
          );

          contentLines.slice(0, max).forEach((line: string) => {
            results.push({
              content: line.slice(0, 500),
              author: '',
              url: 'https://www.threads.net',
            });
          });
        }

        return results;
      }, maxPosts);

      await context.close();
      await browser.close();

      const fetchedPosts: FetchedPost[] = posts
        .filter(p => p.content.length > 15)
        .map(p => ({
          platform: 'Threads',
          title: p.content.slice(0, 80),
          content: p.content,
          url: p.url,
          author: p.author || undefined,
        }));

      this.logger.log(`Scraped ${fetchedPosts.length} posts from Threads`);
      return fetchedPosts;

    } catch (e) {
      this.logger.error(`Threads scraping failed: ${e.message}`);
      if (browser) await browser.close().catch(() => {});
      return [];
    }
  }
}
