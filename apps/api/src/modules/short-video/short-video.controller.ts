import {
  Controller, Post, Body, Param, UseGuards, HttpCode, HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShortVideoService } from './short-video.service';

class GenerateShortDto {
  @IsString() @IsOptional() @IsIn(['9:16', '1:1'])
  format?: '9:16' | '1:1';

  @IsBoolean() @IsOptional()
  addSubtitles?: boolean;

  @IsString() @IsOptional() @IsIn(['youtube_shorts', 'instagram_reels', 'tiktok'])
  platform?: string;
}

@ApiTags('Short Videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/videos')
export class ShortVideoController {
  constructor(private readonly shortVideoService: ShortVideoService) {}

  @Post(':videoId/clips/:clipId/generate-short')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a short video from a clip' })
  async generateShort(
    @CurrentUser('id') userId: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Param('clipId', ParseUUIDPipe) clipId: string,
    @Body() dto: GenerateShortDto,
  ) {
    return this.shortVideoService.generateShort(videoId, clipId, userId, {
      format: dto.format,
      addSubtitles: dto.addSubtitles,
      platform: dto.platform,
    });
  }

  @Post(':videoId/generate-all-shorts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate short videos from all clips' })
  async generateAllShorts(
    @CurrentUser('id') userId: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: GenerateShortDto,
  ) {
    return this.shortVideoService.generateAllShorts(videoId, userId, {
      format: dto.format,
      addSubtitles: dto.addSubtitles,
      platform: dto.platform,
    });
  }
}
