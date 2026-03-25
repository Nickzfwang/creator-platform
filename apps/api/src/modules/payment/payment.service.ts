import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan, SubscriptionStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PLAN_LIMITS, PLAN_INFO, PlanLimits } from './constants/plan-limits';

interface UsageJson {
  videosUsed?: number;
  postsUsed?: number;
  botMessagesUsed?: number;
  brandDealsUsed?: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
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
      this.logger.warn('Stripe SDK not initialized — STRIPE_SECRET_KEY missing');
    }

    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  // ─── Plans ───

  getPlans() {
    const plans = PLAN_INFO.map((plan) => ({
      ...plan,
      stripePriceId: this.getStripePriceId(plan.id),
    }));
    return { plans };
  }

  // ─── Current Subscription ───

  async getCurrentSubscription(userId: string, tenantId: string) {
    let subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, userId },
    });

    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          tenantId,
          userId,
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.ACTIVE,
          limits: PLAN_LIMITS.FREE as unknown as Prisma.InputJsonValue,
          usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const usage = (subscription.usage as unknown as UsageJson) ?? {};
    const limits = (subscription.limits as unknown as PlanLimits) ?? PLAN_LIMITS[subscription.plan];

    return {
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
      usage: {
        videosUsed: usage.videosUsed ?? 0,
        videosLimit: limits.videosPerMonth,
        postsUsed: usage.postsUsed ?? 0,
        postsLimit: limits.postsPerMonth,
        botMessagesUsed: usage.botMessagesUsed ?? 0,
        botMessagesLimit: limits.botMessagesPerMonth,
        brandDealsUsed: usage.brandDealsUsed ?? 0,
        brandDealsLimit: limits.brandDealsPerMonth,
      },
      percentages: {
        videos: this.calcPercentage(usage.videosUsed ?? 0, limits.videosPerMonth),
        posts: this.calcPercentage(usage.postsUsed ?? 0, limits.postsPerMonth),
        botMessages: this.calcPercentage(usage.botMessagesUsed ?? 0, limits.botMessagesPerMonth),
        brandDeals: this.calcPercentage(usage.brandDealsUsed ?? 0, limits.brandDealsPerMonth),
      },
    };
  }

  // ─── Checkout ───

  async createCheckoutSession(
    userId: string,
    tenantId: string,
    dto: CreateCheckoutDto,
  ) {
    if (dto.planId === SubscriptionPlan.FREE) {
      throw new BadRequestException('Cannot checkout for Free plan');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, userId },
    });

    if (subscription?.plan === dto.planId) {
      throw new BadRequestException(`Already on ${dto.planId} plan`);
    }

    const stripePriceId = this.getStripePriceId(dto.planId);
    if (!stripePriceId) {
      throw new BadRequestException(`Stripe price not configured for ${dto.planId}`);
    }

    if (!this.stripe) {
      throw new BadRequestException('Stripe 尚未設定，請聯繫管理員');
    }

    // Get or create Stripe Customer
    const stripeCustomerId = await this.getOrCreateStripeCustomer(userId);

    // If user already has a Stripe subscription, update it (proration)
    if (subscription?.stripeSubscriptionId) {
      const stripeSub = await this.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{
            id: stripeSub.items.data[0].id,
            price: stripePriceId,
          }],
          proration_behavior: 'create_prorations',
        });

        this.logger.log(`Subscription updated for user ${userId} to plan ${dto.planId}`);
        return {
          checkoutUrl: null,
          sessionId: null,
          message: '方案已升級，帳單將按比例調整',
          upgraded: true,
        };
      }
    }

    // Create new Checkout Session
    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: dto.successUrl ?? `${this.frontendUrl}/settings?billing=success`,
      cancel_url: dto.cancelUrl ?? `${this.frontendUrl}/settings?billing=cancelled`,
      metadata: { tenantId, userId },
    });

    this.logger.log(`Checkout session created for user ${userId}, plan ${dto.planId}`);

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  // ─── Customer Portal ───

  async createPortalSession(userId: string, returnUrl?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer found. Free plan users cannot access billing portal.',
      );
    }

    if (!this.stripe) {
      throw new BadRequestException('Stripe 尚未設定');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl ?? `${this.frontendUrl}/settings`,
    });

    this.logger.log(`Portal session created for user ${userId}`);
    return { portalUrl: session.url };
  }

  // ─── Webhook ───

  async handleWebhook(signature: string, rawBody: Buffer | undefined) {
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;

    if (this.stripe) {
      const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
      if (webhookSecret) {
        try {
          event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err) {
          this.logger.error(`Webhook signature verification failed: ${err}`);
          throw new BadRequestException('Invalid webhook signature');
        }
      } else {
        // Fallback: parse without verification (dev mode)
        this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
        event = JSON.parse(rawBody.toString());
      }
    } else {
      // No Stripe SDK — parse raw
      event = JSON.parse(rawBody.toString());
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    const obj = event.data.object as unknown as Record<string, unknown>;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(obj);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(obj);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(obj);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(obj);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(obj);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  // ─── Usage Tracking ───

  async recordUsage(
    tenantId: string,
    type: 'video' | 'post' | 'bot_message' | 'brand_deal',
  ) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    if (!subscription) return;

    const usage = (subscription.usage as unknown as UsageJson) ?? {};
    const fieldMap: Record<string, keyof UsageJson> = {
      video: 'videosUsed',
      post: 'postsUsed',
      bot_message: 'botMessagesUsed',
      brand_deal: 'brandDealsUsed',
    };

    const field = fieldMap[type];
    if (!field) return;

    const updated = { ...usage, [field]: (usage[field] ?? 0) + 1 };

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { usage: updated as Prisma.InputJsonValue },
    });

    this.logger.log(`Usage recorded: ${type} for tenant ${tenantId}`);
  }

  async checkUsageLimit(
    tenantId: string,
    type: 'video' | 'post' | 'bot_message' | 'brand_deal',
  ): Promise<boolean> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    if (!subscription) return false;

    const limits = (subscription.limits as unknown as PlanLimits) ?? PLAN_LIMITS[subscription.plan];
    const usage = (subscription.usage as unknown as UsageJson) ?? {};

    const limitMap: Record<string, keyof PlanLimits> = {
      video: 'videosPerMonth',
      post: 'postsPerMonth',
      bot_message: 'botMessagesPerMonth',
      brand_deal: 'brandDealsPerMonth',
    };
    const usageMap: Record<string, keyof UsageJson> = {
      video: 'videosUsed',
      post: 'postsUsed',
      bot_message: 'botMessagesUsed',
      brand_deal: 'brandDealsUsed',
    };

    const limit = limits[limitMap[type]];
    const used = usage[usageMap[type]] ?? 0;

    if (limit === -1) return true;
    return used < limit;
  }

  // ─── Webhook Handlers (private) ───

  private async handleCheckoutCompleted(data: Record<string, unknown>) {
    const metadata = data.metadata as { tenantId?: string; userId?: string } | undefined;
    if (!metadata?.tenantId || !metadata?.userId) {
      this.logger.warn('checkout.session.completed missing metadata');
      return;
    }

    const stripeSubscriptionId = data.subscription as string | undefined;
    if (!stripeSubscriptionId) return;

    // Determine plan from Stripe subscription's price ID
    let plan: SubscriptionPlan = SubscriptionPlan.PRO; // default fallback
    if (this.stripe) {
      try {
        const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        const priceId = stripeSub.items.data[0]?.price?.id;
        plan = this.planFromPriceId(priceId) ?? SubscriptionPlan.PRO;

        // Store currentPeriodEnd
        const periodEnd = new Date(stripeSub.current_period_end * 1000);

        const existing = await this.prisma.subscription.findFirst({
          where: { tenantId: metadata.tenantId },
        });

        const subData = {
          plan,
          stripeSubscriptionId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          limits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
          usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
        };

        if (existing) {
          await this.prisma.subscription.update({ where: { id: existing.id }, data: subData });
        } else {
          await this.prisma.subscription.create({
            data: { tenantId: metadata.tenantId, userId: metadata.userId, ...subData },
          });
        }

        this.logger.log(`Checkout completed for tenant ${metadata.tenantId}, plan ${plan}`);
        return;
      } catch (err) {
        this.logger.error(`Failed to retrieve Stripe subscription: ${err}`);
      }
    }

    // Fallback without Stripe SDK
    const existing = await this.prisma.subscription.findFirst({
      where: { tenantId: metadata.tenantId },
    });

    const subData = {
      plan,
      stripeSubscriptionId,
      status: SubscriptionStatus.ACTIVE,
      limits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
      usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
    };

    if (existing) {
      await this.prisma.subscription.update({ where: { id: existing.id }, data: subData });
    } else {
      await this.prisma.subscription.create({
        data: { tenantId: metadata.tenantId, userId: metadata.userId, ...subData },
      });
    }

    this.logger.log(`Checkout completed for tenant ${metadata.tenantId}, plan ${plan}`);
  }

  private async handleInvoicePaid(data: Record<string, unknown>) {
    const stripeSubscriptionId = data.subscription as string | undefined;
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });
    if (!subscription) return;

    // Extract period end from invoice data
    const periodEnd = data.period_end
      ? new Date((data.period_end as number) * 1000)
      : undefined;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        ...(periodEnd && { currentPeriodEnd: periodEnd }),
        // Reset usage on new billing cycle
        usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Invoice paid for subscription ${subscription.id}, usage reset`);
  }

  private async handleSubscriptionUpdated(data: Record<string, unknown>) {
    const stripeSubscriptionId = data.id as string | undefined;
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });
    if (!subscription) return;

    const status = data.status as string;
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
    };

    const newStatus = statusMap[status] ?? subscription.status;

    // Update plan if price changed
    const items = data.items as { data?: { price?: { id?: string } }[] } | undefined;
    const priceId = items?.data?.[0]?.price?.id;
    const newPlan = priceId ? this.planFromPriceId(priceId) : null;

    const periodEnd = data.current_period_end
      ? new Date((data.current_period_end as number) * 1000)
      : undefined;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        ...(newPlan && {
          plan: newPlan,
          limits: PLAN_LIMITS[newPlan] as unknown as Prisma.InputJsonValue,
        }),
        ...(periodEnd && { currentPeriodEnd: periodEnd }),
      },
    });

    this.logger.log(`Subscription ${subscription.id} updated to status ${newStatus}${newPlan ? `, plan ${newPlan}` : ''}`);
  }

  private async handleSubscriptionDeleted(data: Record<string, unknown>) {
    const stripeSubscriptionId = data.id as string | undefined;
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });
    if (!subscription) return;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELLED,
        stripeSubscriptionId: null,
        limits: PLAN_LIMITS.FREE as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Subscription ${subscription.id} cancelled, downgraded to FREE`);
  }

  private async handlePaymentFailed(data: Record<string, unknown>) {
    const stripeSubscriptionId = data.subscription as string | undefined;
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });
    if (!subscription) return;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.PAST_DUE },
    });

    this.logger.log(`Payment failed for subscription ${subscription.id}`);
  }

  // ─── Helpers ───

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true, displayName: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.stripeCustomerId) return user.stripeCustomerId;

    if (!this.stripe) throw new BadRequestException('Stripe 尚未設定');

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    this.logger.log(`Created Stripe customer ${customer.id} for user ${userId}`);
    return customer.id;
  }

  private planFromPriceId(priceId: string | undefined): SubscriptionPlan | null {
    if (!priceId) return null;

    const starterPrice = this.config.get<string>('STRIPE_PRICE_STARTER');
    const proPrice = this.config.get<string>('STRIPE_PRICE_PRO');
    const businessPrice = this.config.get<string>('STRIPE_PRICE_BUSINESS');

    if (priceId === starterPrice) return SubscriptionPlan.STARTER;
    if (priceId === proPrice) return SubscriptionPlan.PRO;
    if (priceId === businessPrice) return SubscriptionPlan.BUSINESS;

    return null;
  }

  private calcPercentage(used: number, limit: number): number | null {
    if (limit === -1) return null;
    if (limit === 0) return 100;
    return Math.min(Math.round((used / limit) * 100), 100);
  }

  private getStripePriceId(plan: SubscriptionPlan): string | null {
    const envMap: Record<string, string> = {
      STARTER: 'STRIPE_PRICE_STARTER',
      PRO: 'STRIPE_PRICE_PRO',
      BUSINESS: 'STRIPE_PRICE_BUSINESS',
    };
    const envKey = envMap[plan];
    if (!envKey) return null;
    return this.config.get<string>(envKey) ?? null;
  }
}
