import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialSyncService } from './social-sync.service';
import { EncryptionService } from './encryption.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, SocialSyncService, EncryptionService],
  exports: [SocialService, SocialSyncService, EncryptionService],
})
export class SocialModule {}
