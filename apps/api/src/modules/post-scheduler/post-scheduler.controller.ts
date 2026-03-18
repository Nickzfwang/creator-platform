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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PostSchedulerService } from './post-scheduler.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { AiGeneratePostDto } from './dto/ai-generate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/posts')
export class PostSchedulerController {
  constructor(private readonly postSchedulerService: PostSchedulerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new post (draft or scheduled)' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.postSchedulerService.create(userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List posts (cursor-based pagination)' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListPostsQueryDto,
  ) {
    return this.postSchedulerService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post detail' })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postSchedulerService.findById(postId, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update post (DRAFT/SCHEDULED only)' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postSchedulerService.update(postId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete post (DRAFT/SCHEDULED only)' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postSchedulerService.remove(postId, userId);
  }

  @Post(':id/publish-now')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Publish post immediately' })
  async publishNow(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postSchedulerService.publishNow(postId, userId);
  }

  @Post('ai-generate')
  @ApiOperation({ summary: 'AI generate post content (GPT-4o)' })
  async aiGenerate(
    @CurrentUser('id') userId: string,
    @Body() dto: AiGeneratePostDto,
  ) {
    return this.postSchedulerService.aiGenerate(userId, dto);
  }

  @Get('optimal-times')
  @ApiOperation({ summary: 'Get AI-recommended optimal posting times' })
  async getOptimalTimes(@CurrentUser('id') userId: string) {
    return this.postSchedulerService.getOptimalPostingTimes(userId);
  }
}
