import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

/**
 * Dcard popular posts source.
 * Primary: direct API (fast, no browser needed).
 * Fallback: tries with browser-like headers if API is blocked by Cloudflare.
 */
export class DcardApiSource implements TrendSource {
  private readonly logger = new Logger(DcardApiSource.name);

  readonly name = 'Dcard 熱門';
  readonly sourcePlatform = 'API_DCARD';

  private readonly url =
    'https://www.dcard.tw/service/api/v2/posts?popular=true&limit=15';

  async fetch(): Promise<RssFeedItem[]> {
    // Try with browser-like headers to avoid Cloudflare block
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
          Referer: 'https://www.dcard.tw/',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`Dcard API returned HTTP ${res.status}`);
        return this.fetchFromDcardForum();
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        this.logger.warn('Dcard API returned non-JSON (likely Cloudflare block)');
        return this.fetchFromDcardForum();
      }

      const posts = await res.json();

      if (!Array.isArray(posts)) {
        this.logger.warn('Dcard API returned non-array response');
        return this.fetchFromDcardForum();
      }

      return posts.slice(0, 10).map((post: any) => ({
        title: post.title || '',
        link: `https://www.dcard.tw/f/${post.forumAlias}/p/${post.id}`,
        pubDate: post.createdAt || undefined,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));
    } catch (error) {
      this.logger.warn(`Failed to fetch Dcard API: ${error}`);
      return this.fetchFromDcardForum();
    }
  }

  /**
   * Fallback: try specific forum APIs which may be less aggressively blocked.
   */
  private async fetchFromDcardForum(): Promise<RssFeedItem[]> {
    const forums = ['trending', 'talk', 'mood'];
    const allItems: RssFeedItem[] = [];

    for (const forum of forums) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const url = `https://www.dcard.tw/service/api/v2/forums/${forum}/posts?limit=5`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
            Referer: 'https://www.dcard.tw/',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) continue;

        const posts = await res.json();
        if (!Array.isArray(posts)) continue;

        for (const post of posts.slice(0, 5)) {
          allItems.push({
            title: post.title || '',
            link: `https://www.dcard.tw/f/${post.forumAlias || forum}/p/${post.id}`,
            pubDate: post.createdAt || undefined,
            source: this.name,
            sourcePlatform: this.sourcePlatform,
          });
        }
      } catch {
        // skip failed forum
      }
    }

    if (allItems.length === 0) {
      this.logger.warn('All Dcard API endpoints blocked — Dcard data unavailable');
    }

    return allItems;
  }
}
