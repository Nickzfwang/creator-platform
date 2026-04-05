import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExportService } from './export.service';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('members')
  @ApiOperation({ summary: 'Export members/subscribers as CSV' })
  async exportMembers(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.exportMembersCsv(userId, tenantId);
    const filename = `members-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Export analytics data as CSV' })
  async exportAnalytics(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period: string,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.exportAnalyticsCsv(userId, tenantId, period);
    const filename = `analytics-${period ?? '30d'}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('affiliate')
  @ApiOperation({ summary: 'Export affiliate links and stats as CSV' })
  async exportAffiliate(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.exportAffiliateCsv(userId, tenantId);
    const filename = `affiliate-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
