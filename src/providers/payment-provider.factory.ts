import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "../payment/enums/payment-provider.enum";
import { PaymentProviderStrategy } from "./strategies/payment-provider.strategy";
// import { PayPalStrategy } from "./strategies/paypal.strategy";
import { StripeStrategy } from "./strategies/stripe.strategy";

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private stripeStrategy: StripeStrategy,
    // private paypalStrategy: PayPalStrategy,
  ) {}

  get(provider: PaymentProvider): PaymentProviderStrategy {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return this.stripeStrategy;
      // case PaymentProvider.PAYPAL:
      //   return this.paypalStrategy;
      default:
        throw new Error('Unsupported payment provider');
    }
  }
}