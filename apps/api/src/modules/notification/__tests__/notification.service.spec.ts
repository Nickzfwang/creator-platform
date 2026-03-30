import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationGateway } from '../notification.gateway';

// Mock factories
const mockPrisma = () => ({
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
});

const mockGateway = () => ({
  sendToUser: jest.fn(),
  sendUnreadCount: jest.fn(),
});

const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockTenantId = '00000000-0000-0000-0000-000000000010';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof mockPrisma>;
  let gateway: ReturnType<typeof mockGateway>;

  beforeEach(async () => {
    prisma = mockPrisma();
    gateway = mockGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  // ─── findAll ───

  describe('findAll', () => {
    it('should return paginated notifications with unread count', async () => {
      const notifications = Array.from({ length: 21 }, (_, i) => ({
        id: `notif-${i}`,
        userId: mockUserId,
        tenantId: mockTenantId,
        isRead: false,
        createdAt: new Date(),
      }));

      prisma.notification.findMany.mockResolvedValue(notifications);
      prisma.notification.count.mockResolvedValue(15);

      const result = await service.findAll(mockUserId, mockTenantId);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('notif-19');
      expect(result.unreadCount).toBe(15);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, tenantId: mockTenantId },
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should filter unread only when requested', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findAll(mockUserId, mockTenantId, undefined, 20, true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, tenantId: mockTenantId, isRead: false },
        }),
      );
    });
  });

  // ─── getUnreadCount ───

  describe('getUnreadCount', () => {
    it('should return count filtered by userId', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(mockUserId, mockTenantId);

      expect(result).toEqual({ count: 7 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: mockUserId, tenantId: mockTenantId, isRead: false },
      });
    });
  });

  // ─── markAsRead ───

  describe('markAsRead', () => {
    it('should update notification', async () => {
      const updated = {
        id: 'notif-1',
        userId: mockUserId,
        isRead: true,
        readAt: new Date(),
      };
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.markAsRead('notif-1', mockUserId);

      expect(result).toEqual(updated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: mockUserId },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });
  });

  // ─── markAllAsRead ───

  describe('markAllAsRead', () => {
    it('should batch update and return count', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead(mockUserId);

      expect(result).toEqual({ updatedCount: 5 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });
  });

  // ─── send ───

  describe('send', () => {
    const dto = {
      userId: mockUserId,
      tenantId: mockTenantId,
      type: 'TREND_VIRAL_ALERT' as const,
      title: 'Test notification',
      body: 'Test body',
    };

    it('should create notification and push via WebSocket', async () => {
      const created = { id: 'notif-new', ...dto, isRead: false };
      prisma.notification.create.mockResolvedValue(created);
      prisma.notification.count.mockResolvedValue(3);

      const result = await service.send(dto);

      expect(result).toEqual(created);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: dto.userId,
          tenantId: dto.tenantId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          metadata: {},
          linkUrl: undefined,
        },
      });
      expect(gateway.sendToUser).toHaveBeenCalledWith(mockUserId, created);
      expect(gateway.sendUnreadCount).toHaveBeenCalledWith(mockUserId, 3);
    });

    it('should work without gateway (Optional injection)', async () => {
      // Rebuild module without gateway
      const moduleNoGw: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();

      const serviceNoGw = moduleNoGw.get(NotificationService);

      const created = { id: 'notif-new', ...dto, isRead: false };
      prisma.notification.create.mockResolvedValue(created);

      const result = await serviceNoGw.send(dto);

      expect(result).toEqual(created);
      expect(gateway.sendToUser).not.toHaveBeenCalled();
      expect(gateway.sendUnreadCount).not.toHaveBeenCalled();
    });
  });
});
