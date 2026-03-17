import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VideoService } from './video.service';

@ApiTags('Videos')
@ApiBearerAuth()
@Controller('videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a new video (get presigned URL)' })
  async upload(@Body() body: { fileName: string; contentType: string }) {
    return this.videoService.createUploadUrl(body.fileName, body.contentType);
  }

  @Get()
  @ApiOperation({ summary: 'List all videos' })
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.videoService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video by ID' })
  async findById(@Param('id') id: string) {
    return this.videoService.findById(id);
  }

  @Post(':id/clip')
  @ApiOperation({ summary: 'Generate clips from a video' })
  async createClip(
    @Param('id') id: string,
    @Body() body: { startTime: number; endTime: number; title?: string },
  ) {
    return this.videoService.createClip(id, body);
  }

  @Get(':id/clips')
  @ApiOperation({ summary: 'Get all clips for a video' })
  async getClips(@Param('id') id: string) {
    return this.videoService.getClips(id);
  }
}
