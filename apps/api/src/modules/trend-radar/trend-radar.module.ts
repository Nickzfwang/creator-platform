import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TrendRadarController } from './trend-radar.controller';
import { TrendRadarService } from './trend-radar.service';
import { TrendRadarViralService } from './trend-radar-viral.service';
import { TrendRadarProcessor } from './trend-radar.processor';
import { TrendRadarCron } from './trend-radar.cron';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'trend-radar' }),
    NotificationModule,
  ],
  controllers: [TrendRadarController],
  providers: [
    TrendRadarService,
    TrendRadarViralService,
    TrendRadarProcessor,
    TrendRadarCron,
  ],
  exports: [TrendRadarService],
})
export class TrendRadarModule {}
