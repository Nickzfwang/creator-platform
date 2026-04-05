import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MembershipService } from '../membership.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = () => ({
  membershipTier: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  membership: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

const makeTier = (overrides: Record<string, unknown> = {}) => ({
  id: 'tier-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  name: 'Basic',
  description: 'Basic tier',
  priceMonthly: 99,
  priceYearly: null,
  benefits: ['Access to posts'],
  botAccessTier: 'FREE',
  maxMembers: null,
  isActive: true,
  sortOrder: 0,
  stripePriceId: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeMembership = (overrides: Record<string, unknown> = {}) => ({
  id: 'mem-1',
  fanUserId: 'fan-1',
  creatorUserId: 'user-1',
  tierId: 'tier-1',
  tenantId: 'tenant-1',
  stripeSubscriptionId: null,
  status: 'ACTIVE',
  currentPeriodStart: new Date(),
  currentPeriodEnd: null,
  cancelledAt: null,
  createdAt: new Date('2026-01-15'),
  ...overrides,
});

describe('MembershipService', () => {
  let service: MembershipService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              // No Stripe key → service runs in no-Stripe mode
              if (key === 'STRIPE_SECRET_KEY') return undefined;
              if (key === 'FRONTEND_URL') return 'http://localhost:3001';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(MembershipService);
  });

  // ─── Tier CRUD ───

  describe('createTier', () => {
    it('should create a tier and return formatted result', async () => {
      prisma.membershipTier.create.mockResolvedValue(makeTier());

      const result = await service.createTier('user-1', 'tenant-1', {
        name: 'Basic',
        priceMonthly: 99,
        description: 'Basic tier',
        benefits: ['Access to posts'],
      });

      expect(result.id).toBe('tier-1');
      expect(result.name).toBe('Basic');
      expect(result.priceMonthly).toBe(99);
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(prisma.membershipTier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1', name: 'Basic' }),
        }),
      );
    });

    it('should default sortOrder to 0', async () => {
      prisma.membershipTier.create.mockResolvedValue(makeTier());

      await service.createTier('user-1', 'tenant-1', { name: 'Test', priceMonthly: 50 });

      expect(prisma.membershipTier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 0 }),
        }),
      );
    });
  });

  describe('getTiers', () => {
    it('should return tiers with memberCount', async () => {
      prisma.membershipTier.findMany.mockResolvedValue([
        { ...makeTier(), _count: { memberships: 5 } },
      ]);

      const result = await service.getTiers('user-1', 'tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].memberCount).toBe(5);
      expect(result[0].name).toBe('Basic');
    });

    it('should return empty array when no tiers', async () => {
      prisma.membershipTier.findMany.mockResolvedValue([]);

      const result = await service.getTiers('user-1', 'tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('getPublicTiers', () => {
    it('should only return active tiers', async () => {
      prisma.membershipTier.findMany.mockResolvedValue([
        { ...makeTier({ isActive: true }), _count: { memberships: 3 } },
      ]);

      const result = await service.getPublicTiers('user-1', 'tenant-1');

      expect(result).toHaveLength(1);
      expect(prisma.membershipTier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('updateTier', () => {
    it('should update only provided fields', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier());
      prisma.membershipTier.update.mockResolvedValue(makeTier({ name: 'Premium' }));

      const result = await service.updateTier('user-1', 'tenant-1', 'tier-1', { name: 'Premium' });

      expect(result.name).toBe('Premium');
    });

    it('should throw NotFoundException if tier not found', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTier('user-1', 'tenant-1', 'tier-x', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier({ userId: 'other' }));

      await expect(
        service.updateTier('user-1', 'tenant-1', 'tier-1', { name: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if wrong tenant', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier({ tenantId: 'other-tenant' }));

      await expect(
        service.updateTier('user-1', 'tenant-1', 'tier-1', { name: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow toggling isActive', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier());
      prisma.membershipTier.update.mockResolvedValue(makeTier({ isActive: false }));

      const result = await service.updateTier('user-1', 'tenant-1', 'tier-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });

  describe('deleteTier', () => {
    it('should delete tier with no members', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue({
        ...makeTier(),
        _count: { memberships: 0 },
      });

      await service.deleteTier('user-1', 'tenant-1', 'tier-1');

      expect(prisma.membershipTier.delete).toHaveBeenCalledWith({ where: { id: 'tier-1' } });
    });

    it('should throw BadRequestException if tier has active members', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue({
        ...makeTier(),
        _count: { memberships: 3 },
      });

      await expect(
        service.deleteTier('user-1', 'tenant-1', 'tier-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if tier not found', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(null);

      await expect(service.deleteTier('user-1', 'tenant-1', 'tier-x')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue({
        ...makeTier({ userId: 'other' }),
        _count: { memberships: 0 },
      });

      await expect(service.deleteTier('user-1', 'tenant-1', 'tier-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Subscribe (no-Stripe mode) ───

  describe('subscribe', () => {
    it('should create membership directly without Stripe', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier());
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.membership.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ stripeConnectId: null });
      prisma.membership.create.mockResolvedValue(makeMembership());

      const result = await service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-1' });

      expect(result.membershipId).toBe('mem-1');
      expect(result.checkoutUrl).toBeNull();
      expect(result.tier.name).toBe('Basic');
    });

    it('should throw NotFoundException for inactive tier', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier({ isActive: false }));

      await expect(
        service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent tier', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(null);

      await expect(
        service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for wrong tenant', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier({ tenantId: 'other-tenant' }));

      await expect(
        service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when tier is at max capacity', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier({ maxMembers: 5 }));
      prisma.membership.count.mockResolvedValue(5);

      await expect(
        service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate subscription', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(makeTier());
      prisma.membership.count.mockResolvedValue(0);
      prisma.membership.findFirst.mockResolvedValue(makeMembership());

      await expect(
        service.subscribe('fan-1', 'tenant-1', { tierId: 'tier-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Webhook ───

  describe('handleMembershipCheckoutCompleted', () => {
    const metadata = {
      fanUserId: 'fan-1',
      creatorUserId: 'user-1',
      tierId: 'tier-1',
      tenantId: 'tenant-1',
    };

    it('should create new membership if none exists', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue(makeMembership());

      await service.handleMembershipCheckoutCompleted(metadata, 'sub_123');

      expect(prisma.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fanUserId: 'fan-1',
            stripeSubscriptionId: 'sub_123',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should update existing membership', async () => {
      prisma.membership.findFirst.mockResolvedValue(makeMembership({ status: 'PAST_DUE' }));

      await service.handleMembershipCheckoutCompleted(metadata, 'sub_456');

      expect(prisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-1' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            stripeSubscriptionId: 'sub_456',
          }),
        }),
      );
    });
  });

  // ─── Cancel ───

  describe('cancelMembership', () => {
    it('should cancel membership (no Stripe)', async () => {
      prisma.membership.findUnique.mockResolvedValue(makeMembership());

      await service.cancelMembership('fan-1', 'tenant-1', 'mem-1');

      expect(prisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelledAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException if membership not found', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelMembership('fan-1', 'tenant-1', 'mem-x'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not the fan', async () => {
      prisma.membership.findUnique.mockResolvedValue(makeMembership({ fanUserId: 'other-fan' }));

      await expect(
        service.cancelMembership('fan-1', 'tenant-1', 'mem-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for wrong tenant', async () => {
      prisma.membership.findUnique.mockResolvedValue(makeMembership({ tenantId: 'other-tenant' }));

      await expect(
        service.cancelMembership('fan-1', 'tenant-1', 'mem-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already cancelled', async () => {
      prisma.membership.findUnique.mockResolvedValue(makeMembership({ status: 'CANCELLED' }));

      await expect(
        service.cancelMembership('fan-1', 'tenant-1', 'mem-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Members List ───

  describe('getMembers', () => {
    it('should return paginated members', async () => {
      const membership = {
        ...makeMembership(),
        fan: { id: 'fan-1', displayName: 'Fan', avatarUrl: null, email: 'fan@test.com' },
        tier: { id: 'tier-1', name: 'Basic', priceMonthly: 99 },
      };
      prisma.membership.findMany.mockResolvedValue([membership]);

      const result = await service.getMembers('user-1', 'tenant-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data[0].fan.displayName).toBe('Fan');
      expect(result.data[0].tier.priceMonthly).toBe(99);
    });

    it('should detect hasMore when results exceed limit', async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        ...makeMembership({ id: `mem-${i}` }),
        fan: { id: `fan-${i}`, displayName: `Fan ${i}`, avatarUrl: null, email: `f${i}@test.com` },
        tier: { id: 'tier-1', name: 'Basic', priceMonthly: 99 },
      }));
      prisma.membership.findMany.mockResolvedValue(items);

      const result = await service.getMembers('user-1', 'tenant-1', { limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('mem-1');
    });

    it('should apply status filter', async () => {
      prisma.membership.findMany.mockResolvedValue([]);

      await service.getMembers('user-1', 'tenant-1', { status: 'ACTIVE' as any });

      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should use cursor for pagination', async () => {
      prisma.membership.findMany.mockResolvedValue([]);

      await service.getMembers('user-1', 'tenant-1', { cursor: 'mem-5' });

      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'mem-5' },
        }),
      );
    });
  });

  // ─── My Memberships ───

  describe('getMyMemberships', () => {
    it('should return fan memberships with creator and tier info', async () => {
      prisma.membership.findMany.mockResolvedValue([{
        ...makeMembership(),
        creator: { id: 'user-1', displayName: 'Creator', avatarUrl: null },
        tier: { id: 'tier-1', name: 'Basic', priceMonthly: 99, benefits: ['Post access'] },
      }]);

      const result = await service.getMyMemberships('fan-1', 'tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].creator.displayName).toBe('Creator');
      expect(result[0].tier.priceMonthly).toBe(99);
      expect(result[0].tier.benefits).toEqual(['Post access']);
    });

    it('should return empty for fan with no memberships', async () => {
      prisma.membership.findMany.mockResolvedValue([]);

      const result = await service.getMyMemberships('fan-1', 'tenant-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Stripe Connect (no-Stripe mode) ───

  describe('createConnectAccount', () => {
    it('should throw BadRequestException when Stripe not configured', async () => {
      await expect(service.createConnectAccount('user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getConnectStatus', () => {
    it('should return disconnected when no Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue({ stripeConnectId: null });

      const result = await service.getConnectStatus('user-1');

      expect(result).toEqual({ connected: false, chargesEnabled: false, payoutsEnabled: false });
    });

    it('should return disconnected when no stripeConnectId', async () => {
      prisma.user.findUnique.mockResolvedValue({ stripeConnectId: null });

      const result = await service.getConnectStatus('user-1');
      expect(result.connected).toBe(false);
    });
  });
});
