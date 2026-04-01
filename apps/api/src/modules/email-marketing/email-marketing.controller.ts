import {
  Controller, Get, Post, Delete, Body, Param, Query, Res, Header,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsArray, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailMarketingService } from './email-marketing.service';

class AddSubscriberDto {
  @IsEmail() email: string;
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() source?: string;
  @IsArray() @IsOptional() tags?: string[];
}

class CreateCampaignDto {
  @IsString() name: string;
  @IsString() @IsOptional() @IsIn(['SINGLE', 'SEQUENCE']) type?: string;
  @IsArray() @IsOptional() targetTags?: string[];
}

class AiGenerateSequenceDto {
  @IsString() purpose: string;
  @IsString() @IsOptional() productName?: string;
  @IsString() @IsOptional() tone?: string;
  @IsNumber() @Type(() => Number) @IsOptional() emailCount?: number;
}

class AiGenerateSingleDto {
  @IsString() purpose: string;
  @IsString() @IsOptional() context?: string;
  @IsString() @IsOptional() tone?: string;
}

@ApiTags('Email Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/email')
export class EmailMarketingController {
  constructor(private readonly emailService: EmailMarketingService) {}

  // ─── Stats ───
  @Get('stats')
  @ApiOperation({ summary: 'Get email marketing stats' })
  async getStats(@CurrentUser('id') userId: string) {
    return this.emailService.getStats(userId);
  }

  // ─── Subscribers ───
  @Post('subscribers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a subscriber' })
  async addSubscriber(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AddSubscriberDto,
  ) {
    return this.emailService.addSubscriber(userId, tenantId, dto);
  }

  @Get('subscribers')
  @ApiOperation({ summary: 'List subscribers' })
  async listSubscribers(
    @CurrentUser('id') userId: string,
    @Query('tag') tag?: string,
  ) {
    return this.emailService.listSubscribers(userId, { tag });
  }

  @Delete('subscribers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsubscribe' })
  async removeSubscriber(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) subscriberId: string,
  ) {
    return this.emailService.removeSubscriber(subscriberId, userId);
  }

  // ─── Campaigns ───
  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a campaign' })
  async createCampaign(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.emailService.createCampaign(userId, tenantId, dto);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List campaigns' })
  async listCampaigns(@CurrentUser('id') userId: string) {
    return this.emailService.listCampaigns(userId);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get campaign detail with emails' })
  async getCampaign(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) campaignId: string,
  ) {
    return this.emailService.getCampaign(campaignId, userId);
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a campaign' })
  async deleteCampaign(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) campaignId: string,
  ) {
    return this.emailService.deleteCampaign(campaignId, userId);
  }

  // ─── Send Campaign ───
  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a campaign to subscribers via Brevo' })
  async sendCampaign(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) campaignId: string,
  ) {
    return this.emailService.sendCampaign(campaignId, userId, tenantId);
  }

  // ─── AI Generation ───
  @Post('ai/generate-sequence')
  @ApiOperation({ summary: 'AI generate email sequence (welcome → nurture → sell)' })
  async aiGenerateSequence(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AiGenerateSequenceDto,
  ) {
    return this.emailService.aiGenerateSequence(userId, tenantId, dto);
  }

  @Post('ai/generate-single')
  @ApiOperation({ summary: 'AI generate a single email' })
  async aiGenerateSingle(
    @CurrentUser('id') userId: string,
    @Body() dto: AiGenerateSingleDto,
  ) {
    return this.emailService.aiGenerateSingleEmail(userId, dto);
  }
}

// ─── Public Unsubscribe Controller (no auth) ───

@ApiTags('Email Marketing')
@Controller('v1/email')
export class EmailUnsubscribeController {
  constructor(private readonly emailService: EmailMarketingService) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Unsubscribe from email list (public, no auth)' })
  async unsubscribe(
    @Query('id') subscriberId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.emailService.processUnsubscribe(subscriberId, token);
      const message = result.alreadyUnsubscribed
        ? '你已經取消訂閱了。'
        : `已成功取消訂閱 (${result.email})。`;
      res.send(this.renderUnsubPage(message, false));
    } catch {
      res.status(400).send(this.renderUnsubPage('取消訂閱連結無效或已過期。', true));
    }
  }

  private renderUnsubPage(message: string, isError: boolean): string {
    return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>取消訂閱</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
.card{background:#fff;border-radius:12px;padding:2rem;max-width:400px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.icon{font-size:3rem;margin-bottom:1rem}
.msg{color:${isError ? '#dc2626' : '#16a34a'};font-size:1.1rem;font-weight:500}</style></head>
<body><div class="card"><div class="icon">${isError ? '⚠️' : '✅'}</div><p class="msg">${message}</p>
<p style="color:#6b7280;font-size:.875rem;margin-top:1rem">你可以關閉此頁面。</p></div></body></html>`;
  }
}
