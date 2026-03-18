import { Module } from '@nestjs/common';
import { PaymentController, WebhookController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
