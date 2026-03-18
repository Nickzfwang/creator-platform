import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { OverviewQueryDto } from './dto/overview-query.dto';
import { RecentPostsQueryDto } from './dto/recent-posts-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview with metrics, trends, and platform breakdown' })
  async getOverview(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: OverviewQueryDto,
  ) {
    return this.dashboardService.getOverview(userId, tenantId, query.period);
  }

  @Get('recent-posts')
  @ApiOperation({ summary: 'Get upcoming scheduled posts' })
  async getRecentPosts(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: RecentPostsQueryDto,
  ) {
    return this.dashboardService.getRecentPosts(userId, tenantId, query.limit);
  }

  @Get('quick-stats')
  @ApiOperation({ summary: 'Get today\'s quick stats and subscription usage' })
  async getQuickStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.dashboardService.getQuickStats(userId, tenantId);
  }
}
