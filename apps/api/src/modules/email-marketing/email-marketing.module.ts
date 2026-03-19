import { Module } from '@nestjs/common';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingService } from './email-marketing.service';

@Module({
  controllers: [EmailMarketingController],
  providers: [EmailMarketingService],
})
export class EmailMarketingModule {}
