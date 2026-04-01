import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingService } from './email-marketing.service';
import { EmailSendProcessor } from './email-send.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email-send' }),
  ],
  controllers: [EmailMarketingController],
  providers: [EmailMarketingService, EmailSendProcessor],
})
export class EmailMarketingModule {}
