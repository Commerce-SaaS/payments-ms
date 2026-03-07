import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { PaymentModule } from 'src/payment/payment.module';
import { PaymentProviderFactory } from 'src/providers/payment-provider.factory';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, PaymentProviderFactory],
  imports: [TypeOrmModule.forFeature([Subscription]), PaymentModule],
  exports: [SubscriptionService, TypeOrmModule],
})
export class SubscriptionModule {}
