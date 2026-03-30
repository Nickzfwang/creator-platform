import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TrendRadarService } from './trend-radar.service';
import { TrendRadarViralService } from './trend-radar-viral.service';
import { PrismaService } from '../../prisma/prisma.service';

interface RefreshJobData {
  includeScraper: boolean;
}

@Processor('trend-radar')
export class TrendRadarProcessor extends WorkerHost {
  private readonly logger = new Logger(TrendRadarProcessor.name);

  constructor(
    private readonly trendRadarService: TrendRadarService,
    private readonly viralService: TrendRadarViralService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<RefreshJobData>): Promise<void> {
    this.logger.log(`Processing trend refresh job: ${job.id} (includeScraper: ${job.data.includeScraper})`);

    try {
      // Get previous snapshot before refresh
      const previousSnapshot = await this.prisma.trendSnapshot.findFirst({
        orderBy: { generatedAt: 'desc' },
        include: { topics: true },
      });

      // Run refresh
      const newSnapshot = await this.trendRadarService.refreshTrends(job.data.includeScraper);

      // Viral detection
      await this.viralService.detectViralTrends(
        newSnapshot.topics,
        previousSnapshot?.topics ?? [],
      );

      // Keyword matching
      await this.viralService.matchKeywords(newSnapshot.topics);

      this.logger.log(`Refresh complete: ${newSnapshot.topicCount} topics`);
    } catch (error) {
      this.logger.error(`Refresh job failed: ${error}`);
      throw error; // Re-throw for BullMQ retry
    }
  }
}
