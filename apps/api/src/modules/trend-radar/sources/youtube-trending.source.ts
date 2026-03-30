import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

export class YouTubeTrendingSource implements TrendSource {
  private readonly logger = new Logger(YouTubeTrendingSource.name);

  readonly name = 'YouTube Trending TW';
  readonly sourcePlatform = 'API_YOUTUBE_TRENDING';

  private readonly url =
    'https://www.youtube.com/feeds/videos.xml?chart=trending&gl=TW';

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
        this.logger.warn(
          `YouTube Trending returned HTTP ${res.status}`,
        );
        return [];
      }

      const text = await res.text();
      return this.parseAtom(text);
    } catch (error) {
      this.logger.warn(`Failed to fetch YouTube Trending: ${error}`);
      return [];
    }
  }

  private parseAtom(text: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];
    const entryBlocks = text.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];

    for (const block of entryBlocks.slice(0, 15)) {
      const title = this.extractTag(block, 'title');
      const linkMatch = block.match(
        /<link[^>]*href="([^"]*)"[^>]*\/?>|<link[^>]*>(.*?)<\/link>/,
      );
      const link = linkMatch ? (linkMatch[1] || linkMatch[2] || '') : '';
      const published =
        this.extractTag(block, 'published') ||
        this.extractTag(block, 'updated');

      if (title) {
        items.push({
          title,
          link,
          pubDate: published || undefined,
          source: this.name,
          sourcePlatform: this.sourcePlatform,
        });
      }
    }

    return items;
  }

  private extractTag(block: string, tag: string): string | null {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    );
    const match = block.match(regex);
    if (!match) return null;
    return (match[1] || match[2] || '').trim() || null;
  }
}
