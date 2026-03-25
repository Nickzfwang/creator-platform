import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MonetizeService } from './monetize.service';

@ApiTags('Monetize')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/monetize')
export class MonetizeController {
  constructor(private readonly monetizeService: MonetizeService) {}

  @Get('health')
  @ApiOperation({ summary: '收入健診報告' })
  async getHealth(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.monetizeService.getHealth(userId, tenantId, period);
  }

  @Get('advice')
  @ApiOperation({ summary: 'AI 變現建議' })
  async getAdvice(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.monetizeService.getAdvice(userId, tenantId);
  }

  @Get('forecast')
  @ApiOperation({ summary: '收入預測' })
  async getForecast(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.monetizeService.getForecast(userId, tenantId);
  }
}
