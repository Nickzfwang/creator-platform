import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsIn, IsNumber, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';

class ChatHistoryItemDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

class AiChatDto {
  @IsString()
  message: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  history?: ChatHistoryItemDto[];
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

    const systemPrompt = `你是 Creator Platform 的 AI 創作助手「小創」，一位擁有 10 年社群經營經驗的創作者顧問。你的使命是用數據驅動的策略，幫助創作者快速成長並實現永續變現。

你了解這位創作者的最新資料：
${creatorContext}

你的核心專長：
1. 📊 數據分析 → 識別成長瓶頸，找出突破點
2. 💡 內容策略 → 基於趨勢和受眾分析，推薦高潛力主題
3. 📝 文案撰寫 → 標題優化、腳本架構、社群文案
4. 🤝 品牌合作 → 報價策略、提案技巧、談判建議
5. 💰 變現設計 → 會員分層、數位商品定價、銷售漏斗
6. 📅 發布策略 → 最佳時段、頻率規劃、跨平台分發

回覆原則：
- 使用繁體中文
- 語氣像一個真正關心你的業內前輩——直接、誠實、有料
- 每個建議必須具體到「下一步行動」，例如不說「多發影片」，而說「本週三發一支 8 分鐘的教學影片，主題聚焦在 X，因為你的 Y 類內容互動率最高」
- 回覆控制在 200 字以內，重點加粗
- 如果創作者的想法有盲點，要直說，不要只是附和
- 適當使用 emoji 增加可讀性，但不要過度`;

    const historyMessages = (dto.history ?? []).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));
    const messages = [
      ...historyMessages,
      { role: 'user' as const, content: dto.message },
    ];

    const reply = await this.aiService.chatWithHistory(
      systemPrompt,
      messages,
      { model: 'gpt-4o', maxTokens: 512, temperature: 0.7 },
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
    const systemPrompt = `你是一位頂尖的 YouTube 影片腳本撰寫師，曾協助多位百萬訂閱創作者製作爆款內容。你深諳 YouTube 演算法和觀眾心理學。

請根據提供的主題和參數，生成一份完整的影片腳本大綱。

腳本格式要求：
1. 🎬 影片標題（2-3 個標題選項，運用好奇心缺口、數字、對比等技巧吸引點擊）
2. 📝 影片簡介（YouTube 描述欄用，含 SEO 關鍵字，80-120 字）
3. 🎯 目標觀眾（具體描述觀眾畫像、痛點和期望收穫）
4. ⏱️ 建議時長與節奏安排
5. 📋 逐段腳本大綱：
   - 🪝 Hook 開頭（前 15 秒）— 寫出具體的開場白台詞，必須在 3 秒內引起好奇心
   - 📖 主體段落（3-5 段，每段包含：核心論點、支撐案例/數據、預估時長、視覺提示）
   - ⚡ 重新抓住注意力的中場 Hook（防止中途跳出）
   - 🎬 結尾 CTA（具體的行動呼籲台詞，引導訂閱/留言/看下一部）
6. 💡 拍攝建議（場景、鏡位、B-roll 素材、道具清單）
7. ✂️ 剪輯建議（節奏、轉場、字卡、音效時機）
8. #️⃣ 推薦標籤（8-10 個 hashtag，含熱門標籤和長尾標籤）
9. 🔍 SEO 關鍵字（5 個，含搜尋量估算）
10. 📌 縮圖建議（構圖、文字、表情、色彩建議）

--- 優秀範例參考 ---
主題「如何用 AI 工具提升工作效率」的 Hook 範例：
「你知道嗎？90% 的上班族每天浪費 3 小時在重複性工作上。今天我要分享 5 個 AI 工具，幫你把這 3 小時拿回來。」

主題「新手 YouTuber 的 10 個致命錯誤」的 Hook 範例：
「我花了兩年才弄清楚這 10 件事，如果有人早點告訴我，我可能已經 10 萬訂閱了。」
---

使用繁體中文，語氣專業但有趣。用 emoji 和 markdown 格式增加可讀性。
腳本要有「說人話」的感覺，不要太書面語。`;

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
      { model: 'gpt-4o', maxTokens: 2048, temperature: 0.8 },
    );

    return { script, topic: dto.topic, generatedAt: new Date().toISOString() };
  }
}
