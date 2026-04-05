import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export members/subscribers as CSV
   */
  async exportMembersCsv(userId: string, tenantId: string): Promise<string> {
    const memberships = await this.prisma.membership.findMany({
      where: { creatorUserId: userId, tenantId },
      include: {
        fan: { select: { email: true, displayName: true } },
        tier: { select: { name: true, priceMonthly: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Email', 'Display Name', 'Tier', 'Price (Monthly)', 'Status', 'Subscribed At', 'Cancelled At'];
    const rows = memberships.map((m) => [
      m.fan.email,
      m.fan.displayName,
      m.tier.name,
      Number(m.tier.priceMonthly),
      m.status,
      m.createdAt.toISOString(),
      m.cancelledAt?.toISOString() ?? '',
    ]);

    return this.toCsv(headers, rows);
  }

  /**
   * Export analytics data as CSV
   */
  async exportAnalyticsCsv(
    userId: string,
    tenantId: string,
    period: string = '30d',
  ): Promise<string> {
    const days = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await this.prisma.platformAnalytics.findMany({
      where: {
        userId,
        tenantId,
        date: { gte: startDate },
      },
      include: {
        socialAccount: { select: { platform: true, platformUsername: true } },
      },
      orderBy: { date: 'asc' },
    });

    const headers = ['Date', 'Platform', 'Username', 'Followers', 'Views', 'Likes', 'Comments', 'Shares', 'Engagement Rate'];
    const rows = analytics.map((a) => [
      a.date.toISOString().split('T')[0],
      a.socialAccount.platform,
      a.socialAccount.platformUsername,
      a.followers ?? 0,
      a.views ?? 0,
      a.likes ?? 0,
      a.comments ?? 0,
      a.shares ?? 0,
      a.engagementRate ?? 0,
    ]);

    return this.toCsv(headers, rows);
  }

  /**
   * Export affiliate links and stats as CSV
   */
  async exportAffiliateCsv(userId: string, tenantId: string): Promise<string> {
    const links = await this.prisma.affiliateLink.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Product Name', 'URL', 'Tracking Code', 'Clicks', 'Conversions', 'Revenue', 'Commission Rate', 'Active', 'Created At'];
    const rows = links.map((l) => [
      l.productName ?? '',
      l.originalUrl,
      l.trackingCode,
      l.clickCount,
      l.conversionCount,
      Number(l.revenueTotal),
      l.commissionRate ? Number(l.commissionRate) : '',
      l.isActive ? 'Yes' : 'No',
      l.createdAt.toISOString(),
    ]);

    return this.toCsv(headers, rows);
  }

  private toCsv(headers: string[], rows: (string | number)[][]): string {
    const escape = (val: string | number) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [
      headers.map(escape).join(','),
      ...rows.map((row) => row.map(escape).join(',')),
    ];

    // BOM for Excel UTF-8 compatibility
    return '\uFEFF' + lines.join('\n');
  }
}
