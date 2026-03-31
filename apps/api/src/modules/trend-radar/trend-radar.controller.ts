import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
// Rate limiting handled at service level (manual timestamp check)
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TrendRadarService } from './trend-radar.service';
import { TrendQueryDto } from './dto/trend-query.dto';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { UpdateTrendSettingsDto } from './dto/update-trend-settings.dto';

const MAX_KEYWORDS = 20;

@ApiTags('Trend Radar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/trends')
export class TrendRadarController {
  constructor(
    private readonly trendRadarService: TrendRadarService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Trends ───

  @Get()
  @ApiOperation({ summary: 'Get current trending topics with AI analysis' })
  async getTrends(@Query() query: TrendQueryDto) {
    return this.trendRadarService.getTrends(
      query.category,
      query.platform,
      query.phase,
    );
  }

  private lastRefreshAt = 0;

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force refresh trend data from all sources' })
  async refreshTrends() {
    // Simple rate limit: 1 refresh per 10 minutes
    const now = Date.now();
    if (now - this.lastRefreshAt < 10 * 60 * 1000) {
      throw new ForbiddenException('請等待 10 分鐘後再重新掃描');
    }
    this.lastRefreshAt = now;
    await this.trendRadarService.refreshTrends(true);
    return this.trendRadarService.getTrends();
  }

  @Get(':fingerprint/history')
  @ApiOperation({ summary: 'Get 14-day trend history by fingerprint' })
  async getTrendHistory(@Param('fingerprint') fingerprint: string) {
    // Validate fingerprint format (hex string, 16 chars)
    if (!/^[a-f0-9]{16}$/.test(fingerprint)) {
      throw new BadRequestException('Invalid fingerprint format');
    }
    const history = await this.trendRadarService.getTrendHistory(fingerprint);
    if (!history) {
      throw new NotFoundException('Trend not found');
    }
    return history;
  }

  // ─── Keywords ───

  @Get('keywords')
  @ApiOperation({ summary: 'List tracked keywords' })
  async listKeywords(
    @CurrentUser('id') userId: string,
  ) {
    const keywords = await this.prisma.trendKeyword.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      keywords,
      quota: { used: keywords.length, max: MAX_KEYWORDS },
    };
  }

  @Post('keywords')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a tracked keyword' })
  async addKeyword(
    @Body() dto: CreateKeywordDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    // Check quota
    const count = await this.prisma.trendKeyword.count({ where: { userId } });
    if (count >= MAX_KEYWORDS) {
      throw new ForbiddenException(`最多追蹤 ${MAX_KEYWORDS} 個關鍵字`);
    }

    // Check duplicate
    const existing = await this.prisma.trendKeyword.findUnique({
      where: { userId_keyword: { userId, keyword: dto.keyword.trim() } },
    });
    if (existing) {
      throw new ConflictException('此關鍵字已追蹤');
    }

    return this.prisma.trendKeyword.create({
      data: {
        userId,
        tenantId,
        keyword: dto.keyword.trim(),
      },
    });
  }

  @Delete('keywords/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tracked keyword' })
  async deleteKeyword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const keyword = await this.prisma.trendKeyword.findFirst({
      where: { id, userId },
    });
    if (!keyword) {
      throw new NotFoundException('關鍵字不存在');
    }
    await this.prisma.trendKeyword.delete({ where: { id } });
  }

  // ─── Settings ───

  @Get('settings')
  @ApiOperation({ summary: 'Get trend notification preferences' })
  async getSettings(
    @CurrentUser('id') userId: string,
  ) {
    const settings = await this.prisma.trendUserSettings.findUnique({
      where: { userId },
    });
    return settings ?? {
      notifyKeywordHit: true,
      notifyViralAlert: true,
      notifyDailySummary: true,
      emailKeywordHit: false,
      emailViralAlert: false,
      emailDailySummary: true,
    };
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update trend notification preferences' })
  async updateSettings(
    @Body() dto: UpdateTrendSettingsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.prisma.trendUserSettings.upsert({
      where: { userId },
      create: {
        userId,
        tenantId,
        ...dto,
      },
      update: dto,
    });
  }
}
