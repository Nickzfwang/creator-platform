import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePortalDto } from './dto/create-portal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@Controller('v1/subscriptions')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List all available subscription plans' })
  getPlans() {
    return this.paymentService.getPlans();
  }

  @Get('current')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current subscription and usage' })
  async getCurrent(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.paymentService.getCurrentSubscription(userId, tenantId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create Stripe Checkout session for subscription' })
  async createCheckout(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentService.createCheckoutSession(userId, tenantId, dto);
  }

  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create Stripe Customer Portal session' })
  async createPortal(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePortalDto,
  ) {
    return this.paymentService.createPortalSession(userId, dto.returnUrl);
  }
}

@ApiTags('Webhooks')
@Controller('v1/webhooks')
export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleWebhook(signature, req.rawBody);
  }
}
