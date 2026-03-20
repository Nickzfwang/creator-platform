import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialSyncService } from './social-sync.service';
import { EncryptionService } from './encryption.service';
import { YouTubeApiService } from './youtube-api.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, SocialSyncService, EncryptionService, YouTubeApiService],
  exports: [SocialService, SocialSyncService, EncryptionService, YouTubeApiService],
})
export class SocialModule {}
