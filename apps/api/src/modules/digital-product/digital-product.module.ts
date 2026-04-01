import { Module } from '@nestjs/common';
import { DigitalProductController } from './digital-product.controller';
import { DigitalProductService } from './digital-product.service';

@Module({
  controllers: [DigitalProductController],
  providers: [DigitalProductService],
  exports: [DigitalProductService],
})
export class DigitalProductModule {}
