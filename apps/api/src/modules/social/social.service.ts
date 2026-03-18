import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialPlatform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
}

const PLATFORM_CONFIGS: Record<string, Partial<OAuthConfig> & { scopes: string[]; authUrl: string; tokenUrl: string }> = {
  YOUTUBE: {
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  },
  INSTAGRAM: {
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
  },
  TIKTOK: {
    scopes: ['user.info.basic', 'video.publish', 'video.list'],
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  },
  FACEBOOK: {
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'public_profile'],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
  },
  TWITTER: {
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
  },
  THREADS: {
    scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_insights'],
    authUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
  },
};

const SOCIAL_ACCOUNT_PUBLIC_SELECT = {
  id: true,
  platform: true,
  platformUsername: true,
  platformUserId: true,
  followerCount: true,
  isActive: true,
  scopes: true,
  lastSyncedAt: true,
  tokenExpiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  getConnectUrl(platform: SocialPlatform, userId: string, tenantId: string): string {
    const platformConfig = PLATFORM_CONFIGS[platform];
    if (!platformConfig) {
      throw new BadRequestException(`Platform ${platform} is not supported yet`);
    }

    const oauthConfig = this.getOAuthConfig(platform);

    // State contains user context for the callback
    const state = Buffer.from(
      JSON.stringify({ userId, tenantId, platform, ts: Date.now() }),
    ).toString('base64url');

    // TODO: Store state in Redis with 10-minute TTL for CSRF protection
    // await this.redis.set(`oauth:state:${state}`, '1', 'EX', 600);

    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      response_type: 'code',
      scope: platformConfig.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${platformConfig.authUrl}?${params.toString()}`;
  }

  async handleCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
  ) {
    // Decode state to get user context
    let stateData: { userId: string; tenantId: string; platform: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      throw new BadRequestException('Invalid OAuth state parameter');
    }

    if (stateData.platform !== platform) {
      throw new BadRequestException('Platform mismatch in OAuth state');
    }

    // TODO: Verify state exists in Redis and delete it (prevent replay)
    // const exists = await this.redis.del(`oauth:state:${state}`);
    // if (!exists) throw new BadRequestException('OAuth state expired or already used');

    // TODO: Exchange authorization code for tokens
    // const tokens = await this.exchangeCodeForTokens(platform, code);
    // const profile = await this.fetchPlatformProfile(platform, tokens.accessToken);

    // Placeholder — will be replaced when platform APIs are integrated
    const tokens = {
      accessToken: `placeholder_access_${code}`,
      refreshToken: `placeholder_refresh_${code}`,
      expiresIn: 3600,
    };
    const profile = {
      platformUserId: `user_${Date.now()}`,
      platformUsername: `@connected_${platform.toLowerCase()}`,
      followerCount: 0,
    };

    // Encrypt tokens before storage
    const encryptedAccessToken = this.encryption.encrypt(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken
      ? this.encryption.encrypt(tokens.refreshToken)
      : null;

    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    // Upsert social account
    const account = await this.prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: stateData.userId,
          platform,
          platformUserId: profile.platformUserId,
        },
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        platformUsername: profile.platformUsername,
        followerCount: profile.followerCount,
        isActive: true,
        scopes: PLATFORM_CONFIGS[platform]?.scopes ?? [],
        lastSyncedAt: new Date(),
      },
      create: {
        userId: stateData.userId,
        tenantId: stateData.tenantId,
        platform,
        platformUserId: profile.platformUserId,
        platformUsername: profile.platformUsername,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        followerCount: profile.followerCount,
        isActive: true,
        scopes: PLATFORM_CONFIGS[platform]?.scopes ?? [],
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Social account ${platform} connected for user ${stateData.userId}`);
    return account.id;
  }

  async getAccounts(userId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      select: SOCIAL_ACCOUNT_PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return {
      data: accounts.map((account) => ({
        ...account,
        tokenStatus: this.computeTokenStatus(account.tokenExpiresAt),
        tokenExpiresAt: undefined, // don't expose raw timestamp
      })),
    };
  }

  async disconnectAccount(accountId: string, userId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { id: true, userId: true, platform: true, accessToken: true },
    });

    if (!account) {
      throw new NotFoundException('Social account not found');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('Not the account owner');
    }

    // TODO: Best-effort revoke platform token
    // try {
    //   const token = this.encryption.decrypt(account.accessToken);
    //   await this.revokePlatformToken(account.platform, token);
    // } catch (e) { this.logger.warn(`Failed to revoke ${account.platform} token`); }

    await this.prisma.socialAccount.delete({ where: { id: accountId } });

    this.logger.log(`Social account ${accountId} (${account.platform}) disconnected`);
  }

  async refreshAccountToken(accountId: string, userId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true, userId: true, platform: true,
        accessToken: true, refreshToken: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Social account not found');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('Not the account owner');
    }
    if (!account.refreshToken) {
      throw new BadRequestException('No refresh token available for this account');
    }

    // TODO: Use refresh token to get new access token from platform API
    // const refreshToken = this.encryption.decrypt(account.refreshToken);
    // const newTokens = await this.refreshPlatformToken(account.platform, refreshToken);

    // Placeholder
    const newAccessToken = `refreshed_${Date.now()}`;
    const newExpiresAt = new Date(Date.now() + 3600 * 1000);

    const encryptedToken = this.encryption.encrypt(newAccessToken);

    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encryptedToken,
        tokenExpiresAt: newExpiresAt,
      },
    });

    this.logger.log(`Token refreshed for social account ${accountId}`);

    return {
      id: accountId,
      tokenStatus: 'valid' as const,
      tokenExpiresAt: newExpiresAt.toISOString(),
    };
  }

  private computeTokenStatus(
    tokenExpiresAt: Date | null,
  ): 'valid' | 'expiring_soon' | 'expired' {
    if (!tokenExpiresAt) return 'valid'; // no expiry info = assume valid
    const now = Date.now();
    const expiresMs = tokenExpiresAt.getTime();
    if (expiresMs < now) return 'expired';
    if (expiresMs < now + 60 * 60 * 1000) return 'expiring_soon'; // < 1hr
    return 'valid';
  }

  private getOAuthConfig(platform: SocialPlatform): OAuthConfig {
    const baseUrl = this.config.get<string>('API_BASE_URL', 'http://localhost:4000');
    const platformConfig = PLATFORM_CONFIGS[platform];

    if (!platformConfig) {
      throw new BadRequestException(`Platform ${platform} is not supported`);
    }

    switch (platform) {
      case SocialPlatform.YOUTUBE:
        return {
          clientId: this.config.get<string>('YOUTUBE_CLIENT_ID', ''),
          clientSecret: this.config.get<string>('YOUTUBE_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/YOUTUBE`,
          ...platformConfig,
        };
      case SocialPlatform.INSTAGRAM:
        return {
          clientId: this.config.get<string>('INSTAGRAM_APP_ID', ''),
          clientSecret: this.config.get<string>('INSTAGRAM_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/INSTAGRAM`,
          ...platformConfig,
        };
      case SocialPlatform.TIKTOK:
        return {
          clientId: this.config.get<string>('TIKTOK_CLIENT_KEY', ''),
          clientSecret: this.config.get<string>('TIKTOK_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/TIKTOK`,
          ...platformConfig,
        };
      case SocialPlatform.FACEBOOK:
        return {
          clientId: this.config.get<string>('FACEBOOK_APP_ID', ''),
          clientSecret: this.config.get<string>('FACEBOOK_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/FACEBOOK`,
          ...platformConfig,
        };
      case SocialPlatform.TWITTER:
        return {
          clientId: this.config.get<string>('TWITTER_CLIENT_ID', ''),
          clientSecret: this.config.get<string>('TWITTER_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/TWITTER`,
          ...platformConfig,
        };
      case SocialPlatform.THREADS:
        return {
          clientId: this.config.get<string>('THREADS_APP_ID', ''),
          clientSecret: this.config.get<string>('THREADS_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/THREADS`,
          ...platformConfig,
        };
      default:
        throw new BadRequestException(`Platform ${platform} OAuth not configured`);
    }
  }
}
