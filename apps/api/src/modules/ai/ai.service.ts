import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_LIMITS, PlanLimits } from '../payment/constants/plan-limits';

export type AiProvider = 'claude' | 'openai';

interface AiUsageContext {
  tenantId: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private defaultProvider: AiProvider = 'claude';

  constructor(private readonly prisma: PrismaService) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.log('OpenAI client initialized');
    } else {
      this.logger.warn('OPENAI_API_KEY not set — Whisper/Embedding features unavailable');
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
      this.logger.log('Anthropic client initialized');
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — Claude features unavailable');
    }

    // Default to Claude if available, fallback to OpenAI
    if (this.anthropic) {
      this.defaultProvider = 'claude';
    } else if (this.openai) {
      this.defaultProvider = 'openai';
    }
  }

  get isAvailable(): boolean {
    return this.anthropic !== null || this.openai !== null;
  }

  /** Map OpenAI model names to Claude equivalents */
  private mapModelToClaude(openaiModel?: string): string {
    switch (openaiModel) {
      case 'gpt-4o-mini':
        return 'claude-haiku-4-5-20251001';
      case 'gpt-4o':
      default:
        return 'claude-sonnet-4-6';
    }
  }

  /**
   * Check if tenant has remaining AI quota. Returns true if allowed.
   */
  async checkAiQuota(tenantId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    if (!subscription) return { allowed: true, used: 0, limit: 50 }; // default FREE limits

    const limits = (subscription.limits as unknown as PlanLimits) ?? PLAN_LIMITS[subscription.plan];
    const usage = (subscription.usage as Record<string, number>) ?? {};
    const used = usage.aiCallsUsed ?? 0;
    const limit = limits.aiCallsPerMonth;

    if (limit === -1) return { allowed: true, used, limit: -1 };
    return { allowed: used < limit, used, limit };
  }

  /**
   * Record an AI call usage (fire-and-forget)
   */
  private async recordAiUsage(tenantId?: string): Promise<void> {
    if (!tenantId) return;
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: { tenantId },
      });
      if (!subscription) return;

      const usage = (subscription.usage as Record<string, number>) ?? {};
      const updated = { ...usage, aiCallsUsed: (usage.aiCallsUsed ?? 0) + 1 };

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { usage: updated as any },
      });
    } catch (err) {
      this.logger.warn(`Failed to record AI usage: ${err}`);
    }
  }

  /**
   * General-purpose chat completion
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number; temperature?: number; context?: AiUsageContext; provider?: AiProvider },
  ): Promise<string> {
    const provider = options?.provider ?? this.defaultProvider;

    if (provider === 'claude' && this.anthropic) {
      return this.chatWithClaude(systemPrompt, userMessage, options);
    }
    if (this.openai) {
      return this.chatWithOpenAI(systemPrompt, userMessage, options);
    }
    return this.fallbackReply(userMessage);
  }

  private async chatWithClaude(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number; temperature?: number; context?: AiUsageContext },
  ): Promise<string> {
    try {
      const response = await this.anthropic!.messages.create({
        model: this.mapModelToClaude(options?.model),
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      this.recordAiUsage(options?.context?.tenantId);
      const block = response.content[0];
      return block.type === 'text' ? block.text.trim() : '';
    } catch (error) {
      this.logger.error(`Claude chat error: ${error}`);
      // Fallback to OpenAI if available
      if (this.openai) {
        this.logger.log('Falling back to OpenAI...');
        return this.chatWithOpenAI(systemPrompt, userMessage, options);
      }
      return this.fallbackReply(userMessage);
    }
  }

  private async chatWithOpenAI(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number; temperature?: number; context?: AiUsageContext },
  ): Promise<string> {
    try {
      const response = await this.openai!.chat.completions.create({
        model: options?.model ?? 'gpt-4o',
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      this.recordAiUsage(options?.context?.tenantId);
      return response.choices[0]?.message?.content?.trim() ?? '';
    } catch (error) {
      this.logger.error(`OpenAI chat error: ${error}`);
      return this.fallbackReply(userMessage);
    }
  }

  /**
   * Multi-turn conversation
   */
  async chatWithHistory(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: { model?: string; maxTokens?: number; temperature?: number; context?: AiUsageContext; provider?: AiProvider },
  ): Promise<string> {
    const provider = options?.provider ?? this.defaultProvider;
    const lastMsg = messages[messages.length - 1]?.content ?? '';

    if (provider === 'claude' && this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: this.mapModelToClaude(options?.model),
          max_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });

        this.recordAiUsage(options?.context?.tenantId);
        const block = response.content[0];
        return block.type === 'text' ? block.text.trim() : '';
      } catch (error) {
        this.logger.error(`Claude chat error: ${error}`);
        if (this.openai) {
          this.logger.log('Falling back to OpenAI...');
        } else {
          return this.fallbackReply(lastMsg);
        }
      }
    }

    if (!this.openai) return this.fallbackReply(lastMsg);

    try {
      const response = await this.openai.chat.completions.create({
        model: options?.model ?? 'gpt-4o',
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      });

      this.recordAiUsage(options?.context?.tenantId);
      return response.choices[0]?.message?.content?.trim() ?? '';
    } catch (error) {
      this.logger.error(`OpenAI chat error: ${error}`);
      return this.fallbackReply(lastMsg);
    }
  }

  /**
   * Generate structured JSON output
   */
  async generateJson<T>(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number; context?: AiUsageContext; provider?: AiProvider },
  ): Promise<T | null> {
    const provider = options?.provider ?? this.defaultProvider;

    if (provider === 'claude' && this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: this.mapModelToClaude(options?.model),
          max_tokens: options?.maxTokens ?? 2048,
          temperature: 0.5,
          system: systemPrompt + '\n\nRespond in valid JSON only. Do not include any text outside the JSON.',
          messages: [
            { role: 'user', content: userMessage },
          ],
        });

        this.recordAiUsage(options?.context?.tenantId);
        const block = response.content[0];
        const raw = block.type === 'text' ? block.text.trim() : '';
        // Extract JSON from response (strip markdown fences if present)
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in Claude response');
        return JSON.parse(jsonMatch[0]);
      } catch (error) {
        this.logger.error(`Claude JSON generation error: ${error}`);
        if (this.openai) {
          this.logger.log('Falling back to OpenAI for JSON generation...');
        } else {
          return null;
        }
      }
    }

    if (!this.openai) return null;

    try {
      const response = await this.openai.chat.completions.create({
        model: options?.model ?? 'gpt-4o',
        max_tokens: options?.maxTokens ?? 2048,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt + '\n\nRespond in valid JSON only.' },
          { role: 'user', content: userMessage },
        ],
      });

      this.recordAiUsage(options?.context?.tenantId);
      const content = response.choices[0]?.message?.content?.trim();
      return content ? JSON.parse(content) : null;
    } catch (error) {
      this.logger.error(`OpenAI JSON generation error: ${error}`);
      return null;
    }
  }

  /**
   * Transcribe audio/video to text using Whisper
   */
  async transcribe(
    filePath: string,
    options?: { language?: string; responseFormat?: 'json' | 'srt' | 'vtt' | 'text' },
  ): Promise<string> {
    if (!this.openai) throw new Error('OpenAI not configured');

    const { createReadStream } = require('fs');
    const format = options?.responseFormat ?? 'srt';

    const result = await this.openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
      response_format: format,
      language: options?.language ?? 'zh',
    });

    // Whisper returns string for srt/vtt/text formats
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  /**
   * Transcribe with word-level timestamps using Whisper verbose_json
   */
  async transcribeVerbose(
    filePath: string,
    options?: { language?: string },
  ): Promise<{ text: string; words: Array<{ word: string; start: number; end: number }> }> {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured, returning empty transcription');
      return { text: '', words: [] };
    }

    try {
      const { createReadStream } = require('fs');

      const result = await this.openai.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        language: options?.language ?? 'zh',
      });

      const words = (result as any).words ?? [];
      const text = (result as any).text ?? '';

      return {
        text,
        words: words.map((w: any) => ({
          word: String(w.word ?? ''),
          start: Number(w.start ?? 0),
          end: Number(w.end ?? 0),
        })),
      };
    } catch (error) {
      this.logger.error(`Whisper verbose transcription error: ${error}`);
      throw new Error(`Transcription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Polish/correct subtitle text using AI
   */
  async polishSubtitles(srtContent: string, provider?: AiProvider): Promise<string> {
    const useProvider = provider ?? this.defaultProvider;

    const systemPrompt = `你是專業的字幕校正專家，擅長處理科技、教學、生活類影片字幕。請修正以下 SRT 字幕，保持 SRT 格式不變。

校正規則（嚴格遵守）：
1. **語音辨識錯誤修正**：
   - 修正同音字錯誤（如「在線」→「在線」、「因該」→「應該」）
   - 科技專有名詞統一（如 AI、API、Python、JavaScript、YouTube、iPhone 等保持英文原形）
   - 品牌名稱保持正確拼寫

2. **斷句優化**：
   - 每行最多 15 個中文字（含標點符號）
   - 在語意完整處斷句，不要斷在詞語中間
   - 短句可合併，避免只有 2-3 個字的行

3. **標點符號**：
   - 加入適當的逗號、句號、問號
   - 語氣詞後加逗號（如「嗯，」「對，」「所以，」）
   - 列舉項目間加頓號

4. **不可改動的項目**：
   - 不改變時間軸（時間碼）
   - 不改變字幕序號
   - 不增加或刪除字幕段落
   - 不改變原意

直接回覆修正後的完整 SRT 內容，不要加任何說明。`;

    if (useProvider === 'claude' && this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: srtContent }],
        });

        const block = response.content[0];
        return block.type === 'text' ? block.text.trim() : srtContent;
      } catch (error) {
        this.logger.error(`Claude subtitle polishing failed: ${error}`);
        if (this.openai) {
          this.logger.log('Falling back to OpenAI for subtitle polishing...');
        } else {
          return srtContent;
        }
      }
    }

    if (!this.openai) return srtContent;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: srtContent },
        ],
      });

      return response.choices[0]?.message?.content?.trim() ?? srtContent;
    } catch (error) {
      this.logger.error(`OpenAI subtitle polishing failed: ${error}`);
      return srtContent;
    }
  }

  /**
   * Generate embedding vector for text using OpenAI text-embedding-3-small
   * Returns 1536-dimensional vector for pgvector similarity search
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000), // Max ~8K tokens for embedding model
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Embedding generation failed: ${error}`);
      return null;
    }
  }

  /**
   * Batch generate embeddings (up to 2048 inputs per request)
   */
  async generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.openai || texts.length === 0) return texts.map(() => null);

    try {
      const truncated = texts.map(t => t.slice(0, 8000));
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: truncated,
      });
      return response.data.map(d => d.embedding);
    } catch (error) {
      this.logger.error(`Batch embedding generation failed: ${error}`);
      return texts.map(() => null);
    }
  }

  private fallbackReply(message: string): string {
    return `感謝您的訊息！目前 AI 功能尚未啟用（ANTHROPIC_API_KEY / OPENAI_API_KEY 未設定），請聯繫管理員。您的訊息：「${message.slice(0, 50)}...」`;
  }
}
