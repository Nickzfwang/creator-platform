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
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TrendRadarService } from './trend-radar.service';
import { TrendQueryDto } from './dto/trend-query.dto';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { UpdateTrendSettingsDto } from './dto/update-trend-settings.dto';
import { CreateCustomRssDto } from './dto/create-custom-rss.dto';

const MAX_KEYWORDS = 20;

@ApiTags('Trend Radar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/trends')
export class TrendRadarController {
  constructor(
    private readonly trendRadarService: TrendRadarService,
    private readonly prisma: PrismaService,
    @InjectQueue('trend-radar') private readonly trendQueue: Queue,
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
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a trend data refresh from all sources' })
  async refreshTrends() {
    // Simple rate limit: 1 refresh per 10 minutes
    const now = Date.now();
    if (now - this.lastRefreshAt < 10 * 60 * 1000) {
      throw new ForbiddenException('errors.trendRadar.rateLimited');
    }
    this.lastRefreshAt = now;

    const job = await this.trendQueue.add(
      'refresh',
      { includeScraper: true },
      { attempts: 2, backoff: { type: 'exponential', delay: 30000 } },
    );

    return { success: true, jobId: job.id, message: '趨勢掃描已啟動，請稍後重新整理頁面' };
  }

  @Get(':fingerprint/history')
  @ApiOperation({ summary: 'Get trend history by fingerprint (7d/14d/30d)' })
  async getTrendHistory(
    @Param('fingerprint') fingerprint: string,
    @Query('period') period?: string,
  ) {
    if (!/^[a-f0-9]{16}$/.test(fingerprint)) {
      throw new BadRequestException('errors.trendRadar.invalidFingerprint');
    }
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 14;
    const history = await this.trendRadarService.getTrendHistory(fingerprint, days);
    if (!history) {
      throw new NotFoundException('errors.trendRadar.trendNotFound');
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
      throw new ForbiddenException('errors.trendRadar.maxKeywords');
    }

    // Check duplicate
    const existing = await this.prisma.trendKeyword.findUnique({
      where: { userId_keyword: { userId, keyword: dto.keyword.trim() } },
    });
    if (existing) {
      throw new ConflictException('errors.trendRadar.keywordAlreadyTracked');
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
      throw new NotFoundException('errors.trendRadar.keywordNotFound');
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
      preferredPlatforms: [],
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

  // ─── Custom RSS Sources ───

  @Get('rss')
  @ApiOperation({ summary: 'List custom RSS sources' })
  async listCustomRss(
    @CurrentUser('id') userId: string,
  ) {
    return this.prisma.customRssSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('rss')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a custom RSS source (max 10)' })
  async addCustomRss(
    @Body() dto: CreateCustomRssDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const count = await this.prisma.customRssSource.count({ where: { userId } });
    if (count >= 10) {
      throw new ForbiddenException('errors.trendRadar.maxRssSources');
    }

    const existing = await this.prisma.customRssSource.findUnique({
      where: { userId_url: { userId, url: dto.url } },
    });
    if (existing) {
      throw new ConflictException('errors.trendRadar.rssAlreadyAdded');
    }

    return this.prisma.customRssSource.create({
      data: {
        userId,
        tenantId,
        name: dto.name,
        url: dto.url,
      },
    });
  }

  @Delete('rss/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a custom RSS source' })
  async deleteCustomRss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const source = await this.prisma.customRssSource.findFirst({
      where: { id, userId },
    });
    if (!source) {
      throw new NotFoundException('errors.trendRadar.rssNotFound');
    }
    await this.prisma.customRssSource.delete({ where: { id } });
  }
}
