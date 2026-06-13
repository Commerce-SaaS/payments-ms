import { Inject, Injectable } from '@nestjs/common';
import { STRIPE_CLIENT } from 'src/config/services';
import { PaymentStatus } from 'src/common/dto/payment-status.enum';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionPlan } from 'src/subscription/enums/subscription-plan.enum';
import { SubscriptionStatus } from 'src/subscription/enums/subscription-status.enum';
import { SubscriptionService } from 'src/subscription/subscription.service';
import Stripe from 'stripe';
import Redis from 'ioredis';

@Injectable()
export class SubscriptionHandler {
  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
  ) {}

  async handleSubscriptionPaid(invoice: Stripe.Invoice) {
    const subscriptionDetails = invoice.parent?.subscription_details;
    try {
      // 1. Validate it's a subscription invoice
      if (subscriptionDetails?.subscription === null) {
        return { success: false, reason: 'Not a subscription invoice' };
      }

      const stripeSubscriptionId = subscriptionDetails?.subscription as string;
      const subscriptionId = subscriptionDetails?.metadata
        ?.subscriptionId as string;

      // 2. Find internal subscription
      const subscription =
        await this.subscriptionService.findOne(subscriptionId);

      if (!subscription) {
        return { success: false, reason: 'Subscription not found' };
      }

      // 3. Retrieve current data from Stripe
      let stripeSub: Stripe.Subscription;

      try {
        stripeSub = await this.stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          { expand: ['items.data.price.product'] },
        );
      } catch (error) {
        return { success: false };
      }

      const price = stripeSub.items.data[0]?.price;
      const product = price?.product as Stripe.Product;
      const item = stripeSub.items.data[0];
      const planNameMap: Record<string, SubscriptionPlan> = {
        basic: SubscriptionPlan.BASIC,
        base: SubscriptionPlan.BASIC,
        pro: SubscriptionPlan.PRO,
      };
      const resolvedPlan =
        planNameMap[product?.name?.toLowerCase()] ?? SubscriptionPlan.BASIC;

      // 4. Update subscription with real period data
      await this.subscriptionService.update(subscription.id, {
        currentPeriodStart: item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : new Date(invoice.period_start * 1000),
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : new Date(invoice.period_end * 1000),
        status: SubscriptionStatus.ACTIVE,
        plan: resolvedPlan,
        stripeSubscriptionId: stripeSubscriptionId,
        cancelAtPeriodEnd: false,
        priceAmount: price?.unit_amount ?? undefined,
        currency: price?.currency ?? undefined,
        stripePriceId: price?.id ?? undefined,
      });

      // 5. Mark payment as completed if exists
      const paymentId = subscriptionDetails?.metadata?.paymentId;
      const organizationId = subscriptionDetails?.metadata?.organizationId;

      if (paymentId) {
        await this.paymentService.update({
          paymentId,
          status: PaymentStatus.COMPLETED,
          organizationId: organizationId ?? ""
        });
      }

      // 6. Invalidate subscription cache
      await this.invalidateCache(subscription.userId);

      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionPaid error', error);
      return { success: false };
    }
  }

  async handleSubscriptionDeleted(object: Stripe.Subscription) {
    try {
      const subscriptionId = object.metadata?.subscriptionId;
      if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

      const subscription = await this.subscriptionService.findOne(subscriptionId);
      if (!subscription) return { success: false, reason: 'Subscription not found' };

      await this.subscriptionService.update(subscription.id, {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      });

      await this.invalidateCache(subscription.userId);

      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionDeleted error', error);
      return { success: false };
    }
  }

  async handleSubscriptionPaymentFailed(object: Stripe.Invoice) {
    try {
      const subscriptionId =
        object.parent?.subscription_details?.metadata?.subscriptionId;
      if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

      const subscription = await this.subscriptionService.findOne(subscriptionId);
      if (!subscription) return { success: false, reason: 'Subscription not found' };

      await this.subscriptionService.update(subscription.id, {
        status: SubscriptionStatus.PAST_DUE,
      });

      await this.invalidateCache(subscription.userId);

      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionPaymentFailed error', error);
      return { success: false };
    }
  }

  async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    try {
      const subscriptionId = stripeSub.metadata?.subscriptionId;
      if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

      const subscription = await this.subscriptionService.findOne(subscriptionId);
      if (!subscription) return { success: false, reason: 'Subscription not found' };

      const statusMap: Record<string, SubscriptionStatus> = {
        active: SubscriptionStatus.ACTIVE,
        past_due: SubscriptionStatus.PAST_DUE,
        canceled: SubscriptionStatus.CANCELED,
        trialing: SubscriptionStatus.TRIAL,
      };

      const item = stripeSub.items.data[0];
      const price = item?.price;

      await this.subscriptionService.update(subscription.id, {
        status: statusMap[stripeSub.status] ?? subscription.status,
        currentPeriodStart: item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        priceAmount: price?.unit_amount ?? undefined,
        currency: price?.currency ?? undefined,
        stripePriceId: price?.id ?? undefined,
      });

      await this.invalidateCache(subscription.userId);

      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionUpdated error', error);
      return { success: false };
    }
  }

  private async invalidateCache(userId?: string) {
    if (userId) {
      await this.redis.del(`sub:user:${userId}`);
    }
  }
}
