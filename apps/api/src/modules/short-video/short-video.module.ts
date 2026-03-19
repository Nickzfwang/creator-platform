import { Module } from '@nestjs/common';
import { ShortVideoController } from './short-video.controller';
import { ShortVideoService } from './short-video.service';

@Module({
  controllers: [ShortVideoController],
  providers: [ShortVideoService],
})
export class ShortVideoModule {}
