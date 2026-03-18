import { Module } from '@nestjs/common';
import { AutoBrowseController } from './auto-browse.controller';
import { AutoBrowseService } from './auto-browse.service';

@Module({
  controllers: [AutoBrowseController],
  providers: [AutoBrowseService],
})
export class AutoBrowseModule {}
