import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { VideoStatus, Prisma } from '@prisma/client';
import { join, basename } from 'path';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import * as ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ContentRepurposeService } from '../content-repurpose/content-repurpose.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

const CLIPS_DIR = join(process.cwd(), 'uploads', 'clips');
if (!existsSync(CLIPS_DIR)) {
  mkdirSync(CLIPS_DIR, { recursive: true });
}

const THUMBNAILS_DIR = join(process.cwd(), 'uploads', 'thumbnails');
if (!existsSync(THUMBNAILS_DIR)) {
  mkdirSync(THUMBNAILS_DIR, { recursive: true });
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly contentRepurposeService: ContentRepurposeService,
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

    // Use ffprobe to get actual video duration; fallback to estimate from file size
    let estimatedDuration: number;
    try {
      const ffprobeOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file.path}"`,
        { encoding: 'utf8', timeout: 10000 },
      ).trim();
      estimatedDuration = Math.round(parseFloat(ffprobeOutput));
      if (isNaN(estimatedDuration) || estimatedDuration <= 0) {
        throw new Error('Invalid duration from ffprobe');
      }
    } catch (e) {
      this.logger.warn(`ffprobe failed, falling back to estimate: ${e}`);
      estimatedDuration = Math.max(30, Math.round(file.size / 500_000));
    }

    const originalUrl = `/uploads/videos/${file.filename}`;

    // Create video record first (PROCESSING state)
    const video = await this.prisma.video.create({
      data: {
        userId,
        tenantId,
        title,
        originalUrl,
        durationSeconds: estimatedDuration,
        fileSizeBytes: file.size,
        mimeType: file.mimetype,
        status: VideoStatus.PROCESSING,
      },
    });

    // ─── Automated AI Pipeline ───
    // Step 0: Generate thumbnail from video
    try {
      const thumbnailUrl = await this.generateThumbnail(file.path, video.id, estimatedDuration);
      await this.prisma.video.update({
        where: { id: video.id },
        data: { thumbnailUrl },
      });
      this.logger.log(`Thumbnail generated for video ${video.id}`);
    } catch (e) {
      this.logger.warn(`Thumbnail generation failed for ${video.id}: ${e}`);
    }

    // Step 1: Whisper transcription (if audio exists and duration reasonable)
    let transcript: string | null = null;
    if (estimatedDuration >= 3 && estimatedDuration <= 3600) {
      try {
        transcript = await this.transcribeVideo(file.path);
        this.logger.log(`Transcript generated for ${video.id} (${transcript.length} chars)`);
      } catch (e) {
        this.logger.warn(`Transcription failed for ${video.id}: ${e}`);
      }
    }

    // Step 2: AI summary (use transcript if available for much better quality)
    const aiSummary = transcript
      ? await this.generateAiSummaryFromTranscript(title, estimatedDuration, transcript)
      : await this.generateAiSummary(title, estimatedDuration);

    // Step 2.5: If title looks like a filename (e.g. IMG_5518), generate a meaningful title from transcript
    let finalTitle = title;
    if (transcript && /^(IMG|VID|MOV|DSC|WP|Screen|Untitled|video)[_\-\s]?\d*/i.test(title)) {
      try {
        const aiTitle = await this.aiService.chat(
          '你是影片標題生成器。根據逐字稿內容，生成一個簡潔、吸引人的繁體中文標題（10-25字）。只回覆標題文字，不要加引號或其他說明。',
          `逐字稿（前 500 字）：${transcript.slice(0, 500)}`,
          { maxTokens: 60 },
        );
        if (aiTitle && aiTitle.length >= 3 && aiTitle.length <= 50) {
          finalTitle = aiTitle.replace(/[「」""'']/g, '').trim();
          this.logger.log(`Auto-generated title: "${finalTitle}" (was: "${title}")`);
        }
      } catch (e) {
        this.logger.warn(`Auto-title generation failed: ${e}`);
      }
    }

    // Step 3: Update video with transcript, summary, and potentially better title
    await this.prisma.video.update({
      where: { id: video.id },
      data: {
        title: finalTitle,
        aiSummary,
        ...(transcript ? { transcript } : {}),
        status: VideoStatus.PROCESSED,
      },
    });

    // Step 4: Generate AI clips (uses transcript for smarter cuts) + FFmpeg cut
    await this.generateAiClips(video.id, tenantId, title, estimatedDuration, transcript);

    // Step 5: Trigger content repurpose generation (async, non-blocking)
    try {
      await this.contentRepurposeService.triggerGeneration(video.id, userId, tenantId);
      this.logger.log(`Content repurpose triggered for video ${video.id}`);
    } catch (e) {
      this.logger.warn(`Content repurpose trigger failed for ${video.id}: ${e}`);
    }

    this.logger.log(`Video ${video.id} fully processed: ${file.filename}`);
    return { id: video.id, status: 'PROCESSED', message: 'Video uploaded and processed' };
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

  /**
   * Generate thumbnail from video at a specific timestamp
   */
  private async generateThumbnail(filePath: string, videoId: string, duration: number): Promise<string> {
    // Capture frame at 10% of duration (or 1s for very short videos)
    const seekTime = Math.max(1, Math.floor(duration * 0.1));
    const thumbnailFilename = `thumb-${videoId}.jpg`;
    const thumbnailPath = join(THUMBNAILS_DIR, thumbnailFilename);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .seekInput(seekTime)
        .frames(1)
        .outputOptions(['-vf', 'scale=640:-1', '-q:v', '4'])
        .output(thumbnailPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    this.logger.log(`Thumbnail generated for ${videoId}: ${thumbnailFilename}`);
    return `/uploads/thumbnails/${thumbnailFilename}`;
  }

  /**
   * Generate thumbnail for a clip at its start time
   */
  private async generateClipThumbnail(sourceFilePath: string, clipId: string, startTime: number): Promise<string> {
    const seekTime = Math.max(0, startTime + 1); // 1 second into the clip
    const thumbnailFilename = `thumb-clip-${clipId}.jpg`;
    const thumbnailPath = join(THUMBNAILS_DIR, thumbnailFilename);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourceFilePath)
        .seekInput(seekTime)
        .frames(1)
        .outputOptions(['-vf', 'scale=640:-1', '-q:v', '4'])
        .output(thumbnailPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    return `/uploads/thumbnails/${thumbnailFilename}`;
  }

  /**
   * Extract audio from video and transcribe with Whisper
   */
  private async transcribeVideo(filePath: string): Promise<string> {
    const subtitlesDir = join(process.cwd(), 'uploads', 'subtitles');
    if (!existsSync(subtitlesDir)) mkdirSync(subtitlesDir, { recursive: true });

    // Extract audio to mp3 (Whisper works best with mono 16kHz)
    const audioFile = join(subtitlesDir, `${Date.now()}-audio.mp3`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions(['-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-y'])
        .output(audioFile)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    this.logger.log(`Audio extracted for transcription: ${audioFile}`);

    try {
      // Whisper transcription → plain text
      const transcript = await this.aiService.transcribe(audioFile, {
        language: 'zh',
        responseFormat: 'text',
      });
      return transcript;
    } finally {
      // Clean up audio file
      try { unlinkSync(audioFile); } catch { /* ignore */ }
    }
  }

  /**
   * Generate AI summary using actual transcript content (much higher quality)
   */
  private async generateAiSummaryFromTranscript(
    title: string,
    duration: number,
    transcript: string,
  ): Promise<string> {
    // Truncate transcript if too long (GPT context limit)
    const truncated = transcript.length > 3000
      ? transcript.slice(0, 3000) + '...(truncated)'
      : transcript;

    const summary = await this.aiService.chat(
      `你是一位專業的影片內容分析師。根據影片的逐字稿內容，生成一段 80-150 字的深度摘要。使用繁體中文。

要求：
- 準確反映影片的實際內容和核心觀點
- 點出影片的關鍵知識點或亮點
- 評估影片對目標觀眾的價值
- 語氣專業但親切`,
      `影片標題：「${title}」
時長：${Math.round(duration / 60)} 分鐘

逐字稿內容：
${truncated}

請生成深度 AI 分析摘要：`,
      { maxTokens: 400 },
    );
    return summary || `AI 分析完成：影片「${title}」已自動處理並識別出多個精華片段。`;
  }

  private async generateAiSummary(title: string, duration: number): Promise<string> {
    const summary = await this.aiService.chat(
      '你是一個影片分析 AI。根據影片標題和時長，生成一段 50-80 字的影片摘要。使用繁體中文。要像是真正分析過影片內容一樣，描述可能的主題、亮點和價值。',
      `影片標題：「${title}」\n時長：${Math.round(duration / 60)} 分鐘\n\n請生成 AI 分析摘要：`,
      { maxTokens: 200 },
    );
    return summary || `AI 分析完成：影片「${title}」已自動處理，識別出多個精華片段。`;
  }

  private async generateAiClips(videoId: string, tenantId: string, title: string, duration: number, transcript?: string | null) {
    // For very short videos (< 60s), create a single clip of the full video
    if (duration <= 60) {
      this.logger.log(`Video ${videoId} is ${duration}s (short), creating single full-length clip`);

      const video = await this.prisma.video.findUnique({
        where: { id: videoId },
        select: { originalUrl: true },
      });
      const sourceFile = video ? this.findSourceFile(video.originalUrl) : null;

      const clip = await this.prisma.videoClip.create({
        data: {
          videoId,
          tenantId,
          title: `${title} — 完整短片`,
          startTime: 0,
          endTime: duration,
          durationSeconds: duration,
          aiScore: 0.95,
          hashtags: ['#Shorts', '#精華', '#推薦'],
          status: 'GENERATING',
        },
        select: { id: true, title: true, startTime: true, endTime: true, durationSeconds: true, aiScore: true, hashtags: true, status: true, clipUrl: true, createdAt: true },
      });

      // For short videos, just copy the original as the clip
      if (sourceFile) {
        try {
          const clipUrl = await this.cutClipFile(sourceFile, clip.id, 0, duration);
          let clipThumbnailUrl: string | undefined;
          try {
            clipThumbnailUrl = await this.generateClipThumbnail(sourceFile, clip.id, 0);
          } catch { /* ignore */ }
          await this.prisma.videoClip.update({
            where: { id: clip.id },
            data: { clipUrl, status: 'READY', ...(clipThumbnailUrl ? { thumbnailUrl: clipThumbnailUrl } : {}) },
          });
          (clip as any).clipUrl = clipUrl;
          (clip as any).status = 'READY';
        } catch (e) {
          this.logger.warn(`FFmpeg clip cut failed for short video ${clip.id}: ${e}`);
          await this.prisma.videoClip.update({
            where: { id: clip.id },
            data: { status: 'READY' },
          });
        }
      }

      return [clip];
    }

    // For longer videos, ask GPT to suggest clip segments
    const minClipDuration = Math.min(30, Math.floor(duration * 0.1));
    const maxClipDuration = Math.min(120, Math.floor(duration * 0.3));

    // Check for word-level timestamps for precise mode
    const video2 = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { originalUrl: true, metadata: true },
    });
    const meta = (video2?.metadata as Record<string, unknown>) ?? {};
    const whisperWords = meta.whisperWords as Array<{ word: string; start: number; end: number }> | undefined;
    const hasPreciseTimestamps = whisperWords && whisperWords.length > 0;

    // Build transcript context for smarter clip detection
    const transcriptContext = transcript
      ? `\n\n以下是影片的逐字稿，請根據內容找出最精華、最有價值的段落來建議剪輯點：\n${transcript.length > 4000 ? transcript.slice(0, 4000) + '...(truncated)' : transcript}`
      : '';

    // Add word-level timestamp hints if available
    const timestampHints = hasPreciseTimestamps
      ? `\n\n以下是 word-level 時間戳（每 30 個詞取一個標記），請用這些精準定位片段起止時間：\n${
          whisperWords!.filter((_, i) => i % 30 === 0).map(w => `[${w.start.toFixed(1)}s] ${w.word}`).join('\n')
        }`
      : '';

    // Use precise mode (startTime/endTime in seconds) when word-level data available
    // Otherwise fallback to percentage mode (startPct/endPct)
    const clipResponseFormat = hasPreciseTimestamps
      ? `每個片段包含：
- title: 吸引人的片段標題（繁體中文）
- startTime: 精準開始時間（秒，整數）
- endTime: 精準結束時間（秒，整數，片段 ${minClipDuration}-${maxClipDuration} 秒）
- score: AI 推薦分數（0.7-0.98）
- hashtags: 3-4 個相關 hashtag
- reason: 推薦原因（金句/高潮/實用技巧/爭議觀點/情緒高點）

回覆 JSON 格式：{ "clips": [{ "title": "...", "startTime": 120, "endTime": 155, "score": 0.95, "hashtags": [...], "reason": "金句" }] }`
      : `每個片段包含：
- title: 吸引人的片段標題（繁體中文）
- startPct: 開始位置（0-1 比例）
- endPct: 結束位置（片段 ${minClipDuration}-${maxClipDuration} 秒）
- score: AI 推薦分數（0.7-0.98）
- hashtags: 3-4 個相關 hashtag

回覆 JSON 格式：{ "clips": [{ "title": "...", "startPct": 0.25, "endPct": 0.35, "score": 0.95, "hashtags": [...] }] }`;

    const result = await this.aiService.generateJson<{
      clips: Array<{
        title: string;
        startPct?: number; endPct?: number;
        startTime?: number; endTime?: number;
        score: number; hashtags: string[];
        reason?: string;
      }>;
    }>(
      `你是一個專業的影片 AI 剪輯助手，擅長從長影片中找出最適合做成 Short/Reels 的精華片段。

根據影片標題、時長${transcript ? '和逐字稿內容' : ''}，建議 3-4 個最佳精華片段。
${transcript ? '請基於逐字稿的實際內容，找出最有觀看價值的段落。\n優先選擇：核心觀點表達、精彩示範或操作、有情緒張力的段落、觀眾會想分享的金句。' : ''}

${clipResponseFormat}`,
      `影片標題：「${title}」\n時長：${duration} 秒（${Math.round(duration / 60)} 分鐘）${transcriptContext}${timestampHints}`,
      { maxTokens: 2048 },
    );

    const clipDefs = result?.clips ?? [
      { title: `精華片段 — ${title}`, startPct: 0.15, endPct: 0.25, score: 0.93, hashtags: ['#精華', '#推薦'] },
      { title: `重點回顧 — ${title}`, startPct: 0.45, endPct: 0.55, score: 0.87, hashtags: ['#重點', '#回顧'] },
      { title: `結尾亮點 — ${title}`, startPct: 0.80, endPct: 0.92, score: 0.81, hashtags: ['#亮點', '#必看'] },
    ];

    // Find source file for FFmpeg cutting
    const sourceFile = video2 ? this.findSourceFile(video2.originalUrl) : null;

    const clips = [];
    for (const def of clipDefs) {
      // Use precise timestamps if available, otherwise calculate from percentage
      const startTime = def.startTime != null
        ? Math.floor(def.startTime)
        : Math.floor(duration * (def.startPct ?? 0));
      const endTime = def.endTime != null
        ? Math.min(Math.floor(def.endTime), duration)
        : Math.min(Math.floor(duration * (def.endPct ?? 1)), duration);
      const clip = await this.prisma.videoClip.create({
        data: {
          videoId,
          tenantId,
          title: def.title,
          description: def.reason ? `推薦原因：${def.reason}` : undefined,
          startTime,
          endTime,
          durationSeconds: endTime - startTime,
          aiScore: Math.min(def.score, 0.99),
          hashtags: def.hashtags ?? ['#creator', '#精華'],
          status: 'GENERATING',
        },
        select: { id: true, title: true, description: true, startTime: true, endTime: true, durationSeconds: true, aiScore: true, hashtags: true, status: true, createdAt: true },
      });

      // FFmpeg cut clip file + generate clip thumbnail
      if (sourceFile) {
        try {
          const clipUrl = await this.cutClipFile(sourceFile, clip.id, startTime, endTime);
          // Generate thumbnail for this clip
          let clipThumbnailUrl: string | undefined;
          try {
            clipThumbnailUrl = await this.generateClipThumbnail(sourceFile, clip.id, startTime);
          } catch (thumbErr) {
            this.logger.warn(`Clip thumbnail failed for ${clip.id}: ${thumbErr}`);
          }
          await this.prisma.videoClip.update({
            where: { id: clip.id },
            data: { clipUrl, status: 'READY', ...(clipThumbnailUrl ? { thumbnailUrl: clipThumbnailUrl } : {}) },
          });
          (clip as any).clipUrl = clipUrl;
          (clip as any).status = 'READY';
        } catch (e) {
          this.logger.warn(`FFmpeg clip cut failed for ${clip.id}: ${e}`);
          await this.prisma.videoClip.update({
            where: { id: clip.id },
            data: { status: 'READY' },
          });
        }
      }

      clips.push(clip);
    }
    return clips;
  }

  /**
   * Cut a clip from the source video using FFmpeg
   */
  private cutClipFile(
    sourceFile: string,
    clipId: string,
    startTime: number,
    endTime: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputFile = join(CLIPS_DIR, `${clipId}.mp4`);
      const duration = endTime - startTime;

      ffmpeg(sourceFile)
        .setStartTime(startTime)
        .setDuration(duration)
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
        .on('end', () => {
          this.logger.log(`Clip cut: ${clipId} (${startTime}s-${endTime}s)`);
          resolve(`/uploads/clips/${clipId}.mp4`);
        })
        .on('error', (err) => reject(err))
        .run();
    });
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

    // Clean up clip files
    const clips = await this.prisma.videoClip.findMany({
      where: { videoId },
      select: { clipUrl: true },
    });
    for (const clip of clips) {
      if (clip.clipUrl?.startsWith('/uploads/')) {
        const clipPath = join(process.cwd(), clip.clipUrl);
        if (existsSync(clipPath)) {
          try { unlinkSync(clipPath); } catch { /* ignore */ }
        }
      }
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

    // Step 1: Check if video has audio stream
    const { execSync } = require('child_process');
    let hasAudio = false;
    try {
      const probeResult = execSync(
        `ffprobe -v quiet -print_format json -show_streams "${sourceFile}"`,
        { encoding: 'utf-8' },
      );
      const streams = JSON.parse(probeResult).streams || [];
      hasAudio = streams.some((s: any) => s.codec_type === 'audio');
    } catch {
      this.logger.warn(`ffprobe failed for ${videoId}, assuming no audio`);
    }

    // Check for embedded subtitle stream
    const hasSubtitle = (() => {
      try {
        const probeResult = execSync(
          `ffprobe -v quiet -print_format json -show_streams "${sourceFile}"`,
          { encoding: 'utf-8' },
        );
        const streams = JSON.parse(probeResult).streams || [];
        return streams.some((s: any) => s.codec_type === 'subtitle');
      } catch { return false; }
    })();

    let srtContent: string;

    if (!hasAudio && hasSubtitle) {
      // No audio but has embedded subtitles — extract subtitle track directly
      this.logger.log(`No audio but found embedded subtitles for ${videoId}, extracting...`);
      const extractedSrt = join(subtitlesDir, `${videoId}-extracted.srt`);
      try {
        execSync(`ffmpeg -i "${sourceFile}" -map 0:s:0 -y "${extractedSrt}" 2>/dev/null`);
        srtContent = require('fs').readFileSync(extractedSrt, 'utf-8');
        try { unlinkSync(extractedSrt); } catch {}
        this.logger.log(`Extracted embedded subtitles (${srtContent.length} chars)`);
      } catch (e) {
        throw new NotFoundException('無法提取嵌入字幕，請上傳含有語音或字幕的影片。');
      }
    } else if (!hasAudio) {
      throw new NotFoundException('此影片沒有音訊軌道也沒有嵌入字幕，無法生成字幕。請上傳含有語音的影片。');
    } else {
      // Has audio — use Whisper transcription
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

      srtContent = await this.aiService.transcribe(audioFile, {
        language: options?.language ?? 'zh',
        responseFormat: 'srt',
      });

      // Clean up audio file
      try { unlinkSync(audioFile); } catch {}
    }

    this.logger.log(`Subtitle content ready (${srtContent.length} chars)`);

    // Step 4: GPT polish (optional, default true)
    if (options?.polish !== false) {
      srtContent = await this.aiService.polishSubtitles(srtContent);
      this.logger.log('Subtitles polished by GPT');
    }

    // Step 5: Save SRT file
    const srtFile = join(subtitlesDir, `${videoId}.srt`);
    writeFileSync(srtFile, srtContent, 'utf-8');

    // Also generate VTT format
    const vttContent = this.srtToVtt(srtContent);
    const vttFile = join(subtitlesDir, `${videoId}.vtt`);
    writeFileSync(vttFile, vttContent, 'utf-8');

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

  // ─── Post-Production Tools ───

  /**
   * Get Whisper word-level timestamps and store in metadata
   */
  async transcribeWords(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, status: true, originalUrl: true, durationSeconds: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');
    if (video.status !== 'PROCESSED') throw new BadRequestException('Video must be in PROCESSED state');

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    if (meta.whisperWords && (meta.whisperWords as unknown[]).length > 0) {
      return {
        videoId,
        wordCount: (meta.whisperWords as unknown[]).length,
        durationSeconds: video.durationSeconds,
        message: 'Word-level timestamps already exist',
      };
    }

    const sourceFile = this.findSourceFile(video.originalUrl);
    if (!sourceFile) throw new NotFoundException('Video file not found');

    // Extract audio
    const subtitlesDir = join(process.cwd(), 'uploads', 'subtitles');
    if (!existsSync(subtitlesDir)) mkdirSync(subtitlesDir, { recursive: true });
    const audioFile = join(subtitlesDir, `${Date.now()}-words-audio.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourceFile)
        .outputOptions(['-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-y'])
        .output(audioFile)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    try {
      const result = await this.aiService.transcribeVerbose(audioFile);

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          metadata: { ...meta, whisperWords: result.words },
          ...(!(video as any).transcript ? { transcript: result.text } : {}),
        },
      });

      this.logger.log(`Word-level transcription for ${videoId}: ${result.words.length} words`);
      return {
        videoId,
        wordCount: result.words.length,
        durationSeconds: video.durationSeconds,
        message: 'Word-level timestamps generated',
      };
    } finally {
      try { unlinkSync(audioFile); } catch { /* ignore */ }
    }
  }

  /**
   * Detect filler words from word-level timestamps
   */
  async detectFillers(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    let words = meta.whisperWords as Array<{ word: string; start: number; end: number }> | undefined;

    // Auto-transcribe if no word-level data
    if (!words || words.length === 0) {
      const result = await this.transcribeWords(videoId, userId);
      const refreshed = await this.prisma.video.findUnique({
        where: { id: videoId },
        select: { metadata: true },
      });
      const refreshedMeta = (refreshed?.metadata as Record<string, unknown>) ?? {};
      words = refreshedMeta.whisperWords as Array<{ word: string; start: number; end: number }>;
    }

    if (!words || words.length === 0) {
      return { videoId, fillers: [], totalCount: 0, estimatedSavings: 0 };
    }

    const FILLER_WORDS = new Set([
      '嗯', '啊', '呃', '那個', '就是', '然後', '對', '對對對',
      '基本上', '所以說', '怎麼說', '其實', '反正', '就是說',
      '你知道', '欸', '齁', '喔',
    ]);

    const fillers: Array<{
      id: string;
      word: string;
      startTime: number;
      endTime: number;
      contextBefore: string;
      contextAfter: string;
    }> = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const trimmed = w.word.trim().replace(/[，。、！？,.!?]/g, '');
      if (FILLER_WORDS.has(trimmed)) {
        fillers.push({
          id: `filler-${i}`,
          word: trimmed,
          startTime: w.start,
          endTime: w.end,
          contextBefore: words.slice(Math.max(0, i - 5), i).map(x => x.word).join(''),
          contextAfter: words.slice(i + 1, i + 6).map(x => x.word).join(''),
        });
      }
    }

    const estimatedSavings = fillers.reduce((sum, f) => sum + (f.endTime - f.startTime), 0);

    // Store filler marks in metadata
    await this.prisma.video.update({
      where: { id: videoId },
      data: { metadata: { ...meta, fillerMarks: fillers } },
    });

    return {
      videoId,
      fillers,
      totalCount: fillers.length,
      estimatedSavings: Math.round(estimatedSavings * 10) / 10,
    };
  }

  /**
   * Cut selected filler words from video using FFmpeg
   */
  async cutFillers(videoId: string, userId: string, fillerIds: string[]) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, originalUrl: true, durationSeconds: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    const allFillers = (meta.fillerMarks ?? []) as Array<{ id: string; startTime: number; endTime: number }>;
    const selectedFillers = allFillers
      .filter(f => fillerIds.includes(f.id))
      .sort((a, b) => a.startTime - b.startTime);

    if (selectedFillers.length === 0) {
      throw new BadRequestException('No valid filler marks selected');
    }

    const sourceFile = this.findSourceFile(video.originalUrl);
    if (!sourceFile) throw new NotFoundException('Video file not found');

    const duration = video.durationSeconds ?? 300;

    // Calculate keep intervals (inverse of remove intervals)
    const keepIntervals: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const filler of selectedFillers) {
      if (filler.startTime > cursor) {
        keepIntervals.push({ start: cursor, end: filler.startTime });
      }
      cursor = filler.endTime;
    }
    if (cursor < duration) {
      keepIntervals.push({ start: cursor, end: duration });
    }

    // FFmpeg concat: extract each keep interval and concatenate
    const trimmedDir = join(process.cwd(), 'uploads', 'videos');
    const outputFile = join(trimmedDir, `${videoId}-trimmed.mp4`);
    const tempDir = join(process.cwd(), 'uploads', 'temp');
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

    // Create segment files
    const segmentFiles: string[] = [];
    for (let i = 0; i < keepIntervals.length; i++) {
      const seg = keepIntervals[i];
      const segFile = join(tempDir, `${videoId}-seg-${i}.ts`);
      segmentFiles.push(segFile);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(sourceFile)
          .setStartTime(seg.start)
          .setDuration(seg.end - seg.start)
          .outputOptions(['-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts', '-y'])
          .output(segFile)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });
    }

    // Concatenate segments
    const concatInput = segmentFiles.join('|');
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(`concat:${concatInput}`)
          .inputOptions(['-protocol_whitelist', 'file,pipe,concat'])
          .outputOptions([
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart', '-y',
          ])
          .output(outputFile)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });
    } finally {
      // Cleanup temp segments regardless of success/failure
      for (const f of segmentFiles) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }

    const newDuration = keepIntervals.reduce((sum, k) => sum + (k.end - k.start), 0);
    const outputUrl = `/uploads/videos/${videoId}-trimmed.mp4`;

    this.logger.log(`Filler cut for ${videoId}: ${duration}s → ${Math.round(newDuration)}s (removed ${selectedFillers.length} fillers)`);

    return {
      videoId,
      outputUrl,
      originalDuration: duration,
      newDuration: Math.round(newDuration * 10) / 10,
      removedCount: selectedFillers.length,
    };
  }

  /**
   * Generate YouTube chapter markers using AI
   */
  async generateChapters(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, title: true, transcript: true, durationSeconds: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');
    if ((video.durationSeconds ?? 0) < 30) {
      throw new BadRequestException('Video too short for chapter markers (< 30s)');
    }

    const transcript = typeof video.transcript === 'string'
      ? video.transcript
      : video.transcript ? JSON.stringify(video.transcript) : null;

    if (!transcript) {
      throw new BadRequestException('Video has no transcript. Please process the video first.');
    }

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    const duration = video.durationSeconds ?? 300;

    // Use word-level timestamps if available for better accuracy
    const words = meta.whisperWords as Array<{ word: string; start: number; end: number }> | undefined;
    const timestampHint = words && words.length > 0
      ? `\n\n以下是部分 word-level 時間戳供參考（每 50 個詞取一個標記點）：\n${
          words.filter((_, i) => i % 50 === 0).map(w => `[${Math.floor(w.start)}s] ${w.word}`).join('\n')
        }`
      : '';

    const result = await this.aiService.generateJson<{
      chapters: Array<{ title: string; startTime: number }>;
    }>(
      `你是影片內容結構分析專家。根據影片轉錄稿，識別主題轉換點並產出 YouTube 章節標記。

規則：
- 第一個章節必須從 0 秒開始
- 每個章節標題 5-15 字，精確描述該段內容
- 章節間隔至少 60 秒
- 一支 ${Math.round(duration / 60)} 分鐘的影片通常有 4-8 個章節
- 使用繁體中文
- startTime 為整數（秒）

回傳 JSON：{ "chapters": [{ "title": "開場介紹", "startTime": 0 }, ...] }`,
      `影片標題：「${video.title}」\n時長：${duration} 秒\n\n轉錄稿：\n${transcript.slice(0, 4000)}${timestampHint}`,
      { model: 'gpt-4o-mini', maxTokens: 1024 },
    );

    const chapters = (result?.chapters ?? []).map((ch, i) => ({
      id: `ch-${i}`,
      title: ch.title,
      startTime: Math.max(0, Math.round(ch.startTime)),
    }));

    // Ensure first chapter starts at 0
    if (chapters.length > 0 && chapters[0].startTime !== 0) {
      chapters[0].startTime = 0;
    }

    // Generate YouTube format string
    const youtubeFormat = chapters
      .map(ch => {
        const m = Math.floor(ch.startTime / 60);
        const s = ch.startTime % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ch.title}`;
      })
      .join('\n');

    // Store in metadata
    await this.prisma.video.update({
      where: { id: videoId },
      data: { metadata: { ...meta, chapters } },
    });

    this.logger.log(`Chapters generated for ${videoId}: ${chapters.length} chapters`);

    return { videoId, chapters, youtubeFormat };
  }

  /**
   * Update chapter markers
   */
  async updateChapters(videoId: string, userId: string, chapters: Array<{ id: string; title: string; startTime: number }>) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    const sorted = chapters.sort((a, b) => a.startTime - b.startTime);

    const youtubeFormat = sorted
      .map(ch => {
        const m = Math.floor(ch.startTime / 60);
        const s = ch.startTime % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ch.title}`;
      })
      .join('\n');

    await this.prisma.video.update({
      where: { id: videoId },
      data: { metadata: { ...meta, chapters: sorted } },
    });

    return { chapters: sorted, youtubeFormat };
  }

  /**
   * Generate script summary using AI
   */
  async generateScriptSummary(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, title: true, transcript: true, durationSeconds: true, metadata: true },
    });

    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException('Not the video owner');
    if ((video.durationSeconds ?? 0) < 30) {
      throw new BadRequestException('Video too short for script summary (< 30s)');
    }

    const transcript = typeof video.transcript === 'string'
      ? video.transcript
      : video.transcript ? JSON.stringify(video.transcript) : null;

    if (!transcript) {
      throw new BadRequestException('Video has no transcript.');
    }

    const duration = video.durationSeconds ?? 300;
    const totalMin = Math.floor(duration / 60);
    const totalSec = duration % 60;

    const result = await this.aiService.generateJson<{
      title: string;
      totalDuration: string;
      sections: Array<{
        title: string;
        timeRange: string;
        startTime: number;
        endTime: number;
        keyPoints: string[];
        keywords: string[];
      }>;
      tags: string[];
      oneLinerSummary: string;
    }>(
      `你是內容分析專家。分析影片轉錄稿，產出結構化腳本大綱。

要求：
- 將影片拆解為 Intro + 3-7 個主要段落 + 結尾
- 每段包含：標題（5-12字）、時間範圍（"MM:SS - MM:SS"）、startTime/endTime（秒）、2-3 個核心論點、2-4 個關鍵字
- 產出一句話摘要（20-40字）
- tags 為影片整體的 5-8 個標籤
- 使用繁體中文

回傳 JSON：
{
  "title": "影片主題",
  "totalDuration": "${totalMin}:${String(totalSec).padStart(2, '0')}",
  "sections": [{ "title": "...", "timeRange": "00:00 - 02:15", "startTime": 0, "endTime": 135, "keyPoints": ["..."], "keywords": ["..."] }],
  "tags": ["tag1", "tag2"],
  "oneLinerSummary": "一句話描述"
}`,
      `影片標題：「${video.title}」\n時長：${duration} 秒\n\n轉錄稿：\n${transcript.slice(0, 4000)}`,
      { model: 'gpt-4o-mini', maxTokens: 2048 },
    );

    if (!result) {
      throw new BadRequestException('AI failed to generate script summary');
    }

    const meta = (video.metadata as Record<string, unknown>) ?? {};
    await this.prisma.video.update({
      where: { id: videoId },
      data: { metadata: { ...meta, scriptSummary: result } },
    });

    // Generate Markdown
    const md = [
      `# ${result.title}`,
      '',
      `> ${result.oneLinerSummary}`,
      `> 時長：${result.totalDuration}`,
      '',
      ...result.sections.map(s => [
        `## ${s.title}`,
        `*${s.timeRange}*`,
        '',
        ...s.keyPoints.map(p => `- ${p}`),
        '',
        `**關鍵字：** ${s.keywords.join('、')}`,
        '',
      ]).flat(),
      `---`,
      `**標籤：** ${result.tags.join('、')}`,
    ].join('\n');

    this.logger.log(`Script summary for ${videoId}: ${result.sections.length} sections`);

    return { videoId, summary: result, markdown: md };
  }
}
