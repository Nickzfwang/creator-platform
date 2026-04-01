import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { VideoProcessProcessor } from './video-process.processor';
import { ContentRepurposeModule } from '../content-repurpose/content-repurpose.module';

@Module({
  imports: [
    ContentRepurposeModule,
    BullModule.registerQueue({ name: 'video-process' }),
  ],
  controllers: [VideoController],
  providers: [VideoService, VideoProcessProcessor],
  exports: [VideoService],
})
export class VideoModule {}
