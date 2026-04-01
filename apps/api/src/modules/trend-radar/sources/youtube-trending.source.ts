import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

export class YouTubeTrendingSource implements TrendSource {
  private readonly logger = new Logger(YouTubeTrendingSource.name);

  readonly name = 'YouTube Trending TW';
  readonly sourcePlatform = 'API_YOUTUBE_TRENDING';

  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY;
  }

  async fetch(): Promise<RssFeedItem[]> {
    // Prefer YouTube Data API v3 if key is available
    if (this.apiKey) {
      return this.fetchFromApi();
    }

    // Fallback: aggregate popular TW tech channels via RSS
    this.logger.warn('YOUTUBE_API_KEY not set, falling back to channel RSS feeds');
    return this.fetchFromChannelRss();
  }

  private async fetchFromApi(): Promise<RssFeedItem[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=TW&maxResults=15&key=${this.apiKey}`;
      const res = await fetch(url, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`YouTube Data API returned HTTP ${res.status}`);
        return this.fetchFromChannelRss();
      }

      const data = await res.json();
      const items: RssFeedItem[] = (data.items ?? []).map((item: any) => ({
        title: item.snippet?.title || '',
        link: `https://www.youtube.com/watch?v=${item.id}`,
        pubDate: item.snippet?.publishedAt || undefined,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      }));

      if (items.length === 0) {
        this.logger.warn('YouTube Data API returned 0 items, falling back to channel RSS');
        return this.fetchFromChannelRss();
      }

      return items;
    } catch (error) {
      this.logger.warn(`Failed to fetch from YouTube Data API: ${error}`);
      return this.fetchFromChannelRss();
    }
  }

  /**
   * Fallback: fetch latest videos from popular TW YouTube channels via RSS.
   * YouTube per-channel RSS still works: /feeds/videos.xml?channel_id=...
   */
  private async fetchFromChannelRss(): Promise<RssFeedItem[]> {
    // Popular TW tech/creator channels
    const channels = [
      { id: 'UCupvZG-5ko_eiXAupbDfxWw', name: 'CNN' },          // well-known channel
      { id: 'UC2pmfLm7iq6Ov1UwYrWYkZA', name: 'Tech' },
      { id: 'UCVHFbqXqoYvEWM1Ddxl0QDg', name: 'News' },
    ];

    const allItems: RssFeedItem[] = [];

    for (const ch of channels) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'CreatorPlatform/1.0 (RSS Reader)' },
          },
        );
        clearTimeout(timeout);

        if (!res.ok) continue;

        const text = await res.text();
        const items = this.parseAtom(text);
        allItems.push(...items.slice(0, 5));
      } catch {
        // skip failed channels
      }
    }

    return allItems;
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
