import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from '../common/dto/payment-status.enum';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { PaymentErrorCode } from './enums/payment-error-code.enum';
import { envs } from 'src/config';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymentsPaginationDto } from './dto/payments-pagination.dto';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { STRIPE_CLIENT } from 'src/config/services';
import { PaymentProvider } from './enums/payment-provider.enum';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { PaymentMethod } from 'src/payment-methods/entities/payment-method.entity';
import { PaymentMethodsService } from 'src/payment-methods/payment-methods.service';
import { PaymentCancellationReason } from './enums/payment-cancellation-reason.enum';
import { Not, In } from 'typeorm';

// Payment statuses a payment's method may still be reassigned in — mirrors the
// frontend's EDITABLE set (payments-table.tsx).
const METHOD_EDITABLE_STATUSES = [PaymentStatus.PENDING, PaymentStatus.COMPLETED];

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) { }

  async create(dto: CreatePaymentDto) {
    try {
      const payment = this.paymentRepository.create({
        ...dto,
      });
      return await this.paymentRepository.save(payment);
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  // Client-facing PATCH /payments/:id — reassigns only the payment method.
  async update(dto: UpdatePaymentDto) {
    const { id, organizationId, paymentMethodId } = dto;
    const payment = await this.paymentRepository.findOneBy({ id });

    if (!payment) {
      RpcExceptionHelper.notFound(
        PaymentErrorCode.PAYMENT_NOT_FOUND,
        'Payment',
      );
    }

    if (payment.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentErrorCode.PAYMENT_FORBIDDEN,
        'You do not have access to this payment',
      );
    }

    if (!METHOD_EDITABLE_STATUSES.includes(payment.status)) {
      RpcExceptionHelper.badRequest(
        PaymentErrorCode.PAYMENT_ALREADY_FINALIZED,
        'Cannot update a finalized payment',
      );
    }

    const method = await this.paymentMethodsService.findOne(
      paymentMethodId,
      organizationId,
    );

    if (!method.isActive) {
      RpcExceptionHelper.badRequest(
        PaymentErrorCode.PAYMENT_FAILED,
        'Payment method is not active',
      );
    }

    try {
      await this.paymentRepository.update(id, {
        paymentMethodId: method.id,
        paymentMethodName: method.name,
      });
      return await this.paymentRepository.findOneBy({ id });
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  // Internal lifecycle transitions (webhooks, subscription handler) — not exposed
  // over the gateway.
  async updateStatus(dto: UpdatePaymentStatusDto) {
    const { paymentId: id } = dto;
    const payment = await this.paymentRepository.findOneBy({ id });

    if (!payment) {
      RpcExceptionHelper.notFound(
        PaymentErrorCode.PAYMENT_NOT_FOUND,
        'Payment',
      );
    }

    if (
      !payment.subscriptionId &&
      payment.organizationId !== dto.organizationId
    ) {
      RpcExceptionHelper.forbidden(
        PaymentErrorCode.PAYMENT_FORBIDDEN,
        'You do not have access to this payment',
      );
    }

    if (dto.status && payment.status === dto.status) {
      return payment;
    }

    if (
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.FAILED
    ) {
      RpcExceptionHelper.badRequest(
        PaymentErrorCode.PAYMENT_ALREADY_FINALIZED,
        'Cannot update a finalized payment',
      );
    }

    try {
      const { paymentId, organizationId, ...updateData } = dto;
      await this.paymentRepository.update(id, updateData);
      return await this.paymentRepository.findOneBy({ id });
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  async createPaymentSession(dto: CreatePaymentSessionDto) {
    const {
      amount,
      organizationId,
      provider,
      orderId,
      lineItems,
      userId,
      stripeAccountId,
    } = dto;

    const existingPayment = await this.getPendingPayment({ orderId }, provider);

    if (existingPayment?.checkoutUrl) {
      return {
        paymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkoutUrl,
      };
    }

    const payment = await this.paymentRepository.save({
      organizationId,
      orderId,
      provider,
      amount,
      userId,
      status: PaymentStatus.PENDING,
    });

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

  async findAll(dto: PaymentsPaginationDto) {
    const {
      orderId,
      organizationId,
      status,
      userId,
      search,
      offset = 0,
      limit = 20,
    } = dto;
    const effectiveLimit = limit > 0 ? limit : 20;

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.organizationId = :organizationId', { organizationId });

    if (orderId) {
      qb.andWhere('payment.orderId = :orderId', { orderId });
    }
    if (status) {
      qb.andWhere('payment.status = :status', { status });
    }

    if (userId) {
      qb.andWhere('payment.userId = :userId', { userId });
    }

    if (search) {
      qb.andWhere(
        '("payment"."id"::text ILIKE :search OR "payment"."orderId"::text ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const totalItems = await qb.getCount();

    const items = await qb
      .clone()
      .orderBy('payment.createdAt', 'DESC')
      .skip(offset)
      .take(effectiveLimit)
      .getMany();

    return {
      items: items.map((p) => ({
        id: p.id,
        orderId: p.orderId ?? null,
        subscriptionId: p.subscriptionId ?? null,
        paymentMethodName: p.paymentMethodName ?? null,
        userId: p.userId ?? null,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
      })),
      totalItems,
      totalPages: Math.ceil(totalItems / effectiveLimit),
      currentPage: Math.floor(offset / effectiveLimit) + 1,
      hasMore: offset + effectiveLimit < totalItems,
    };
  }

  async findMyPayments(dto: PaymentsPaginationDto) {
    return this.findAll({ ...dto });
  }

  async findMyPaymentById(dto: {
    id: string;
    organizationId: string;
    userId: string;
  }) {
    const payment = await this.paymentRepository.findOne({
      where: {
        id: dto.id,
        organizationId: dto.organizationId,
        userId: dto.userId,
      },
    });

    if (!payment) {
      RpcExceptionHelper.notFound(
        PaymentErrorCode.PAYMENT_NOT_FOUND,
        'Payment',
      );
    }

    return {
      id: payment.id,
      orderId: payment.orderId ?? null,
      subscriptionId: payment.subscriptionId ?? null,
      userId: payment.userId ?? null,
      paymentMethodName: payment.paymentMethodName ?? null,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      failureReason: payment.failureReason ?? null,
      paidAt: payment.paidAt ?? null,
      cancelledAt: payment.cancelledAt ?? null,
      createdAt: payment.createdAt,
    };
  }

  async findOne(dto: { id: string; organizationId: string }) {
    const payment = await this.paymentRepository.findOne({
      where: {
        id: dto.id,
        organizationId: dto.organizationId,
      },
    });

    if (!payment) {
      RpcExceptionHelper.notFound(
        PaymentErrorCode.PAYMENT_NOT_FOUND,
        'Payment',
      );
    }

    return {
      id: payment.id,
      orderId: payment.orderId ?? null,
      subscriptionId: payment.subscriptionId ?? null,
      userId: payment.userId ?? null,
      paymentMethodName: payment.paymentMethodName ?? null,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      failureReason: payment.failureReason ?? null,
      paidAt: payment.paidAt ?? null,
      cancelledAt: payment.cancelledAt ?? null,
      createdAt: payment.createdAt,
    };
  }

  async cancel(dto: CancelPaymentDto) {
    const { id, organizationId, failureReason } = dto;
    const payment = await this.paymentRepository.findOneBy({ id });

    if (!payment) {
      RpcExceptionHelper.notFound(
        PaymentErrorCode.PAYMENT_NOT_FOUND,
        'Payment',
      );
    }

    if (!payment.subscriptionId && payment.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentErrorCode.PAYMENT_FORBIDDEN,
        'You do not have access to this payment',
      );
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      RpcExceptionHelper.badRequest(
        PaymentErrorCode.PAYMENT_ALREADY_FINALIZED,
        'Payment is already cancelled',
      );
    }
    try {
      await this.paymentRepository.update(id, {
        status: PaymentStatus.CANCELLED,
        failureReason: failureReason ?? PaymentCancellationReason.STAFF_CANCEL,
        cancelledAt: new Date(),
      });
      return { message: 'Payment cancelled successfully' };
    } catch (error) {
      RpcExceptionHelper.handle(PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  // ============================================================
  // CANCEL ALL ACTIVE PAYMENTS FOR AN ORDER (order.cancelled event)
  // Idempotent: already-cancelled/refunded payments are skipped.
  // Does NOT execute Stripe refunds — see TODO[CRITICAL][REFUND] below.
  // ============================================================
  async cancelOrderPayments(dto: { orderId: string; organizationId: string }): Promise<void> {
    const { orderId, organizationId } = dto;

    const activePayments = await this.paymentRepository.find({
      where: {
        orderId,
        organizationId,
        status: Not(In([PaymentStatus.CANCELLED, PaymentStatus.REFUNDED])),
      },
    });

    if (!activePayments.length) {
      this.logger.log(
        `order.cancelled: no active payments found for orderId=${orderId} — skipping (idempotent)`,
      );
      return;
    }

    for (const payment of activePayments) {
      if (payment.status === PaymentStatus.COMPLETED || payment.status === PaymentStatus.PAID) {
        // TODO[CRITICAL][REFUND]: this only marks the payment CANCELLED — it does NOT
        // issue a real Stripe refund. Before production with live Stripe payments,
        // this MUST call the Stripe refund API (stripe.refunds.create) for card
        // payments, or customers will be marked refunded without getting their money back.
        this.logger.warn(
          `[REFUND-PENDING] Payment ${payment.id} for orderId=${orderId} was ${payment.status} — ` +
            `marking CANCELLED but NO real Stripe refund was executed. ` +
            `A Stripe refund must be issued before going live.`,
        );
      }

      await this.paymentRepository.update(payment.id, {
        status: PaymentStatus.CANCELLED,
        failureReason: PaymentCancellationReason.ORDER_CANCELLED,
        cancelledAt: new Date(),
      });
    }

    this.logger.log(
      `order.cancelled: cancelled ${activePayments.length} payment(s) for orderId=${orderId}`,
    );
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

  // Called when auth-ms emits customer.anonymized.
  // Nulls userId (breaks the re-identification link) and providerMetadata (raw
  // Stripe session object — useful only while the customer is active).
  // Accounting data lives in dedicated columns (amount, status, externalPaymentId,
  // orderId) and is NOT touched.
  // Safe to call multiple times: second call matches zero rows and is a no-op.
  async anonymizeCustomerPayments(userId: string): Promise<number> {
    const result = await this.paymentRepository.update(
      { userId },
      { userId: null, providerMetadata: null },
    );
    const affected = result.affected ?? 0;
    this.logger.log(
      `customer.anonymized: nulled userId+providerMetadata on ${affected} payment(s) for userId=${userId}`,
    );
    return affected;
  }
}
