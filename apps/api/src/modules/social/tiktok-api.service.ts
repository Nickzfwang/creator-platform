import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TikTokTokens {
  accessToken: string;
  refreshToken?: string;
  openId: string;
  expiresAt: Date;
  refreshExpiresAt?: Date;
}

export interface TikTokUserInfo {
  openId: string;
  displayName: string;
  avatarUrl?: string;
  followerCount: number;
  videoCount: number;
}

export interface TikTokUploadResult {
  publishId: string;
  status: string;
}

/**
 * TikTok Content Posting API v2 client
 * Uses OAuth 2.0 for user authorization
 */
@Injectable()
export class TikTokApiService {
  private readonly logger = new Logger(TikTokApiService.name);
  private readonly baseUrl = 'https://open.tiktokapis.com/v2';

  constructor(private readonly config: ConfigService) {}

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<TikTokTokens> {
    const clientKey = this.config.get<string>('TIKTOK_CLIENT_KEY', '');
    const clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET', '');

    const response = await fetch(`${this.baseUrl}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`TikTok token exchange failed: ${error}`);
      throw new Error(`TikTok token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`TikTok OAuth error: ${data.error_description ?? data.error}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      openId: data.open_id,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
      refreshExpiresAt: data.refresh_expires_in
        ? new Date(Date.now() + data.refresh_expires_in * 1000)
        : undefined,
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
    const clientKey = this.config.get<string>('TIKTOK_CLIENT_KEY', '');
    const clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET', '');

    const response = await fetch(`${this.baseUrl}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      openId: data.open_id,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    };
  }

  /**
   * Get user info
   */
  async getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
    const response = await fetch(
      `${this.baseUrl}/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok user info failed: ${error}`);
    }

    const result = await response.json();
    const user = result.data?.user;

    if (!user) {
      throw new Error('TikTok user data not found');
    }

    return {
      openId: user.open_id,
      displayName: user.display_name ?? '',
      avatarUrl: user.avatar_url,
      followerCount: user.follower_count ?? 0,
      videoCount: user.video_count ?? 0,
    };
  }

  /**
   * Upload video to TikTok using direct post (pull from URL)
   * This is the simplest approach — TikTok downloads video from our URL
   */
  async uploadVideoByUrl(
    accessToken: string,
    videoUrl: string,
    options?: {
      title?: string;
      privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
    },
  ): Promise<TikTokUploadResult> {
    const response = await fetch(`${this.baseUrl}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: options?.title ?? '',
          privacy_level: options?.privacyLevel ?? 'SELF_ONLY',
          disable_comment: options?.disableComment ?? false,
          disable_duet: options?.disableDuet ?? false,
          disable_stitch: options?.disableStitch ?? false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`TikTok video upload failed: ${error}`);
      throw new Error(`TikTok video upload failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.error?.code !== 'ok' && result.error?.code) {
      throw new Error(`TikTok upload error: ${result.error.message ?? result.error.code}`);
    }

    this.logger.log(`TikTok video publish initiated: ${result.data?.publish_id}`);
    return {
      publishId: result.data?.publish_id ?? '',
      status: 'PROCESSING',
    };
  }

  /**
   * Check video publish status
   */
  async checkPublishStatus(
    accessToken: string,
    publishId: string,
  ): Promise<{ status: string; videoId?: string }> {
    const response = await fetch(`${this.baseUrl}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    if (!response.ok) {
      return { status: 'UNKNOWN' };
    }

    const result = await response.json();

    return {
      status: result.data?.status ?? 'UNKNOWN',
      videoId: result.data?.publicaly_available_post_id?.[0],
    };
  }

  /**
   * Get user's video list with metrics
   */
  async getVideoList(
    accessToken: string,
    maxCount = 10,
  ): Promise<{
    videos: Array<{ id: string; title: string; views: number; likes: number; comments: number; shares: number }>;
    totalViews: number;
    engagementRate: number;
  }> {
    const response = await fetch(`${this.baseUrl}/video/list/?fields=id,title,view_count,like_count,comment_count,share_count`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ max_count: maxCount }),
    });

    if (!response.ok) {
      this.logger.warn(`TikTok video list failed: ${response.status}`);
      return { videos: [], totalViews: 0, engagementRate: 0 };
    }

    const result = await response.json();
    const videoList = result.data?.videos ?? [];

    const videos = videoList.map((v: any) => ({
      id: v.id,
      title: v.title ?? '',
      views: v.view_count ?? 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
    }));

    const totalViews = videos.reduce((s: number, v: any) => s + v.views, 0);
    const totalEngagement = videos.reduce((s: number, v: any) => s + v.likes + v.comments + v.shares, 0);

    const engagementRate = totalViews > 0
      ? Math.round((totalEngagement / totalViews) * 10000) / 100
      : 0;

    return { videos, totalViews, engagementRate };
  }

  /**
   * Revoke token
   */
  async revokeToken(accessToken: string): Promise<void> {
    const clientKey = this.config.get<string>('TIKTOK_CLIENT_KEY', '');
    const clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET', '');

    try {
      await fetch(`${this.baseUrl}/oauth/revoke/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: accessToken,
        }).toString(),
      });
      this.logger.log('TikTok token revoked');
    } catch (e) {
      this.logger.warn(`TikTok token revocation failed: ${e}`);
    }
  }
}
