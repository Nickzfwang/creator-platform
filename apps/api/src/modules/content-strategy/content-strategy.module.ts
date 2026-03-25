import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentStrategyController } from './content-strategy.controller';
import { ContentStrategyService } from './content-strategy.service';
import { CompetitorService } from './competitor.service';
import { ContentStrategyProcessor } from './content-strategy.processor';
import { CompetitorSyncProcessor } from './competitor-sync.processor';
import { ContentStrategyCron } from './content-strategy.cron';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TrendRadarModule } from '../trend-radar/trend-radar.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'content-strategy' }),
    BullModule.registerQueue({ name: 'competitor-sync' }),
    AnalyticsModule,
    TrendRadarModule,
  ],
  controllers: [ContentStrategyController],
  providers: [
    ContentStrategyService,
    CompetitorService,
    ContentStrategyProcessor,
    CompetitorSyncProcessor,
    ContentStrategyCron,
  ],
  exports: [ContentStrategyService, CompetitorService],
})
export class ContentStrategyModule {}
