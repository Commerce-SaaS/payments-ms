import { Injectable } from '@nestjs/common';
import { WebhookEvent } from './types/webhook-events.types';
import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';
import Stripe from 'stripe';
import { PaymentStatus } from 'src/payment/enums/payment-status.enum';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { SubscriptionService } from 'src/subscription/subscription.service';
import { SubscriptionStatus } from 'src/subscription/enums/subscription-status.enum';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionHandler: SubscriptionHandler,
  ) {}

  async handleEvent(payload: WebhookEvent) {
    if (payload.provider !== PaymentProvider.STRIPE) {
      return { ignored: true };
    }

    const { event } = payload;

    switch (event.type) {
      // CHECKOUT SESSION
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      // SUBSCRIPTIONS
      case 'invoice.paid':
        return this.subscriptionHandler.handleSubscriptionPaid(
          event.data.object,
        );

      case 'invoice.payment_failed':
        return this.subscriptionHandler.handleSubscriptionPaymentFailed(
          event.data.object,
        );

      case 'customer.subscription.deleted':
        return this.subscriptionHandler.handleSubscriptionDeleted(
          event.data.object,
        );

      // PAYMENTS
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        return { success: true };

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        return { failed: true };

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object);
        return { failed: true };

      // CONNECT - ACCOUNT LIFECYCLE

      case 'account.updated':
        await this.handleAccountUpdated(event.data.object);
        return { accountUpdated: true };

      case 'account.application.deauthorized':
        await this.handleAccountDeauthorized(event.data.object);
        return { accountDisconnected: true };

      case 'account.external_account.created':
        return { externalAccountAdded: true };

      case 'account.external_account.deleted':
        return { externalAccountRemoved: true };

      default:
        return { ignored: true };
    }
  }
  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { paymentId, subscriptionId } = session.metadata || {};
;
    await this.paymentService.update(paymentId, {
      status: PaymentStatus.PROCESSING,
    });

    if (session.mode === 'subscription') {
      if (!subscriptionId || !session.subscription) return;

      await this.subscriptionService.update(subscriptionId, {
        stripeSubscriptionId: session.subscription as string,
        status: SubscriptionStatus.PROCESSING,
      });
    }
  }

  async handleAccountUpdated(object: Stripe.Account) {
    return true;
  }
  async handleAccountDeauthorized(object: Stripe.Application) {
    return true;
  }
  async handlePaymentCanceled(object: Stripe.PaymentIntent) {
    return true;
  }
  async handlePaymentFailed(object: Stripe.PaymentIntent) {
    return true;
  }
  async handlePaymentSucceeded(object: Stripe.PaymentIntent) {
    return true;
  }

  private async onPaymentSucceeded(invoice: Stripe.Invoice) {
    const metadata = invoice.metadata;
    const { organizationId, paymentId, orderId } = metadata as {
      organizationId: string;
      paymentId: string;
      orderId: string;
    };

    try {
      await this.paymentService.update(paymentId, {
        status: PaymentStatus.COMPLETED,
        amount: invoice.amount_paid / 100,
      });

      return { success: true };
    } catch (error) {
      RpcExceptionHelper.handle(error);
    }
  }

  private async onPaymentFailed(invoice: Stripe.Invoice) {
    return { failed: true };
  }
}
