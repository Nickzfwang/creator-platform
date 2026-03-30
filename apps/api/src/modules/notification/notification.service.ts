import {
  Injectable,
  Optional,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationType, Prisma } from '@prisma/client';

export interface SendNotificationDto {
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
  linkUrl?: string;
  sendEmail?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway?: NotificationGateway,
  ) {}

  async findAll(
    userId: string,
    tenantId: string,
    cursor?: string,
    limit = 20,
    unreadOnly = false,
  ) {
    const take = Math.min(limit, 50);

    const where: Prisma.NotificationWhereInput = { userId, tenantId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      take: take + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = notifications.length > take;
    const data = hasMore ? notifications.slice(0, take) : notifications;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const unreadCount = await this.prisma.notification.count({
      where: { userId, tenantId, isRead: false },
    });

    return { data, nextCursor, hasMore, unreadCount };
  }

  async getUnreadCount(userId: string, tenantId?: string) {
    const where: Prisma.NotificationWhereInput = { userId, isRead: false };
    if (tenantId) where.tenantId = tenantId;
    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.update({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { updatedCount: result.count };
  }

  async send(dto: SendNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? {},
        linkUrl: dto.linkUrl,
      },
    });

    if (this.gateway) {
      try {
        this.gateway.sendToUser(dto.userId, notification);
        const { count } = await this.getUnreadCount(dto.userId);
        this.gateway.sendUnreadCount(dto.userId, count);
      } catch (error) {
        this.logger.warn(
          `Failed to send real-time notification to user ${dto.userId}`,
          error,
        );
      }
    }

    return notification;
  }

  async sendBatch(items: SendNotificationDto[]) {
    const results = [];
    for (const item of items) {
      const notification = await this.send(item);
      results.push(notification);
    }
    return results;
  }
}
