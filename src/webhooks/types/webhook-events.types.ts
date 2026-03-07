import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';
import { Stripe } from "stripe";

export interface WebhookEvent {
  provider: PaymentProvider;
  event: Stripe.Event;
}
