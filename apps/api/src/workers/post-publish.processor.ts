import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PostStatus, SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../modules/social/encryption.service';
import { YouTubeApiService } from '../modules/social/youtube-api.service';
import * as fs from 'fs';
import { Readable } from 'stream';

interface PublishJobData {
  postId: string;
}

interface PlatformConfig {
  platform: string;
  accountId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

@Processor('post-publish')
export class PostPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PostPublishProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly youtubeApi: YouTubeApiService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    const { postId } = job.data;
    this.logger.log(`Processing publish job for post ${postId}`);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        clip: {
          select: {
            id: true, title: true, clipUrl: true,
            video: { select: { originalUrl: true } },
          },
        },
      },
    });

    if (!post) {
      this.logger.warn(`Post ${postId} not found, skipping`);
      return;
    }

    if (post.status !== PostStatus.PUBLISHING && post.status !== PostStatus.SCHEDULED) {
      this.logger.warn(`Post ${postId} is in ${post.status} status, skipping`);
      return;
    }

    // Update status to PUBLISHING
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.PUBLISHING },
    });

    const platforms = (post.platforms as unknown as PlatformConfig[]) ?? [];
    const errors: string[] = [];

    for (const platformConfig of platforms) {
      try {
        await this.publishToPlatform(post, platformConfig);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to publish to ${platformConfig.platform}: ${msg}`);
        errors.push(`${platformConfig.platform}: ${msg}`);
      }
    }

    if (errors.length === platforms.length && platforms.length > 0) {
      // All platforms failed
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          status: PostStatus.FAILED,
          errorMessage: errors.join('; '),
        },
      });
      throw new Error(`All platforms failed: ${errors.join('; ')}`);
    }

    // At least one platform succeeded
    await this.prisma.post.update({
      where: { id: postId },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        errorMessage: errors.length > 0 ? `Partial failures: ${errors.join('; ')}` : null,
      },
    });

    this.logger.log(`Post ${postId} published successfully`);
  }

  private async publishToPlatform(
    post: {
      id: string;
      userId: string;
      contentText: string | null;
      mediaUrls: string[];
      hashtags: string[];
      clip: { id: string; title: string; clipUrl: string | null; video: { originalUrl: string } } | null;
    },
    config: PlatformConfig,
  ): Promise<void> {
    const platform = config.platform as SocialPlatform;

    // Find the user's connected account for this platform
    const account = config.accountId
      ? await this.prisma.socialAccount.findUnique({ where: { id: config.accountId } })
      : await this.prisma.socialAccount.findFirst({
          where: { userId: post.userId, platform, isActive: true },
        });

    if (!account) {
      throw new Error(`No connected ${platform} account found`);
    }

    let accessToken = this.encryption.decrypt(account.accessToken);

    // Auto-refresh if expired
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date() && account.refreshToken) {
      const refreshToken = this.encryption.decrypt(account.refreshToken);

      if (platform === SocialPlatform.YOUTUBE) {
        const newTokens = await this.youtubeApi.refreshAccessToken(refreshToken);
        accessToken = newTokens.accessToken;

        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: this.encryption.encrypt(newTokens.accessToken),
            tokenExpiresAt: newTokens.expiresAt,
          },
        });
      }
    }

    if (platform === SocialPlatform.YOUTUBE) {
      await this.publishToYouTube(post, accessToken, config);
    } else {
      throw new Error(`Publishing to ${platform} is not yet implemented`);
    }
  }

  private async publishToYouTube(
    post: {
      contentText: string | null;
      mediaUrls: string[];
      hashtags: string[];
      clip: { id: string; title: string; clipUrl: string | null; video: { originalUrl: string } } | null;
    },
    accessToken: string,
    config: PlatformConfig,
  ): Promise<void> {
    // Determine the video file to upload:
    // 1. clip's own file (if generated)
    // 2. clip's source video (original upload)
    // 3. post's mediaUrls
    const videoPath = post.clip?.clipUrl
      ?? post.clip?.video?.originalUrl
      ?? post.mediaUrls[0];

    if (!videoPath) {
      throw new Error('No video file available for YouTube upload');
    }

    // Resolve local paths (relative to cwd)
    const resolvedPath = videoPath.startsWith('/uploads/')
      ? `${process.cwd()}${videoPath}`
      : videoPath;

    if (!resolvedPath.startsWith('http') && !fs.existsSync(resolvedPath)) {
      throw new Error(`Video file not found: ${resolvedPath}`);
    }

    const fileStream = fs.createReadStream(resolvedPath);
    const title = post.clip?.title ?? post.contentText?.slice(0, 100) ?? 'Untitled';
    const description = [
      post.contentText ?? '',
      post.hashtags.length > 0 ? `\n${post.hashtags.join(' ')}` : '',
    ].join('');

    const result = await this.youtubeApi.uploadVideo(
      accessToken,
      Readable.from(fileStream),
      {
        title,
        description,
        tags: post.hashtags.map((h) => h.replace('#', '')),
        privacyStatus: config.privacyStatus ?? 'private',
      },
    );

    this.logger.log(`YouTube upload complete: ${result.url}`);
  }
}
