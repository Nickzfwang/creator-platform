import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AffiliateEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import { ListLinksQueryDto } from './dto/list-links-query.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Links CRUD ───

  async createLink(userId: string, tenantId: string, dto: CreateLinkDto) {
    const trackingCode = await this.generateTrackingCode();
    const shortUrl = `/r/${trackingCode}`;

    const link = await this.prisma.affiliateLink.create({
      data: {
        userId,
        tenantId,
        originalUrl: dto.originalUrl,
        trackingCode,
        shortUrl,
        productName: dto.productName,
        commissionRate: dto.commissionRate,
      },
    });

    return this.formatLink(link);
  }

  async findAll(userId: string, tenantId: string, query: ListLinksQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.AffiliateLinkWhereInput = {
      tenantId,
      userId,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        productName: { contains: query.search, mode: 'insensitive' as const },
      }),
    };

    const links = await this.prisma.affiliateLink.findMany({
      where,
      take: limit + 1,
      ...(query.cursor && {
        skip: 1,
        cursor: { id: query.cursor },
      }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = links.length > limit;
    const data = hasMore ? links.slice(0, limit) : links;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map(this.formatLink),
      nextCursor,
      hasMore,
    };
  }

  async findById(userId: string, tenantId: string, id: string) {
    const link = await this.prisma.affiliateLink.findUnique({
      where: { id },
      include: {
        _count: { select: { events: true } },
      },
    });

    if (!link) throw new NotFoundException('errors.affiliate.linkNotFound');
    if (link.userId !== userId || link.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Recent events summary (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEvents = await this.prisma.affiliateEvent.groupBy({
      by: ['eventType'],
      where: {
        linkId: id,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
      _sum: { revenueAmount: true },
    });

    const eventsSummary = recentEvents.map((e) => ({
      eventType: e.eventType,
      count: e._count,
      totalRevenue: Number(e._sum.revenueAmount ?? 0),
    }));

    return {
      ...this.formatLink(link),
      totalEvents: link._count.events,
      recentEventsSummary: eventsSummary,
    };
  }

  async update(userId: string, tenantId: string, id: string, dto: UpdateLinkDto) {
    const link = await this.prisma.affiliateLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('errors.affiliate.linkNotFound');
    if (link.userId !== userId || link.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.affiliateLink.update({
      where: { id },
      data: {
        ...(dto.productName !== undefined && { productName: dto.productName }),
        ...(dto.commissionRate !== undefined && { commissionRate: dto.commissionRate }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.formatLink(updated);
  }

  async deactivate(userId: string, tenantId: string, id: string) {
    const link = await this.prisma.affiliateLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('errors.affiliate.linkNotFound');
    if (link.userId !== userId || link.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    await this.prisma.affiliateLink.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Redirect ───

  async handleRedirect(trackingCode: string, req: { ip?: string; userAgent?: string; referrer?: string }) {
    const link = await this.prisma.affiliateLink.findUnique({
      where: { trackingCode },
    });

    if (!link) throw new NotFoundException('errors.affiliate.linkNotFound');

    // Record click event (fire-and-forget)
    if (link.isActive) {
      const ipHash = req.ip
        ? createHash('sha256').update(req.ip).digest('hex').substring(0, 64)
        : null;

      this.prisma.affiliateEvent
        .create({
          data: {
            linkId: link.id,
            tenantId: link.tenantId,
            eventType: AffiliateEventType.CLICK,
            ipHash,
            userAgent: req.userAgent?.substring(0, 500),
            referrer: req.referrer?.substring(0, 1000),
          },
        })
        .then(() =>
          this.prisma.affiliateLink.update({
            where: { id: link.id },
            data: { clickCount: { increment: 1 } },
          }),
        )
        .catch((err) => this.logger.error(`Failed to record click: ${err.message}`));
    }

    return link.originalUrl;
  }

  // ─── Events ───

  async createEvent(dto: CreateEventDto) {
    const link = await this.prisma.affiliateLink.findUnique({
      where: { trackingCode: dto.trackingCode },
    });

    if (!link) throw new NotFoundException('errors.affiliate.trackingNotFound');

    if (dto.eventType === AffiliateEventType.CLICK) {
      throw new BadRequestException('errors.affiliate.useRedirectEndpoint');
    }

    const event = await this.prisma.affiliateEvent.create({
      data: {
        linkId: link.id,
        tenantId: link.tenantId,
        eventType: dto.eventType,
        revenueAmount: dto.revenueAmount,
        visitorId: dto.visitorId,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
    });

    // Update link counters
    const updateData: Prisma.AffiliateLinkUpdateInput = {};
    if (dto.eventType === AffiliateEventType.PURCHASE) {
      updateData.conversionCount = { increment: 1 };
      if (dto.revenueAmount) {
        updateData.revenueTotal = { increment: dto.revenueAmount };
      }
    } else if (dto.eventType === AffiliateEventType.REFUND && dto.revenueAmount) {
      updateData.revenueTotal = { decrement: dto.revenueAmount };
      updateData.conversionCount = { decrement: 1 };
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.affiliateLink.update({
        where: { id: link.id },
        data: updateData,
      });
    }

    return {
      id: event.id,
      linkId: event.linkId,
      eventType: event.eventType,
      revenueAmount: event.revenueAmount ? Number(event.revenueAmount) : null,
      createdAt: event.createdAt.toISOString(),
    };
  }

  // ─── Stats ───

  async getStats(userId: string, tenantId: string, period: '7d' | '30d' | '90d' = '30d', linkId?: string) {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const linkWhere: Prisma.AffiliateLinkWhereInput = { tenantId, userId };
    if (linkId) linkWhere.id = linkId;

    const userLinks = await this.prisma.affiliateLink.findMany({
      where: linkWhere,
      select: { id: true, productName: true },
    });
    const linkIds = userLinks.map((l) => l.id);

    if (linkIds.length === 0) {
      return {
        totalClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
        conversionRate: 0,
        topLinks: [],
        dailyTrends: [],
      };
    }

    // Aggregate events
    const events = await this.prisma.affiliateEvent.groupBy({
      by: ['eventType'],
      where: {
        linkId: { in: linkIds },
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { revenueAmount: true },
    });

    const totalClicks = events.find((e) => e.eventType === AffiliateEventType.CLICK)?._count ?? 0;
    const purchaseEvents = events.find((e) => e.eventType === AffiliateEventType.PURCHASE);
    const totalConversions = purchaseEvents?._count ?? 0;
    const totalRevenue = Number(purchaseEvents?._sum.revenueAmount ?? 0);
    const conversionRate = totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0;

    // Top links (by revenue)
    const topLinksData = await this.prisma.affiliateLink.findMany({
      where: { id: { in: linkIds } },
      orderBy: { revenueTotal: 'desc' },
      take: 5,
      select: {
        id: true,
        productName: true,
        clickCount: true,
        conversionCount: true,
        revenueTotal: true,
      },
    });

    const topLinks = topLinksData.map((l) => ({
      linkId: l.id,
      productName: l.productName,
      clicks: l.clickCount,
      conversions: l.conversionCount,
      revenue: Number(l.revenueTotal),
    }));

    // Daily trends
    const dailyEvents = await this.prisma.affiliateEvent.findMany({
      where: {
        linkId: { in: linkIds },
        createdAt: { gte: startDate },
      },
      select: {
        eventType: true,
        revenueAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const trendsMap = new Map<string, { clicks: number; conversions: number; revenue: number }>();
    for (const e of dailyEvents) {
      const dateKey = e.createdAt.toISOString().split('T')[0];
      const existing = trendsMap.get(dateKey) ?? { clicks: 0, conversions: 0, revenue: 0 };
      if (e.eventType === AffiliateEventType.CLICK) existing.clicks++;
      if (e.eventType === AffiliateEventType.PURCHASE) {
        existing.conversions++;
        existing.revenue += Number(e.revenueAmount ?? 0);
      }
      trendsMap.set(dateKey, existing);
    }

    const dailyTrends = Array.from(trendsMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    return {
      totalClicks,
      totalConversions,
      totalRevenue,
      conversionRate,
      topLinks,
      dailyTrends,
    };
  }

  // ─── Helpers ───

  private async generateTrackingCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(4).toString('hex');
      const exists = await this.prisma.affiliateLink.findUnique({
        where: { trackingCode: code },
      });
      if (!exists) return code;
    }
    return randomBytes(8).toString('hex');
  }

  private formatLink(link: {
    id: string;
    originalUrl: string;
    trackingCode: string;
    shortUrl: string | null;
    productName: string | null;
    commissionRate: unknown;
    clickCount: number;
    conversionCount: number;
    revenueTotal: unknown;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: link.id,
      originalUrl: link.originalUrl,
      trackingCode: link.trackingCode,
      shortUrl: link.shortUrl ?? `/r/${link.trackingCode}`,
      productName: link.productName,
      commissionRate: link.commissionRate ? Number(link.commissionRate) : null,
      clickCount: link.clickCount,
      conversionCount: link.conversionCount,
      revenueTotal: Number(link.revenueTotal),
      isActive: link.isActive,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
