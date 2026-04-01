import { Module } from '@nestjs/common';
import { PaymentController, WebhookController } from './payment.controller';
import { PaymentService } from './payment.service';
import { DigitalProductModule } from '../digital-product/digital-product.module';

@Module({
  imports: [DigitalProductModule],
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
