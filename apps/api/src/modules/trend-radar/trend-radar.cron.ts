import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { BrevoService } from '../brevo/brevo.service';

@Injectable()
export class TrendRadarCron {
  private readonly logger = new Logger(TrendRadarCron.name);

  constructor(
    @InjectQueue('trend-radar') private readonly trendQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly brevoService: BrevoService,
  ) {}

  // RSS + API refresh every 2 hours during daytime (UTC: 0,2,4,6,8,10,12,14 → UTC+8: 8,10,...,22)
  @Cron('0 0,2,4,6,8,10,12,14 * * *')
  async scheduledRefresh() {
    this.logger.log('Scheduled RSS/API trend refresh');
    await this.trendQueue.add(
      'refresh',
      { includeScraper: false },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
      },
    );
  }

  // Playwright scraper every 6 hours (UTC: 1,7,13,19 → UTC+8: 9,15,21,3)
  @Cron('0 1,7,13,19 * * *')
  async scheduledScrape() {
    this.logger.log('Scheduled Playwright scraper refresh');
    await this.trendQueue.add(
      'refresh',
      { includeScraper: true },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 60000 },
      },
    );
  }

  // Daily trend summary email at 9:00 AM UTC+8 (= UTC 01:00)
  @Cron('0 1 * * *')
  async dailySummaryEmail() {
    this.logger.log('Sending daily trend summary emails');

    const latestSnapshot = await this.prisma.trendSnapshot.findFirst({
      orderBy: { generatedAt: 'desc' },
      include: { topics: { orderBy: { relevanceScore: 'desc' }, take: 5 } },
    });

    if (!latestSnapshot || latestSnapshot.topics.length === 0) {
      this.logger.warn('No snapshot available for daily summary');
      return;
    }

    const subscribers = await this.prisma.trendUserSettings.findMany({
      where: { emailDailySummary: true },
      include: {
        user: { select: { id: true, email: true, displayName: true, tenantId: true } },
      },
    });

    for (const sub of subscribers) {
      try {
        // Send email via Brevo
        await this.brevoService.sendTrendDailySummary(
          sub.user.email,
          sub.user.displayName,
          latestSnapshot.topics,
          latestSnapshot.aiAnalysis,
        );

        // Also create in-app notification if enabled
        if (sub.notifyDailySummary) {
          await this.notificationService.send({
            userId: sub.user.id,
            tenantId: sub.user.tenantId,
            type: 'TREND_DAILY_SUMMARY',
            title: '📊 今日趨勢摘要',
            body: `今日 Top 5 趨勢：${latestSnapshot.topics.map(t => t.title).join('、')}`,
            linkUrl: '/trends',
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to send daily summary to ${sub.user.email}: ${error}`);
      }
    }

    this.logger.log(`Daily summary sent to ${subscribers.length} subscribers`);
  }

  // Cleanup old data: snapshots > 14 days, notifications > 30 days
  // Runs at 4:00 AM UTC+8 (= UTC 20:00)
  @Cron('0 20 * * *')
  async cleanupOldData() {
    const snapshotCutoff = new Date();
    snapshotCutoff.setDate(snapshotCutoff.getDate() - 14);

    const deletedSnapshots = await this.prisma.trendSnapshot.deleteMany({
      where: { generatedAt: { lt: snapshotCutoff } },
    });
    this.logger.log(`Cleaned up ${deletedSnapshots.count} snapshots older than 14 days`);

    const notifCutoff = new Date();
    notifCutoff.setDate(notifCutoff.getDate() - 30);
    const deletedNotifs = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: notifCutoff } },
    });
    this.logger.log(`Cleaned up ${deletedNotifs.count} notifications older than 30 days`);
  }
}
