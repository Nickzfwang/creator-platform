import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

interface RssSourceConfig {
  name: string;
  url: string;
  sourcePlatform: string;
  category: string;
}

const RSS_FEED_CONFIGS: RssSourceConfig[] = [
  {
    name: 'TechOrange 科技報橘',
    url: 'https://buzzorange.com/techorange/feed/',
    sourcePlatform: 'RSS_TECHORANGE',
    category: '科技',
  },
  {
    name: 'iThome',
    url: 'https://www.ithome.com.tw/rss',
    sourcePlatform: 'RSS_ITHOME',
    category: '科技',
  },
  {
    name: '數位時代',
    url: 'https://www.bnext.com.tw/rss',
    sourcePlatform: 'RSS_BNEXT',
    category: '商業科技',
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    sourcePlatform: 'RSS_TECHCRUNCH',
    category: '國際科技',
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    sourcePlatform: 'RSS_THEVERGE',
    category: '國際科技',
  },
  {
    name: 'Product Hunt',
    url: 'https://www.producthunt.com/feed',
    sourcePlatform: 'RSS_PRODUCTHUNT',
    category: '新產品',
  },
  {
    name: 'Creator Economy (Substack)',
    url: 'https://creatoreconomy.so/feed',
    sourcePlatform: 'RSS_CREATOR_ECONOMY',
    category: '創作者經濟',
  },
  {
    name: 'Reddit r/technology',
    url: 'https://www.reddit.com/r/technology/.rss',
    sourcePlatform: 'RSS_REDDIT',
    category: '國際科技',
  },
];

export class RssSource implements TrendSource {
  private readonly logger = new Logger(RssSource.name);

  readonly name: string;
  readonly sourcePlatform: string;
  private readonly url: string;
  private readonly category: string;

  constructor(config: RssSourceConfig) {
    this.name = config.name;
    this.url = config.url;
    this.sourcePlatform = config.sourcePlatform;
    this.category = config.category;
  }

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
          `${this.name} returned HTTP ${res.status}`,
        );
        return [];
      }

      const text = await res.text();
      return this.parseXml(text);
    } catch (error) {
      this.logger.warn(`Failed to fetch ${this.name}: ${error}`);
      return [];
    }
  }

  private parseXml(text: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];

    // Detect format: RSS 2.0 uses <item>, Atom uses <entry>
    const isAtom = /<feed[\s>]/.test(text) && /<entry[\s>]/.test(text);

    if (isAtom) {
      return this.parseAtom(text);
    }
    return this.parseRss(text);
  }

  private parseRss(text: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];
    const itemBlocks = text.match(/<item[\s>][\s\S]*?<\/item>/g) || [];

    for (const block of itemBlocks.slice(0, 10)) {
      const title = this.extractTag(block, 'title');
      const link = this.extractTag(block, 'link');
      const pubDate = this.extractTag(block, 'pubDate');

      if (title) {
        items.push({
          title,
          link: link || '',
          pubDate: pubDate || undefined,
          source: this.name,
          sourcePlatform: this.sourcePlatform,
        });
      }
    }

    return items;
  }

  private parseAtom(text: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];
    const entryBlocks = text.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];

    for (const block of entryBlocks.slice(0, 10)) {
      const title = this.extractTag(block, 'title');
      // Atom links are self-closing with href attribute
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

  /**
   * Extract text content from an XML tag, handling CDATA sections.
   */
  private extractTag(block: string, tag: string): string | null {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    );
    const match = block.match(regex);
    if (!match) return null;
    return (match[1] || match[2] || '').trim() || null;
  }
}

export function createRssSources(): RssSource[] {
  return RSS_FEED_CONFIGS.map((config) => new RssSource(config));
}
