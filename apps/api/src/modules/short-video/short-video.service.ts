import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { join, basename } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export interface ShortVideoResult {
  id: string;
  title: string;
  outputPath: string;
  outputUrl: string;
  format: '9:16' | '1:1';
  durationSeconds: number;
  subtitlePath?: string;
  thumbnailUrl?: string;
  hashtags: string[];
  suggestedCaption: string;
}

@Injectable()
export class ShortVideoService {
  private readonly logger = new Logger(ShortVideoService.name);
  private readonly outputDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    this.outputDir = join(process.cwd(), 'uploads', 'shorts');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a short video from a clip of a longer video
   */
  async generateShort(
    videoId: string,
    clipId: string,
    userId: string,
    options?: {
      format?: '9:16' | '1:1';
      addSubtitles?: boolean;
      platform?: string; // youtube_shorts, instagram_reels, tiktok
    },
  ): Promise<ShortVideoResult> {
    const format = options?.format ?? '9:16';
    const platform = options?.platform ?? 'youtube_shorts';

    // Get the video and clip from DB
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.userId !== userId) {
      throw new NotFoundException('Video not found');
    }

    const clip = await this.prisma.videoClip.findUnique({ where: { id: clipId } });
    if (!clip || clip.videoId !== videoId) {
      throw new NotFoundException('Clip not found');
    }

    // Find the source video file
    const sourceFile = this.findSourceFile(video.originalUrl);
    if (!sourceFile) {
      throw new BadRequestException('原始影片檔案不存在，請重新上傳');
    }

    // Generate output filename
    const shortId = `short-${Date.now()}`;
    const outputFile = join(this.outputDir, `${shortId}.mp4`);
    const thumbnailFile = join(this.outputDir, `${shortId}-thumb.jpg`);

    // Step 1: Cut and resize the video
    this.logger.log(`Generating short: ${clip.startTime}s - ${clip.endTime}s, format: ${format}`);

    await this.cutAndResize(sourceFile, outputFile, {
      startTime: clip.startTime,
      endTime: clip.endTime,
      format,
    });

    // Step 2: Generate thumbnail
    await this.generateThumbnail(outputFile, thumbnailFile);

    // Step 3: Generate subtitles if requested
    let subtitlePath: string | null | undefined;
    if (options?.addSubtitles) {
      try {
        subtitlePath = await this.generateSubtitles(outputFile, shortId);
        // Burn subtitles into video
        if (subtitlePath) {
          const withSubsFile = join(this.outputDir, `${shortId}-subs.mp4`);
          await this.burnSubtitles(outputFile, subtitlePath, withSubsFile);
          // Replace original with subtitled version
          unlinkSync(outputFile);
          const { renameSync } = require('fs');
          renameSync(withSubsFile, outputFile);
        }
      } catch (e) {
        this.logger.warn(`Subtitle generation failed: ${(e as Error).message}`);
      }
    }

    // Step 4: Use AI to generate platform-specific caption and hashtags
    // Get transcript for context
    const transcriptRaw = video.transcript;
    let transcriptStr = '';
    if (transcriptRaw) {
      try {
        transcriptStr = typeof transcriptRaw === 'string' ? transcriptRaw : JSON.parse(JSON.stringify(transcriptRaw));
        if (typeof transcriptStr !== 'string') transcriptStr = String(transcriptStr);
      } catch { transcriptStr = String(transcriptRaw); }
    }

    const platformStrategy = {
      youtube_shorts: {
        name: 'YouTube Shorts',
        titleRule: '15字以內，用問句或數字開頭製造好奇心（如「3個你不知道的...」）',
        captionRule: '50-100字，開頭要有 Hook，加上 #Shorts 標籤',
        hashtagRule: '5-8個，必含 #Shorts，混合熱門標籤和精準標籤',
        tone: '專業但親切，適合教學和知識分享',
      },
      instagram_reels: {
        name: 'Instagram Reels',
        titleRule: '12字以內，口語化、帶 emoji，像跟朋友對話',
        captionRule: '80-120字，大量 emoji，分段落，結尾用問句引導留言',
        hashtagRule: '8-12個，混合大標籤（百萬+）和小標籤（萬級），加上中文標籤',
        tone: '活潑可愛，帶點生活感和親近感',
      },
      tiktok: {
        name: 'TikTok',
        titleRule: '10字以內，直擊痛點或製造爭議（如「別再這樣做了！」）',
        captionRule: '30-50字，極短、口語化，第一句就是 Hook',
        hashtagRule: '3-5個，優先使用平台熱門挑戰標籤，不要太多',
        tone: '年輕化、口語化、帶梗，像在跟同齡人聊天',
      },
    }[platform] ?? {
      name: platform,
      titleRule: '15字以內，吸引人的標題',
      captionRule: '50-100字的描述文案',
      hashtagRule: '5-8個相關 hashtag',
      tone: '專業友善',
    };

    const transcriptContext = transcriptStr
      ? `\n\n影片逐字稿（前 500 字）：\n${transcriptStr.slice(0, 500)}`
      : '';

    const aiContent = await this.aiService.generateJson<{
      title: string;
      caption: string;
      hashtags: string[];
    }>(
      `你是 ${platformStrategy.name} 短影片內容策略專家，深諳該平台的演算法和用戶偏好。

請根據影片素材生成最適合 ${platformStrategy.name} 的內容：
- **title**: ${platformStrategy.titleRule}
- **caption**: ${platformStrategy.captionRule}
- **hashtags**: ${platformStrategy.hashtagRule}（不含 # 符號）

語氣風格：${platformStrategy.tone}

⚠️ 重要：所有內容必須基於影片的實際內容（標題、片段名稱、逐字稿），不能編造與影片無關的主題。

回覆 JSON: { "title": "...", "caption": "...", "hashtags": [...] }`,
      `原始影片標題：${video.title}\n片段標題：${clip.title}\n片段長度：${clip.endTime - clip.startTime}秒\n平台：${platformStrategy.name}${transcriptContext}`,
      { maxTokens: 500 },
    );

