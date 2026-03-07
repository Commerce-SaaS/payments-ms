import { Global, Module } from '@nestjs/common';
import { envs } from 'src/config';
import { STRIPE_CLIENT } from 'src/config/services';
import Stripe from 'stripe';

@Global()
@Module({
  providers: [
    {
      provide: STRIPE_CLIENT,
      useFactory: () => {
        return new Stripe(envs.stripeSecret, {
          apiVersion: '2025-12-15.clover',
        });
      },
    },
  ],
  exports: [STRIPE_CLIENT],
})
export class StripeModule {}