import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan, SubscriptionStatus, Prisma } from '@prisma/client';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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

    // Auto-create FREE subscription if none exists
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

    // TODO: Integrate with Stripe
    // 1. Get or create Stripe Customer (using user.stripeCustomerId)
    // 2. If existing subscription → stripe.subscriptions.update (proration)
    // 3. If new → stripe.checkout.sessions.create
    //
    // const session = await stripe.checkout.sessions.create({
    //   customer: stripeCustomerId,
    //   mode: 'subscription',
    //   line_items: [{ price: stripePriceId, quantity: 1 }],
    //   success_url: dto.successUrl ?? `${frontendUrl}/settings/billing?success=true`,
    //   cancel_url: dto.cancelUrl ?? `${frontendUrl}/settings/billing?cancelled=true`,
    //   metadata: { tenantId, userId },
    // });

    const sessionId = `cs_placeholder_${Date.now()}`;
    const checkoutUrl = `https://checkout.stripe.com/placeholder/${sessionId}`;

    this.logger.log(
      `Checkout session created for user ${userId}, plan ${dto.planId}`,
    );

    return { checkoutUrl, sessionId };
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

    // TODO: Integrate with Stripe
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: user.stripeCustomerId,
    //   return_url: returnUrl ?? `${frontendUrl}/settings/billing`,
    // });

    const portalUrl = `https://billing.stripe.com/placeholder/${user.stripeCustomerId}`;

    this.logger.log(`Portal session created for user ${userId}`);
    return { portalUrl };
  }

  // ─── Webhook ───

  async handleWebhook(signature: string, rawBody: Buffer | undefined) {
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    // TODO: Verify Stripe signature
    // const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    // const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
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

    // TODO: Fetch subscription from Stripe to determine plan from price ID
    const plan = SubscriptionPlan.PRO; // placeholder

    const existing = await this.prisma.subscription.findFirst({
      where: { tenantId: metadata.tenantId },
    });

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          plan,
          stripeSubscriptionId,
          status: SubscriptionStatus.ACTIVE,
          limits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
          usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          tenantId: metadata.tenantId,
          userId: metadata.userId,
          plan,
          stripeSubscriptionId,
          status: SubscriptionStatus.ACTIVE,
          limits: PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue,
          usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
        },
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

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        usage: { videosUsed: 0, postsUsed: 0, botMessagesUsed: 0, brandDealsUsed: 0 } as unknown as Prisma.InputJsonValue,
        // TODO: Update currentPeriodEnd from Stripe invoice
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

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: newStatus },
    });

    this.logger.log(`Subscription ${subscription.id} updated to status ${newStatus}`);
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
