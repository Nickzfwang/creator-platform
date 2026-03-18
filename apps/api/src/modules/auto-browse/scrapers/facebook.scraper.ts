import type { Page } from 'puppeteer-core';
import type { ScrapedPost } from '../auto-browse.service';

export class FacebookScraper {
  async scrape(
    page: Page,
    options: { maxPosts: number; scrollCount: number },
  ): Promise<ScrapedPost[]> {
    // Navigate to Facebook feed
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await this.delay(3000);

    const posts: ScrapedPost[] = [];

    // Scroll and collect posts
    for (let i = 0; i < options.scrollCount && posts.length < options.maxPosts; i++) {
      // Extract visible posts
      const newPosts = await page.evaluate(() => {
        const results: Array<{
          author: string;
          content: string;
          url: string;
          likes: number;
          comments: number;
          imageUrl: string;
        }> = [];

        // Facebook post containers
        const postElements = document.querySelectorAll('[role="article"]');
        postElements.forEach((post) => {
          try {
            // Get author
            const authorEl = post.querySelector('h3 a, h4 a, strong a, [data-ad-rendering-role="profile_name"] a');
            const author = authorEl?.textContent?.trim() || '';

            // Get content text
            const contentEl = post.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"], div[dir="auto"]');
            const content = contentEl?.textContent?.trim() || '';

            // Get post URL
            const timeLink = post.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
            const url = timeLink ? (timeLink as HTMLAnchorElement).href : '';

            // Get engagement counts (approximate from aria-labels)
            const likeBtn = post.querySelector('[aria-label*="讚"], [aria-label*="Like"]');
            const likesText = likeBtn?.getAttribute('aria-label') || '';
            const likesMatch = likesText.match(/(\d+)/);
            const likes = likesMatch ? parseInt(likesMatch[1]) : 0;

            const commentBtn = post.querySelector('[aria-label*="留言"], [aria-label*="comment"]');
            const commentsText = commentBtn?.getAttribute('aria-label') || '';
            const commentsMatch = commentsText.match(/(\d+)/);
            const comments = commentsMatch ? parseInt(commentsMatch[1]) : 0;

            // Get image
            const img = post.querySelector('img[src*="scontent"]');
            const imageUrl = img ? (img as HTMLImageElement).src : '';

            if (content && content.length > 15) {
              results.push({ author, content: content.slice(0, 1000), url, likes, comments, imageUrl });
            }
          } catch { /* skip problematic posts */ }
        });

        return results;
      });

      // Add new unique posts
      for (const np of newPosts) {
        if (np.content && !posts.some(p => p.content === np.content)) {
          posts.push({
            platform: 'facebook',
            author: np.author,
            content: np.content,
            url: np.url || 'https://www.facebook.com/',
            likes: np.likes,
            comments: np.comments,
            imageUrl: np.imageUrl,
          });
        }
      }

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await this.delay(2000 + Math.random() * 1000); // Random delay to look natural
    }

    return posts.slice(0, options.maxPosts);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
