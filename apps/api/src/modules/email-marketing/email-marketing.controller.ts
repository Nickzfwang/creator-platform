import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsArray, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
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
