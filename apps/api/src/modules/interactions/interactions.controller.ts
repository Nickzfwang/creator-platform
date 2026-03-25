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
import { CommentCategory, CommentPriority } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InteractionsService } from './interactions.service';
import { ImportCommentsDto } from './dto/import-comments.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Interactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post('comments/import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '匯入留言' })
  async importComments(
    @Body() dto: ImportCommentsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.interactionsService.importComments(userId, tenantId, dto);
  }

  @Get('comments')
  @ApiOperation({ summary: '列出留言' })
  async listComments(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: CommentCategory,
    @Query('priority') priority?: CommentPriority,
    @Query('isReplied') isReplied?: string,
    @Query('search') search?: string,
  ) {
    return this.interactionsService.listComments(userId, tenantId, {
      cursor,
      limit: limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20,
      category,
      priority,
      isReplied: isReplied === 'true' ? true : isReplied === 'false' ? false : undefined,
      search,
    });
  }

  @Post('comments/:id/generate-reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 代擬回覆' })
  async generateReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateReplyDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.interactionsService.generateReply(id, userId, tenantId, dto);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: '更新留言（標記已回覆等）' })
  async updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.interactionsService.updateComment(id, userId, tenantId, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '刪除留言' })
  async deleteComment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.interactionsService.deleteComment(id, userId, tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: '互動統計' })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.interactionsService.getStats(userId, tenantId, period);
  }
}
