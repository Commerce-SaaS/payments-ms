import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { PaymentModule } from 'src/payment/payment.module';
import { ConnectHandler } from './handlers/connect.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, ConnectHandler, PaymentHandler, SubscriptionHandler],
  imports: [SubscriptionModule, PaymentModule],
})
export class WebhooksModule {}
