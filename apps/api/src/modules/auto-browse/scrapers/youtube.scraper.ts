import type { Page } from 'puppeteer-core';
import type { ScrapedPost } from '../auto-browse.service';

export class YouTubeScraper {
  async scrape(
    page: Page,
    options: { maxPosts: number; scrollCount: number },
  ): Promise<ScrapedPost[]> {
    // Navigate to YouTube trending
    await page.goto('https://www.youtube.com/feed/trending', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await this.delay(3000);

    const posts: ScrapedPost[] = [];

    for (let i = 0; i < options.scrollCount && posts.length < options.maxPosts; i++) {
      const newPosts = await page.evaluate(() => {
        const results: Array<{
          author: string;
          content: string;
          url: string;
          views: string;
          imageUrl: string;
        }> = [];

        // YouTube video renderers
        const videoElements = document.querySelectorAll(
          'ytd-video-renderer, ytd-rich-item-renderer, ytd-expanded-shelf-contents-renderer ytd-video-renderer'
        );

        videoElements.forEach((video) => {
          try {
            const titleEl = video.querySelector('#video-title, a#video-title-link');
            const title = titleEl?.textContent?.trim() || '';
            const url = titleEl ? (titleEl as HTMLAnchorElement).href : '';

            const channelEl = video.querySelector(
              '#channel-name a, ytd-channel-name a, .ytd-channel-name a'
            );
            const author = channelEl?.textContent?.trim() || '';

            const metaEl = video.querySelector('#metadata-line, .inline-metadata-item');
            const metaText = metaEl?.textContent?.trim() || '';

            // Views count from meta
            const viewsMatch = metaText.match(/([\d,.]+[萬億KMB]?)\s*次觀看|([\d,.]+[KMB]?)\s*views/i);
            const views = viewsMatch ? (viewsMatch[1] || viewsMatch[2]) : '';

            const descEl = video.querySelector('#description-text, .metadata-snippet-text');
            const description = descEl?.textContent?.trim() || '';

            const thumbEl = video.querySelector('img#img, yt-image img');
            const imageUrl = thumbEl ? (thumbEl as HTMLImageElement).src : '';

            if (title) {
              results.push({
                author,
                content: `${title}\n\n${description}`.trim(),
                url: url || 'https://www.youtube.com/',
                views,
                imageUrl,
              });
            }
          } catch { /* skip */ }
        });

        return results;
      });

      for (const np of newPosts) {
        if (np.content && !posts.some(p => p.content === np.content)) {
          posts.push({
            platform: 'youtube',
            author: np.author,
            content: np.content,
            url: np.url,
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
