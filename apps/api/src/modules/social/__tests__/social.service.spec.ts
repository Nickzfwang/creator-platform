import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { SocialService } from '../social.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { YouTubeApiService } from '../youtube-api.service';
import { TwitterApiService } from '../twitter-api.service';
import { MetaApiService } from '../meta-api.service';
import { TikTokApiService } from '../tiktok-api.service';

const mockPrisma = () => ({
  socialAccount: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  platformAnalytics: { deleteMany: jest.fn() },
  $transaction: jest.fn((args: unknown[]) => Promise.resolve(args)),
});

const mockEncryption = () => ({
  encrypt: jest.fn((v: string) => `enc_${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc_', '')),
});

const mockYoutubeApi = () => ({
  exchangeCodeForTokens: jest.fn(),
  getChannelInfo: jest.fn(),
  refreshAccessToken: jest.fn(),
  revokeToken: jest.fn(),
});

const mockTwitterApi = () => ({
  exchangeCodeForTokens: jest.fn(),
  getUserInfo: jest.fn(),
  refreshAccessToken: jest.fn(),
  revokeToken: jest.fn(),
});

const mockMetaApi = () => ({
  exchangeCodeForTokens: jest.fn(),
  getUserProfile: jest.fn(),
  getInstagramAccountInfo: jest.fn(),
  revokeToken: jest.fn(),
});

const mockTiktokApi = () => ({
  exchangeCodeForTokens: jest.fn(),
  getUserInfo: jest.fn(),
  refreshAccessToken: jest.fn(),
  revokeToken: jest.fn(),
});

describe('SocialService', () => {
  let service: SocialService;
  let prisma: ReturnType<typeof mockPrisma>;
  let encryption: ReturnType<typeof mockEncryption>;
  let youtubeApi: ReturnType<typeof mockYoutubeApi>;
  let twitterApi: ReturnType<typeof mockTwitterApi>;
  let metaApi: ReturnType<typeof mockMetaApi>;
  let tiktokApi: ReturnType<typeof mockTiktokApi>;

  const configMap: Record<string, string> = {
    API_BASE_URL: 'http://localhost:4000',
    YOUTUBE_CLIENT_ID: 'yt-id',
    YOUTUBE_CLIENT_SECRET: 'yt-secret',
    TWITTER_CLIENT_ID: 'tw-id',
    TWITTER_CLIENT_SECRET: 'tw-secret',
    FACEBOOK_APP_ID: 'fb-id',
    FACEBOOK_APP_SECRET: 'fb-secret',
    INSTAGRAM_APP_ID: 'ig-id',
    INSTAGRAM_APP_SECRET: 'ig-secret',
    TIKTOK_CLIENT_KEY: 'tt-key',
    TIKTOK_CLIENT_SECRET: 'tt-secret',
    THREADS_APP_ID: 'th-id',
    THREADS_APP_SECRET: 'th-secret',
  };

  beforeEach(async () => {
    prisma = mockPrisma();
    encryption = mockEncryption();
    youtubeApi = mockYoutubeApi();
    twitterApi = mockTwitterApi();
    metaApi = mockMetaApi();
    tiktokApi = mockTiktokApi();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: YouTubeApiService, useValue: youtubeApi },
        { provide: TwitterApiService, useValue: twitterApi },
        { provide: MetaApiService, useValue: metaApi },
        { provide: TikTokApiService, useValue: tiktokApi },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, def?: string) => configMap[key] ?? def) },
        },
      ],
    }).compile();

    service = module.get(SocialService);
  });

  // ─── getConnectUrl ───

  describe('getConnectUrl', () => {
    it('should generate YouTube OAuth URL with correct params', () => {
      const url = service.getConnectUrl(SocialPlatform.YOUTUBE, 'user-1', 'tenant-1');
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('client_id=yt-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('callback%2Fyoutube');
      expect(url).toContain('access_type=offline');
    });

    it('should generate Twitter OAuth URL with PKCE params', () => {
      const url = service.getConnectUrl(SocialPlatform.TWITTER, 'user-1', 'tenant-1');
      expect(url).toContain('twitter.com');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should generate TikTok OAuth URL with client_key', () => {
      const url = service.getConnectUrl(SocialPlatform.TIKTOK, 'user-1', 'tenant-1');
      expect(url).toContain('tiktok.com');
      expect(url).toContain('client_key=tt-key');
      // TikTok uses comma-separated scopes
      expect(url).toContain('user.info.basic');
    });

    it('should encode user context in state param', () => {
      const url = service.getConnectUrl(SocialPlatform.YOUTUBE, 'user-1', 'tenant-1');
      const stateMatch = url.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      const stateData = JSON.parse(Buffer.from(stateMatch![1], 'base64url').toString());
      expect(stateData.userId).toBe('user-1');
      expect(stateData.tenantId).toBe('tenant-1');
      expect(stateData.platform).toBe('YOUTUBE');
    });

    it('should generate Facebook OAuth URL', () => {
      const url = service.getConnectUrl(SocialPlatform.FACEBOOK, 'user-1', 'tenant-1');
      expect(url).toContain('facebook.com');
      expect(url).toContain('client_id=fb-id');
    });

    it('should generate Threads OAuth URL', () => {
      const url = service.getConnectUrl(SocialPlatform.THREADS, 'user-1', 'tenant-1');
      expect(url).toContain('threads.net');
    });
  });

  // ─── handleCallback ───

  describe('handleCallback', () => {
    const makeState = (data: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(data)).toString('base64url');

    it('should handle YouTube callback and upsert account', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'YOUTUBE' });
      youtubeApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'yt-access',
        refreshToken: 'yt-refresh',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      youtubeApi.getChannelInfo.mockResolvedValue({
        channelId: 'UC123',
        title: 'MyChannel',
        subscriberCount: 1000,
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-1' });

      const result = await service.handleCallback(SocialPlatform.YOUTUBE, 'auth-code', state);

      expect(result).toBe('account-1');
      expect(youtubeApi.exchangeCodeForTokens).toHaveBeenCalledWith('auth-code', expect.any(String));
      expect(encryption.encrypt).toHaveBeenCalledWith('yt-access');
      expect(encryption.encrypt).toHaveBeenCalledWith('yt-refresh');
      expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_platform_platformUserId: { userId: 'user-1', platform: 'YOUTUBE', platformUserId: 'UC123' } },
        }),
      );
    });

    it('should handle Twitter callback with PKCE codeVerifier', async () => {
      const state = makeState({
        userId: 'user-1', tenantId: 'tenant-1', platform: 'TWITTER',
        codeVerifier: 'test-verifier',
      });
      twitterApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'tw-access',
        refreshToken: 'tw-refresh',
        expiresAt: new Date(Date.now() + 7200_000),
      });
      twitterApi.getUserInfo.mockResolvedValue({
        id: 'tw-user-1',
        username: 'testuser',
        followersCount: 500,
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-2' });

      await service.handleCallback(SocialPlatform.TWITTER, 'tw-code', state);

      expect(twitterApi.exchangeCodeForTokens).toHaveBeenCalledWith(
        'tw-code', expect.any(String), 'test-verifier',
      );
    });

    it('should throw if Twitter callback missing codeVerifier', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'TWITTER' });

      await expect(
        service.handleCallback(SocialPlatform.TWITTER, 'code', state),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle TikTok callback', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'TIKTOK' });
      tiktokApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'tt-access',
        refreshToken: 'tt-refresh',
        expiresAt: new Date(Date.now() + 86400_000),
      });
      tiktokApi.getUserInfo.mockResolvedValue({
        openId: 'tt-open-1',
        displayName: 'TikToker',
        followerCount: 2000,
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-3' });

      const result = await service.handleCallback(SocialPlatform.TIKTOK, 'tt-code', state);
      expect(result).toBe('account-3');
    });

    it('should handle Facebook callback with page data', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'FACEBOOK' });
      metaApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'fb-access',
        expiresAt: new Date(Date.now() + 5_184_000_000),
      });
      metaApi.getUserProfile.mockResolvedValue({
        userId: 'fb-user-1',
        name: 'FBUser',
        pages: [{
          pageId: 'page-1',
          pageName: 'MyPage',
          pageAccessToken: 'page-token',
          followersCount: 3000,
        }],
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-4' });

      await service.handleCallback(SocialPlatform.FACEBOOK, 'fb-code', state);

      // Should use page token and page identity
      expect(encryption.encrypt).toHaveBeenCalledWith('page-token');
    });

    it('should handle Instagram callback with business account', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'INSTAGRAM' });
      metaApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'ig-access',
        expiresAt: new Date(Date.now() + 5_184_000_000),
      });
      metaApi.getUserProfile.mockResolvedValue({
        userId: 'ig-user-1',
        name: 'IGUser',
        pages: [{
          pageId: 'page-1',
          pageName: 'MyPage',
          pageAccessToken: 'page-token',
          instagramBusinessAccountId: 'ig-biz-1',
        }],
      });
      metaApi.getInstagramAccountInfo.mockResolvedValue({
        id: 'ig-biz-1',
        username: 'ig_creator',
        followersCount: 5000,
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-5' });

      await service.handleCallback(SocialPlatform.INSTAGRAM, 'ig-code', state);

      expect(metaApi.getInstagramAccountInfo).toHaveBeenCalledWith('page-token', 'ig-biz-1');
    });

    it('should handle Instagram fallback when no business account', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'INSTAGRAM' });
      metaApi.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'ig-access',
        expiresAt: new Date(Date.now() + 5_184_000_000),
      });
      metaApi.getUserProfile.mockResolvedValue({
        userId: 'ig-user-1',
        name: 'IGUser',
        pages: [],
      });
      prisma.socialAccount.upsert.mockResolvedValue({ id: 'account-6' });

      await service.handleCallback(SocialPlatform.INSTAGRAM, 'ig-code', state);

      expect(metaApi.getInstagramAccountInfo).not.toHaveBeenCalled();
    });

    it('should throw on invalid state', async () => {
      await expect(
        service.handleCallback(SocialPlatform.YOUTUBE, 'code', 'not-valid-base64!!!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on platform mismatch in state', async () => {
      const state = makeState({ userId: 'user-1', tenantId: 'tenant-1', platform: 'TWITTER' });
      await expect(
        service.handleCallback(SocialPlatform.YOUTUBE, 'code', state),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getAccounts ───

  describe('getAccounts', () => {
    it('should return accounts with computed tokenStatus', async () => {
      const futureDate = new Date(Date.now() + 86400_000);
      prisma.socialAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1', platform: 'YOUTUBE', platformUsername: 'Channel',
          followerCount: 100, isActive: true, scopes: [],
          lastSyncedAt: new Date(), tokenExpiresAt: futureDate, createdAt: new Date(),
        },
      ]);

      const result = await service.getAccounts('user-1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tokenStatus).toBe('valid');
      expect(result.data[0].tokenExpiresAt).toBeUndefined();
    });

    it('should mark expired tokens', async () => {
      const pastDate = new Date(Date.now() - 3600_000);
      prisma.socialAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1', platform: 'TWITTER', platformUsername: 'user',
          followerCount: 0, isActive: true, scopes: [],
          lastSyncedAt: null, tokenExpiresAt: pastDate, createdAt: new Date(),
        },
      ]);

      const result = await service.getAccounts('user-1');
      expect(result.data[0].tokenStatus).toBe('expired');
    });

    it('should mark expiring_soon tokens (< 1 hour)', async () => {
      const soonDate = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      prisma.socialAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1', platform: 'TIKTOK', platformUsername: 'user',
          followerCount: 0, isActive: true, scopes: [],
          lastSyncedAt: null, tokenExpiresAt: soonDate, createdAt: new Date(),
        },
      ]);

      const result = await service.getAccounts('user-1');
      expect(result.data[0].tokenStatus).toBe('expiring_soon');
    });
  });

  // ─── disconnectAccount ───

  describe('disconnectAccount', () => {
    it('should revoke token and delete account in transaction', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'YOUTUBE', accessToken: 'enc_yt-token',
      });

      await service.disconnectAccount('acc-1', 'user-1');

      expect(encryption.decrypt).toHaveBeenCalledWith('enc_yt-token');
      expect(youtubeApi.revokeToken).toHaveBeenCalledWith('yt-token');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should still delete account if token revocation fails', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'TWITTER', accessToken: 'enc_tw-token',
      });
      twitterApi.revokeToken.mockRejectedValue(new Error('revoke failed'));

      await service.disconnectAccount('acc-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when account does not exist', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.disconnectAccount('acc-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'other-user', platform: 'YOUTUBE', accessToken: 'enc_t',
      });
      await expect(service.disconnectAccount('acc-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── refreshAccountToken ───

  describe('refreshAccountToken', () => {
    it('should refresh YouTube token', async () => {
      const newExpiry = new Date(Date.now() + 3600_000);
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'YOUTUBE',
        accessToken: 'enc_old-access', refreshToken: 'enc_old-refresh',
      });
      youtubeApi.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: newExpiry,
      });

      const result = await service.refreshAccountToken('acc-1', 'user-1');

      expect(result.tokenStatus).toBe('valid');
      expect(prisma.socialAccount.update).toHaveBeenCalled();
    });

    it('should refresh Twitter token', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'TWITTER',
        accessToken: 'enc_old', refreshToken: 'enc_old-refresh',
      });
      twitterApi.refreshAccessToken.mockResolvedValue({
        accessToken: 'new', refreshToken: 'new-refresh',
        expiresAt: new Date(Date.now() + 7200_000),
      });

      const result = await service.refreshAccountToken('acc-1', 'user-1');
      expect(result.tokenStatus).toBe('valid');
    });

    it('should refresh TikTok token', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'TIKTOK',
        accessToken: 'enc_old', refreshToken: 'enc_old-refresh',
      });
      tiktokApi.refreshAccessToken.mockResolvedValue({
        accessToken: 'new', refreshToken: 'new-refresh',
        expiresAt: new Date(Date.now() + 86400_000),
      });

      const result = await service.refreshAccountToken('acc-1', 'user-1');
      expect(result.tokenStatus).toBe('valid');
    });

    it('should throw for Meta platforms (no refresh mechanism)', async () => {
      for (const platform of ['FACEBOOK', 'INSTAGRAM', 'THREADS']) {
        prisma.socialAccount.findUnique.mockResolvedValue({
          id: 'acc-1', userId: 'user-1', platform,
          accessToken: 'enc_t', refreshToken: 'enc_r',
        });
        await expect(service.refreshAccountToken('acc-1', 'user-1')).rejects.toThrow(BadRequestException);
      }
    });

    it('should throw if no refresh token available', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'user-1', platform: 'YOUTUBE',
        accessToken: 'enc_t', refreshToken: null,
      });
      await expect(service.refreshAccountToken('acc-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when account not found', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.refreshAccountToken('acc-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1', userId: 'other', platform: 'YOUTUBE',
        accessToken: 'enc_t', refreshToken: 'enc_r',
      });
      await expect(service.refreshAccountToken('acc-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
