import { Injectable } from '@nestjs/common';
import { SubscriptionService } from 'src/subscription/subscription.service';

@Injectable()
export class AccessService {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async checkAccess(userId: string) {
    const subscription = await this.subscriptionService.getByUser(userId).catch(() => null);

    if (!subscription) {
      return {
        active: false,
        plan: null,
        status: 'NONE',
        expiresAt: null,
      };
    }

    const active = this.subscriptionService.isActive(subscription);

    return {
      active,
      plan: subscription.plan,
      status: subscription.status,
      expiresAt: subscription.currentPeriodEnd,
    };
  }

  async checkOnboarding(userId: string) {
    const subscription = await this.subscriptionService.getByUser(userId).catch(() => null);
    const paid = subscription ? this.subscriptionService.isActive(subscription) : false;

    return {
      paid,
    };
  }
}
