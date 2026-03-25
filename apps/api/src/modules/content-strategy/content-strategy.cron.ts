import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentStrategyCron {
  private readonly logger = new Logger(ContentStrategyCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('content-strategy') private readonly strategyQueue: Queue,
    @InjectQueue('competitor-sync') private readonly competitorSyncQueue: Queue,
  ) {}

  /**
   * Weekly auto-generate: runs every Monday at each hour (0-23),
   * checks users whose preferredGenerateHour matches the current hour.
   * For MVP, runs every Monday at 9 AM and processes all auto-generate users.
   */
  @Cron('0 9 * * 1') // Every Monday at 9 AM
  async weeklyGenerate() {
    this.logger.log('Starting weekly content strategy generation');

    try {
      // Find all users with subscriptions (active creators)
      const users = await this.prisma.user.findMany({
        where: {
          role: 'CREATOR',
          onboardingCompleted: true,
        },
        select: { id: true, tenantId: true },
      });

      for (const user of users) {
        await this.strategyQueue.add(
          'weekly-generate',
          { userId: user.id, tenantId: user.tenantId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 60000 },
          },
        );
      }

      this.logger.log(`Queued weekly generation for ${users.length} users`);
    } catch (error) {
      this.logger.error('Weekly generation scheduling failed:', error);
    }
  }

  /**
   * Daily competitor sync: runs at 3 AM every day.
   * Syncs all active competitors, prioritizing those not synced recently.
   */
  @Cron('0 3 * * *') // Every day at 3 AM
  async dailyCompetitorSync() {
    this.logger.log('Starting daily competitor sync');

    try {
      const competitors = await this.prisma.competitor.findMany({
        where: { isActive: true },
        orderBy: { lastSyncedAt: 'asc' },
        select: { id: true },
      });

      for (const competitor of competitors) {
        await this.competitorSyncQueue.add(
          'sync',
          { competitorId: competitor.id },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          },
        );
      }

      this.logger.log(`Queued sync for ${competitors.length} competitors`);
    } catch (error) {
      this.logger.error('Competitor sync scheduling failed:', error);
    }
  }
}
