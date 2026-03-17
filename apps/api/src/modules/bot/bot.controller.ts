import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BotService } from './bot.service';

@ApiTags('Bot')
@ApiBearerAuth()
@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('config')
  @ApiOperation({ summary: 'Create or update bot configuration' })
  async setConfig(
    @Body()
    body: {
      name: string;
      personality: string;
      systemPrompt?: string;
      knowledgeBaseIds?: string[];
    },
  ) {
    return this.botService.setConfig(body);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get current bot configuration' })
  async getConfig() {
    return this.botService.getConfig();
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Send a chat message to the bot' })
  async chat(
    @Param('id') id: string,
    @Body() body: { message: string; conversationId?: string },
  ) {
    return this.botService.chat(id, body);
  }
}
