import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialSyncService } from './social-sync.service';
import { EncryptionService } from './encryption.service';
import { YouTubeApiService } from './youtube-api.service';
import { TwitterApiService } from './twitter-api.service';
import { MetaApiService } from './meta-api.service';
import { TikTokApiService } from './tiktok-api.service';

@Module({
  controllers: [SocialController],
  providers: [
    SocialService,
    SocialSyncService,
    EncryptionService,
    YouTubeApiService,
    TwitterApiService,
    MetaApiService,
    TikTokApiService,
  ],
  exports: [
    SocialService,
    SocialSyncService,
    EncryptionService,
    YouTubeApiService,
    TwitterApiService,
    MetaApiService,
    TikTokApiService,
  ],
})
export class SocialModule {}
