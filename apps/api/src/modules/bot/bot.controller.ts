import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BotService } from './bot.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ListBotsQueryDto } from './dto/list-bots-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Bots')
@Controller('v1/bots')
export class BotController {
  constructor(private readonly botService: BotService) {}

  // ─── Bot Config (Owner, requires auth) ───

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new bot configuration' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateBotDto,
  ) {
    return this.botService.create(userId, tenantId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my bots (cursor-based pagination)' })
  async findAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListBotsQueryDto,
  ) {
    return this.botService.findAll(userId, tenantId, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get bot detail' })
  async findById(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.botService.findById(userId, tenantId, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update bot configuration' })
  async update(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotDto,
  ) {
    return this.botService.update(userId, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete bot and all conversations' })
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.botService.remove(userId, tenantId, id);
  }

  @Get(':id/conversations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List conversations for a bot' })
  async getConversations(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListBotsQueryDto,
  ) {
    return this.botService.getConversations(userId, tenantId, id, query.limit, query.cursor);
  }

  // ─── Public Endpoints (no auth) ───

  @Get(':id/public')
  @ApiOperation({ summary: 'Get public bot info (no auth, public bots only)' })
  async getPublicBot(@Param('id', ParseUUIDPipe) id: string) {
    return this.botService.getPublicBot(id);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Send a chat message to a bot (public for public bots)' })
  async chat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.botService.chat(id, dto);
  }
}
