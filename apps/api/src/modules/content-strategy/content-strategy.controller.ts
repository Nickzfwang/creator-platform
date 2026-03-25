import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContentStrategyService } from './content-strategy.service';
import { CompetitorService } from './competitor.service';
import { GenerateSuggestionsDto } from './dto/generate-suggestions.dto';
import { AdoptSuggestionDto } from './dto/adopt-suggestion.dto';
import { CreateCalendarItemDto } from './dto/create-calendar-item.dto';
import { UpdateCalendarItemDto } from './dto/update-calendar-item.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { AddCompetitorDto } from './dto/add-competitor.dto';
import { CreatePostFromCalendarDto } from './dto/create-post-from-calendar.dto';
import { UpdateStrategySettingsDto } from './dto/update-strategy-settings.dto';

@ApiTags('Content Strategy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/content-strategy')
export class ContentStrategyController {
  constructor(
    private readonly contentStrategyService: ContentStrategyService,
    private readonly competitorService: CompetitorService,
  ) {}

  // ─── AI 主題推薦 ───

  @Post('suggestions/generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'AI 生成主題建議' })
  async generateSuggestions(
    @Body() dto: GenerateSuggestionsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.generateSuggestions(userId, tenantId, dto);
  }

  @Get('suggestions')
  @ApiOperation({ summary: '列出主題建議' })
  async listSuggestions(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('batchId') batchId?: string,
    @Query('dismissed') dismissed?: string,
  ) {
    return this.contentStrategyService.listSuggestions(
      userId,
      tenantId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
      batchId,
      dismissed === 'true',
    );
  }

  @Post('suggestions/:id/adopt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '採用建議排入日曆' })
  async adoptSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdoptSuggestionDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.adoptSuggestion(id, userId, tenantId, dto);
  }

  @Post('suggestions/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忽略建議' })
  async dismissSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.dismissSuggestion(id, userId, tenantId);
  }

  @Post('suggestions/:id/replace')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '替換建議（換一個）' })
  async replaceSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.replaceSuggestion(id, userId, tenantId);
  }

  // ─── 內容日曆 ───

  @Get('calendar')
  @ApiOperation({ summary: '取得日曆項目' })
  async getCalendar(
    @Query() query: CalendarQueryDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.getCalendar(userId, tenantId, query);
  }

  @Post('calendar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '手動新增日曆項目' })
  async createCalendarItem(
    @Body() dto: CreateCalendarItemDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.createCalendarItem(userId, tenantId, dto);
  }

  @Patch('calendar/:id')
  @ApiOperation({ summary: '更新日曆項目' })
  async updateCalendarItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarItemDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.updateCalendarItem(id, userId, tenantId, dto);
  }

  @Delete('calendar/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '刪除日曆項目' })
  async deleteCalendarItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.deleteCalendarItem(id, userId, tenantId);
  }

  @Post('calendar/:id/create-post')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '從日曆項目建立排程 Post' })
  async createPostFromCalendar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostFromCalendarDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentStrategyService.createPostFromCalendar(id, userId, tenantId, dto);
  }

  // ─── 競品追蹤 ───

  @Post('competitors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新增競品頻道追蹤' })
  async addCompetitor(
    @Body() dto: AddCompetitorDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.competitorService.addCompetitor(userId, tenantId, dto.channelUrl);
  }

  @Get('competitors')
  @ApiOperation({ summary: '列出已追蹤的競品頻道' })
  async listCompetitors(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.competitorService.listCompetitors(userId, tenantId);
  }

  @Get('competitors/analysis')
  @ApiOperation({ summary: 'AI 競品趨勢分析' })
  async getCompetitorAnalysis(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.competitorService.getCompetitorAnalysis(userId, tenantId);
  }

  @Get('competitors/:id/videos')
  @ApiOperation({ summary: '取得競品頻道影片列表' })
  async getCompetitorVideos(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.competitorService.getCompetitorVideos(
      id,
      userId,
      tenantId,
      cursor,
      limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20,
    );
  }

  @Delete('competitors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '取消追蹤競品頻道' })
  async removeCompetitor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.competitorService.removeCompetitor(id, userId, tenantId);
  }

  // ─── 策略回顧 ───

  @Get('review')
  @ApiOperation({ summary: '策略回顧數據' })
  async getReview(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
  ) {
    return this.contentStrategyService.getReview(userId, tenantId, period, startDate);
  }

  @Get('review/insights')
  @ApiOperation({ summary: 'AI 策略洞察報告' })
  async getReviewInsights(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.contentStrategyService.getReviewInsights(userId, tenantId, period);
  }

  // ─── 設定 ───

  @Get('settings')
  @ApiOperation({ summary: '取得策略設定' })
  async getSettings(
    @CurrentUser('id') userId: string,
  ) {
    return this.contentStrategyService.getSettings(userId);
  }

  @Patch('settings')
  @ApiOperation({ summary: '更新策略設定' })
  async updateSettings(
    @Body() dto: UpdateStrategySettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentStrategyService.updateSettings(userId, dto);
  }
}
