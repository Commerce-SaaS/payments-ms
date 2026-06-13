import { Module } from '@nestjs/common';
import { SubscriptionModule } from './subscription/subscription.module';
import { PaymentModule } from './payment/payment.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AccessModule } from './access/access.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envs } from './config';
import { ConfigModule } from '@nestjs/config';
import { StripeModule } from './stripe/stripe.module';
import { RedisModule } from './redis/redis.module';
import { ORDERS_EVENTS_CLIENT, ORGANIZATION_EVENTS_CLIENT } from './config/services';
import { RabbitMQModule } from './config/transports/rabbitmq.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envs.dbHost,
      port: envs.dbPort ?? 5432,
      username: envs.postgresUser,
      password: envs.postgresPassword,
      database: envs.postgresDb,
      autoLoadEntities: true,
      synchronize: envs.nodeEnv === 'development',
    }),
    RedisModule,
    SubscriptionModule,
    PaymentModule,
    WebhooksModule,
    AccessModule,
    StripeModule,
    RabbitMQModule.register({
      name: ORDERS_EVENTS_CLIENT,
      queue: envs.rabbitmqOrdersEventQueue,
      url: envs.rabbitmqUrl,
    }),
    RabbitMQModule.register({
      name: ORGANIZATION_EVENTS_CLIENT,
      queue: envs.rabbitmqOrganizationQueue,
      url: envs.rabbitmqUrl,
    }),
    PaymentMethodsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
