import { Module } from '@nestjs/common';
import { AffiliateController, AffiliateRedirectController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';

@Module({
  controllers: [AffiliateController, AffiliateRedirectController],
  providers: [AffiliateService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
