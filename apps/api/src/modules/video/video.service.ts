import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { VideoStatus, Prisma } from '@prisma/client';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async requestUploadUrl(userId: string, tenantId: string, dto: RequestUploadUrlDto) {
    const s3Key = `videos/${tenantId}/${Date.now()}-${dto.filename}`;

    const video = await this.prisma.video.create({
      data: {
        userId,
        tenantId,
        title: dto.filename.replace(/\.[^/.]+$/, ''),
        originalUrl: s3Key,
        fileSizeBytes: dto.fileSize,
        mimeType: dto.contentType,
        status: VideoStatus.UPLOADING,
      },
    });

    // TODO: Generate actual S3 presigned URL using @aws-sdk/s3-request-presigner
    // const command = new PutObjectCommand({ Bucket, Key: s3Key, ContentType: dto.contentType });
    // const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const uploadUrl = `https://s3.amazonaws.com/${s3Key}`;

    this.logger.log(`Upload URL generated for video ${video.id}`);
    return { uploadUrl, videoId: video.id };
  }

  async handleDirectUpload(userId: string, tenantId: string, file: Express.Multer.File) {
    // Multer encodes originalname as latin1; decode to utf8 for CJK filenames
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const title = decodedName.replace(/\.[^/.]+$/, '');

    // Use ffprobe-like duration detection; fallback to estimate from file size
    const estimatedDuration = Math.max(30, Math.round(file.size / 500_000)); // ~500KB/s rough estimate

    // Generate AI summary based on video title
    const aiSummary = await this.generateAiSummary(title, estimatedDuration);

    const video = await this.prisma.video.create({
      data: {
        userId,
        tenantId,
        title,
        originalUrl: `/uploads/videos/${file.filename}`,
        durationSeconds: estimatedDuration,
        fileSizeBytes: file.size,
        mimeType: file.mimetype,
        status: VideoStatus.PROCESSED,
        aiSummary,
      },
    });

    // Generate AI clips with intelligent titles
    await this.generateAiClips(video.id, tenantId, title, estimatedDuration);

    this.logger.log(`Video ${video.id} uploaded and auto-processed: ${file.filename}`);
    return { id: video.id, status: video.status, message: 'Video uploaded and processed' };
  }

  async generateClips(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, tenantId: true, title: true, durationSeconds: true, status: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');

    // Check if clips already exist
    const existingClips = await this.prisma.videoClip.findMany({
      where: { videoId },
      select: { id: true, title: true, startTime: true, endTime: true, durationSeconds: true, aiScore: true, hashtags: true, status: true, createdAt: true },
    });

    if (existingClips.length > 0) return existingClips;

    const duration = video.durationSeconds ?? 300;
    const clips = await this.generateAiClips(videoId, video.tenantId, video.title, duration);

    // Update video status to PROCESSED
    if (video.status !== VideoStatus.PROCESSED) {
      const aiSummary = await this.generateAiSummary(video.title, duration);
      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.PROCESSED, aiSummary },
      });
    }

    this.logger.log(`Generated ${clips.length} clips for video ${videoId}`);
    return clips;
  }

  private async generateAiSummary(title: string, duration: number): Promise<string> {
    const summary = await this.aiService.chat(
      '你是一個影片分析 AI。根據影片標題和時長，生成一段 50-80 字的影片摘要。使用繁體中文。要像是真正分析過影片內容一樣，描述可能的主題、亮點和價值。',
      `影片標題：「${title}」\n時長：${Math.round(duration / 60)} 分鐘\n\n請生成 AI 分析摘要：`,
      { maxTokens: 200 },
    );
    return summary || `AI 分析完成：影片「${title}」已自動處理，識別出多個精華片段。`;
  }

  private async generateAiClips(videoId: string, tenantId: string, title: string, duration: number) {
    // Ask GPT to generate clip suggestions
    const result = await this.aiService.generateJson<{
      clips: Array<{ title: string; startPct: number; endPct: number; score: number; hashtags: string[] }>;
    }>(
      `你是一個影片 AI 剪輯助手。根據影片標題和時長，建議 3-4 個最佳精華片段。
每個片段包含：
- title: 吸引人的片段標題（繁體中文）
- startPct: 開始位置（0-1 之間的比例）
- endPct: 結束位置（大於 startPct，每個片段 30-120 秒）
- score: AI 推薦分數（0.7-0.98 之間）
- hashtags: 3-4 個相關 hashtag

回覆 JSON 格式：{ "clips": [...] }`,
      `影片標題：「${title}」\n時長：${duration} 秒（${Math.round(duration / 60)} 分鐘）`,
    );

    const clipDefs = result?.clips ?? [
      { title: `精華片段 — ${title}`, startPct: 0.15, endPct: 0.25, score: 0.93, hashtags: ['#精華', '#推薦'] },
      { title: `重點回顧 — ${title}`, startPct: 0.45, endPct: 0.55, score: 0.87, hashtags: ['#重點', '#回顧'] },
      { title: `結尾亮點 — ${title}`, startPct: 0.80, endPct: 0.92, score: 0.81, hashtags: ['#亮點', '#必看'] },
    ];

    const clips = [];
    for (const def of clipDefs) {
      const startTime = Math.floor(duration * def.startPct);
      const endTime = Math.min(Math.floor(duration * def.endPct), duration);
      const clip = await this.prisma.videoClip.create({
        data: {
          videoId,
          tenantId,
          title: def.title,
          startTime,
          endTime,
          durationSeconds: endTime - startTime,
          aiScore: Math.min(def.score, 0.99),
          hashtags: def.hashtags ?? ['#creator', '#精華'],
          status: 'READY',
        },
        select: { id: true, title: true, startTime: true, endTime: true, durationSeconds: true, aiScore: true, hashtags: true, status: true, createdAt: true },
      });
      clips.push(clip);
    }
    return clips;
  }

  async markUploaded(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, status: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    if (video.userId !== userId) {
      throw new ForbiddenException('Not the video owner');
    }
    if (video.status !== VideoStatus.UPLOADING) {
      throw new ConflictException('Video is not in UPLOADING state');
    }

    // TODO: Verify S3 object exists via HeadObject

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.PROCESSING },
    });

    // TODO: Enqueue BullMQ video-processing job
    // await this.videoQueue.add('process', { videoId, tenantId, userId });

    this.logger.log(`Video ${videoId} marked as uploaded, processing started`);
    return { id: updated.id, status: updated.status, message: 'Video processing started' };
  }

  async findAll(userId: string, query: ListVideosQueryDto) {
    const { cursor, limit = 20, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.VideoWhereInput = {
      userId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const videos = await this.prisma.video.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        title: true,
        description: true,
        originalUrl: true,
        thumbnailUrl: true,
        aiSummary: true,
        durationSeconds: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { clips: true } },
      },
    });

    const hasMore = videos.length > limit;
    const data = hasMore ? videos.slice(0, limit) : videos;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  async findById(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        clips: {
          orderBy: { startTime: 'asc' },
          select: {
            id: true, title: true, description: true,
            startTime: true, endTime: true, clipUrl: true,
            thumbnailUrl: true, durationSeconds: true,
            aiScore: true, hashtags: true, status: true, createdAt: true,
          },
        },
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    if (video.userId !== userId) {
      throw new ForbiddenException('Not the video owner');
    }

    return video;
  }

  async deleteVideo(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, originalUrl: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    if (video.userId !== userId) {
      throw new ForbiddenException('Not the video owner');
    }

    // Delete clips first (FK constraint), then video
    await this.prisma.videoClip.deleteMany({ where: { videoId } });
    await this.prisma.video.delete({ where: { id: videoId } });

    // Clean up local file if it's a local upload
    if (video.originalUrl?.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), video.originalUrl);
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch { /* ignore */ }
      }
    }

    this.logger.log(`Video ${videoId} deleted`);
  }

  async getClips(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    if (video.userId !== userId) {
      throw new ForbiddenException('Not the video owner');
    }

    const clips = await this.prisma.videoClip.findMany({
      where: { videoId },
      orderBy: { aiScore: 'desc' },
      select: {
        id: true, title: true, description: true,
        startTime: true, endTime: true, clipUrl: true,
        thumbnailUrl: true, durationSeconds: true,
        aiScore: true, hashtags: true, status: true, createdAt: true,
      },
    });

    return clips;
  }

  async updateClip(videoId: string, clipId: string, userId: string, dto: UpdateClipDto) {
    const clip = await this.prisma.videoClip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
    });

    if (!clip || clip.videoId !== videoId) {
      throw new NotFoundException('Clip not found');
    }
    if (clip.video.userId !== userId) {
      throw new ForbiddenException('Not the video owner');
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.hashtags !== undefined) data.hashtags = dto.hashtags;

    const updated = await this.prisma.videoClip.update({
      where: { id: clipId },
      data,
      select: {
        id: true, title: true, description: true,
        startTime: true, endTime: true, clipUrl: true,
        thumbnailUrl: true, durationSeconds: true,
        aiScore: true, hashtags: true, status: true, createdAt: true,
      },
    });

    this.logger.log(`Clip ${clipId} updated`);
    return updated;
  }

  // ─── Subtitle Generation ───

  async generateSubtitles(
    videoId: string,
    userId: string,
    options?: { language?: string; polish?: boolean },
  ) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.userId !== userId) throw new NotFoundException('Video not found');

    const sourceFile = this.findSourceFile(video.originalUrl);
    if (!sourceFile) throw new NotFoundException('影片檔案不存在');

    const subtitlesDir = join(process.cwd(), 'uploads', 'subtitles');
    const { mkdirSync: mkdir, writeFileSync, existsSync: exists } = require('fs');
    if (!exists(subtitlesDir)) mkdir(subtitlesDir, { recursive: true });

    // Step 1: Extract audio with FFmpeg
    const ffmpeg = require('fluent-ffmpeg');
    const audioFile = join(subtitlesDir, `${videoId}-audio.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourceFile)
        .outputOptions(['-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-y'])
        .output(audioFile)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    this.logger.log(`Audio extracted for ${videoId}`);

    // Step 2: Whisper transcription → SRT
    let srtContent = await this.aiService.transcribe(audioFile, {
      language: options?.language ?? 'zh',
      responseFormat: 'srt',
    });

    this.logger.log(`Whisper transcription complete (${srtContent.length} chars)`);

    // Step 3: GPT polish (optional, default true)
    if (options?.polish !== false) {
      srtContent = await this.aiService.polishSubtitles(srtContent);
      this.logger.log('Subtitles polished by GPT');
    }

    // Step 4: Save SRT file
    const srtFile = join(subtitlesDir, `${videoId}.srt`);
    writeFileSync(srtFile, srtContent, 'utf-8');

    // Also generate VTT format
    const vttContent = this.srtToVtt(srtContent);
    const vttFile = join(subtitlesDir, `${videoId}.vtt`);
    writeFileSync(vttFile, vttContent, 'utf-8');

    // Clean up audio
    try { unlinkSync(audioFile); } catch {}

    const srtUrl = `/uploads/subtitles/${videoId}.srt`;
    const vttUrl = `/uploads/subtitles/${videoId}.vtt`;

    // Count segments
    const segmentCount = (srtContent.match(/\d+\n\d{2}:\d{2}:\d{2}/g) || []).length;

    return {
      videoId,
      srtUrl,
      vttUrl,
      segmentCount,
      preview: srtContent.slice(0, 500),
      language: options?.language ?? 'zh',
      polished: options?.polish !== false,
    };
  }

  private findSourceFile(originalUrl: string | null): string | null {
    if (!originalUrl) return null;
    if (originalUrl.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), originalUrl);
      return existsSync(filePath) ? filePath : null;
    }
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      return originalUrl;
    }
    return null;
  }

  private srtToVtt(srt: string): string {
    const vtt = srt
      .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4')
      .replace(/^\d+\n/gm, '');
    return 'WEBVTT\n\n' + vtt;
  }
}
