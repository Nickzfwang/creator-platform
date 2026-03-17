import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PostSchedulerService } from './post-scheduler.service';

@ApiTags('Post Scheduler')
@ApiBearerAuth()
@Controller('post-scheduler')
export class PostSchedulerController {
  constructor(private readonly postSchedulerService: PostSchedulerService) {}

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a new post' })
  async schedule(
    @Body()
    body: {
      content: string;
      platforms: string[];
      scheduledAt: string;
      mediaIds?: string[];
    },
  ) {
    return this.postSchedulerService.schedule(body);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get scheduled posts calendar view' })
  async getCalendar(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.postSchedulerService.getCalendar(startDate, endDate);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a scheduled post immediately' })
  async publish(@Param('id') id: string) {
    return this.postSchedulerService.publish(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scheduled post' })
  async remove(@Param('id') id: string) {
    return this.postSchedulerService.remove(id);
  }
}
