import { Module } from '@nestjs/common';
import { SubscriptionModule } from './subscription/subscription.module';
import { PaymentModule } from './payment/payment.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AccessModule } from './access/access.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envs } from './config';
import { ConfigModule } from '@nestjs/config';
import { StripeModule } from './stripe/stripe.module';

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
    SubscriptionModule,
    PaymentModule,
    WebhooksModule,
    AccessModule,
    StripeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
