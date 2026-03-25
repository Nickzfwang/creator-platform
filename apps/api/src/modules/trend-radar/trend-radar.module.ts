import { Module } from '@nestjs/common';
import { TrendRadarController } from './trend-radar.controller';
import { TrendRadarService } from './trend-radar.service';

@Module({
  controllers: [TrendRadarController],
  providers: [TrendRadarService],
  exports: [TrendRadarService],
})
export class TrendRadarModule {}
