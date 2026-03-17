import { Controller, Get, Post, Body, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook')
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleWebhook(signature, req.rawBody);
  }

  @Get('subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscriptions' })
  async getSubscriptions() {
    // TODO: Extract user from @CurrentUser() decorator
    return this.paymentService.getSubscriptions('current-user-id');
  }
}
