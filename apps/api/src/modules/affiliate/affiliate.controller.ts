import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AffiliateService } from './affiliate.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import { ListLinksQueryDto } from './dto/list-links-query.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Affiliate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Post('links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new affiliate tracking link' })
  async createLink(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateLinkDto,
  ) {
    return this.affiliateService.createLink(userId, tenantId, dto);
  }

  @Get('links')
  @ApiOperation({ summary: 'List affiliate links (cursor-based pagination)' })
  async listLinks(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListLinksQueryDto,
  ) {
    return this.affiliateService.findAll(userId, tenantId, query);
  }

  @Get('links/:id')
  @ApiOperation({ summary: 'Get affiliate link detail with event summary' })
  async getLink(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.affiliateService.findById(userId, tenantId, id);
  }

  @Patch('links/:id')
  @ApiOperation({ summary: 'Update affiliate link' })
  async updateLink(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.affiliateService.update(userId, tenantId, id, dto);
  }

  @Delete('links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate affiliate link (soft delete)' })
  async deactivateLink(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.affiliateService.deactivate(userId, tenantId, id);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a conversion event (external callback)' })
  async createEvent(@Body() dto: CreateEventDto) {
    return this.affiliateService.createEvent(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get affiliate marketing statistics' })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: StatsQueryDto,
  ) {
    return this.affiliateService.getStats(userId, tenantId, query.period, query.linkId);
  }
}

// Separate controller for public redirect endpoint
@Controller('r')
export class AffiliateRedirectController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Get(':trackingCode')
  @ApiExcludeEndpoint()
  async redirect(
    @Param('trackingCode') trackingCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const targetUrl = await this.affiliateService.handleRedirect(trackingCode, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'],
    });
    res.redirect(302, targetUrl);
  }
}
