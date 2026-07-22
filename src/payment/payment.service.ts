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
import { PaymentTotalsByMethodDto } from './dto/payment-totals-by-method.dto';
import { PaymentTotalsByMethodRangeDto } from './dto/payment-totals-by-method-range.dto';
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
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) { }

  async create(dto: CreatePaymentDto) {
    try {
      const { paidAt, ...rest } = dto;
      const payment = this.paymentRepository.create({
        ...rest,
        ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
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
      cashSessionId,
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
      cashSessionId,
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

  // Used by client-gateway to build the cash-session ticket Z report — sums
  // payments by cashSessionId (Payment.cashSessionId, inherited from Order at
  // creation time), grouped by payment method for completed/paid payments,
  // plus cancelled/refunded breakdowns for the pre-close summary.
  async totalsByMethod(dto: PaymentTotalsByMethodDto) {
    const { organizationId, cashSessionId } = dto;

    console.log(cashSessionId);
    const rows = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.paymentMethodId', 'paymentMethodId')
      .addSelect('payment.paymentMethodName', 'paymentMethodName')
      .addSelect('SUM(payment.amount)', 'totalAmount')
      .addSelect('COUNT(payment.id)', 'paymentCount')
      .where('payment.organizationId = :organizationId', { organizationId })
      .andWhere('payment.cashSessionId = :cashSessionId', { cashSessionId })
      .andWhere('payment.status IN (:...statuses)', {
        statuses: [PaymentStatus.COMPLETED, PaymentStatus.PAID],
      })
      .groupBy('payment.paymentMethodId')
      .addGroupBy('payment.paymentMethodName')
      .getRawMany<{
        paymentMethodId: string | null;
        paymentMethodName: string | null;
        totalAmount: string;
        paymentCount: string;
      }>();

    const totals = await this.classifyRowsByCash(rows);

    // Payments with no paymentMethodId (legacy data) can't be classified as
    // cash or not — surfaced separately so a cash discrepancy isn't blamed on
    // the cashier when the real cause is unclassified payments.
    const unclassified = totals.filter((t) => t.paymentMethodId === null);
    const unclassifiedTotal = unclassified.reduce((sum, t) => sum + t.totalAmount, 0);
    const unclassifiedCount = unclassified.reduce((sum, t) => sum + t.paymentCount, 0);

    const hasCashMethodConfigured =
      (await this.paymentMethodRepository.count({
        where: { organizationId, isCash: true },
      })) > 0;

    // Same grouped-aggregate query as `totals` above, just filtered to a
    // different status — needed for the pre-close summary so the cashier can
    // see cancellations/refunds alongside the cash breakdown before confirming.
    const { total: cancelledTotal, count: cancelledCount } = await this.sumByStatus(
      organizationId,
      cashSessionId,
      PaymentStatus.CANCELLED,
    );
    const { total: refundedTotal, count: refundedCount } = await this.sumByStatus(
      organizationId,
      cashSessionId,
      PaymentStatus.REFUNDED,
    );

    return {
      totals,
      grandTotal: totals.reduce((sum, t) => sum + t.totalAmount, 0),
      totalPayments: totals.reduce((sum, t) => sum + t.paymentCount, 0),
      cashTotal: totals.filter((t) => t.isCash).reduce((sum, t) => sum + t.totalAmount, 0),
      unclassifiedTotal,
      unclassifiedCount,
      hasCashMethodConfigured,
      cancelledTotal,
      cancelledCount,
      refundedTotal,
      refundedCount,
    };
  }

  private async sumByStatus(
    organizationId: string,
    cashSessionId: string,
    status: PaymentStatus,
  ): Promise<{ total: number; count: number }> {
    const row = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'total')
      .addSelect('COUNT(payment.id)', 'count')
      .where('payment.organizationId = :organizationId', { organizationId })
      .andWhere('payment.cashSessionId = :cashSessionId', { cashSessionId })
      .andWhere('payment.status = :status', { status })
      .getRawOne<{ total: string | null; count: string }>();

    return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
  }

  // Shared by totalsByMethod (cash-session scoped) and totalsByMethodRange
  // (date-range scoped) — resolves isCash by cross-referencing
  // PaymentMethod.isCash (withDeleted: true, see totalsByMethod's note on
  // historical soft-deleted methods) rather than trusting a column on
  // Payment itself, since isCash never lived there.
  private async classifyRowsByCash(
    rows: {
      paymentMethodId: string | null;
      paymentMethodName: string | null;
      totalAmount: string;
      paymentCount: string;
    }[],
  ): Promise<
    {
      paymentMethodId: string | null;
      paymentMethodName: string;
      isCash: boolean;
      totalAmount: number;
      paymentCount: number;
    }[]
  > {
    const methodIds = rows.map((r) => r.paymentMethodId).filter((id): id is string => !!id);
    const cashMethods = methodIds.length
      ? await this.paymentMethodRepository.find({
          where: { id: In(methodIds), isCash: true },
          withDeleted: true,
        })
      : [];
    const cashMethodIds = new Set(cashMethods.map((m) => m.id));

    return rows.map((row) => ({
      paymentMethodId: row.paymentMethodId ?? null,
      paymentMethodName: row.paymentMethodName ?? 'Unknown',
      isCash: row.paymentMethodId ? cashMethodIds.has(row.paymentMethodId) : false,
      totalAmount: Number(row.totalAmount),
      paymentCount: Number(row.paymentCount),
    }));
  }

  // Sibling of totalsByMethod, scoped by organizationId + createdAt range
  // instead of cashSessionId — used by client-gateway's analytics aggregator
  // for the payment-method breakdown (payment.totals_by_method_range).
  async totalsByMethodRange(dto: PaymentTotalsByMethodRangeDto) {
    const { organizationId, from, to } = dto;

    const rows = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.paymentMethodId', 'paymentMethodId')
      .addSelect('payment.paymentMethodName', 'paymentMethodName')
      .addSelect('SUM(payment.amount)', 'totalAmount')
      .addSelect('COUNT(payment.id)', 'paymentCount')
      .where('payment.organizationId = :organizationId', { organizationId })
      .andWhere('payment.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('payment.status IN (:...statuses)', {
        statuses: [PaymentStatus.COMPLETED, PaymentStatus.PAID],
      })
      .groupBy('payment.paymentMethodId')
      .addGroupBy('payment.paymentMethodName')
      .getRawMany<{
        paymentMethodId: string | null;
        paymentMethodName: string | null;
        totalAmount: string;
        paymentCount: string;
      }>();

    const totals = await this.classifyRowsByCash(rows);

    return {
      totals,
      grandTotal: totals.reduce((sum, t) => sum + t.totalAmount, 0),
      totalPayments: totals.reduce((sum, t) => sum + t.paymentCount, 0),
      cashTotal: totals.filter((t) => t.isCash).reduce((sum, t) => sum + t.totalAmount, 0),
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
