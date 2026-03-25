import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentRepurposeController } from './content-repurpose.controller';
import { ContentRepurposeService } from './content-repurpose.service';
import { ContentRepurposeProcessor } from './content-repurpose.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'content-repurpose' }),
  ],
  controllers: [ContentRepurposeController],
  providers: [ContentRepurposeService, ContentRepurposeProcessor],
  exports: [ContentRepurposeService],
})
export class ContentRepurposeModule {}
