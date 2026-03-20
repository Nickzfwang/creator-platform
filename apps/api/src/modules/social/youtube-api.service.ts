import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface YouTubeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
}

export interface YouTubeChannelStats {
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  status: string;
}

@Injectable()
export class YouTubeApiService {
  private readonly logger = new Logger(YouTubeApiService.name);

  constructor(private readonly config: ConfigService) {}

  private createOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.get('YOUTUBE_CLIENT_ID'),
      this.config.get('YOUTUBE_CLIENT_SECRET'),
    );
  }

  private getYouTubeClient(accessToken: string): youtube_v3.Youtube {
    const auth = this.createOAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    return google.youtube({ version: 'v3', auth });
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<YouTubeTokens> {
    const oauth2 = new google.auth.OAuth2(
      this.config.get('YOUTUBE_CLIENT_ID'),
      this.config.get('YOUTUBE_CLIENT_SECRET'),
      redirectUri,
    );

    const { tokens } = await oauth2.getToken(code);

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<YouTubeTokens> {
    const oauth2 = this.createOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2.refreshAccessToken();

    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: new Date(
        credentials.expiry_date ?? Date.now() + 3600 * 1000,
      ),
    };
  }

  async getChannelInfo(accessToken: string): Promise<YouTubeChannelInfo> {
    const youtube = this.getYouTubeClient(accessToken);

    const res = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel) {
      throw new Error('No YouTube channel found for this account');
    }

    return {
      channelId: channel.id!,
      title: channel.snippet?.title ?? '',
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? undefined,
      subscriberCount: Number(channel.statistics?.subscriberCount ?? 0),
    };
  }

  async getChannelStats(accessToken: string): Promise<YouTubeChannelStats> {
    const youtube = this.getYouTubeClient(accessToken);

    const res = await youtube.channels.list({
      part: ['statistics'],
      mine: true,
    });

    const stats = res.data.items?.[0]?.statistics;
    if (!stats) {
      throw new Error('Failed to fetch YouTube channel statistics');
    }

    return {
      subscriberCount: Number(stats.subscriberCount ?? 0),
      viewCount: Number(stats.viewCount ?? 0),
      videoCount: Number(stats.videoCount ?? 0),
    };
  }

  async uploadVideo(
    accessToken: string,
    fileStream: Readable,
    metadata: {
      title: string;
      description?: string;
      tags?: string[];
      privacyStatus?: 'private' | 'unlisted' | 'public';
      categoryId?: string;
    },
  ): Promise<YouTubeUploadResult> {
    const youtube = this.getYouTubeClient(accessToken);

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description ?? '',
          tags: metadata.tags,
          categoryId: metadata.categoryId ?? '22', // People & Blogs
        },
        status: {
          privacyStatus: metadata.privacyStatus ?? 'private',
        },
      },
      media: {
        body: fileStream,
      },
    });

    const videoId = res.data.id!;

    this.logger.log(`Video uploaded successfully: ${videoId}`);

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      status: res.data.status?.uploadStatus ?? 'uploaded',
    };
  }

  async revokeToken(token: string): Promise<void> {
    const oauth2 = this.createOAuth2Client();
    try {
      await oauth2.revokeToken(token);
      this.logger.log('YouTube token revoked successfully');
    } catch (error) {
      this.logger.warn('Failed to revoke YouTube token', error);
    }
  }
}
