import { Inject, Injectable } from '@nestjs/common';
import { STRIPE_CLIENT } from 'src/config/services';
import Stripe from 'stripe';

@Injectable()
export class PaymentHandler {
  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,
  ) {}
}
