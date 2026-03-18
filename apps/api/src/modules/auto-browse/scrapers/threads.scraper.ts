import type { Page } from 'puppeteer-core';
import type { ScrapedPost } from '../auto-browse.service';

export class ThreadsScraper {
  async scrape(
    page: Page,
    options: { maxPosts: number; scrollCount: number },
  ): Promise<ScrapedPost[]> {
    // Navigate to Threads feed
    await page.goto('https://www.threads.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await this.delay(3000);

    const posts: ScrapedPost[] = [];

    for (let i = 0; i < options.scrollCount && posts.length < options.maxPosts; i++) {
      const newPosts = await page.evaluate(() => {
        const results: Array<{
          author: string;
          content: string;
          url: string;
          likes: number;
          imageUrl: string;
        }> = [];

        // Threads uses div containers for posts
        const postElements = document.querySelectorAll('[data-pressable-container="true"]');

        postElements.forEach((post) => {
          try {
            // Get author from profile link
            const authorEl = post.querySelector('a[href*="/@"] span, a[role="link"] span');
            const author = authorEl?.textContent?.trim()?.replace('@', '') || '';

            // Get text content
            const textEls = post.querySelectorAll('div[dir="auto"]');
            let content = '';
            textEls.forEach((el) => {
              const text = el.textContent?.trim();
              if (text && text.length > 10 && !text.startsWith('@')) {
                content += text + '\n';
              }
            });
            content = content.trim();

            // Get post URL
            const timeLink = post.querySelector('time')?.closest('a');
            const url = timeLink ? (timeLink as HTMLAnchorElement).href : '';

            // Get likes (approximate)
            const likeEl = post.querySelector('[aria-label*="like"], [aria-label*="讚"]');
            const likesText = likeEl?.getAttribute('aria-label') || '';
            const likesMatch = likesText.match(/(\d+)/);
            const likes = likesMatch ? parseInt(likesMatch[1]) : 0;

            // Image
            const img = post.querySelector('img[src*="instagram"], img[src*="threads"]');
            const imageUrl = img ? (img as HTMLImageElement).src : '';

            if (content && content.length > 10) {
              results.push({ author, content: content.slice(0, 1000), url, likes, imageUrl });
            }
          } catch { /* skip */ }
        });

        return results;
      });

      for (const np of newPosts) {
        if (np.content && !posts.some(p => p.content === np.content)) {
          posts.push({
            platform: 'threads',
            author: np.author,
            content: np.content,
            url: np.url || 'https://www.threads.net/',
            likes: np.likes,
            imageUrl: np.imageUrl,
          });
        }
      }

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await this.delay(2000 + Math.random() * 1000);
    }

    return posts.slice(0, options.maxPosts);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
