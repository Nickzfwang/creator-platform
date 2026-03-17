import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest content into the knowledge base' })
  async ingest(
    @Body() body: { content: string; source: string; metadata?: Record<string, unknown> },
  ) {
    return this.knowledgeBaseService.ingest(body);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge base entries' })
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.knowledgeBaseService.findAll(page, limit);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a knowledge base entry' })
  async remove(@Param('id') id: string) {
    return this.knowledgeBaseService.remove(id);
  }
}
