import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MetaTokens {
  accessToken: string;
  expiresAt: Date;
}

export interface MetaPageInfo {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId?: string;
  followersCount: number;
}

export interface MetaUserProfile {
  userId: string;
  name: string;
  pages: MetaPageInfo[];
}

export interface MetaPostResult {
  postId: string;
  url: string;
}

/**
 * Meta Graph API service for Facebook and Instagram
 * Handles both Facebook Page posts and Instagram Business posts
 */
@Injectable()
export class MetaApiService {
  private readonly logger = new Logger(MetaApiService.name);
  private readonly graphApiVersion = 'v21.0';

  constructor(private readonly config: ConfigService) {}

  private get graphUrl() {
    return `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  /**
   * Exchange authorization code for short-lived token, then get long-lived token
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    platform: 'FACEBOOK' | 'INSTAGRAM',
  ): Promise<MetaTokens> {
    const appId = platform === 'INSTAGRAM'
      ? this.config.get<string>('INSTAGRAM_APP_ID', '')
      : this.config.get<string>('FACEBOOK_APP_ID', '');
    const appSecret = platform === 'INSTAGRAM'
      ? this.config.get<string>('INSTAGRAM_APP_SECRET', '')
      : this.config.get<string>('FACEBOOK_APP_SECRET', '');

    // Step 1: Exchange code for short-lived token
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const shortLivedRes = await fetch(
      `${this.graphUrl}/oauth/access_token?${params.toString()}`,
    );

    if (!shortLivedRes.ok) {
      const error = await shortLivedRes.text();
      this.logger.error(`Meta token exchange failed: ${error}`);
      throw new Error(`Meta token exchange failed: ${shortLivedRes.status}`);
    }

    const shortLivedData = await shortLivedRes.json();

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedData.access_token,
    });

    const longLivedRes = await fetch(
      `${this.graphUrl}/oauth/access_token?${longLivedParams.toString()}`,
    );

    if (!longLivedRes.ok) {
      // Fall back to short-lived token
      this.logger.warn('Failed to exchange for long-lived token, using short-lived');
      return {
        accessToken: shortLivedData.access_token,
        expiresAt: new Date(Date.now() + (shortLivedData.expires_in ?? 3600) * 1000),
      };
    }

    const longLivedData = await longLivedRes.json();

    return {
      accessToken: longLivedData.access_token,
      expiresAt: new Date(Date.now() + (longLivedData.expires_in ?? 5184000) * 1000), // ~60 days
    };
  }

  /**
   * Get user profile and connected Pages
   */
  async getUserProfile(accessToken: string): Promise<MetaUserProfile> {
    // Get user info
    const userRes = await fetch(
      `${this.graphUrl}/me?fields=id,name&access_token=${accessToken}`,
    );

    if (!userRes.ok) {
      throw new Error(`Meta user profile failed: ${userRes.status}`);
    }

    const userData = await userRes.json();

    // Get connected Pages
    const pagesRes = await fetch(
      `${this.graphUrl}/me/accounts?fields=id,name,access_token,followers_count,instagram_business_account&access_token=${accessToken}`,
    );

    const pages: MetaPageInfo[] = [];
    if (pagesRes.ok) {
      const pagesData = await pagesRes.json();
      for (const page of pagesData.data ?? []) {
        pages.push({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          instagramBusinessAccountId: page.instagram_business_account?.id,
          followersCount: page.followers_count ?? 0,
        });
      }
    }

    return {
      userId: userData.id,
      name: userData.name,
      pages,
    };
  }

  /**
   * Get Instagram Business Account info
   */
  async getInstagramAccountInfo(
    accessToken: string,
    igAccountId: string,
  ): Promise<{
    id: string;
    username: string;
    followersCount: number;
    mediaCount: number;
  }> {
    const response = await fetch(
      `${this.graphUrl}/${igAccountId}?fields=id,username,followers_count,media_count&access_token=${accessToken}`,
    );

    if (!response.ok) {
      throw new Error(`Instagram account info failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      username: data.username ?? '',
      followersCount: data.followers_count ?? 0,
      mediaCount: data.media_count ?? 0,
    };
  }

  // ─── Facebook Page Publishing ───

  /**
   * Post to a Facebook Page (text + optional link)
   */
  async postToFacebookPage(
    pageAccessToken: string,
    pageId: string,
    message: string,
    link?: string,
  ): Promise<MetaPostResult> {
    const body: Record<string, string> = { message };
    if (link) body.link = link;

    const response = await fetch(`${this.graphUrl}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: pageAccessToken }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Facebook page post failed: ${error}`);
      throw new Error(`Facebook page post failed: ${response.status}`);
    }

    const data = await response.json();

    this.logger.log(`Facebook post created: ${data.id}`);
    return {
      postId: data.id,
      url: `https://www.facebook.com/${data.id}`,
    };
  }

  /**
   * Post photo to Facebook Page
   */
  async postPhotoToFacebookPage(
    pageAccessToken: string,
    pageId: string,
    message: string,
    imageUrl: string,
  ): Promise<MetaPostResult> {
    const response = await fetch(`${this.graphUrl}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        url: imageUrl,
        access_token: pageAccessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook photo post failed: ${error}`);
    }

    const data = await response.json();

    return {
      postId: data.id,
      url: `https://www.facebook.com/${data.id}`,
    };
  }

  // ─── Instagram Publishing (Content Publishing API) ───

  /**
   * Publish to Instagram (image post)
   * Two-step process: 1. Create container → 2. Publish container
   */
  async postToInstagram(
    accessToken: string,
    igAccountId: string,
    imageUrl: string,
    caption: string,
  ): Promise<MetaPostResult> {
    // Step 1: Create media container
    const containerRes = await fetch(
      `${this.graphUrl}/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      },
    );

    if (!containerRes.ok) {
      const error = await containerRes.text();
      throw new Error(`Instagram container creation failed: ${error}`);
    }

    const containerData = await containerRes.json();
    const containerId = containerData.id;

    // Step 2: Publish container
    const publishRes = await fetch(
      `${this.graphUrl}/${igAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const error = await publishRes.text();
      throw new Error(`Instagram publish failed: ${error}`);
    }

    const publishData = await publishRes.json();

    this.logger.log(`Instagram post published: ${publishData.id}`);
    return {
      postId: publishData.id,
      url: `https://www.instagram.com/p/${publishData.id}/`,
    };
  }

  /**
   * Publish Reel to Instagram (video)
   */
  async postReelToInstagram(
    accessToken: string,
    igAccountId: string,
    videoUrl: string,
    caption: string,
  ): Promise<MetaPostResult> {
    // Step 1: Create video container
    const containerRes = await fetch(
      `${this.graphUrl}/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          caption,
          media_type: 'REELS',
          access_token: accessToken,
        }),
      },
    );

    if (!containerRes.ok) {
      const error = await containerRes.text();
      throw new Error(`Instagram Reel container creation failed: ${error}`);
    }

    const containerData = await containerRes.json();
    const containerId = containerData.id;

    // Step 2: Wait for video processing (poll status)
    await this.waitForMediaProcessing(accessToken, containerId);

    // Step 3: Publish
    const publishRes = await fetch(
      `${this.graphUrl}/${igAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const error = await publishRes.text();
      throw new Error(`Instagram Reel publish failed: ${error}`);
    }

    const publishData = await publishRes.json();

    this.logger.log(`Instagram Reel published: ${publishData.id}`);
    return {
      postId: publishData.id,
      url: `https://www.instagram.com/reel/${publishData.id}/`,
    };
  }

  /**
   * Poll for media container processing status
   */
  private async waitForMediaProcessing(
    accessToken: string,
    containerId: string,
    maxAttempts = 30,
    intervalMs = 5000,
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(
        `${this.graphUrl}/${containerId}?fields=status_code&access_token=${accessToken}`,
      );

      if (res.ok) {
        const data = await res.json();
        if (data.status_code === 'FINISHED') return;
        if (data.status_code === 'ERROR') {
          throw new Error('Instagram media processing failed');
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error('Instagram media processing timed out');
  }

  // ─── Metrics ───

  /**
   * Get Facebook Page insights
   */
  async getPageInsights(
    pageAccessToken: string,
    pageId: string,
  ): Promise<{
    followers: number;
    totalReach: number;
    engagementRate: number;
  }> {
    const response = await fetch(
      `${this.graphUrl}/${pageId}?fields=followers_count,fan_count&access_token=${pageAccessToken}`,
    );

    if (!response.ok) {
      return { followers: 0, totalReach: 0, engagementRate: 0 };
    }

    const data = await response.json();

    return {
      followers: data.followers_count ?? data.fan_count ?? 0,
      totalReach: 0, // Requires page_insights permission
      engagementRate: 0,
    };
  }

  /**
   * Get Instagram account metrics
   */
  async getInstagramMetrics(
    accessToken: string,
    igAccountId: string,
  ): Promise<{
    followers: number;
    mediaCount: number;
    engagementRate: number;
    recentMedia: Array<{ id: string; caption: string; likeCount: number; commentsCount: number }>;
  }> {
    // Get account info
    const accountRes = await fetch(
      `${this.graphUrl}/${igAccountId}?fields=followers_count,media_count&access_token=${accessToken}`,
    );

    let followers = 0;
    let mediaCount = 0;
    if (accountRes.ok) {
      const data = await accountRes.json();
      followers = data.followers_count ?? 0;
      mediaCount = data.media_count ?? 0;
    }

    // Get recent media with metrics
    const mediaRes = await fetch(
      `${this.graphUrl}/${igAccountId}/media?fields=id,caption,like_count,comments_count,media_type&limit=10&access_token=${accessToken}`,
    );

    const recentMedia: Array<{ id: string; caption: string; likeCount: number; commentsCount: number }> = [];
    let totalLikes = 0;
    let totalComments = 0;

    if (mediaRes.ok) {
      const mediaData = await mediaRes.json();
      for (const m of mediaData.data ?? []) {
        const likes = m.like_count ?? 0;
        const comments = m.comments_count ?? 0;
        totalLikes += likes;
        totalComments += comments;
        recentMedia.push({
          id: m.id,
          caption: m.caption ?? '',
          likeCount: likes,
          commentsCount: comments,
        });
      }
    }

    const engagementRate = followers > 0 && recentMedia.length > 0
      ? Math.round(((totalLikes + totalComments) / (followers * recentMedia.length)) * 10000) / 100
      : 0;

    return { followers, mediaCount, engagementRate, recentMedia };
  }

  /**
   * Revoke access token
   */
  async revokeToken(accessToken: string): Promise<void> {
    try {
      await fetch(
        `${this.graphUrl}/me/permissions?access_token=${accessToken}`,
        { method: 'DELETE' },
      );
      this.logger.log('Meta token revoked');
    } catch (e) {
      this.logger.warn(`Meta token revocation failed: ${e}`);
    }
  }
}
