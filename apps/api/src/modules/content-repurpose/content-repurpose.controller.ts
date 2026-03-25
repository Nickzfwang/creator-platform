import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContentRepurposeService } from './content-repurpose.service';
import { UpdateRepurposeItemDto } from './dto/update-repurpose-item.dto';
import { ScheduleItemsDto } from './dto/schedule-items.dto';
import { CreateCampaignFromItemDto } from './dto/create-campaign.dto';

@ApiTags('Content Repurpose')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/content-repurpose')
export class ContentRepurposeController {
  constructor(private readonly contentRepurposeService: ContentRepurposeService) {}

  @Get('video/:videoId')
  @ApiOperation({ summary: '取得影片的再利用 job 及所有生成項目' })
  async getJobByVideoId(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentRepurposeService.getJobByVideoId(videoId, userId);
  }

  @Post('video/:videoId/generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '手動觸發或重新生成內容再利用' })
  async triggerGeneration(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.contentRepurposeService.triggerGeneration(videoId, userId, tenantId);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: '編輯單一再利用項目內容' })
  async updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRepurposeItemDto,
  ) {
    return this.contentRepurposeService.updateItem(itemId, userId, dto);
  }

  @Post('items/:itemId/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '還原為 AI 原始版本' })
  async resetItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentRepurposeService.resetItem(itemId, userId);
  }

  @Post('items/:itemId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新生成單一項目' })
  async regenerateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentRepurposeService.regenerateItem(itemId, userId);
  }

  @Post('items/schedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '批次排程選中的社群貼文項目' })
  async scheduleItems(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ScheduleItemsDto,
  ) {
    return this.contentRepurposeService.scheduleItems(userId, tenantId, dto);
  }

  @Post('items/:itemId/create-campaign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '將 Email 項目建立為 Email Campaign' })
  async createCampaign(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCampaignFromItemDto,
  ) {
    return this.contentRepurposeService.createCampaignFromItem(itemId, userId, tenantId, dto);
  }
}
