import { Logger } from '@nestjs/common';
import { RssFeedItem, TrendSource } from './base-source';

/**
 * Fetches latest Claude Code releases from GitHub API.
 * Extracts changelog entries as trend items.
 */
export class ClaudeCodeDocsSource implements TrendSource {
  private readonly logger = new Logger(ClaudeCodeDocsSource.name);

  readonly name = 'Claude Code Docs';
  readonly sourcePlatform = 'RSS_CLAUDE_CODE';

  private readonly url =
    'https://api.github.com/repos/anthropics/claude-code/releases?per_page=5';

  async fetch(): Promise<RssFeedItem[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CreatorPlatform/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`GitHub API returned HTTP ${res.status}`);
        return [];
      }

      const releases: Array<{
        tag_name: string;
        name: string;
        body: string;
        html_url: string;
        published_at: string;
      }> = await res.json();

      if (!Array.isArray(releases) || releases.length === 0) {
        this.logger.warn('GitHub releases returned empty');
        return [];
      }

      const items: RssFeedItem[] = [];

      for (const release of releases) {
        // Extract bullet points from release body
        const bullets = (release.body || '')
          .split('\n')
          .filter(line => line.trim().startsWith('- '))
          .map(line => line.replace(/^-\s+/, '').trim())
          .filter(line => line.length > 10 && line.length < 300);

        if (bullets.length > 0) {
          // Create one item per significant changelog entry
          for (const bullet of bullets.slice(0, 3)) {
            items.push({
              title: `[Claude Code ${release.tag_name}] ${bullet}`,
              link: release.html_url,
              pubDate: release.published_at,
              source: this.name,
              sourcePlatform: this.sourcePlatform,
            });
          }
        } else {
          // Fallback: use release title
          items.push({
            title: `Claude Code ${release.tag_name} released`,
            link: release.html_url,
            pubDate: release.published_at,
            source: this.name,
            sourcePlatform: this.sourcePlatform,
          });
        }
      }

      return items.slice(0, 10);
    } catch (error) {
      this.logger.warn(`Failed to fetch Claude Code releases: ${error}`);
      return [];
    }
  }
}
