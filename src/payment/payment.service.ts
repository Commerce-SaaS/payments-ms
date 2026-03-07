import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { PaymentErrorCode } from './enums/payment-error-code.enum';
import Stripe from 'stripe';
import { envs } from 'src/config';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { STRIPE_CLIENT } from 'src/config/services';
import { PaymentProvider } from './enums/payment-provider.enum';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}
  async create(dto: CreatePaymentDto) {
    try {
      const payment = this.paymentRepository.create(dto);
      return await this.paymentRepository.save(payment);
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  async update(id: string, dto: UpdatePaymentDto) {
    try {
      const payment = await this.paymentRepository.findOneBy({ id });
      if (!payment) {
        RpcExceptionHelper.notFound(
          PaymentErrorCode.PAYMENT_NOT_FOUND,
          'Payment',
        );
      }
      Object.assign(payment, dto);
      return await this.paymentRepository.save(payment);
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  async createPaymentSession(dto: CreatePaymentSessionDto) {
    const { amount, organizationId, provider, orderId, lineItems, userId, stripeAccountId } =
      dto;
    console.log(dto);
    // 1️⃣ Evitar pagos duplicados
    const existingPayment = await this.getPendingPayment({ orderId }, provider);

    if (existingPayment?.checkoutUrl) {
      return {
        paymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkoutUrl,
      };
    }

    // 2️⃣ Crear registro Payment
    const payment = await this.paymentRepository.save({
      organizationId,
      orderId,
      provider,
      amount,
      userId,
      status: PaymentStatus.PENDING,
    });

    // 3️⃣ Delegar al provider correspondiente
    const providerStrategy = this.providerFactory.get(provider);

    const session = await providerStrategy.createSession({
      paymentId: payment.id,
      lineItems,
      stripeAccountId,
      successUrl: `${envs.clientUrl}/success?paymentId=${payment.id}`,
      cancelUrl: `${envs.clientUrl}/cancel`,
      metadata: {
        paymentId: payment.id,
        orderId,
        organizationId,
      },
      mode: 'payment',
    });

    // 4️⃣ Guardar datos del proveedor (GENÉRICO)
    await this.paymentRepository.update(payment.id, {
      externalPaymentId: session.externalPaymentId,
      externalSessionId: session.externalSessionId,
      checkoutUrl: session.checkoutUrl,
      providerMetadata: session.raw ?? null,
    });

    return {
      paymentId: payment.id,
      checkoutUrl: session.checkoutUrl,
    };
  }
  async getPendingPayment(
    params: {
      orderId?: string;
      subscriptionId?: string;
    },
    provider: PaymentProvider,
  ): Promise<Payment | null> {
    const where: any = {
      status: PaymentStatus.PENDING,
      provider,
    };

    if (params.orderId) {
      where.orderId = params.orderId;
    }

    if (params.subscriptionId) {
      where.subscriptionId = params.subscriptionId;
    }

    const payment = await this.paymentRepository.findOne({ where });

    return payment ?? null;
  }
}
