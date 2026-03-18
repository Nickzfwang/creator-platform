import { Module } from '@nestjs/common';
import { ContentClipController } from './content-clip.controller';
import { ContentClipService } from './content-clip.service';

@Module({
  controllers: [ContentClipController],
  providers: [ContentClipService],
})
export class ContentClipModule {}
