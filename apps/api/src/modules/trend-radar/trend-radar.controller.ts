import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TrendRadarService } from './trend-radar.service';

class TrendQueryDto {
  @IsString()
  @IsOptional()
  category?: string;
}

@ApiTags('Trend Radar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/trends')
export class TrendRadarController {
  constructor(private readonly trendRadarService: TrendRadarService) {}

  @Get()
  @ApiOperation({ summary: 'Get current trending topics with AI analysis' })
  async getTrends(@Query() query: TrendQueryDto) {
    return this.trendRadarService.getTrends(query.category);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force refresh trend data from sources' })
  async refreshTrends() {
    return this.trendRadarService.getTrends(undefined, true);
  }
}
