import { Module } from '@nestjs/common';
import { BrandDealController } from './brand-deal.controller';
import { BrandDealService } from './brand-deal.service';

@Module({
  controllers: [BrandDealController],
  providers: [BrandDealService],
  exports: [BrandDealService],
})
export class BrandDealModule {}
