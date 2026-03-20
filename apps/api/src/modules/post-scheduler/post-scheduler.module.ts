import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PostSchedulerController } from './post-scheduler.controller';
import { PostSchedulerService } from './post-scheduler.service';
import { SocialModule } from '../social/social.module';
import { PostPublishProcessor } from '../../workers/post-publish.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'post-publish' }),
    SocialModule,
  ],
  controllers: [PostSchedulerController],
  providers: [PostSchedulerService, PostPublishProcessor],
  exports: [PostSchedulerService],
})
export class PostSchedulerModule {}
