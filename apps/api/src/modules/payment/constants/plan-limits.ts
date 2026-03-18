import { SubscriptionPlan } from '@prisma/client';

export interface PlanLimits {
  videosPerMonth: number;
  postsPerMonth: number;
  botMessagesPerMonth: number;
  brandDealsPerMonth: number;
}

// -1 = unlimited
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    videosPerMonth: 3,
    postsPerMonth: 30,
    botMessagesPerMonth: 100,
    brandDealsPerMonth: 1,
  },
  STARTER: {
    videosPerMonth: 15,
    postsPerMonth: 150,
    botMessagesPerMonth: 1000,
    brandDealsPerMonth: 5,
  },
  PRO: {
    videosPerMonth: 50,
    postsPerMonth: 500,
    botMessagesPerMonth: 5000,
    brandDealsPerMonth: 20,
  },
  BUSINESS: {
    videosPerMonth: -1,
    postsPerMonth: -1,
    botMessagesPerMonth: -1,
    brandDealsPerMonth: -1,
  },
};

export interface PlanInfo {
  id: SubscriptionPlan;
  name: string;
  price: number; // USD cents per month
  currency: 'usd';
  interval: 'month';
  limits: PlanLimits;
  features: string[];
  stripePriceId: string | null;
  recommended: boolean;
}

export const PLAN_INFO: PlanInfo[] = [
  {
    id: SubscriptionPlan.FREE,
    name: 'Free',
    price: 0,
    currency: 'usd',
    interval: 'month',
    limits: PLAN_LIMITS.FREE,
    features: ['3 videos/month', '30 posts/month', 'Basic AI clipping', 'Community support'],
    stripePriceId: null,
    recommended: false,
  },
  {
    id: SubscriptionPlan.STARTER,
    name: 'Starter',
    price: 2900,
    currency: 'usd',
    interval: 'month',
    limits: PLAN_LIMITS.STARTER,
    features: ['15 videos/month', '150 posts/month', '1,000 bot messages', '5 brand deals', 'Priority support'],
    stripePriceId: null, // Set via env: STRIPE_PRICE_STARTER
    recommended: false,
  },
  {
    id: SubscriptionPlan.PRO,
    name: 'Pro',
    price: 7900,
    currency: 'usd',
    interval: 'month',
    limits: PLAN_LIMITS.PRO,
    features: ['50 videos/month', '500 posts/month', '5,000 bot messages', '20 brand deals', 'Advanced analytics', 'Priority support'],
    stripePriceId: null, // Set via env: STRIPE_PRICE_PRO
    recommended: true,
  },
  {
    id: SubscriptionPlan.BUSINESS,
    name: 'Business',
    price: 19900,
    currency: 'usd',
    interval: 'month',
    limits: PLAN_LIMITS.BUSINESS,
    features: ['Unlimited videos', 'Unlimited posts', 'Unlimited bot messages', 'Unlimited brand deals', 'White-label options', 'Dedicated support'],
    stripePriceId: null, // Set via env: STRIPE_PRICE_BUSINESS
    recommended: false,
  },
];
