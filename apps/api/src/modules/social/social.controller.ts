import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { SocialPlatform } from '@prisma/client';
import { SocialService } from './social.service';
import { SocialSyncService } from './social-sync.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Social')
@ApiBearerAuth()
@Controller('v1/social')
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly socialSyncService: SocialSyncService,
  ) {}

  @Get('connect/:platform')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate OAuth flow for a social platform' })
  async connect(
    @Param('platform') platform: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const platformEnum = this.validatePlatform(platform);
    const url = this.socialService.getConnectUrl(platformEnum, userId, tenantId);
    res.redirect(url);
  }

  @Get('callback/:platform')
  @ApiOperation({ summary: 'Handle OAuth callback from social platform' })
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectBase = `${frontendUrl}/settings`;

    if (error) {
      res.redirect(`${redirectBase}?error=${error}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${redirectBase}?error=missing_params`);
      return;
    }

    try {
      const platformEnum = this.validatePlatform(platform);
      await this.socialService.handleCallback(platformEnum, code, state);
      res.redirect(`${redirectBase}?connected=${platform}`);
    } catch (err) {
      const errorCode = err instanceof BadRequestException ? 'invalid_state' : 'server_error';
      res.redirect(`${redirectBase}?error=${errorCode}`);
    }
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List connected social accounts' })
  async getAccounts(@CurrentUser('id') userId: string) {
    return this.socialService.getAccounts(userId);
  }

  @Delete('accounts/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect a social account' })
  async disconnect(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    await this.socialService.disconnectAccount(accountId, userId);
  }

  @Post('accounts/:id/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Manually refresh social account token' })
  async refreshToken(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    return this.socialService.refreshAccountToken(accountId, userId);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Manually trigger sync for all connected accounts' })
  async syncAccounts(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.socialSyncService.syncUserAccounts(userId, tenantId);
  }

  @Get('sync/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get sync status for connected accounts' })
  async getSyncStatus(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.socialSyncService.getSyncStatus(userId, tenantId);
  }

  private validatePlatform(platform: string): SocialPlatform {
    const upper = platform.toUpperCase();
    if (!Object.values(SocialPlatform).includes(upper as SocialPlatform)) {
      throw new BadRequestException(
        `Unsupported platform: ${platform}. Supported: ${Object.values(SocialPlatform).join(', ')}`,
      );
    }
    return upper as SocialPlatform;
  }
}
