import { Inject, Injectable } from '@nestjs/common';
import { STRIPE_CLIENT } from 'src/config/services';
import { envs } from 'src/config';
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

    // Non-recoverable: not a subscription invoice
    if (!subscriptionDetails?.subscription) {
      return { success: false, reason: 'Not a subscription invoice' };
    }

    const stripeSubscriptionId = subscriptionDetails.subscription as string;
    const subscriptionId = subscriptionDetails.metadata?.subscriptionId;

    // Non-recoverable: metadata missing — re-sending will not fix it
    if (!subscriptionId) {
      return { success: false, reason: 'No subscriptionId in metadata' };
    }

    try {
      const subscription = await this.subscriptionService.findOne(subscriptionId);

      const stripeSub = await this.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
        { expand: ['items.data.price.product'] },
      );

      const item = stripeSub.items.data[0];
      const price = item?.price;
      const product = price?.product as Stripe.Product | undefined;
      const resolvedPlan = this.resolvePlan(price?.id, product?.name);

      await this.subscriptionService.update(subscription.id, {
        currentPeriodStart: item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : new Date(invoice.period_start * 1000),
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : new Date(invoice.period_end * 1000),
        status: SubscriptionStatus.ACTIVE,
        plan: resolvedPlan ?? subscription.plan,
        stripeSubscriptionId,
        cancelAtPeriodEnd: false,
        priceAmount: price?.unit_amount ?? undefined,
        currency: price?.currency ?? undefined,
        stripePriceId: price?.id ?? undefined,
      });

      const paymentId = subscriptionDetails.metadata?.paymentId;
      const organizationId = subscriptionDetails.metadata?.organizationId;

      if (paymentId) {
        await this.paymentService.updateStatus({
          paymentId,
          status: PaymentStatus.COMPLETED,
          organizationId: organizationId ?? '',
        });
      }

      await this.invalidateCache(subscription.userId);
      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionPaid error', error);
      throw error; // Re-throw so the transport retries on transient errors
    }
  }

  async handleSubscriptionDeleted(object: Stripe.Subscription) {
    const subscriptionId = object.metadata?.subscriptionId;
    // Non-recoverable: no subscriptionId means we can never resolve this event
    if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

    try {
      const subscription = await this.subscriptionService.findOne(subscriptionId);

      await this.subscriptionService.update(subscription.id, {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      });

      await this.invalidateCache(subscription.userId);
      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionDeleted error', error);
      throw error;
    }
  }

  async handleSubscriptionPaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId =
      invoice.parent?.subscription_details?.metadata?.subscriptionId;
    // Non-recoverable: no subscriptionId means we can never resolve this event
    if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

    try {
      const subscription = await this.subscriptionService.findOne(subscriptionId);

      await this.subscriptionService.update(subscription.id, {
        status: SubscriptionStatus.PAST_DUE,
      });

      await this.invalidateCache(subscription.userId);
      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionPaymentFailed error', error);
      throw error;
    }
  }

  async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const subscriptionId = stripeSub.metadata?.subscriptionId;
    // Non-recoverable: no subscriptionId means we can never resolve this event
    if (!subscriptionId) return { success: false, reason: 'No subscriptionId in metadata' };

    try {
      const subscription = await this.subscriptionService.findOne(subscriptionId);

      const statusMap: Record<string, SubscriptionStatus> = {
        active: SubscriptionStatus.ACTIVE,
        past_due: SubscriptionStatus.PAST_DUE,
        canceled: SubscriptionStatus.CANCELED,
        incomplete: SubscriptionStatus.INCOMPLETE,
        incomplete_expired: SubscriptionStatus.EXPIRED,
        unpaid: SubscriptionStatus.PAST_DUE, // no distinct UNPAID state; treat as past_due
        paused: SubscriptionStatus.PAUSED,
      };

      const item = stripeSub.items.data[0];
      const price = item?.price;
      // product is not expanded in webhook events, so resolvePlan uses priceId map only
      const resolvedPlan = this.resolvePlan(price?.id);

      await this.subscriptionService.update(subscription.id, {
        status: statusMap[stripeSub.status] ?? subscription.status,
        plan: resolvedPlan ?? subscription.plan,
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
      throw error;
    }
  }

  /**
   * Resolves a SubscriptionPlan from a Stripe price ID, falling back to the
   * product name when the price ID is not in the configured map.
   *
   * Configure STRIPE_PRICE_ID_BASIC / STRIPE_PRICE_ID_PRO in env so that
   * handleSubscriptionUpdated (which receives no expanded product) also resolves
   * the plan correctly.
   */
  private resolvePlan(priceId?: string, productName?: string): SubscriptionPlan | undefined {
    if (priceId) {
      if (priceId === envs.stripePriceIdBasic) return SubscriptionPlan.BASIC;
      if (priceId === envs.stripePriceIdPro) return SubscriptionPlan.PRO;
    }
    if (productName) {
      const nameMap: Record<string, SubscriptionPlan> = {
        basic: SubscriptionPlan.BASIC,
        base: SubscriptionPlan.BASIC,
        pro: SubscriptionPlan.PRO,
      };
      return nameMap[productName.toLowerCase()];
    }
    return undefined;
  }

  private async invalidateCache(userId?: string | null) {
    if (userId) {
      await this.redis.del(`sub:user:${userId}`);
    }
  }
}
