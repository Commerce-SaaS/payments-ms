import { Inject, Injectable, Logger } from '@nestjs/common';
import { WebhookEvent } from './types/webhook-events.types';
import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';
import Stripe from 'stripe';
import { PaymentStatus } from 'src/common/dto/payment-status.enum';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { PaymentCancellationReason } from 'src/payment/enums/payment-cancellation-reason.enum';
import { ClientProxy } from '@nestjs/microservices/client/client-proxy';
import {
  ORDERS_EVENTS_CLIENT,
  ORGANIZATION_EVENTS_CLIENT,
} from 'src/config/services';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { ORGANIZATION_PATTERNS } from './patterns/organization_patterns';
import Redis from 'ioredis';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  private readonly EVENT_TTL = 60 * 60 * 72;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionHandler: SubscriptionHandler,
    @Inject(ORDERS_EVENTS_CLIENT)
    private readonly ordersClient: ClientProxy,
    @Inject(ORGANIZATION_EVENTS_CLIENT)
    private readonly organizationEventsClient: ClientProxy,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async handleEvent(payload: WebhookEvent) {
    if (payload.provider !== PaymentProvider.STRIPE) return { ignored: true };
    const { event } = payload;

    const doneKey = `stripe:evt:done:${event.id}`;
    const lockKey = `stripe:evt:lock:${event.id}`;

    if (await this.redis.get(doneKey)) {
      this.logger.log(`Duplicate Stripe event skipped: ${event.id}`);
      return { idempotent: true };
    }

    const locked = await this.redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (locked !== 'OK') return { inProgress: true };

    try {
      const result = await this.processEvent(event);
      await this.redis.set(doneKey, '1', 'EX', this.EVENT_TTL);
      return result;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async processEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'checkout.session.expired':
        await this.handleCheckoutExpired(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      // All subscription invoices (including the first onboarding payment) are
      // routed here. Full activation (status, periods, plan) happens in
      // handleSubscriptionPaid, which also marks the associated payment record.
      case 'invoice.paid':
        return this.subscriptionHandler.handleSubscriptionPaid(
          event.data.object as Stripe.Invoice,
        );

      case 'invoice.payment_failed':
        return this.subscriptionHandler.handleSubscriptionPaymentFailed(
          event.data.object as Stripe.Invoice,
        );

      case 'customer.subscription.deleted':
        return this.subscriptionHandler.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );

      case 'customer.subscription.updated':
        return this.subscriptionHandler.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );

      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );

        return { success: true };

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
        return { failed: true };

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(
          event.data.object as Stripe.PaymentIntent,
        );
        return { failed: true };

      // ─── CONNECT ──────────────────────────────────────────────────

      case 'account.updated':
        return this.handleAccountUpdated(event.data.object as Stripe.Account);

      case 'account.application.deauthorized':
        return this.handleAccountDeauthorized(
          event.data.object as Stripe.Application,
          event.account,
        );

      case 'account.external_account.created':
        return { externalAccountAdded: true };

      case 'account.external_account.deleted':
        return { externalAccountRemoved: true };

      default:
        return { ignored: true };
    }
  }

  // ─── CONNECT HANDLERS ─────────────────────────────────────────────

  private async handleAccountUpdated(account: Stripe.Account) {
    const {
      id: stripeAccountId,
      charges_enabled,
      payouts_enabled,
      metadata,
    } = account;
    const organizationId = metadata?.organizationId;

    if (!organizationId) {
      this.logger.warn(
        `account.updated: no organizationId in metadata for account=${stripeAccountId}`,
      );
      return { ignored: true };
    }

    if (charges_enabled && payouts_enabled) {
      this.logger.log(
        `account.updated: onboarding complete for account=${stripeAccountId}, org=${organizationId}`,
      );

      this.organizationEventsClient.emit(ORGANIZATION_PATTERNS.UPDATE_EVENT, {
        id: organizationId,
        stripeAccountId: stripeAccountId,
      });
    }

    return { accountUpdated: true };
  }

  private async handleAccountDeauthorized(
    _object: Stripe.Application,
    stripeAccountId?: string,
  ) {
    if (!stripeAccountId) {
      this.logger.warn(
        'account.application.deauthorized: missing stripeAccountId in event.account',
      );
      return { ignored: true };
    }

    this.logger.log(
      `account.application.deauthorized: clearing stripeAccountId=${stripeAccountId}`,
    );

    this.organizationEventsClient.emit(
      ORGANIZATION_PATTERNS.CLEAR_STRIPE_ACCOUNT,
      { stripeAccountId },
    );

    return { accountDisconnected: true };
  }
  // ─── OTHER HANDLERS ───────────────────────────────────────────────

  async handleCheckoutCompleted(_session: Stripe.Checkout.Session) {
    // Subscription activation happens on invoice.paid, not here.
    // For one-time payment flows, activation happens on payment_intent.succeeded.
  }

  async handleCheckoutExpired(session: Stripe.Checkout.Session) {
    const { paymentId, organizationId } = session.metadata || {};
    if (!paymentId) return { ignored: true };

    await this.paymentService.updateStatus({
      paymentId,
      status: PaymentStatus.EXPIRED,
      failureReason: PaymentCancellationReason.CHECKOUT_SESSION_EXPIRED,
      organizationId,
    });
  }

  async handlePaymentCanceled(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.updateStatus({
      paymentId,
      status: PaymentStatus.CANCELLED,
      failureReason: PaymentCancellationReason.PAYMENT_CANCELED,
      organizationId,
    });
    return { success: true };
  }

  async handlePaymentFailed(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.updateStatus({
      paymentId,
      status: PaymentStatus.FAILED,
      failureReason: PaymentCancellationReason.PAYMENT_FAILED,
      organizationId,
    });
    return { success: true };
  }

  async handlePaymentSucceeded(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.updateStatus({
      paymentId,
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
      externalPaymentId: object.id,
      organizationId,
    });

    if (object.metadata?.orderId) {
      this.ordersClient.emit(ORDER_PATTERNS.PAYMENT_STATUS, {
        id: object.metadata.orderId,
        organizationId,
        paymentStatus: PaymentStatus.PAID,
      });
    }
    return { success: true };
  }
}
