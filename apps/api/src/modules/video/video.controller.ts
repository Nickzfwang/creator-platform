import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { VideoService } from './video.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'videos');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

@ApiTags('Videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Get presigned S3 upload URL' })
  async requestUploadUrl(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.videoService.requestUploadUrl(userId, tenantId, dto);
  }

  @Post(':id/uploaded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark video as uploaded, start processing' })
  async markUploaded(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
  ) {
    return this.videoService.markUploaded(videoId, userId);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only video files are allowed'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Direct file upload (local dev)' })
  async uploadFile(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.videoService.handleDirectUpload(userId, tenantId, file);
  }

  @Get()
  @ApiOperation({ summary: 'List videos (cursor-based pagination)' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListVideosQueryDto,
  ) {
    return this.videoService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video detail with clips' })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
  ) {
    return this.videoService.findById(videoId, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete video and all clips' })
  async deleteVideo(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
  ) {
    return this.videoService.deleteVideo(videoId, userId);
  }

  @Get(':id/clips')
  @ApiOperation({ summary: 'Get clips for a video' })
  async getClips(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
  ) {
    return this.videoService.getClips(videoId, userId);
  }

  @Post(':id/clips/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate AI clips for a video' })
  async generateClips(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
  ) {
    return this.videoService.generateClips(videoId, userId);
  }

  @Patch(':id/clips/:clipId')
  @ApiOperation({ summary: 'Update clip title/description/hashtags' })
  async updateClip(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) videoId: string,
    @Param('clipId', ParseUUIDPipe) clipId: string,
    @Body() dto: UpdateClipDto,
  ) {
    return this.videoService.updateClip(videoId, clipId, userId, dto);
  }
}
