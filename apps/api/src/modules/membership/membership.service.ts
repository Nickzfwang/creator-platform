import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Tier CRUD (Creator) ───

  async createTier(userId: string, tenantId: string, dto: CreateTierDto) {
    const tier = await this.prisma.membershipTier.create({
      data: {
        userId,
        tenantId,
        name: dto.name,
        description: dto.description,
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        benefits: dto.benefits as unknown as Prisma.InputJsonValue,
        botAccessTier: dto.botAccessTier,
        maxMembers: dto.maxMembers,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    // TODO: Create Stripe Product + Price
    // const product = await stripe.products.create({ name: dto.name });
    // const price = await stripe.prices.create({ product: product.id, unit_amount: dto.priceMonthly * 100, currency: 'usd', recurring: { interval: 'month' } });
    // await prisma.membershipTier.update({ where: { id: tier.id }, data: { stripePriceId: price.id } });

    return this.formatTier(tier);
  }

  async getTiers(userId: string, tenantId: string) {
    const tiers = await this.prisma.membershipTier.findMany({
      where: { tenantId, userId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });

    return tiers.map((t) => ({
      ...this.formatTier(t),
      memberCount: t._count.memberships,
    }));
  }

  async getPublicTiers(creatorUserId: string, tenantId: string) {
    const tiers = await this.prisma.membershipTier.findMany({
      where: { tenantId, userId: creatorUserId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });

    return tiers.map((t) => ({
      ...this.formatTier(t),
      memberCount: t._count.memberships,
    }));
  }

  async updateTier(userId: string, tenantId: string, id: string, dto: UpdateTierDto) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('Tier not found');
    if (tier.userId !== userId || tier.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.membershipTier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceMonthly !== undefined && { priceMonthly: dto.priceMonthly }),
        ...(dto.priceYearly !== undefined && { priceYearly: dto.priceYearly }),
        ...(dto.benefits !== undefined && { benefits: dto.benefits as unknown as Prisma.InputJsonValue }),
        ...(dto.botAccessTier !== undefined && { botAccessTier: dto.botAccessTier }),
        ...(dto.maxMembers !== undefined && { maxMembers: dto.maxMembers }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.formatTier(updated);
  }

  async deleteTier(userId: string, tenantId: string, id: string) {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true } } },
    });
    if (!tier) throw new NotFoundException('Tier not found');
    if (tier.userId !== userId || tier.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    if (tier._count.memberships > 0) {
      throw new BadRequestException('Cannot delete tier with active members. Deactivate it instead.');
    }

    await this.prisma.membershipTier.delete({ where: { id } });
  }

  // ─── Subscribe (Fan) ───

  async subscribe(fanUserId: string, tenantId: string, dto: SubscribeDto) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id: dto.tierId } });
    if (!tier || !tier.isActive) throw new NotFoundException('Tier not found or inactive');
    if (tier.tenantId !== tenantId) throw new ForbiddenException();

    // Check max members
    if (tier.maxMembers) {
      const currentCount = await this.prisma.membership.count({
        where: { tierId: tier.id, status: MembershipStatus.ACTIVE },
      });
      if (currentCount >= tier.maxMembers) {
        throw new BadRequestException('This tier has reached maximum capacity');
      }
    }

    // Check for existing membership
    const existing = await this.prisma.membership.findFirst({
      where: {
        fanUserId,
        creatorUserId: tier.userId,
        tierId: tier.id,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new ConflictException('Already subscribed to this tier');
    }

    // TODO: Create Stripe Checkout Session with Connect
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   line_items: [{ price: tier.stripePriceId, quantity: 1 }],
    //   payment_intent_data: { application_fee_percent: 10, transfer_data: { destination: creatorStripeConnectId } },
    //   success_url: dto.successUrl, cancel_url: dto.cancelUrl,
    //   metadata: { fanUserId, creatorUserId: tier.userId, tierId: tier.id, tenantId },
    // });

    // Create membership (pending until Stripe webhook confirms)
    const membership = await this.prisma.membership.create({
      data: {
        fanUserId,
        creatorUserId: tier.userId,
        tierId: tier.id,
        tenantId,
        status: MembershipStatus.ACTIVE, // TODO: set to PENDING until Stripe confirms
        currentPeriodStart: new Date(),
      },
    });

    const checkoutUrl = `https://checkout.stripe.com/placeholder/membership_${membership.id}`;

    this.logger.log(`Membership created: fan ${fanUserId} → tier ${tier.name}`);

    return {
      membershipId: membership.id,
      checkoutUrl,
      tier: this.formatTier(tier),
    };
  }

  // ─── Members List (Creator) ───

  async getMembers(userId: string, tenantId: string, query: ListMembersQueryDto) {
    const limit = query.limit ?? 20;

    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        creatorUserId: userId,
        ...(query.status && { status: query.status }),
      },
      take: limit + 1,
      ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
      orderBy: { createdAt: 'desc' },
      include: {
        fan: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
        tier: { select: { id: true, name: true, priceMonthly: true } },
      },
    });

    const hasMore = memberships.length > limit;
    const data = hasMore ? memberships.slice(0, limit) : memberships;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((m) => ({
        id: m.id,
        status: m.status,
        currentPeriodStart: m.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: m.currentPeriodEnd?.toISOString() ?? null,
        cancelledAt: m.cancelledAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        fan: m.fan,
        tier: {
          id: m.tier.id,
          name: m.tier.name,
          priceMonthly: Number(m.tier.priceMonthly),
        },
      })),
      nextCursor,
      hasMore,
    };
  }

  // ─── My Memberships (Fan) ───

  async getMyMemberships(fanUserId: string, tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { fanUserId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        tier: { select: { id: true, name: true, priceMonthly: true, benefits: true } },
      },
    });

    return memberships.map((m) => ({
      id: m.id,
      status: m.status,
      currentPeriodEnd: m.currentPeriodEnd?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      creator: m.creator,
      tier: {
        id: m.tier.id,
        name: m.tier.name,
        priceMonthly: Number(m.tier.priceMonthly),
        benefits: m.tier.benefits,
      },
    }));
  }

  // ─── Cancel (Fan) ───

  async cancelMembership(fanUserId: string, tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.fanUserId !== fanUserId || membership.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    if (membership.status === MembershipStatus.CANCELLED) {
      throw new BadRequestException('Membership already cancelled');
    }

    // TODO: Cancel Stripe subscription
    // await stripe.subscriptions.update(membership.stripeSubscriptionId, { cancel_at_period_end: true });

    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Membership ${membershipId} cancelled by fan ${fanUserId}`);
  }

  // ─── Helpers ───

  private formatTier(tier: {
    id: string;
    name: string;
    description: string | null;
    priceMonthly: unknown;
    priceYearly: unknown;
    benefits: unknown;
    botAccessTier: string;
    maxMembers: number | null;
    isActive: boolean;
    sortOrder: number;
    stripePriceId: string | null;
    createdAt: Date;
  }) {
    return {
      id: tier.id,
      name: tier.name,
      description: tier.description,
      priceMonthly: Number(tier.priceMonthly),
      priceYearly: tier.priceYearly ? Number(tier.priceYearly) : null,
      benefits: tier.benefits,
      botAccessTier: tier.botAccessTier,
      maxMembers: tier.maxMembers,
      isActive: tier.isActive,
      sortOrder: tier.sortOrder,
      stripePriceId: tier.stripePriceId,
      createdAt: tier.createdAt.toISOString(),
    };
  }
}
