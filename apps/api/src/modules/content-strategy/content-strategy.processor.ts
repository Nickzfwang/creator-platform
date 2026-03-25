import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContentStrategyService } from './content-strategy.service';

interface WeeklyGenerateJobData {
  userId: string;
  tenantId: string;
}

@Processor('content-strategy')
export class ContentStrategyProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentStrategyProcessor.name);

  constructor(
    private readonly contentStrategyService: ContentStrategyService,
  ) {
    super();
  }

  async process(job: Job<WeeklyGenerateJobData>): Promise<void> {
    const { userId, tenantId } = job.data;
    this.logger.log(`Processing weekly content strategy for user ${userId}`);

    try {
      const result = await this.contentStrategyService.weeklyAutoGenerate(userId, tenantId);
      this.logger.log(
        `Weekly strategy generated ${result.suggestions.length} suggestions for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(`Weekly strategy generation failed for user ${userId}: ${error}`);
      throw error;
    }
  }
}
