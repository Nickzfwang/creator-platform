import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  private readonly stripe: Stripe | null;
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = stripeKey
      ? new Stripe(stripeKey, { apiVersion: '2024-06-20' })
      : null;

    if (!this.stripe) {
      this.logger.warn('Stripe SDK not initialized for MembershipService');
    }

    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

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

    // Create Stripe Product + Price
    if (this.stripe) {
      try {
        const product = await this.stripe.products.create({
          name: `${dto.name} Membership`,
          metadata: { tierId: tier.id, tenantId },
        });

        const price = await this.stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(Number(dto.priceMonthly) * 100), // TWD to cents
          currency: 'twd',
          recurring: { interval: 'month' },
        });

        await this.prisma.membershipTier.update({
          where: { id: tier.id },
          data: { stripePriceId: price.id },
        });

        this.logger.log(`Stripe Product+Price created for tier ${tier.id}: ${price.id}`);
      } catch (err) {
        this.logger.error(`Failed to create Stripe price for tier ${tier.id}: ${err}`);
      }
    }

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

    // Get creator's Stripe Connect ID
    const creator = await this.prisma.user.findUnique({
      where: { id: tier.userId },
      select: { stripeConnectId: true },
    });

    // Create Stripe Checkout Session with Connect
    if (this.stripe && tier.stripePriceId && creator?.stripeConnectId) {
      // Get or create fan's Stripe Customer
      const fanCustomerId = await this.getOrCreateStripeCustomer(fanUserId);

      const session = await this.stripe.checkout.sessions.create({
        customer: fanCustomerId,
        mode: 'subscription',
        line_items: [{ price: tier.stripePriceId, quantity: 1 }],
        subscription_data: {
          application_fee_percent: 10, // 10% platform fee
          transfer_data: { destination: creator.stripeConnectId },
        },
        success_url: dto.successUrl ?? `${this.frontendUrl}/members?success=true`,
        cancel_url: dto.cancelUrl ?? `${this.frontendUrl}/members?cancelled=true`,
        metadata: {
          fanUserId,
          creatorUserId: tier.userId,
          tierId: tier.id,
          tenantId,
        },
      });

      this.logger.log(`Membership checkout session created for fan ${fanUserId} → tier ${tier.name}`);

      return {
        membershipId: null, // Created on webhook confirmation
        checkoutUrl: session.url,
        tier: this.formatTier(tier),
      };
    }

    // Fallback: create membership directly (no Stripe)
    const membership = await this.prisma.membership.create({
      data: {
        fanUserId,
        creatorUserId: tier.userId,
        tierId: tier.id,
        tenantId,
        status: MembershipStatus.ACTIVE,
        currentPeriodStart: new Date(),
      },
    });

    this.logger.log(`Membership created (no Stripe): fan ${fanUserId} → tier ${tier.name}`);

    return {
      membershipId: membership.id,
      checkoutUrl: null,
      tier: this.formatTier(tier),
    };
  }

  // ─── Stripe Connect Onboarding (Creator) ───

  async createConnectAccount(userId: string) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe 尚未設定');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeConnectId: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Return existing account link if already created
    if (user.stripeConnectId) {
      const accountLink = await this.stripe.accountLinks.create({
        account: user.stripeConnectId,
        refresh_url: `${this.frontendUrl}/settings?connect=refresh`,
        return_url: `${this.frontendUrl}/settings?connect=success`,
        type: 'account_onboarding',
      });
      return { accountUrl: accountLink.url, accountId: user.stripeConnectId };
    }

    // Create new Connect Express account
    const account = await this.stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeConnectId: account.id },
    });

    const accountLink = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${this.frontendUrl}/settings?connect=refresh`,
      return_url: `${this.frontendUrl}/settings?connect=success`,
      type: 'account_onboarding',
    });

    this.logger.log(`Stripe Connect account created for user ${userId}: ${account.id}`);
    return { accountUrl: accountLink.url, accountId: account.id };
  }

  async getConnectStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeConnectId: true },
    });

    if (!user?.stripeConnectId || !this.stripe) {
      return { connected: false, chargesEnabled: false, payoutsEnabled: false };
    }

    try {
      const account = await this.stripe.accounts.retrieve(user.stripeConnectId);
      return {
        connected: true,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        accountId: account.id,
      };
    } catch {
      return { connected: false, chargesEnabled: false, payoutsEnabled: false };
    }
  }

  // ─── Webhook: membership.checkout.completed ───

  async handleMembershipCheckoutCompleted(metadata: {
    fanUserId: string;
    creatorUserId: string;
    tierId: string;
    tenantId: string;
  }, stripeSubscriptionId: string) {
    // Create or update membership
    const existing = await this.prisma.membership.findFirst({
      where: {
        fanUserId: metadata.fanUserId,
        creatorUserId: metadata.creatorUserId,
        tierId: metadata.tierId,
      },
    });

    if (existing) {
      await this.prisma.membership.update({
        where: { id: existing.id },
        data: {
          status: MembershipStatus.ACTIVE,
          stripeSubscriptionId,
          currentPeriodStart: new Date(),
        },
      });
    } else {
      await this.prisma.membership.create({
        data: {
          fanUserId: metadata.fanUserId,
          creatorUserId: metadata.creatorUserId,
          tierId: metadata.tierId,
          tenantId: metadata.tenantId,
          stripeSubscriptionId,
          status: MembershipStatus.ACTIVE,
          currentPeriodStart: new Date(),
        },
      });
    }

    this.logger.log(`Membership confirmed via webhook: fan ${metadata.fanUserId} → tier ${metadata.tierId}`);
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

    // Cancel Stripe subscription at period end
    if (this.stripe && membership.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.update(membership.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        this.logger.log(`Stripe subscription ${membership.stripeSubscriptionId} set to cancel at period end`);
      } catch (err) {
        this.logger.error(`Failed to cancel Stripe subscription: ${err}`);
      }
    }

    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Membership ${membershipId} cancelled by fan ${fanUserId}`);
  }

  // ─── Private Helpers ───

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.stripeCustomerId) return user.stripeCustomerId;

    if (!this.stripe) throw new BadRequestException('Stripe not configured');

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

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
