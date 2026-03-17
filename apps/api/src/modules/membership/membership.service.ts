import { Injectable } from '@nestjs/common';

@Injectable()
export class MembershipService {
  async createTier(data: {
    name: string;
    price: number;
    currency: string;
    benefits: string[];
  }) {
    // TODO: Create Stripe product + price
    // TODO: Store tier in database
    return { id: 'new-tier-id', ...data };
  }

  async getTiers() {
    // TODO: Query membership tiers from database
    return [];
  }

  async subscribe(data: { tierId: string; userId: string }) {
    // TODO: Create Stripe subscription
    // TODO: Store subscription in database
    return { subscriptionId: 'new-sub-id', status: 'active', ...data };
  }
}
