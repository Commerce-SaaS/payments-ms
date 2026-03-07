import Stripe from 'stripe';

export interface CreateProviderSessionDto {
  mode: 'payment' | 'subscription';
  stripeAccountId?: string;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  paymentId?: string;
}