import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

/**
 * Fetches latest updates from Claude Code documentation.
 * Scrapes the overview/changelog page for new feature announcements.
 */
export class ClaudeCodeDocsSource implements TrendSource {
  private readonly logger = new Logger(ClaudeCodeDocsSource.name);

  readonly name = 'Claude Code Docs';
  readonly sourcePlatform = 'RSS_CLAUDE_CODE';

  private readonly urls = [
    'https://code.claude.com/docs/en/overview',
    'https://code.claude.com/docs/en/changelog',
  ];

  async fetch(): Promise<RssFeedItem[]> {
    const items: RssFeedItem[] = [];

    for (const url of this.urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CreatorPlatform/1.0',
            Accept: 'text/html',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          this.logger.warn(`Claude Code docs returned HTTP ${res.status} for ${url}`);
          continue;
        }

        const html = await res.text();
        const parsed = this.parseHtml(html, url);
        items.push(...parsed);
      } catch (error) {
        this.logger.warn(`Failed to fetch Claude Code docs (${url}): ${error}`);
      }
    }

    return items.slice(0, 10);
  }

  private parseHtml(html: string, pageUrl: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];

    // Extract headings (h1, h2, h3) as topic entries
    const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(html)) !== null) {
      const raw = match[1]
        .replace(/<[^>]+>/g, '') // strip inner HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();

      // Skip generic headings
      if (
        !raw ||
        raw.length < 5 ||
        raw.length > 200 ||
        /^(overview|table of contents|navigation|menu|footer)/i.test(raw)
      ) {
        continue;
      }

      items.push({
        title: `[Claude Code] ${raw}`,
        link: pageUrl,
        source: this.name,
        sourcePlatform: this.sourcePlatform,
      });
    }

    return items;
  }
}
