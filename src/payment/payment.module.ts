import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeStrategy } from '../providers/strategies/stripe.strategy';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Payment]), PaymentMethodsModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentProviderFactory,
    StripeStrategy,
  ],
  exports: [PaymentService, TypeOrmModule, StripeStrategy],
})
export class PaymentModule {}
