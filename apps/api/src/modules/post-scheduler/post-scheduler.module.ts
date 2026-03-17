import { Module } from '@nestjs/common';
import { PostSchedulerController } from './post-scheduler.controller';
import { PostSchedulerService } from './post-scheduler.service';

@Module({
  controllers: [PostSchedulerController],
  providers: [PostSchedulerService],
  exports: [PostSchedulerService],
})
export class PostSchedulerModule {}
