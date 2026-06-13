import { Global, Module } from '@nestjs/common';
import { envs } from 'src/config';
import { STRIPE_CLIENT } from 'src/config/services';
import Stripe from 'stripe';
import { StripeConnectService } from './stripe-connect.service';
import { StripeConnectController } from './stripe-connect.controller';

@Global()
@Module({
  imports: [],
  controllers: [StripeConnectController],
  providers: [
    {
      provide: STRIPE_CLIENT,
      useFactory: () => {
        return new Stripe(envs.stripeSecret, {
          apiVersion: '2025-12-15.clover',
        });
      },
    },
    StripeConnectService,
  ],
  exports: [STRIPE_CLIENT, StripeConnectService],
})
export class StripeModule {}
