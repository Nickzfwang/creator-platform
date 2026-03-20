import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI client initialized');
    } else {
      this.logger.warn('OPENAI_API_KEY not set — AI features will use fallback responses');
    }
  }

  get isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * General-purpose chat completion
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.openai) {
      return this.fallbackReply(userMessage);
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: options?.model ?? 'gpt-4o',
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

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
    options?: { model?: string; maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.openai) {
      const lastMsg = messages[messages.length - 1]?.content ?? '';
      return this.fallbackReply(lastMsg);
    }

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

      return response.choices[0]?.message?.content?.trim() ?? '';
    } catch (error) {
      this.logger.error(`OpenAI chat error: ${error}`);
      const lastMsg = messages[messages.length - 1]?.content ?? '';
      return this.fallbackReply(lastMsg);
    }
  }

  /**
   * Generate structured JSON output
   */
  async generateJson<T>(
    systemPrompt: string,
    userMessage: string,
    options?: { model?: string; maxTokens?: number },
  ): Promise<T | null> {
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
   * Polish/correct subtitle text using GPT
   */
  async polishSubtitles(srtContent: string): Promise<string> {
    if (!this.openai) return srtContent;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `你是字幕校正專家。請修正以下 SRT 字幕的錯別字和斷句，保持 SRT 格式不變。
規則：
- 修正明顯的語音辨識錯誤
- 改善斷句，讓每行不超過15個中文字
- 加入適當的標點符號
- 不改變時間軸
- 直接回覆修正後的完整 SRT 內容`,
          },
          { role: 'user', content: srtContent },
        ],
      });

      return response.choices[0]?.message?.content?.trim() ?? srtContent;
    } catch (error) {
      this.logger.error(`Subtitle polishing failed: ${error}`);
      return srtContent;
    }
  }

  private fallbackReply(message: string): string {
    return `感謝您的訊息！目前 AI 功能尚未啟用（OPENAI_API_KEY 未設定），請聯繫管理員。您的訊息：「${message.slice(0, 50)}...」`;
  }
}
