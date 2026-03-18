import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrandDealService } from './brand-deal.service';
import { CreateBrandDealDto } from './dto/create-brand-deal.dto';
import { UpdateBrandDealDto } from './dto/update-brand-deal.dto';
import { ListBrandDealsQueryDto } from './dto/list-brand-deals-query.dto';
import { GenerateProposalDto } from './dto/generate-proposal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Brand Deals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/brand-deals')
export class BrandDealController {
  constructor(private readonly brandDealService: BrandDealService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new brand deal' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateBrandDealDto,
  ) {
    return this.brandDealService.create(userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List brand deals (cursor-based pagination, filter by status/type)' })
  async findAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListBrandDealsQueryDto,
  ) {
    return this.brandDealService.findAll(userId, tenantId, query);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get deal pipeline statistics' })
  async getPipelineStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.brandDealService.getPipelineStats(userId, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get brand deal detail' })
  async findById(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.brandDealService.findById(userId, tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update brand deal (including status transitions)' })
  async update(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDealDto,
  ) {
    return this.brandDealService.update(userId, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete brand deal (DRAFT/PROPOSAL_SENT/NEGOTIATING/CANCELLED only)' })
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.brandDealService.remove(userId, tenantId, id);
  }

  @Post('generate-proposal')
  @ApiOperation({ summary: 'Generate AI proposal for a brand deal' })
  async generateProposal(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: GenerateProposalDto,
  ) {
    return this.brandDealService.generateProposal(userId, tenantId, dto);
  }
}
