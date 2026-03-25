import {
  Controller, Post, Body, Param, UseGuards, HttpCode, HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsIn, IsArray, ArrayMinSize, IsUUID } from 'class-validator';
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

class MultiPlatformDto {
  @ApiProperty()
  @IsUUID()
  videoId: string;

  @ApiProperty()
  @IsUUID()
  clipId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  platforms: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean() @IsOptional()
  addSubtitles?: boolean;
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

  @Post('multi-platform')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate short videos for multiple platforms from a single clip' })
  async generateMultiPlatform(
    @CurrentUser('id') userId: string,
    @Body() dto: MultiPlatformDto,
  ) {
    return this.shortVideoService.generateMultiPlatform(
      dto.videoId, dto.clipId, userId, dto.platforms,
      { addSubtitles: dto.addSubtitles },
    );
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
