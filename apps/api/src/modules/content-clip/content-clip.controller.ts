import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBooleanString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContentClipService } from './content-clip.service';

class CreateClipDto {
  @IsString() platform: string;
  @IsString() url: string;
  @IsString() title: string;
  @IsString() rawContent: string;
  @IsString() @IsOptional() author?: string;
  @IsString() @IsOptional() imageUrl?: string;
}

class ListClipsQueryDto {
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() platform?: string;
  @IsString() @IsOptional() starred?: string;
  @IsString() @IsOptional() cursor?: string;
}

@ApiTags('Content Clips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/clips')
export class ContentClipController {
  constructor(private readonly clipService: ContentClipService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a content clip with AI summary' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateClipDto,
  ) {
    return this.clipService.createClip(userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List saved content clips' })
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListClipsQueryDto,
  ) {
    return this.clipService.getClips(userId, {
      category: query.category,
      platform: query.platform,
      starred: query.starred === 'true',
      cursor: query.cursor,
    });
  }

  @Patch(':id/star')
  @ApiOperation({ summary: 'Toggle star on a clip' })
  async toggleStar(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) clipId: string,
  ) {
    return this.clipService.toggleStar(clipId, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a clip' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) clipId: string,
  ) {
    return this.clipService.deleteClip(clipId, userId);
  }
}
