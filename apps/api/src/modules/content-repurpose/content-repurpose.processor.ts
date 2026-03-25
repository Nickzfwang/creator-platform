import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContentRepurposeService } from './content-repurpose.service';

interface RepurposeJobData {
  jobId: string;
}

@Processor('content-repurpose')
export class ContentRepurposeProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentRepurposeProcessor.name);

  constructor(
    private readonly contentRepurposeService: ContentRepurposeService,
  ) {
    super();
  }

  async process(job: Job<RepurposeJobData>): Promise<void> {
    const { jobId } = job.data;
    this.logger.log(`Processing content repurpose job ${jobId} (attempt ${job.attemptsMade + 1})`);

    try {
      await this.contentRepurposeService.processGeneration(jobId);
      this.logger.log(`Content repurpose job ${jobId} completed successfully`);
    } catch (error) {
      this.logger.error(`Content repurpose job ${jobId} failed: ${error}`);
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
