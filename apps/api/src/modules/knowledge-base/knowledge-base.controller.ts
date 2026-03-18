import {
  Controller,
  Get,
  Post,
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
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { IngestContentDto } from './dto/ingest-content.dto';
import { ListKnowledgeBasesQueryDto } from './dto/list-knowledge-bases-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/knowledge-bases')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new knowledge base' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.kbService.create(userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge bases (cursor-based pagination)' })
  async findAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListKnowledgeBasesQueryDto,
  ) {
    return this.kbService.findAll(userId, tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get knowledge base detail' })
  async findById(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.kbService.findById(userId, tenantId, id);
  }

  @Post(':id/ingest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest text content into knowledge base (chunk + store)' })
  async ingest(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IngestContentDto,
  ) {
    return this.kbService.ingest(userId, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete knowledge base and all chunks' })
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.kbService.remove(userId, tenantId, id);
  }
}
