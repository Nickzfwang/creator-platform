import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TwitterTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface TwitterUserInfo {
  id: string;
  username: string;
  name: string;
  profileImageUrl?: string;
  followersCount: number;
  tweetCount: number;
}

export interface TwitterTweetResult {
  tweetId: string;
  url: string;
}

/**
 * Twitter/X API v2 client
 * Uses OAuth 2.0 with PKCE for user authentication
 * Free tier: 1500 tweets/month, read-only user lookup
 */
@Injectable()
export class TwitterApiService {
  private readonly logger = new Logger(TwitterApiService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Exchange authorization code for tokens (OAuth 2.0 with PKCE)
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<TwitterTokens> {
    const clientId = this.config.get<string>('TWITTER_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('TWITTER_CLIENT_SECRET', '');

    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    });

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Twitter token exchange failed: ${error}`);
      throw new Error(`Twitter token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TwitterTokens> {
    const clientId = this.config.get<string>('TWITTER_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('TWITTER_CLIENT_SECRET', '');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Twitter token refresh failed: ${error}`);
      throw new Error(`Twitter token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
    };
  }

  /**
   * Get authenticated user info
   */
  async getUserInfo(accessToken: string): Promise<TwitterUserInfo> {
    const response = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter user info failed: ${error}`);
    }

    const { data } = await response.json();

    return {
      id: data.id,
      username: data.username,
      name: data.name,
      profileImageUrl: data.profile_image_url,
      followersCount: data.public_metrics?.followers_count ?? 0,
      tweetCount: data.public_metrics?.tweet_count ?? 0,
    };
  }

  /**
   * Post a tweet (text only)
   */
  async postTweet(
    accessToken: string,
    text: string,
  ): Promise<TwitterTweetResult> {
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Twitter post failed: ${error}`);
      throw new Error(`Twitter post failed: ${response.status}`);
    }

    const { data } = await response.json();

    this.logger.log(`Tweet posted: ${data.id}`);
    return {
      tweetId: data.id,
      url: `https://twitter.com/i/web/status/${data.id}`,
    };
  }

  /**
   * Post a tweet with media (image upload via v1.1 API)
   * Note: Media upload uses v1.1 endpoint, requires OAuth 1.0a or Bearer token
   */
  async postTweetWithMedia(
    accessToken: string,
    text: string,
    mediaBuffer: Buffer,
    mediaType: string,
  ): Promise<TwitterTweetResult> {
    // Step 1: Upload media via v1.1 media upload endpoint
    const mediaId = await this.uploadMedia(accessToken, mediaBuffer, mediaType);

    // Step 2: Create tweet with media_id
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        media: { media_ids: [mediaId] },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter tweet with media failed: ${error}`);
    }

    const { data } = await response.json();

    this.logger.log(`Tweet with media posted: ${data.id}`);
    return {
      tweetId: data.id,
      url: `https://twitter.com/i/web/status/${data.id}`,
    };
  }

  /**
   * Upload media to Twitter (v1.1 endpoint, chunked for video)
   */
  private async uploadMedia(
    accessToken: string,
    mediaBuffer: Buffer,
    mediaType: string,
  ): Promise<string> {
    // Simple upload for images < 5MB
    const formData = new FormData();
    formData.append('media_data', mediaBuffer.toString('base64'));
    formData.append('media_category', mediaType.startsWith('video') ? 'tweet_video' : 'tweet_image');

    const response = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter media upload failed: ${error}`);
    }

    const data = await response.json();
    return data.media_id_string;
  }

  /**
   * Get user's recent tweets metrics
   */
  async getRecentTweetMetrics(
    accessToken: string,
    userId: string,
    maxResults = 10,
  ): Promise<{
    tweets: Array<{ id: string; text: string; likes: number; retweets: number; replies: number; impressions: number }>;
    totalLikes: number;
    totalRetweets: number;
    engagementRate: number;
  }> {
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=public_metrics,created_at`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      this.logger.warn(`Failed to fetch tweet metrics: ${response.status}`);
      return { tweets: [], totalLikes: 0, totalRetweets: 0, engagementRate: 0 };
    }

    const { data: tweets } = await response.json();

    if (!tweets || tweets.length === 0) {
      return { tweets: [], totalLikes: 0, totalRetweets: 0, engagementRate: 0 };
    }

    const mapped = tweets.map((t: any) => ({
      id: t.id,
      text: t.text,
      likes: t.public_metrics?.like_count ?? 0,
      retweets: t.public_metrics?.retweet_count ?? 0,
      replies: t.public_metrics?.reply_count ?? 0,
      impressions: t.public_metrics?.impression_count ?? 0,
    }));

    const totalLikes = mapped.reduce((s: number, t: any) => s + t.likes, 0);
    const totalRetweets = mapped.reduce((s: number, t: any) => s + t.retweets, 0);
    const totalImpressions = mapped.reduce((s: number, t: any) => s + t.impressions, 0);

    const engagementRate = totalImpressions > 0
      ? Math.round(((totalLikes + totalRetweets) / totalImpressions) * 10000) / 100
      : 0;

    return { tweets: mapped, totalLikes, totalRetweets, engagementRate };
  }

  /**
   * Revoke token
   */
  async revokeToken(accessToken: string): Promise<void> {
    const clientId = this.config.get<string>('TWITTER_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('TWITTER_CLIENT_SECRET', '');

    try {
      await fetch('https://api.twitter.com/2/oauth2/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
          client_id: clientId,
        }).toString(),
      });
      this.logger.log('Twitter token revoked');
    } catch (e) {
      this.logger.warn(`Twitter token revocation failed: ${e}`);
    }
  }
}
