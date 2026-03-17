import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AffiliateService } from './affiliate.service';

@ApiTags('Affiliate')
@ApiBearerAuth()
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Post('links')
  @ApiOperation({ summary: 'Create a new affiliate link' })
  async createLink(
    @Body() body: { url: string; platform: string; label?: string },
  ) {
    return this.affiliateService.createLink(body);
  }

  @Get('links')
  @ApiOperation({ summary: 'List all affiliate links' })
  async getLinks(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.affiliateService.getLinks(page, limit);
  }

  @Get('conversions')
  @ApiOperation({ summary: 'Get affiliate conversion data' })
  async getConversions(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.affiliateService.getConversions(startDate, endDate);
  }
}
