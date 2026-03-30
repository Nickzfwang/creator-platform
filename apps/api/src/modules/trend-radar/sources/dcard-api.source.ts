import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

export class DcardApiSource implements TrendSource {
  private readonly logger = new Logger(DcardApiSource.name);

  readonly name = 'Dcard 熱門';
  readonly sourcePlatform = 'API_DCARD';

  private readonly url =
    'https://www.dcard.tw/service/api/v2/posts?popular=true&limit=15';

  async fetch(): Promise<RssFeedItem[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CreatorPlatform/1.0 (RSS Reader)' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`Dcard API returned HTTP ${res.status}`);
        return [];
      }

      const posts = await res.json();

      if (!Array.isArray(posts)) {
        this.logger.warn('Dcard API returned non-array response');
        return [];
      }

      return posts.slice(0, 10).map((post: any) => ({
        title: post.title || '',
        link: `https://www.dcard.tw/f/${post.forumAlias}/p/${post.id}`,
        pubDate: post.createdAt || undefined,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));
    } catch (error) {
      this.logger.warn(`Failed to fetch Dcard: ${error}`);
      return [];
    }
  }
}
