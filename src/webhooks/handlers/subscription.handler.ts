import { Inject, Injectable } from '@nestjs/common';
import { STRIPE_CLIENT } from 'src/config/services';
import { PaymentStatus } from 'src/payment/enums/payment-status.enum';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionPlan } from 'src/subscription/enums/subscription-plan.enum';
import { SubscriptionStatus } from 'src/subscription/enums/subscription-status.enum';
import { SubscriptionService } from 'src/subscription/subscription.service';
import Stripe from 'stripe';

@Injectable()
export class SubscriptionHandler {
  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
  ) {}

  async handleSubscriptionPaid(invoice: Stripe.Invoice) {
    const subscriptionDetails = invoice.parent?.subscription_details;
    try {
      // 1️⃣ Validar que sea una invoice de subscription
      if (subscriptionDetails?.subscription === null) {
        return { success: false, reason: 'Not a subscription invoice' };
      }

      const stripeSubscriptionId = subscriptionDetails?.subscription as string;
      const subscriptionId = subscriptionDetails?.metadata
        ?.subscriptionId as string;

      // 2️⃣ Buscar tu subscription interna
      const subscription =
        await this.subscriptionService.findOne(subscriptionId);

      if (!subscription) {
        return { success: false, reason: 'Subscription not found' };
      }

      // 3️⃣ Obtener datos actuales de Stripe (con try/catch)
      let stripeSub: Stripe.Subscription;

      try {
        stripeSub = await this.stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          { expand: ['items.data.price.product'] },
        );
      } catch (error) {
        console.error('Stripe subscription retrieve failed', error);
        return { success: false };
      }

      const price = stripeSub.items.data[0]?.price;
      const product = price?.product as Stripe.Product;

      // 4️⃣ Actualizar subscription SOLO con datos reales del período actual
      await this.subscriptionService.update(subscription.id, {
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000),
        status: SubscriptionStatus.ACTIVE,
        plan: product?.name as SubscriptionPlan,
        stripeSubscriptionId: stripeSubscriptionId,
      });

      // 5️⃣ Marcar payment como completado si existe
      const paymentId = subscriptionDetails?.metadata?.paymentId;

      if (paymentId) {
        await this.paymentService.update(paymentId, {
          status: PaymentStatus.COMPLETED,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('handleSubscriptionPaid error', error);
      return { success: false };
    }
  }

  handleSubscriptionDeleted(object: Stripe.Subscription) {
    throw new Error('Method not implemented.');
  }
  handleSubscriptionPaymentFailed(object: Stripe.Invoice) {
    throw new Error('Method not implemented.');
  }
}
