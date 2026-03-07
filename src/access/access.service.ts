import { Injectable } from '@nestjs/common';
import { SubscriptionService } from 'src/subscription/subscription.service';

@Injectable()
export class AccessService {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async checkAccess(organizationId: string) {
    const subscription = await this.subscriptionService.getByOrganization(
      organizationId,
    );

    const active = this.subscriptionService.isActive(subscription);

    return {
      active,
      plan: subscription.plan,
      expiresAt: subscription.currentPeriodEnd,
    };
  }
}
