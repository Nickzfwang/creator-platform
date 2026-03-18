import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';

class AiChatDto {
  @IsString()
  message: string;

  @IsArray()
  @IsOptional()
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

class GenerateScriptDto {
  @IsString()
  topic: string;

  @IsString()
  @IsOptional()
  style?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(60)
  targetLength?: number;

  @IsString()
  @IsOptional()
  targetAudience?: string;

  @IsString()
  @IsOptional()
  additionalNotes?: string;
}

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI Creator Assistant - chat with context' })
  async chat(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AiChatDto,
  ) {
    // Gather creator context for personalized responses
    const [user, videoCount, postCount, memberCount, socialAccounts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } }),
      this.prisma.video.count({ where: { userId } }),
      this.prisma.post.count({ where: { userId } }),
      this.prisma.membership.count({ where: { creator: { id: userId } } }),
      this.prisma.socialAccount.findMany({
        where: { userId },
        select: { platform: true, platformUsername: true, followerCount: true },
      }),
    ]);

    const creatorContext = [
      `創作者名稱：${user?.displayName ?? '創作者'}`,
      `影片數量：${videoCount}`,
      `排程貼文數：${postCount}`,
      `會員數：${memberCount}`,
      socialAccounts.length > 0
        ? `社群帳號：${socialAccounts.map((a) => `${a.platform}(@${a.platformUsername}, ${a.followerCount ?? 0}粉絲)`).join(', ')}`
        : '尚未連結社群帳號',
    ].join('\n');

    const systemPrompt = `你是 Creator Platform 的 AI 創作助手「小創」。你的任務是幫助創作者成長和變現。

你了解這位創作者的資料：
${creatorContext}

你的能力：
1. 📊 分析數據趨勢，給出成長建議
2. 💡 提供內容創意和影片主題靈感
3. 📝 幫忙撰寫文案、腳本大綱
4. 🤝 品牌合作策略建議
5. 💰 變現模式優化建議
6. 📅 排程策略和最佳發布時間建議

回覆要求：
- 使用繁體中文
- 語氣親切專業，像一個資深的創作者顧問
- 回答簡潔有力，每次回覆控制在 200 字以內
- 適當使用 emoji 增加可讀性
- 給出具體可執行的建議，不要空泛的回答`;

    const messages = [
      ...(dto.history ?? []),
      { role: 'user' as const, content: dto.message },
    ];

    const reply = await this.aiService.chatWithHistory(
      systemPrompt,
      messages,
      { model: 'gpt-4o-mini', maxTokens: 512, temperature: 0.7 },
    );

    return { reply };
  }

  @Post('generate-script')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI generate video script/outline' })
  async generateScript(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateScriptDto,
  ) {
    const systemPrompt = `你是一位頂尖的 YouTube 影片腳本撰寫師，擅長製作吸引人的影片內容。

請根據提供的主題和參數，生成一份完整的影片腳本大綱。

腳本格式要求：
1. 🎬 影片標題（吸引點擊，含關鍵字）
2. 📝 影片簡介（YouTube 描述欄用，50-100 字）
3. 🎯 目標觀眾（誰會看這支影片）
4. ⏱️ 建議時長
5. 📋 腳本大綱：
   - 🪝 Hook 開頭（前 15 秒，抓住注意力）
   - 📖 主體內容（分 3-5 個段落，每段含重點和預估時長）
   - 🎬 結尾 CTA（呼籲行動）
6. 💡 拍攝建議（場景、鏡位、道具）
7. #️⃣ 推薦標籤（5-8 個 hashtag）
8. 🔍 SEO 關鍵字（3-5 個）

使用繁體中文，語氣專業但有趣。用 emoji 和 markdown 格式增加可讀性。`;

    const userMsg = [
      `主題：${dto.topic}`,
      dto.style ? `風格：${dto.style}` : '',
      dto.targetLength ? `目標時長：${dto.targetLength} 分鐘` : '',
      dto.targetAudience ? `目標觀眾：${dto.targetAudience}` : '',
      dto.additionalNotes ? `補充說明：${dto.additionalNotes}` : '',
    ].filter(Boolean).join('\n');

    const script = await this.aiService.chat(
      systemPrompt,
      userMsg,
      { model: 'gpt-4o-mini', maxTokens: 2048, temperature: 0.8 },
    );

    return { script, topic: dto.topic, generatedAt: new Date().toISOString() };
  }
}
