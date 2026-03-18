import {
  Controller, Get, Post, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AutoBrowseService } from './auto-browse.service';

class BrowseDto {
  @IsString() platform: string; // facebook, youtube, threads
  @IsNumber() @IsOptional() maxPosts?: number;
  @IsNumber() @IsOptional() scrollCount?: number;
}

@ApiTags('Auto Browse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/auto-browse')
export class AutoBrowseController {
  constructor(private readonly browseService: AutoBrowseService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check Chrome connection status' })
  async checkStatus() {
    return this.browseService.checkConnection();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run auto-browse on a platform' })
  async browse(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: BrowseDto,
  ) {
    return this.browseService.browsePlatform(userId, tenantId, dto.platform, {
      maxPosts: dto.maxPosts,
      scrollCount: dto.scrollCount,
    });
  }
}
