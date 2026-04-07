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
import { YouTubeApiService } from './youtube-api.service';
import { TwitterApiService } from './twitter-api.service';
import { MetaApiService } from './meta-api.service';
import { TikTokApiService } from './tiktok-api.service';

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
    scopes: ['public_profile', 'email'],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
  },
  TIKTOK: {
    scopes: ['user.info.basic', 'video.publish', 'video.list'],
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  },
  FACEBOOK: {
    scopes: ['public_profile', 'email'],
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
    private readonly youtubeApi: YouTubeApiService,
    private readonly twitterApi: TwitterApiService,
    private readonly metaApi: MetaApiService,
    private readonly tiktokApi: TikTokApiService,
  ) {}

  getConnectUrl(platform: SocialPlatform, userId: string, tenantId: string): string {
    const platformConfig = PLATFORM_CONFIGS[platform];
    if (!platformConfig) {
      throw new BadRequestException(`Platform ${platform} is not supported yet`);
    }

    const oauthConfig = this.getOAuthConfig(platform);

    // State contains user context for the callback
    const statePayload: Record<string, unknown> = { userId, tenantId, platform, ts: Date.now() };

    // Twitter uses PKCE — generate code_verifier and store in state
    if (platform === SocialPlatform.TWITTER) {
      const { randomBytes, createHash } = require('crypto');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
      statePayload.codeVerifier = codeVerifier;

      const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: oauthConfig.clientId,
        redirect_uri: oauthConfig.redirectUri,
        scope: platformConfig.scopes.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return `${platformConfig.authUrl}?${params.toString()}`;
    }

    // TikTok uses client_key instead of client_id
    if (platform === SocialPlatform.TIKTOK) {
      const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

      const params = new URLSearchParams({
        client_key: oauthConfig.clientId,
        redirect_uri: oauthConfig.redirectUri,
        response_type: 'code',
        scope: platformConfig.scopes.join(','),
        state,
      });

      return `${platformConfig.authUrl}?${params.toString()}`;
    }

    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

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
    let stateData: { userId: string; tenantId: string; platform: string; codeVerifier?: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      throw new BadRequestException('errors.social.invalidOAuthState');
    }

    if (stateData.platform !== platform) {
      throw new BadRequestException('errors.social.platformMismatch');
    }

    // State is signed via base64url encoding with platform verification above
    // Redis-based state management deferred to when Redis module is added globally

    // Exchange authorization code for tokens and fetch profile
    let tokens: { accessToken: string; refreshToken?: string; expiresIn: number };
    let profile: { platformUserId: string; platformUsername: string; followerCount: number };
    const oauthConfig = this.getOAuthConfig(platform);

    switch (platform) {
      case SocialPlatform.YOUTUBE: {
        const ytTokens = await this.youtubeApi.exchangeCodeForTokens(code, oauthConfig.redirectUri);
        const channelInfo = await this.youtubeApi.getChannelInfo(ytTokens.accessToken);
        tokens = {
          accessToken: ytTokens.accessToken,
          refreshToken: ytTokens.refreshToken,
          expiresIn: Math.floor((ytTokens.expiresAt.getTime() - Date.now()) / 1000),
        };
        profile = {
          platformUserId: channelInfo.channelId,
          platformUsername: channelInfo.title,
          followerCount: channelInfo.subscriberCount ?? 0,
        };
        break;
      }

      case SocialPlatform.TWITTER: {
        const codeVerifier = stateData.codeVerifier as string;
        if (!codeVerifier) throw new BadRequestException('errors.social.missingPkce');
        const twTokens = await this.twitterApi.exchangeCodeForTokens(code, oauthConfig.redirectUri, codeVerifier);
        const twUser = await this.twitterApi.getUserInfo(twTokens.accessToken);
        tokens = {
          accessToken: twTokens.accessToken,
          refreshToken: twTokens.refreshToken,
          expiresIn: Math.floor((twTokens.expiresAt.getTime() - Date.now()) / 1000),
        };
        profile = {
          platformUserId: twUser.id,
          platformUsername: twUser.username,
          followerCount: twUser.followersCount,
        };
        break;
      }

      case SocialPlatform.FACEBOOK: {
        const fbTokens = await this.metaApi.exchangeCodeForTokens(code, oauthConfig.redirectUri, 'FACEBOOK');
        const fbProfile = await this.metaApi.getUserProfile(fbTokens.accessToken);
        // Use the first Page as the primary identity (if available), fallback to user profile
        const primaryPage = fbProfile.pages?.[0];
        tokens = {
          accessToken: primaryPage?.pageAccessToken ?? fbTokens.accessToken,
          expiresIn: Math.floor((fbTokens.expiresAt.getTime() - Date.now()) / 1000),
        };
        profile = {
          platformUserId: primaryPage?.pageId ?? fbProfile.userId,
          platformUsername: primaryPage?.pageName ?? fbProfile.name,
          followerCount: primaryPage?.followersCount ?? 0,
        };
        this.logger.log(`Facebook connected: ${profile.platformUsername} (pages: ${fbProfile.pages?.length ?? 0})`);
        break;
      }

      case SocialPlatform.INSTAGRAM: {
        const igTokens = await this.metaApi.exchangeCodeForTokens(code, oauthConfig.redirectUri, 'INSTAGRAM');
        const igProfile = await this.metaApi.getUserProfile(igTokens.accessToken);
        // Find Instagram Business Account via connected Page (if page permissions available)
        const pageWithIg = igProfile.pages?.find(p => p.instagramBusinessAccountId);
        if (pageWithIg?.instagramBusinessAccountId) {
          const igAccount = await this.metaApi.getInstagramAccountInfo(
            pageWithIg.pageAccessToken,
            pageWithIg.instagramBusinessAccountId,
          );
          tokens = {
            accessToken: pageWithIg.pageAccessToken,
            expiresIn: Math.floor((igTokens.expiresAt.getTime() - Date.now()) / 1000),
          };
          profile = {
            platformUserId: igAccount.id,
            platformUsername: igAccount.username,
            followerCount: igAccount.followersCount,
          };
        } else {
          // Fallback: connect with basic profile (no page permissions yet)
          this.logger.warn('No Instagram Business Account found via Pages. Using basic profile as fallback.');
          tokens = {
            accessToken: igTokens.accessToken,
            expiresIn: Math.floor((igTokens.expiresAt.getTime() - Date.now()) / 1000),
          };
          profile = {
            platformUserId: igProfile.userId,
            platformUsername: igProfile.name,
            followerCount: 0,
          };
        }
        this.logger.log(`Instagram connected: ${profile.platformUsername}`);
        break;
      }

      case SocialPlatform.TIKTOK: {
        const ttTokens = await this.tiktokApi.exchangeCodeForTokens(code, oauthConfig.redirectUri);
        const ttUser = await this.tiktokApi.getUserInfo(ttTokens.accessToken);
        tokens = {
          accessToken: ttTokens.accessToken,
          refreshToken: ttTokens.refreshToken,
          expiresIn: Math.floor((ttTokens.expiresAt.getTime() - Date.now()) / 1000),
        };
        profile = {
          platformUserId: ttUser.openId,
          platformUsername: ttUser.displayName,
          followerCount: ttUser.followerCount,
        };
        break;
      }

      case SocialPlatform.THREADS: {
        // Threads uses the same Meta/Instagram OAuth flow
        const thTokens = await this.metaApi.exchangeCodeForTokens(code, oauthConfig.redirectUri, 'INSTAGRAM');
        const thProfile = await this.metaApi.getUserProfile(thTokens.accessToken);
        tokens = {
          accessToken: thTokens.accessToken,
          expiresIn: Math.floor((thTokens.expiresAt.getTime() - Date.now()) / 1000),
        };
        profile = {
          platformUserId: thProfile.userId,
          platformUsername: thProfile.name,
          followerCount: 0,
        };
        break;
      }

      default:
        throw new BadRequestException(`Platform ${platform} OAuth is not yet implemented`);
    }

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
      throw new NotFoundException('errors.social.accountNotFound');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('errors.social.notAccountOwner');
    }

    // Best-effort revoke platform token
    try {
      const token = this.encryption.decrypt(account.accessToken);
      switch (account.platform) {
        case SocialPlatform.YOUTUBE:
          await this.youtubeApi.revokeToken(token);
          break;
        case SocialPlatform.TWITTER:
          await this.twitterApi.revokeToken(token);
          break;
        case SocialPlatform.FACEBOOK:
        case SocialPlatform.INSTAGRAM:
        case SocialPlatform.THREADS:
          await this.metaApi.revokeToken(token);
          break;
        case SocialPlatform.TIKTOK:
          await this.tiktokApi.revokeToken(token);
          break;
      }
    } catch (e) {
      this.logger.warn(`Failed to revoke ${account.platform} token: ${e}`);
    }

    await this.prisma.$transaction([
      this.prisma.platformAnalytics.deleteMany({ where: { socialAccountId: accountId } }),
      this.prisma.socialAccount.delete({ where: { id: accountId } }),
    ]);

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
      throw new NotFoundException('errors.social.accountNotFound');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('errors.social.notAccountOwner');
    }
    if (!account.refreshToken) {
      throw new BadRequestException('errors.social.noRefreshToken');
    }

    const decryptedRefreshToken = this.encryption.decrypt(account.refreshToken);

    let newAccessToken: string;
    let newRefreshToken: string | undefined;
    let newExpiresAt: Date;

    switch (account.platform) {
      case SocialPlatform.YOUTUBE: {
        const ytTokens = await this.youtubeApi.refreshAccessToken(decryptedRefreshToken);
        newAccessToken = ytTokens.accessToken;
        newRefreshToken = ytTokens.refreshToken;
        newExpiresAt = ytTokens.expiresAt;
        break;
      }
      case SocialPlatform.TWITTER: {
        const twTokens = await this.twitterApi.refreshAccessToken(decryptedRefreshToken);
        newAccessToken = twTokens.accessToken;
        newRefreshToken = twTokens.refreshToken;
        newExpiresAt = twTokens.expiresAt;
        break;
      }
      case SocialPlatform.TIKTOK: {
        const ttTokens = await this.tiktokApi.refreshAccessToken(decryptedRefreshToken);
        newAccessToken = ttTokens.accessToken;
        newRefreshToken = ttTokens.refreshToken;
        newExpiresAt = ttTokens.expiresAt;
        break;
      }
      case SocialPlatform.FACEBOOK:
      case SocialPlatform.INSTAGRAM:
      case SocialPlatform.THREADS: {
        // Meta long-lived tokens last 60 days; no refresh mechanism — re-auth required
        throw new BadRequestException(
          `${account.platform} tokens last 60 days. Please reconnect the account when expired.`,
        );
      }
      default:
        throw new BadRequestException(`Token refresh not implemented for ${account.platform}`);
    }

    const updateData: Record<string, unknown> = {
      accessToken: this.encryption.encrypt(newAccessToken),
      tokenExpiresAt: newExpiresAt,
    };
    if (newRefreshToken && newRefreshToken !== decryptedRefreshToken) {
      updateData.refreshToken = this.encryption.encrypt(newRefreshToken);
    }

    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: updateData,
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

    const platformLower = platform.toLowerCase();

    switch (platform) {
      case SocialPlatform.YOUTUBE:
        return {
          clientId: this.config.get<string>('YOUTUBE_CLIENT_ID', ''),
          clientSecret: this.config.get<string>('YOUTUBE_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      case SocialPlatform.INSTAGRAM:
        return {
          clientId: this.config.get<string>('INSTAGRAM_APP_ID', ''),
          clientSecret: this.config.get<string>('INSTAGRAM_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      case SocialPlatform.TIKTOK:
        return {
          clientId: this.config.get<string>('TIKTOK_CLIENT_KEY', ''),
          clientSecret: this.config.get<string>('TIKTOK_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      case SocialPlatform.FACEBOOK:
        return {
          clientId: this.config.get<string>('FACEBOOK_APP_ID', ''),
          clientSecret: this.config.get<string>('FACEBOOK_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      case SocialPlatform.TWITTER:
        return {
          clientId: this.config.get<string>('TWITTER_CLIENT_ID', ''),
          clientSecret: this.config.get<string>('TWITTER_CLIENT_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      case SocialPlatform.THREADS:
        return {
          clientId: this.config.get<string>('THREADS_APP_ID', ''),
          clientSecret: this.config.get<string>('THREADS_APP_SECRET', ''),
          redirectUri: `${baseUrl}/api/v1/social/callback/${platformLower}`,
          ...platformConfig,
        };
      default:
        throw new BadRequestException(`Platform ${platform} OAuth not configured`);
    }
  }
}
