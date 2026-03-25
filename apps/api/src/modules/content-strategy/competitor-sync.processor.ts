import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CompetitorService } from './competitor.service';

interface CompetitorSyncJobData {
  competitorId: string;
}

@Processor('competitor-sync')
export class CompetitorSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CompetitorSyncProcessor.name);

  constructor(
    private readonly competitorService: CompetitorService,
  ) {
    super();
  }

  async process(job: Job<CompetitorSyncJobData>): Promise<void> {
    const { competitorId } = job.data;
    this.logger.log(`Syncing competitor ${competitorId}`);

    try {
      await this.competitorService.syncCompetitor(competitorId);
      this.logger.log(`Competitor ${competitorId} synced successfully`);
    } catch (error) {
      this.logger.error(`Competitor sync failed for ${competitorId}: ${error}`);
      throw error;
    }
  }
}
