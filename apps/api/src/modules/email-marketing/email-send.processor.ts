import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { BrevoService } from '../brevo/brevo.service';

export interface EmailSendJobData {
  campaignId: string;
  userId: string;
  subject: string;
  htmlContent: string;
  subscribers: Array<{ email: string; name: string | null }>;
}

const BATCH_SIZE = 50;

@Processor('email-send')
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brevoService: BrevoService,
  ) {
    super();
  }

  async process(job: Job<EmailSendJobData>): Promise<void> {
    const { campaignId, subject, htmlContent, subscribers } = job.data;
    this.logger.log(`Processing email send job: ${job.id} — ${subscribers.length} recipients`);

    let sentCount = 0;
    const totalBatches = Math.ceil(subscribers.length / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = subscribers.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

      // Brevo supports up to 50 recipients per API call
      const to = batch.map(s => ({
        email: s.email,
        name: s.name || '',
      }));

      // Replace {{name}} placeholder in HTML for each recipient individually
      for (const recipient of to) {
        const personalizedHtml = htmlContent.replace(
          /\{\{name\}\}/g,
          recipient.name || '朋友',
        );

        const result = await this.brevoService.sendCampaignEmail(
          [recipient],
          subject,
          personalizedHtml,
        );

        if (result.success) {
          sentCount++;
        }
      }

      await job.updateProgress(Math.round(((i + 1) / totalBatches) * 100));
    }

    // Update campaign stats
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentCount,
      },
    });

    this.logger.log(`Campaign ${campaignId} sent: ${sentCount}/${subscribers.length} delivered`);
  }
}
