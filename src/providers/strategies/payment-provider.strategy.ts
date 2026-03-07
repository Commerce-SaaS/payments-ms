import { CreateProviderSessionDto } from 'src/providers/strategies/interfaces/create-provider-session.interface';
import { ProviderSessionResult } from './interfaces/provider-session-result.interface';
import Stripe from 'stripe';

export interface PaymentProviderStrategy {
  createSession(
    params: CreateProviderSessionDto,
  ): Promise<ProviderSessionResult>;
  retrievePrice(priceId: string): Promise<{
      unitAmount: number | null;
      currency: string;
      productId: string;
      productName: string;
      recurring: Stripe.Price.Recurring.Interval | null;
  }>;
}
