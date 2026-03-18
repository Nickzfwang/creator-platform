import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SocialPlatform } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsQueryDto,
  PlatformAnalyticsQueryDto,
  RevenueAnalyticsQueryDto,
} from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from '../ai/ai.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aiService: AiService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get aggregated analytics overview with period comparison' })
  async getOverview(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getOverview(userId, tenantId, query.period);
  }

  @Get('platform')
  @ApiOperation({ summary: 'Get platform-specific analytics with daily trends' })
  async getPlatformStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PlatformAnalyticsQueryDto,
  ) {
    return this.analyticsService.getPlatformStats(
      userId,
      tenantId,
      query.period,
      query.platform as SocialPlatform | undefined,
    );
  }

  @Get('comparison')
  @ApiOperation({ summary: 'Get cross-platform comparison analytics' })
  async getCrossPlatformComparison(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getCrossPlatformComparison(userId, tenantId, query.period);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue analytics (subscription + membership + affiliate)' })
  async getRevenue(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: RevenueAnalyticsQueryDto,
  ) {
    return this.analyticsService.getRevenueAnalytics(userId, tenantId, query.period, query.source);
  }

  @Get('top-content')
  @ApiOperation({ summary: 'Get top performing content ranked by views' })
  async getTopContent(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getTopContent(userId, tenantId, query.period);
  }

  @Get('ai-insights')
  @ApiOperation({ summary: 'Get AI-powered analytics insights and recommendations' })
  async getAiInsights(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    // Gather all analytics data
    const [overview, revenue, topContent] = await Promise.all([
      this.analyticsService.getOverview(userId, tenantId, query.period),
      this.analyticsService.getRevenueAnalytics(userId, tenantId, query.period),
      this.analyticsService.getTopContent(userId, tenantId, query.period),
    ]);

    const dataContext = JSON.stringify({
      period: query.period ?? '30d',
      metrics: overview.metrics,
      changes: overview.changes,
      platformBreakdown: overview.platformBreakdown,
      revenue: { subscription: revenue.subscription, membership: revenue.membership, affiliate: revenue.affiliate, total: revenue.total },
      topContent: (topContent as any)?.content?.slice(0, 5) ?? [],
    });

    const insights = await this.aiService.chat(
      `你是一位頂尖的社群媒體數據分析師和創作者成長顧問。請根據以下數據，用繁體中文提供分析和建議。

回覆格式要求（嚴格遵守）：
1. 📊 數據亮點：2-3 個最重要的數據發現（每條 1 行）
2. 💡 成長建議：3 個具體可執行的建議（每條 1-2 行）
3. ⚠️ 需要注意：1-2 個潛在風險或需要改善的地方
4. 🎯 本週行動計畫：2 個最優先的行動項目

語氣要專業但親切，像一個私人數據顧問在跟創作者對話。使用 emoji 增加可讀性。
每個區塊用標題分隔，總字數控制在 300-500 字。`,
      `以下是創作者的數據分析報告：\n${dataContext}`,
      { model: 'gpt-4o-mini', maxTokens: 800, temperature: 0.7 },
    );

    return { insights, period: query.period ?? '30d', generatedAt: new Date().toISOString() };
  }
}
