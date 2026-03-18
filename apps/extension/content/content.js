// Content script - extracts content from social media pages
(function () {
  'use strict';

  // Detect which platform we're on
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('threads.net')) return 'threads';
    if (host.includes('youtube.com')) return 'youtube';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('dcard.tw')) return 'dcard';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    return 'unknown';
  }

  // Extract content based on platform
  function extractContent() {
    const platform = detectPlatform();
    const url = window.location.href;
    let title = document.title;
    let content = '';
    let author = '';
    let imageUrl = '';

    switch (platform) {
      case 'youtube': {
        // YouTube video page
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title');
        title = titleEl?.textContent?.trim() || title;
        const descEl = document.querySelector('#description-text, ytd-text-inline-expander');
        content = descEl?.textContent?.trim()?.slice(0, 1000) || '';
        const channelEl = document.querySelector('#channel-name a, ytd-channel-name a');
        author = channelEl?.textContent?.trim() || '';
        const thumbMeta = document.querySelector('meta[property="og:image"]');
        imageUrl = thumbMeta?.getAttribute('content') || '';
        break;
      }
      case 'facebook': {
        // Facebook post
        const postEl = document.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
        content = postEl?.textContent?.trim()?.slice(0, 1000) || '';
        if (!content) {
          // Fallback: get main content area text
          const mainContent = document.querySelector('[role="main"]');
          content = mainContent?.textContent?.trim()?.slice(0, 1000) || '';
        }
        const authorEl = document.querySelector('h2 a[role="link"] span, strong a');
        author = authorEl?.textContent?.trim() || '';
        break;
      }
      case 'threads': {
        const postEl = document.querySelector('[data-pressable-container] div[dir="auto"]');
        content = postEl?.textContent?.trim()?.slice(0, 1000) || '';
        if (!content) {
          const allText = document.querySelectorAll('div[dir="auto"]');
          const texts = Array.from(allText).map(el => el.textContent?.trim()).filter(t => t && t.length > 20);
          content = texts.slice(0, 3).join('\n\n');
        }
        break;
      }
      case 'dcard': {
        const titleEl = document.querySelector('h1, article h2');
        title = titleEl?.textContent?.trim() || title;
        const contentEl = document.querySelector('article .post-content, .PostContent_content__*, [class*="PostContent"]');
        content = contentEl?.textContent?.trim()?.slice(0, 1000) || '';
        if (!content) {
          const articleEl = document.querySelector('article');
          content = articleEl?.textContent?.trim()?.slice(0, 1000) || '';
        }
        const authorEl = document.querySelector('.author, [class*="Author"]');
        author = authorEl?.textContent?.trim() || '';
        break;
      }
      case 'twitter': {
        const tweetEl = document.querySelector('[data-testid="tweetText"]');
        content = tweetEl?.textContent?.trim()?.slice(0, 1000) || '';
        const userEl = document.querySelector('[data-testid="User-Name"] span');
        author = userEl?.textContent?.trim() || '';
        break;
      }
      case 'instagram': {
        const captionEl = document.querySelector('h1, span[dir="auto"]');
        content = captionEl?.textContent?.trim()?.slice(0, 1000) || '';
        break;
      }
      default: {
        // Generic extraction
        const articleEl = document.querySelector('article') || document.querySelector('main');
        content = articleEl?.textContent?.trim()?.slice(0, 1000) || document.body.innerText.slice(0, 1000);
      }
    }

    // Fallback: use meta tags
    if (!content || content.length < 20) {
      const descMeta = document.querySelector('meta[name="description"], meta[property="og:description"]');
      content = descMeta?.getAttribute('content') || content;
    }
    if (!imageUrl) {
      const imgMeta = document.querySelector('meta[property="og:image"]');
      imageUrl = imgMeta?.getAttribute('content') || '';
    }

    return {
      platform,
      url,
      title: title.slice(0, 200),
      content: content.slice(0, 2000),
      author,
      imageUrl,
      extractedAt: new Date().toISOString(),
    };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      const data = extractContent();
      sendResponse(data);
    }
    return true; // Keep channel open for async response
  });
})();
