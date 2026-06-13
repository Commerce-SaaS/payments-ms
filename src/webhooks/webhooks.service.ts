import { Inject, Injectable, Logger } from '@nestjs/common';
import { WebhookEvent } from './types/webhook-events.types';
import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';
import Stripe from 'stripe';
import { PaymentStatus } from 'src/common/dto/payment-status.enum';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { FailureReason } from 'src/payment/enums/payment-failure-reason.enum';
import { ClientProxy } from '@nestjs/microservices/client/client-proxy';
import {
  ORDERS_EVENTS_CLIENT,
  ORGANIZATION_EVENTS_CLIENT,
} from 'src/config/services';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { ORGANIZATION_PATTERNS } from './patterns/organization_patterns';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionHandler: SubscriptionHandler,
    @Inject(ORDERS_EVENTS_CLIENT)
    private readonly ordersClient: ClientProxy,
    @Inject(ORGANIZATION_EVENTS_CLIENT)
    private readonly organizationEventsClient: ClientProxy,
  ) {}

  async handleEvent(payload: WebhookEvent) {
    if (payload.provider !== PaymentProvider.STRIPE) {
      return { ignored: true };
    }

    const { event } = payload;

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

      case 'invoice.paid':
        if (this.isOnboardingSubscriptionInvoice(event.data.object)) {
          return this.handleOnboardingSubscriptionPaid(event.data.object);
        }
        return this.subscriptionHandler.handleSubscriptionPaid(
          event.data.object,
        );

      case 'invoice.payment_failed':
        if (this.isOnboardingSubscriptionInvoice(event.data.object)) {
          return this.handleOnboardingSubscriptionFailed(event.data.object);
        }
        return this.subscriptionHandler.handleSubscriptionPaymentFailed(
          event.data.object,
        );

      case 'customer.subscription.deleted':
        return this.subscriptionHandler.handleSubscriptionDeleted(
          event.data.object,
        );

      case 'customer.subscription.updated':
        return this.subscriptionHandler.handleSubscriptionUpdated(
          event.data.object,
        );

      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        return { success: true };

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        return { failed: true };

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object);
        return { failed: true };

      // ─── CONNECT ──────────────────────────────────────────────────

      case 'account.updated':
        return this.handleAccountUpdated(event.data.object as Stripe.Account);

      case 'account.application.deauthorized':
        return this.handleAccountDeauthorized(
          event.data.object as Stripe.Application,
          event.account, // ← stripeAccountId del connected account
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

    console.log(account)
    console.log(organizationId)

    if (!organizationId) {
      this.logger.warn(
        `account.updated: no organizationId in metadata for account=${stripeAccountId}`,
      );
      return { ignored: true };
    }

    // Onboarding completado
    if (charges_enabled && payouts_enabled) {
      this.logger.log(
        `account.updated: onboarding complete for account=${stripeAccountId}, org=${organizationId}`,
      );

      // Confirmar stripeAccountId en la organización (por si no se guardó antes)
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

    // Limpiar el stripeAccountId de la organización
    this.organizationEventsClient.emit(
      ORGANIZATION_PATTERNS.CLEAR_STRIPE_ACCOUNT,
      { stripeAccountId },
    );

    return { accountDisconnected: true };
  }

  // ─── RESTO DE HANDLERS (sin cambios) ─────────────────────────────

  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { paymentId } = session.metadata || {};
    if (!paymentId) return;
  }

  async handleCheckoutExpired(session: Stripe.Checkout.Session) {
    const { paymentId, organizationId } = session.metadata || {};
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.EXPIRED,
      failureReason: FailureReason.CHECKOUT_SESSION_EXPIRED,
      organizationId,
    });
  }

  async handlePaymentCanceled(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.CANCELLED,
      failureReason: FailureReason.PAYMENT_CANCELED,
      organizationId,
    });
    return { success: true };
  }

  async handlePaymentFailed(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.FAILED,
      failureReason: FailureReason.PAYMENT_FAILED,
      organizationId,
    });
    return { success: true };
  }

  async handlePaymentSucceeded(object: Stripe.PaymentIntent) {
    const paymentId = object.metadata?.paymentId;
    const organizationId = object.metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
      externalPaymentId: object.id,
      organizationId,
    });

    if (object.metadata?.orderId) {
      this.ordersClient.emit(ORDER_PATTERNS.PAYMENT_STATUS, {
        id: object.metadata.orderId,
        paymentStatus: PaymentStatus.PAID,
      });
    }
    return { success: true };
  }

  private isOnboardingSubscriptionInvoice(invoice: Stripe.Invoice): boolean {
    const metadata = invoice.parent?.subscription_details?.metadata;
    return metadata?.type === 'ONBOARDING_SUBSCRIPTION';
  }

  private async handleOnboardingSubscriptionPaid(invoice: Stripe.Invoice) {
    const metadata = invoice.parent?.subscription_details?.metadata;
    const paymentId = metadata?.paymentId;
    const organizationId = metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
      amount: invoice.amount_paid,
      organizationId: organizationId || '',
    });
    return { success: true };
  }

  private async handleOnboardingSubscriptionFailed(invoice: Stripe.Invoice) {
    const metadata = invoice.parent?.subscription_details?.metadata;
    const paymentId = metadata?.paymentId;
    const organizationId = metadata?.organizationId;
    if (!paymentId) return { ignored: true };

    await this.paymentService.update({
      paymentId,
      status: PaymentStatus.FAILED,
      failureReason: FailureReason.PAYMENT_FAILED,
      organizationId: organizationId || '',
    });
    return { failed: true };
  }
}
