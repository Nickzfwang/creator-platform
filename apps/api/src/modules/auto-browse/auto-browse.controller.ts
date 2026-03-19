import {
  Controller, Get, Post, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AutoBrowseService } from './auto-browse.service';

class ExploreDto {
  @IsString() @IsOptional() category?: string; // tech, creator, global, lifestyle, all
  @IsNumber() @IsOptional() maxPosts?: number;
  @IsString() @IsOptional() customRssUrl?: string;
}

@ApiTags('Social Explorer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/explore')
export class AutoBrowseController {
  constructor(private readonly browseService: AutoBrowseService) {}

  @Get('sources')
  @ApiOperation({ summary: 'List available content sources' })
  async getSources() {
    return this.browseService.getAvailableSources();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Explore trending content from public sources' })
  async explore(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ExploreDto,
  ) {
    return this.browseService.explore(userId, tenantId, {
      category: dto.category,
      maxPosts: dto.maxPosts,
      customRssUrl: dto.customRssUrl,
    });
  }
}
