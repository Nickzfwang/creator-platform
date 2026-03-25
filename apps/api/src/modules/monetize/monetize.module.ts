import { Module } from '@nestjs/common';
import { MonetizeController } from './monetize.controller';
import { MonetizeService } from './monetize.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [MonetizeController],
  providers: [MonetizeService],
  exports: [MonetizeService],
})
export class MonetizeModule {}
