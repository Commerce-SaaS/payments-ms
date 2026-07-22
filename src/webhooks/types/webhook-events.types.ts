import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';
import { WebhookOrigin } from '../enums/webhook-origin.enum';
import { Stripe } from "stripe";

export interface WebhookEvent {
  provider: PaymentProvider;
  // Which Stripe webhook endpoint this event arrived through (platform vs
  // connect). Marking only — optional so existing callers/fixtures that
  // don't set it keep compiling; never used to reject or drop an event.
  webhookType?: WebhookOrigin;
  event: Stripe.Event;
}
