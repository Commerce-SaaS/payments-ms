import { Inject, Injectable } from '@nestjs/common';
import { CreateProviderSessionDto } from './interfaces/create-provider-session.interface';
import { PaymentProviderStrategy } from './payment-provider.strategy';
import { Stripe } from 'stripe';
import { STRIPE_CLIENT } from 'src/config/services';

@Injectable()
export class StripeStrategy implements PaymentProviderStrategy {
  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,
  ) {}
  async createSession(
    params: CreateProviderSessionDto & {
      stripeAccountId?: string;
      customerId?: string;
    },
  ) {
    const baseConfig: Stripe.Checkout.SessionCreateParams = {
      mode: params.mode,
      line_items: params.lineItems,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { ...params.metadata },
    };

    if (params.customerId) {
      baseConfig.customer = params.customerId;
    }

    if (params.mode === 'payment') {
      baseConfig.payment_intent_data = {
        metadata: { ...params.metadata },

        ...(params.stripeAccountId && {
          transfer_data: {
            destination: params.stripeAccountId,
          },
        }),
      };
    }

    if (params.mode === 'subscription') {
      baseConfig.subscription_data = {
        metadata: { ...params.metadata },
      };
    }

    const session = await this.stripe.checkout.sessions.create(baseConfig);

    return {
      externalSessionId: session.id,
      checkoutUrl: session.url!,
      raw: session,
    };
  }

  async retrievePrice(priceId: string) {
    const price = await this.stripe.prices.retrieve(priceId, {
      expand: ['product'],
    });

    return {
      unitAmount: price.unit_amount ?? 0,
      currency: price.currency,
      productId: (price.product as Stripe.Product).id,
      productName: (price.product as Stripe.Product).name,
      recurring: price.recurring?.interval ?? null,
    };
  }
}
