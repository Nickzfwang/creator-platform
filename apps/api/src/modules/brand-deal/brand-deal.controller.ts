import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrandDealService } from './brand-deal.service';

@ApiTags('Brand Deals')
@ApiBearerAuth()
@Controller('brand-deals')
export class BrandDealController {
  constructor(private readonly brandDealService: BrandDealService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a brand deal media kit / proposal' })
  async generate(
    @Body()
    body: {
      brandName: string;
      deliverables: string[];
      budget?: number;
    },
  ) {
    return this.brandDealService.generate(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all brand deals' })
  async findAll(@Query('status') status?: string) {
    return this.brandDealService.findAll(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a brand deal' })
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.brandDealService.update(id, body);
  }
}