    const duration = clip.endTime - clip.startTime;
    const outputUrl = `/uploads/shorts/${basename(outputFile)}`;
    const thumbUrl = `/uploads/shorts/${basename(thumbnailFile)}`;

    // Update clip record
    await this.prisma.videoClip.update({
      where: { id: clipId },
      data: {
        clipUrl: outputUrl,
        thumbnailUrl: thumbUrl,
        status: 'READY',
      },
    });

    return {
      id: shortId,
      title: aiContent?.title || clip.title,
      outputPath: outputFile,
      outputUrl,
      format,
      durationSeconds: duration,
      subtitlePath: subtitlePath ?? undefined,
      thumbnailUrl: thumbUrl,
      hashtags: aiContent?.hashtags ?? [],
      suggestedCaption: aiContent?.caption ?? '',
    };
  }

  /**
   * Generate shorts from ALL clips of a video
   */
  async generateAllShorts(
    videoId: string,
    userId: string,
    options?: { format?: '9:16' | '1:1'; addSubtitles?: boolean; platform?: string },
  ): Promise<ShortVideoResult[]> {
    const clips = await this.prisma.videoClip.findMany({
      where: { videoId },
      orderBy: { startTime: 'asc' },
    });

    if (clips.length === 0) {
      throw new BadRequestException('此影片尚無剪輯片段，請先生成 AI 片段');
    }

    const results: ShortVideoResult[] = [];
    for (const clip of clips) {
      try {
        const result = await this.generateShort(videoId, clip.id, userId, options);
        results.push(result);
      } catch (e) {
        this.logger.warn(`Failed to generate short for clip ${clip.id}: ${(e as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Cut video segment and resize to target format
   */
  private cutAndResize(
    inputFile: string,
    outputFile: string,
    options: { startTime: number; endTime: number; format: '9:16' | '1:1' },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = options.endTime - options.startTime;

      // Target dimensions
      const [width, height] = options.format === '9:16' ? [1080, 1920] : [1080, 1080];

      // Use crop + scale filter to convert horizontal to vertical
      // Center crop the video, then scale to target
      const vf =
        options.format === '9:16'
          ? `crop=ih*9/16:ih,scale=${width}:${height}`
          : `crop=min(iw\\,ih):min(iw\\,ih),scale=${width}:${height}`;

      ffmpeg(inputFile)
        .setStartTime(options.startTime)
        .setDuration(duration)
        .videoFilter(vf)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
        ])
        .output(outputFile)
        .on('start', (cmd) => this.logger.debug(`FFmpeg: ${cmd}`))
        .on('end', () => {
          this.logger.log(`Short generated: ${outputFile}`);
          resolve();
        })
        .on('error', (err) => {
          this.logger.error(`FFmpeg error: ${err.message}`);
          reject(new BadRequestException(`影片處理失敗: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Generate a thumbnail from the video
   */
  private generateThumbnail(videoFile: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoFile)
        .screenshots({
          count: 1,
          folder: this.outputDir,
          filename: basename(outputFile),
          size: '540x960',
          timestamps: ['50%'],
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          this.logger.warn(`Thumbnail failed: ${err.message}`);
          resolve(); // Don't fail the whole process for thumbnails
        });
    });
  }

  /**
   * Generate SRT subtitles using OpenAI Whisper
   */
  private async generateSubtitles(videoFile: string, shortId: string): Promise<string | null> {
    const srtFile = join(this.outputDir, `${shortId}.srt`);

    try {
      // Extract audio first
      const audioFile = join(this.outputDir, `${shortId}-audio.mp3`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoFile)
          .outputOptions(['-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-y'])
          .output(audioFile)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // Use injected AiService for Whisper transcription
      const srtContent = await this.aiService.transcribe(audioFile, {
        language: 'zh',
        responseFormat: 'srt',
      });

      // Polish subtitles with GPT
      const polished = await this.aiService.polishSubtitles(srtContent);

      // Write SRT file
      const { writeFileSync } = require('fs');
      writeFileSync(srtFile, polished, 'utf-8');

      // Clean up audio file
      if (existsSync(audioFile)) unlinkSync(audioFile);

      this.logger.log(`Subtitles generated: ${srtFile}`);
      return srtFile;
    } catch (e) {
      this.logger.warn(`Whisper transcription failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Burn SRT subtitles into video
   */
  private burnSubtitles(
    inputFile: string,
    srtFile: string,
    outputFile: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Escape path for FFmpeg filter
      const escapedSrt = srtFile.replace(/:/g, '\\:').replace(/'/g, "\\'");

      ffmpeg(inputFile)
        .videoFilter(`subtitles='${escapedSrt}':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,MarginV=30'`)
        .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-y'])
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Find the source video file on disk
   */
  private findSourceFile(originalUrl: string | null): string | null {
    if (!originalUrl) return null;

    // If it's a local upload path
    if (originalUrl.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), originalUrl);
      return existsSync(filePath) ? filePath : null;
    }

    // Remote URL — FFmpeg can handle http(s) URLs directly
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      return originalUrl;
    }

    return null;
  }

  private platformName(platform: string): string {
    const names: Record<string, string> = {
      youtube_shorts: 'YouTube Shorts',
      instagram_reels: 'Instagram Reels',
      tiktok: 'TikTok',
    };
    return names[platform] ?? platform;
  }
}
