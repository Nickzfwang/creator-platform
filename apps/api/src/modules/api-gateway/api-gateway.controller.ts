import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiGatewayService } from './api-gateway.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('API Gateway')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/api-gateway')
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  // ─── API Keys ───

  @Post('keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key (key returned only once!)' })
  async createApiKey(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiGatewayService.createApiKey(userId, tenantId, dto);
  }

  @Get('keys')
  @ApiOperation({ summary: 'List API keys (hashed, no raw keys)' })
  async listApiKeys(@CurrentUser('tenantId') tenantId: string) {
    return this.apiGatewayService.listApiKeys(tenantId);
  }

  @Delete('keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(
    @CurrentUser('tenantId') tenantId: string,
    @Param('keyId') keyId: string,
  ) {
    await this.apiGatewayService.revokeApiKey(tenantId, keyId);
  }

  // ─── Webhooks ───

  @Post('webhooks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a webhook endpoint (secret returned only once!)' })
  async createWebhook(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.apiGatewayService.createWebhook(tenantId, dto);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List registered webhooks' })
  async listWebhooks(@CurrentUser('tenantId') tenantId: string) {
    return this.apiGatewayService.listWebhooks(tenantId);
  }

  @Get('webhooks/events')
  @ApiOperation({ summary: 'List available webhook event types' })
  async getAvailableEvents() {
    return this.apiGatewayService.getAvailableEvents();
  }

  @Post('webhooks/:webhookId/test')
  @ApiOperation({ summary: 'Send a test payload to a webhook endpoint' })
  async testWebhook(
    @CurrentUser('tenantId') tenantId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.apiGatewayService.testWebhook(tenantId, webhookId);
  }

  @Delete('webhooks/:webhookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable a webhook' })
  async deleteWebhook(
    @CurrentUser('tenantId') tenantId: string,
    @Param('webhookId') webhookId: string,
  ) {
    await this.apiGatewayService.deleteWebhook(tenantId, webhookId);
  }

  // ─── Rate Limits ───

  @Get('rate-limits')
  @ApiOperation({ summary: 'Get current rate limit configuration' })
  async getRateLimits(@CurrentUser('tenantId') tenantId: string) {
    return this.apiGatewayService.getRateLimits(tenantId);
  }
}
